const fs = require('fs');
const autobind = require('auto-bind');

// -----------------------------------------------------
// Define routes
// -----------------------------------------------------
class Router {
	constructor(nodehookr, logger) {
		this._plugins = [];
		this._routes = [];

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

	logger(sev, msg, data) {
		if (!this._nodehookr || !this._nodehookr.logger) return;
		this._nodehookr.logger(sev, msg, data);
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
		if (!fs.existsSync(plugin.path)) throw new Error('Plugin file [' + plugin.path + '] not found');

		const Plugin = require(plugin.path);
		let instance = new Plugin(this._nodehookr);

		if (!route.match)
			throw new Error('No route match pattern specified in routes for plugin [' + plugin.name + ']');

		// Default route method is get
		if (!route.method) route.method = 'GET';

		if (this.matches(route.method, route.match))
			throw new Error('Duplicate route [' + route.match + '] when adding plugin [' + plugin.name + ']');

		if (!route.callback) throw new Error('Callback method not defined for route [' + route.match + ']');

		let callback = instance[route.callback];
		if (!callback)
			throw new Error('Callback function [' + route.callback + '] not found in plugin [' + plugin.name + ']');

		if (typeof callback !== 'function')
			throw new Error(
				'Callback [' + route.callback + '] defined for route [' + route.match + '] is not a function'
			);

		route._callback = callback.bind(instance);
		route._match = new RegExp(route.match, 'i');
		this._routes.push(route);
		return this;
	}

	exec(method, path, params, payload) {
		const route = this.get(method, path);

		if (!route) throw new Error('Route [' + path + '] not found');

		// Recheck, just to make sure
		if (typeof route._callback !== 'function')
			throw new Error('Callback defined for route [' + route.name + '] is not a function');

		// Merge in parameters from request with those from the config
		// parameters from the config file take precedence over the url
		return route._callback(Object.assign(params || {}, route.params || {}), payload);
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
