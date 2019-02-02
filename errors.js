class AppError extends Error {
	constructor(message, inner) {
		super(message);
		this.name = 'AppError';
		this.inner = inner;
	}
}

class RequestError extends Error {
	constructor(code, message, inner) {
		super(message);
		this.name = 'RequestError';
		this.inner = inner;
		this.code = code;
	}
}

module.exports = { AppError: AppError, RequestError: RequestError };
