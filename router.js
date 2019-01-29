var fs = require('fs');

// -----------------------------------------------------
// Define routes
// -----------------------------------------------------
var router = {
	createRouter: function(config, logger, pluginlog) {
		router._config = config;
		router._logger = logger;
		router._pluginlog = pluginlog;
		router._plugins = [];
		router._routes = [];

		router._registerPlugins(config.plugins);

		return router;
	},

	exists: function(path) {
		for (var i = 0; i < router._routes.length; i++) {
			if (path.match(router._routes[i].match)) return true;
		}
		return false;
	},

	matches: function(method, path) {
		var route = router.get(method, path);
		if (!route) return false;
		return true;
	},

	get: function(method, path) {
		for (var i = 0; i < router._routes.length; i++) {
			if (!!path && !!router._routes[i]._match && path.match(router._routes[i]._match)) {
				if (method.toLowerCase() === router._routes[i].method.toLowerCase()) {
					return router._routes[i];
				}
			}
		}
		return false;
	},

	add: function(plugin, route) {
		if (!fs.existsSync(plugin.path)) throw new Error('Plugin file [' + plugin.path + '] not found');

		var instance = require(plugin.path);

		// Init function is optional
		if (!!instance.init) {
			if (typeof instance.init !== 'function')
				throw new Error('The property [init] in plugin [' + plugin.name + '] is not a function');

			instance.init(router._config, router._pluginlog);
		}

		if (!route.match)
			throw new Error('No route match pattern specified in routes for plugin [' + plugin.name + ']');

		// Default route method is get
		if (!route.method) route.method = 'GET';

		if (router.matches(route.method, route.match))
			throw new Error('Duplicate route [' + route.match + '] when adding plugin [' + plugin.name + ']');

		if (!route.callback) throw new Error('Callback method not defined for route [' + route.match + ']');

		var callback = instance[route.callback];
		if (!callback)
			throw new Error('Callback function [' + route.callback + '] not found in plugin [' + plugin.name + ']');

		if (typeof callback !== 'function')
			throw new Error(
				'Callback [' + route.callback + '] defined for route [' + route.match + '] is not a function'
			);

		route._callback = callback;
		route._match = new RegExp(route.match, 'i');
		router._routes.push(route);
	},

	exec: function(method, path, params, payload) {
		var route = router.get(method, path);

		if (!route) throw new Error('Route [' + path + '] not found');

		// Recheck, just to make sure
		if (typeof route._callback !== 'function')
			throw new Error('Callback defined for route [' + route.name + '] is not a function');

		// Merge in parameters from request with those from the config
		// parameters from the config file take precedence over the url
		return route._callback(Object.assign(params || {}, route.params || {}), payload);
	},

	_registerPlugins: function(plugins) {
		if (!plugins) return;

		for (var i = 0; i < plugins.length; i++) {
			var plugin = plugins[i];

			// Only plugins with routes should be registered
			if (!plugin.routes || plugin.routes.length === 0) return;

			plugin.routes.forEach((route) => {
				router.add(plugin, route);
			});

			router._plugins.push(plugin);
		}
	}
};

module.exports = router;
