const fs = require('fs');
const autobind = require('auto-bind');

const Errors = require('./errors');
const AppError = Errors.AppError;
const RequestError = Errors.RequestError;

// -----------------------------------------------------
// Define routes
// -----------------------------------------------------
class Router {
	constructor(nodehookr, routerlog, handleAppError) {
		this._plugins = [];
		this._routes = [];
		this._logger = routerlog;

		// If the plugin is async, we need to handle the error
		// in an async fashion (i.e. no throwing of errors)
		this._handleAppError = handleAppError;

		// Router needs a copy of the whole object to pass to plugins
		this._nodehookr = nodehookr;

		// Register any plugins defined in the config file
		if (!!this.config && !!this.config.plugins) this._registerPlugins(this.config.plugins);

		autobind(this);
	}

	get config() {
		if (!this._nodehookr || !this._nodehookr.config) {
			return {};
		}
		return this._nodehookr.config;
	}

	exists(path) {
		for (let i = 0; i < this._routes.length; i++) {
			if (path.match(this._routes[i].match)) return true;
		}
		return false;
	}

	matches(method, path) {
		const route = this.get(method, path);
		if (!route) return false;
		return true;
	}

	get(method, path) {
		for (let i = 0; i < this._routes.length; i++) {
			if (!!path && !!this._routes[i]._match && path.match(this._routes[i]._match)) {
				if (method.toLowerCase() === this._routes[i].method.toLowerCase()) {
					return this._routes[i];
				}
			}
		}
		return false;
	}

	add(plugin, route) {
		if (!fs.existsSync(plugin.path)) throw new AppError('Plugin file [' + plugin.path + '] not found');

		let Plugin = require(plugin.path);
		let instance = new Plugin(this._nodehookr);

		if (!route.match)
			throw new AppError('No route match pattern specified in routes for plugin [' + plugin.name + ']');

		// Default route method is get
		if (!route.method) route.method = 'GET';

		if (this.matches(route.method, route.match))
			throw new AppError('Duplicate route [' + route.match + '] when adding plugin [' + plugin.name + ']');

		if (!route.callback) throw new AppError('Callback method not defined for route [' + route.match + ']');

		let callback = instance[route.callback];
		if (!callback)
			throw new AppError('Callback function [' + route.callback + '] not found in plugin [' + plugin.name + ']');

		if (typeof callback !== 'function')
			throw new AppError(
				'Callback [' + route.callback + '] defined for route [' + route.match + '] is not a function'
			);

		this._logger(
			'info',
			'Registering route path [' +
				route.match +
				'] to execute [' +
				route.callback +
				'] in plugin [' +
				plugin.path +
				']'
		);

		route._callback = callback.bind(instance);
		route._match = new RegExp(route.match, 'i');
		this._routes.push(route);
		return this;
	}

	exec(method, path, params, payload) {
		const route = this.get(method, path);

		if (!route) throw new RequestError(422, 'Route [' + path + '] not found');

		// Recheck, just to make sure
		if (typeof route._callback !== 'function')
			throw new AppError('Callback defined for route [' + route.name + '] is not a function');

		this._logger('info', 'Route [' + path + '] recieved.  Executing [' + route.callback + ']', route.params);

		// Merge in parameters from request with those from the config
		// parameters from the config file take precedence over the url
		let results;
		try {
			results = route._callback(Object.assign(params || {}, route.params || {}), payload);
			if (results.then && typeof results.then === 'function') {
				results.catch((err) => {
					this._handleAppError(err);
				});
			}
		} catch (err) {
			throw new AppError(err.message, err);
		}
		return results;
	}

	_registerPlugins(plugins) {
		if (!plugins) return;

		for (let i = 0; i < plugins.length; i++) {
			const plugin = plugins[i];

			// Only plugins with routes should be registered
			if (!plugin.routes || plugin.routes.length === 0) return;

			plugin.routes.forEach((route) => {
				this.add(plugin, route);
			});

			this._plugins.push(plugin);
		}
	}
}

module.exports = Router;
