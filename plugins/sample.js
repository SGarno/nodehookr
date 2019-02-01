class Sample {
	constructor(nodehookr) {
		this._config = nodehookr.config;
		this._logger = nodehookr.logger;

		this._logger('info', 'sample plugin initialized');
	}

	myFunction1(params, payload) {
		this._logger('info', 'Got a request for myFunction1', { params: params, payload: payload });
		return params.configParam;
	}

	myFunction2(params, payload) {
		this._logger('info', 'Got a request for myFunction2', { params: params, payload: payload });
		return this._config.userdata;
	}
}

module.exports = Sample;
