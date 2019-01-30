// ============================================================================
//                              NodeHookR
//
// This is the main service entry point.    It loads the configuration file,
// sets up the logger service, and then initializes the router.   When are
// request comes in, it matches it with a route and if it passes, then
// executes the route.
// ============================================================================
var fs = require('fs');
var winston = require('winston');
var http = require('http');
var url = require('url');
var router = require('./router');
require('winston-daily-rotate-file');
require('http-shutdown').extend();

var server = {
	// Set default values
	_configFile: './config.json',
	_loggers: [],

	// -----------------------------------------------------
	// Load configuration
	// -----------------------------------------------------
	config: function() {
		// Only read the config file once, but allow the config
		// file to be re-loaded at a later time (i.e. file watch)
		// at some future release.
		if (!server._config) {
			if (fs.existsSync(server._configFile)) {
				server._config = JSON.parse(fs.readFileSync(server._configFile));
			} else {
				server._config = { log: [] };
			}
		}
		return server._config;
	},

	// -----------------------------------------------------
	// START Server
	// -----------------------------------------------------
	start: function(config) {
		// Set the config file if specified, otherwise, use the default
		// It is done this way because later config() will be hot loaded
		if (!!config) server._configFile = config;

		// Initialize loggers
		for (let [ log, opts ] of Object.entries(server.config().log)) {
			try {
				// Only initialize valid logger entries
				if (log.match(/^(service|router|plugins|requests)$/)) {
					if (opts.enabled === undefined || opts.enabled)
						server._loggers[log] = server.createLogger(log, opts);
				}
			} catch (e) {}
		}

		// Initialize the router any errors will quit the service
		try {
			server.router = router.createRouter(server.config(), server._routerlog, server._pluginlog);
		} catch (e) {
			let err = new Error('Error occured during router intialization');
			server._servicelog('error', err.message, e);
			err.original = e;
			err.stack = e.stack.split('\n').slice(0, 2).join('\n') + '\n' + e.stack;
			throw err;
		}

		try {
			var port = server.config().port || '3000';

			// Initialize the http server
			server._server = http
				.createServer(function(req, res) {
					// Set CORS headers
					res.setHeader('Access-Control-Allow-Origin', '*');
					res.setHeader('Access-Control-Request-Method', '*');
					res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST, PUT, PATCH, DELETE');
					res.setHeader('Access-Control-Allow-Headers', '*');

					try {
						server.handleRequest(req, res);
					} catch (e) {
						server.handleError(503, 'Unexpected error occured handling request', req, res, e);
					}
				})
				.listen(port)
				.withShutdown();
		} catch (e) {
			server._servicelog('Error', 'Error during server startup', e);
			return server;
		}
		console.log('Server running on port ' + port);
		server._servicelog('Server running on port ' + port);

		return server;
	},

	// -----------------------------------------------------
	// Log handlers
	// -----------------------------------------------------
	_servicelog: function(severity, message, data) {
		server._log('service', severity, message, data);
	},
	_requestslog: function(severity, message, data) {
		server._log('requests', severity, message, data);
	},
	_routerlog: function(severity, message, data) {
		server._log('router', severity, message, data);
	},
	_pluginlog: function(severity, message, data) {
		server._log('plugins', severity, message, data);
	},

	_log: function(logname, severity, message, data) {
		var logger;

		if (!logname) return;

		var logger = server._loggers[logname];
		if (!logger) return;

		var sev = 'info';
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
	},

	// -----------------------------------------------------
	// Shutdown server
	// -----------------------------------------------------
	shutdown: function() {
		server._servicelog('info', 'Server shutting down...');
		if (!server._server) return;
		server._server.shutdown(function() {
			server._servicelog('info', 'Server shutdown complete.');
		});
	},

	// -----------------------------------------------------
	// Handle errors
	// -----------------------------------------------------
	handleError: function(code, msg, request, response, err) {
		var url_parts = url.parse(request.url, true);
		var payload = '';

		if (!!request.post) payload = request.post.Value;

		server._requestslog('warn', msg, { error: err, client: url_parts, payload: payload });
		server._servicelog('error', msg, { error: err, client: url_parts });

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
	},

	// -----------------------------------------------------
	// Handle http requests
	// -----------------------------------------------------
	handleRequest: function(request, response) {
		// Split out the URL
		var url_parts = url.parse(request.url, true);

		server._requestslog('info', 'HTTP Request', { client: url_parts });

		var path = url_parts.pathname;

		if (path === '/favicon.ico') {
			response.writeHead(204, { 'Content-Type': 'text/plain' });
			response.end();
			return;
		}

		// If we didn't find a matching route, return an error
		if (!router.exists(path)) {
			return server.handleError(422, 'Invalid or no route supplied', request, response);
		}

		// If the route doesn't match the type, then return an error
		if (!router.matches(request.method, path)) {
			return server.handleError(405, 'Specified route does not support ' + request.method, request, response);
		}

		server.processRequest(request, response);
	},

	// -----------------------------------------------------
	// Process request data
	// -----------------------------------------------------
	processRequest: function(request, response) {
		var queryData = '';

		request.on('data', function(data) {
			queryData += data;
			if (queryData.length > 1e6) {
				queryData = '';
				response.writeHead(413, { 'Content-Type': 'text/plain' }).end();
				request.connection.destroy();
			}
		});

		request.on('end', function() {
			var payload = '';
			if (server.isJSON(queryData)) payload = JSON.parse(queryData);
			else payload = queryData;

			try {
				var url_parts = url.parse(request.url, true);
				var params = url_parts.query;

				payload.remoteAddress = request.connection.remoteAddress;
				payload.remoteHost = request.headers.host;
				payload.remoteOrigin = request.headers.origin;
				payload.remoteUserAgent = request.headers['user-agent'];

				server.writeResponse(response, router.exec(request.method, url_parts.pathname, params, payload));
			} catch (e) {
				return server.handleError(
					500,
					'Error occured while processing ' + request.method + ' request for ' + url_parts.pathname,
					request,
					response,
					e
				);
			}
		});
	},

	isJSON: function(str) {
		try {
			var json = JSON.parse(str);
			return typeof json === 'object';
		} catch (e) {
			return false;
		}
	},

	writeResponse: function(response, content) {
		if (!content) {
			response.writeHead(204, { 'Content-Type': 'text/plain' });
			response.write('');
		} else if (typeof content === 'string') {
			response.writeHead(200, { 'Content-Type': 'text/plain' });
			response.write(content);
		} else {
			var json = JSON.stringify(content);
			response.writeHead(200, { 'Content-Type': 'application/json' });
			response.write(json);
		}
		response.end();
	},

	createLogger: function(logprefix, opts) {
		// Logs always goes to console
		var transports = [];

		if (opts.console) transports.push(new winston.transports.Console());

		// Use /logs as default unless specified
		var path = './logs';
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
};

module.exports = server;
