class Plugin {
	constructor(nodehookr) {
		this._config = nodehookr.config;
		this._logger = nodehookr.logger;
		this._sendmail = nodehookr._sendmail;
	}

	fnString(params, payload) {
		return 'returning a string';
	}

	get propString() {
		return 'String property';
	}
}

module.exports = Plugin;
