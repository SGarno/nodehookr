const nodemailer = require('nodemailer');
const https = require('https');
const handlebars = require('handlebars');
const fs = require('fs');
const autobind = require('auto-bind');

class Mailer {
	constructor(webhookr) {
		this._config = webhookr.config;
		this._logger = webhookr.logger;

		https.globalAgent.options.secureProtocol = 'SSLv3_method';
		if (!!this._config.mailer) this._transport = nodemailer.createTransport(this._config.mailer);
		autobind(this);
	}

	// -----------------------------------------------------
	// Send email with optional template processing
	// -----------------------------------------------------
	send(options) {
		if (!this._transport) return;

		const opts = Object.assign({}, options);

		// Load up the template(s) and populate the message
		if (!!opts.textTemplate) {
			const textContent = this._loadTemplate(opts.textTemplate);
			const textTemplate = handlebars.compile(textContent);
			opts.text = textTemplate(opts.data);
		}

		if (!!opts.htmlTemplate) {
			const htmlContent = this._loadTemplate(opts.htmlTemplate);
			const htmlTemplate = handlebars.compile(htmlContent);
			opts.html = htmlTemplate(opts.data);
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

	_loadTemplate(template) {
		// If the user specified a template, assume it is a path
		// to a template file
		let filename = template;

		// Now, check to see if it is a reference to a template in
		// the config file.   If so, then the template was the name
		// of the template in the config file.   So use that.
		const cfg = this._config.mailer.templates;
		if (cfg && cfg[template] && cfg[template].file) filename = cfg[template].file;

		return fs.readFileSync(filename, 'utf-8');
	}
}
module.exports = Mailer;
