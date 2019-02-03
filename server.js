// ============================================================================
//                              NodeHookR
//
// This is the main service entry point.    It loads the configuration file,
// sets up the logger service, and then initializes the router.   When are
// request comes in, it matches it with a route and if it passes, then
// executes the route.
// ============================================================================
const fs = require('fs');
const winston = require('winston');
const http = require('http');
const url = require('url');
const Router = require('./router');
const Mailer = require('./mailer');
const autobind = require('auto-bind');

const Errors = require('./errors');
const AppError = Errors.AppError;
const RequestError = Errors.RequestError;

require('winston-daily-rotate-file');
require('http-shutdown').extend();

class Server {
	constructor() {
		// Set default values
		this._configFile = './config.json';
		this._loggers = [];

		autobind(this);
	}

	// -----------------------------------------------------
	// Return configuration
	// -----------------------------------------------------
	get config() {
		// Only read the config file once, but allow the config
		// file to be re-loaded at a later time (i.e. file watch)
		// at some future release.
		if (!this._configData) {
			if (fs.existsSync(this._configFile)) {
				let content = fs.readFileSync(this._configFile);
				this._configData = JSON.parse(content);
			} else {
				this._configData = { log: [] };
			}
		}
		return this._configData;
	}

	// -----------------------------------------------------
	// START Server
	// -----------------------------------------------------
	start(file) {
		// Set the config file if specified, otherwise, use the default
		// It is done this way because later config() will be hot loaded
		this._configFile = file || './config.json';

		// Initialize loggers
		for (let [ log, opts ] of Object.entries(this.config.log)) {
			// Only initialize valid logger entries
			if (log.match(/\bservice|\brouter|\bplugins|\brequests/)) {
				if (opts.enabled === undefined || opts.enabled) this._loggers[log] = this._createLogger(log, opts);
			}
		}

		this._servicelog('info', 'NodeHookR initializing');

		// Setup catch-all for async functions in plugins that are not
		// properly catching the exceptions
		process.on('unhandledRejection', (err) => {
			this._handleAppError(
				new AppError('Unhandled promise rejection.   Plugin may not be properly handling error.', err)
			);
		});

		// Set up the callbacks for the plugins
		this._hooks = {
			config: this.config,
			sendmail: this._sendmail.bind(this),
			logger: this._pluginlog.bind(this)
		};

		// Initialize the router and mailer.  If any errors
		// occur during initalization, the service will quit
		this._router = new Router(this._hooks, this._routerlog, this._handleAppError);
		this._mailer = new Mailer(this._hooks, this._mailerlog);

		// Set the default server port
		const port = this.config.port || '3000';

		// Initialize the http server
		this._server = http
			.createServer((req, res) => {
				// Set CORS headers
				res.setHeader('Access-Control-Allow-Origin', '*');
				res.setHeader('Access-Control-Request-Method', '*');
				res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, PUT, PATCH, DELETE');
				res.setHeader('Access-Control-Allow-Headers', '*');

				try {
					this._handleRequest(req, res);
				} catch (err) {
					if (err.name === 'RequestError') this._handleRequestError(err, req, res);
					else this._handleAppError(err);
				}
			})
			.listen(port)
			.withShutdown();

		const msg = 'Server running on port ' + port + '.  Using config [' + this._configFile + ']';
		console.log(msg);
		this._servicelog('info', msg);

		return this;
	}

	// -----------------------------------------------------
	// Shutdown server
	// -----------------------------------------------------
	shutdown() {
		this._servicelog('info', 'NodeHookR shutting down');
		if (!this._server) return;
		this._server.shutdown(() => {
			this._servicelog('info', 'NodeHookR shutdown complete');
		});

		return this;
	}

	// -----------------------------------------------------
	// Sendmail
	// -----------------------------------------------------
	_sendmail(opts) {
		this._mailer.send(opts).catch((err) => {
			this._handleAppError(err);
		});
	}

	// -----------------------------------------------------
	// Log handlers
	// -----------------------------------------------------
	_servicelog(severity, message, data) {
		this._log('service', severity, message, data);
	}
	_requestslog(severity, message, data) {
		this._log('requests', severity, message, data);
	}
	_routerlog(severity, message, data) {
		this._log('router', severity, message, data);
	}
	_pluginlog(severity, message, data) {
		this._log('plugins', severity, message, data);
	}

	_log(logname, severity, message, data) {
		if (!logname) return;

		const logger = this._loggers[logname];
		if (!logger) return;

		let sev = 'info';
		if (!!severity) sev = severity.toLowerCase();

		switch (sev) {
			case 'info':
				logger.info(message, data);
				break;
			case 'warn':
				logger.warn(message, data);
				break;
			case 'error':
				logger.error(message, data);
				break;
		}
	}

