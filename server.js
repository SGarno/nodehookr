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
			try {
				// Only initialize valid logger entries
				if (log.match(/^(service|router|plugins|requests)$/)) {
					if (opts.enabled === undefined || opts.enabled) this._loggers[log] = this._createLogger(log, opts);
				}
			} catch (e) {}
		}

		// Set up the callbacks for the plugins
		this._hooks = {
			config: this.config,
			sendmail: this._sendmail.bind(this),
			logger: this._pluginlog.bind(this)
		};

		// Initialize the router any errors will quit the service
		try {
			this._router = new Router(this._hooks, this._routerlog);
		} catch (e) {
			const err = new Error('Error occured during router intialization');
			this._servicelog('error', err.message, e);
			err.original = e;
			err.stack = e.stack.split('\n').slice(0, 2).join('\n') + '\n' + e.stack;
			throw err;
		}

		// Initialize the mailer
		try {
			this.mailer = new Mailer(this._hooks, this._mailerlog);
		} catch (e) {
			const err = new Error('Error occured during mailer intialization');
			this._servicelog('error', err.message, e);
			err.original = e;
			err.stack = e.stack.split('\n').slice(0, 2).join('\n') + '\n' + e.stack;
			throw err;
		}

		const port = this.config.port || '3000';
		try {
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
					} catch (e) {
						this._handleError(503, 'Unexpected error occured handling request', req, res, e);
					}
				})
				.listen(port)
				.withShutdown();
		} catch (e) {
			this._servicelog('Error', 'Error during server startup', e);
			return this;
		}
		console.log('Server running on port ' + port);
		this._servicelog('Server running on port ' + port);

		return this;
	}

	// -----------------------------------------------------
	// Shutdown server
	// -----------------------------------------------------
	shutdown() {
		this._servicelog('info', 'Server shutting down...');
		if (!this._server) return;
		this._server.shutdown(() => {
			this._servicelog('info', 'Server shutdown complete.');
		});

		return this;
	}

	// -----------------------------------------------------
	// Sendmail
	// -----------------------------------------------------
	_sendmail(opts) {
		mailer.send(opts);
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
				logger.info(message, data);
				break;
			case 'error':
				logger.info(message, data);
				break;
		}
	}

	// -----------------------------------------------------
	// Handle errors
	// -----------------------------------------------------
	_handleError(code, msg, request, response, err) {
		const url_parts = url.parse(request.url, true);
		let payload = '';

		if (!!request.post) payload = request.post.Value;

		this._requestslog('warn', msg, { error: err, client: url_parts, payload: payload });
		this._servicelog('error', msg, { error: err, client: url_parts });

		response.writeHead(code, { 'Content-Type': 'text/html' });

		response.write('<h1>');
		response.write(msg);
		response.write('</h1>');

		if (!!err) {
			response.write('<h2>');
			response.write(err.message || msg);
			response.write('</h2>');
			response.write('<pre>');
			response.write(err.stack || '');
			response.write('</pre>');
		}

		response.end();

		//mail.sendError('Warning', msg, { error: err, client: url_parts, payload: payload });
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
			return this._handleError(422, 'Invalid or no route supplied', request, response);
		}

		// If the route doesn't match the type, then return an error
		if (!this._router.matches(request.method, path)) {
			return this._handleError(405, 'Specified route does not support ' + request.method, request, response);
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
			try {
				const params = url_parts.query;

				response.remoteAddress = request.connection.remoteAddress;
				response.remoteHost = request.headers.host;
				response.remoteOrigin = request.headers.origin;
				response.remoteUserAgent = request.headers['user-agent'];

				this._writeResponse(response, this._router.exec(request.method, url_parts.pathname, params, payload));
			} catch (e) {
				return this._handleError(
					500,
					'Error occured while processing ' + request.method + ' request for ' + url_parts.pathname,
					request,
					response,
					e
				);
			}
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
		const path = './logs';
		if (!!opts.path) path = opts.path;

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
