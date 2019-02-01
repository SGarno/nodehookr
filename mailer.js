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

		// Send the mail
		this._transport.sendMail(opts, () => {
			if (error) {
				throw new Error('Unable to send mail', { options: mailOpts, error: error, response: response });
			} else {
				this._logger('info', 'Message sent to: ' + mailOpts.to + ' subject:' + mailOpts.subject);
			}
		});
	}

	_loadTemplate(filename) {
		if (!filename) throw new Error('Email template [' + template + '] not found in configuration.');
		return fs.readFileSync(filename, 'utf-8');
	}
}
module.exports = Mailer;
