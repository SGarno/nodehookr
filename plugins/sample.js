var sample = {
	init: function(config, logger) {
		sample._config = config;
		sample._logger = logger;
		sample._logger('info', 'sample plugin initialized');
		return sample;
	},

	myFunction1: function(params, payload) {
		sample._logger('info', 'Got a request for myFunction1', { params: params, payload: payload });
		return params.configParam;
	},

	myFunction2: function(params, payload) {
		sample._logger('info', 'Got a request for myFunction2', { params: params, payload: payload });
		return sample._config.userdata;
	}
};

module.exports = sample;
