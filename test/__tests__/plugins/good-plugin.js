var plugin = {
	init: function(config, logger) {
		plugin._config = config;
		plugin._logger = logger;
		return plugin;
	},

	fnString: function(params, payload) {
		return 'returning a string';
	},

	propString: 'String property'
};

module.exports = plugin;