	// -----------------------------------------------------
	// Application error
	//
	// These errors are things that have occured in the
	// server which are internal and should not be reported
	// to the user (such as bad plugins, error sending mail,
	// etc.)
	// -----------------------------------------------------
	_handleAppError(err) {
		this._servicelog('error', err.message, err);

		if (this.config.mailer && this.config.mailer.apperrors) {
			// Omitting the enabled means to still do error notification
			// only if it is explicitly disabled, do we not send
			if (this.config.mailer.enabled !== false) {
				const cfg = this.config.mailer.apperrors;
				let body = 'Error:\n\n' + err.message + '\n\nStack Trace:\n\n' + err.stack;

				// If there is an inner exception, we want to show it as well.
				if (err.inner)
					body += '\n\nInner Error:\n\n' + JSON.stringify(err.inner, null, 2) + '\n\n' + err.inner.stack;

				let opts = Object.assign(
					{ text: body, subject: (cfg.prefix || '[NodeHookR ERROR] ') + err.message },
					cfg
				);

				this._mailer.send(opts).catch((err) => {
					// Well, if we get an error while handling an error,
					// all we can do is log it.  Emails are broken
					this._servicelog('error', err.message, { error: err, stack: err.stack });
				});
			}
		}
	}

	// -----------------------------------------------------
	// Request errors
	//
	// These errors are reserved for those which the user
	// should know about, such as invalid routes or
	// bad parameters being specified.
	// -----------------------------------------------------
	_handleRequestError(err, request, response) {
		const url_parts = url.parse(request.url, true);
		let payload = '';

		if (!!request.post) payload = request.post.Value;

		this._requestslog('error', err.message, { error: err, client: url_parts, payload: payload });

		response.writeHead(err.code, { 'Content-Type': 'text/plain' });
		response.write(err.message);
		response.end();
	}

	// -----------------------------------------------------
	// Handle http requests
	// -----------------------------------------------------
	_handleRequest(request, response) {
		// Split out the URL
		const url_parts = url.parse(request.url, true);

		this._requestslog('info', 'HTTP Request', { client: url_parts });

		const path = url_parts.pathname;

		if (path === '/favicon.ico') {
			response.writeHead(204, { 'Content-Type': 'text/plain' });
			response.end();
			return;
		}

		// If we didn't find a matching route, return an error
		if (!this._router.exists(path)) {
			throw new RequestError(422, 'Invalid or no route supplied');
		}

		// If the route doesn't match the type, then return an error
		if (!this._router.matches(request.method, path)) {
			throw new RequestError(405, 'Specified route does not support ' + request.method);
		}

		this._processRequest(request, response);
	}

	// -----------------------------------------------------
	// Process request data
	// -----------------------------------------------------
	_processRequest(request, response) {
		let queryData = '';

		request.on('data', (data) => {
			queryData += data;
			if (queryData.length > 1e6) {
				queryData = '';
				response.writeHead(413, { 'Content-Type': 'text/plain' }).end();
				request.connection.destroy();
			}
		});

		request.on('end', () => {
			let payload = '';
			if (this._isJSON(queryData)) payload = JSON.parse(queryData);
			else payload = queryData;

			const url_parts = url.parse(request.url, true);
			const params = url_parts.query;

			response.remoteAddress = request.connection.remoteAddress;
			response.remoteHost = request.headers.host;
			response.remoteOrigin = request.headers.origin;
			response.remoteUserAgent = request.headers['user-agent'];

			this._writeResponse(response, this._router.exec(request.method, url_parts.pathname, params, payload));
		});
	}

	_isJSON(str) {
		try {
			const json = JSON.parse(str);
			return typeof json === 'object';
		} catch (e) {
			return false;
		}
	}

	_writeResponse(response, content) {
		if (!content) {
			response.writeHead(204, { 'Content-Type': 'text/plain' });
			response.write('');
		} else if (typeof content === 'string') {
			response.writeHead(200, { 'Content-Type': 'text/plain' });
			response.write(content);
		} else {
			const json = JSON.stringify(content);
			response.writeHead(200, { 'Content-Type': 'application/json' });
			response.write(json);
		}
		response.end();
	}

	_createLogger(logprefix, opts) {
		// Logs always goes to console
		let transports = [];

		if (opts.console) transports.push(new winston.transports.Console());

		// Use /logs as default unless specified
		const path = opts.path || './logs';

		// If we can't find the specified path, try to create it
		if (!fs.existsSync(path)) {
			fs.mkdirSync(path);
		}

		if (!!opts) {
			const filename = path + '/' + (opts.prefix || logprefix + '_') + '%DATE%.log';
			transports.push(
				new winston.transports.DailyRotateFile(
					Object.assign(
						{
							filename: filename,
							datePattern: 'YYYY-MM-DD-HH',
							zippedArchive: true,
							maxSize: opts.maxSize || '20m',
							maxFiles: opts.maxFiles || '14d'
						},
						opts
					)
				)
			);
		}

		return winston.createLogger({ transports: transports });
	}
}

module.exports = Server;
