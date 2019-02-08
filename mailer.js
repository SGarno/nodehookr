const nodemailer = require('nodemailer');
const https = require('https');
const handlebars = require('handlebars');
const fs = require('fs');
const autobind = require('auto-bind');

class Mailer {
	constructor(webhookr) {
		this._config = webhookr.config;
		this._logger = webhookr.logger;

		if (!!this._config.mailer) this._transport = nodemailer.createTransport(this._config.mailer);
		autobind(this);
	}

	// -----------------------------------------------------
	// Send email with optional template processing
	// -----------------------------------------------------
	send(options) {
		if (!this._transport) return;

		// Get the default values from the config file, if html and text
		// templates are both specified, then
		let cfgOpts = {};
		if (!!this._config.mailer.templates) cfgOpts = this._config.mailer.templates[options.template] || {};

		// Merge the config file and parameters passed, where the
		// parameters passed take precedence over the config
		const opts = Object.assign({}, cfgOpts, options);

		// Load up the template(s) and populate the message
		if (!!opts.textfile) {
			const textContent = this._loadTemplate(opts.textfile);
			const textTemplate = handlebars.compile(textContent);
			opts.text = textTemplate(opts);
		}

		if (!!opts.htmlfile) {
			const htmlContent = this._loadTemplate(opts.htmlfile);
			const htmlTemplate = handlebars.compile(htmlContent);
			opts.html = htmlTemplate(opts);
		}

		// Sendmail runs asynchronously (which is what we want), but
		// the error handling cannot return the information back to
		// the user when this happens.   It can, however, go to the
		// log file
		return new Promise((resolve, reject) => {
			this._transport.sendMail(opts, (error, data) => {
				if (error) {
					reject(error);
				} else {
					resolve(data);
				}
			});
		});
	}

	_loadTemplate(filename) {
		return fs.readFileSync(filename, 'utf-8');
	}
}
module.exports = Mailer;
