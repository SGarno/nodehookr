var chai = require('chai');
var chaiHttp = require('chai-http');
var sinon = require('sinon');
var Server = require('../server.js');
var proxyquire = require('proxyquire');

var assert = chai.assert;
var expect = chai.expect;
chai.use(chaiHttp);

var server;

var url = 'http://localhost:3820';
const stub_path = './test/__tests__/';
const stubs = {
	logs_path: 'logs',
	good_plugin: stub_path + 'plugins/good-plugin.js',
	config_valid: stub_path + 'configs/test_config.json',
	invalid_config: stub_path + 'configs/invalid_config.json'
};

describe('Configuration', function() {
	before(() => {
		server = new Server();
	});

	it('Should load default config file', function() {
		const results = server.config;
		assert(results.default);
	});

	it('Should throw error message if config file is invalid', function() {
		() => {
			assert.throws(server.config, Error, 'Unexpected token');
		};
	});

	it('Should load test config', function() {
		server._configFile = stubs.config_valid;
		delete server._configData;
		const results = server.config;
		assert(results.test);
	});

	it('Should not reload config file if already loaded', function() {
		server._configFile = 'test/__tests__/configs/bad_config.json';
		const results = server.config.pathcheck;
		assert(results === 'Valid', 'configuration file not reloaded');
	});
});

// describe('Server initialization failures', function() {
// 	let routerStub = {
// 		createRouter: () => {
// 			throw new Error('testing router error');
// 		}
// 	};
// 	const ProxyServer = proxyquire('../server.js', { './router': routerStub });
// 	const server = new ProxyServer();
// 	const logspy = sinon.spy(server, '_servicelog');

// 	// it('Should throw an error if the router throws one and quit', function(done) {
// 	// 	expect(() => {
// 	// 		server.start(stubs.test_config);
// 	// 	}).to.throw(Error, /Error occured during router intialization/);
// 	// 	done();
// 	// });

// 	it('Should also report an error to the service log since it is running', function(done) {
// 		assert(logspy.calledWithMatch('error', 'Error occured during router intialization'));
// 		done();
// 	});
// });

describe('Server', () => {
	before(() => {
		server = new Server();
		server.start(stubs.config_valid);
	});

	it('Should return 422', (done) => {
		chai.request(url).get('/badmethod').end((err, res) => {
			expect(res).to.have.status(422);
			done();
		});
	});

	it('Should return route 1 static config parameter', (done) => {
		chai.request(url).get('/TestRoute/1').end(function(err, res) {
			expect(res).to.have.status(200);
			expect(res).to.be.text;
			assert.equal(res.text, 'Config from Route #1');
			done();
		});
	});

	it('Should return route 2 static config parameter', (done) => {
		chai.request(url).get('/Route/2/Test').end(function(err, res) {
			assert.equal(res.status, 200);
			expect(res).to.be.text;
			assert.equal(res.text, 'Config From Route #2');
			done();
		});
	});

	it('Should call TestFN2 and return a JSON object', (done) => {
		chai.request(url).post('/TestFN2').end(function(err, res) {
			expect(res).to.have.status(200);
			expect(res).to.be.json;
			expect(res.body).has.property('samples');
			expect(res.body).has.property('text', 'You can use any type of object');
			done();
		});
	});

	it('Should call TestFN2 with body of JSON', (done) => {
		chai
			.request(url)
			.post('/TestFN2')
			.set('Content-Type', 'application/json')
			.send('{ "test": "hello"}')
			.end(function(err, res) {
				expect(res).to.have.status(200);
				expect(res).to.be.json;
				expect(res.body).has.property('samples');
				expect(res.body).has.property('text', 'You can use any type of object');
				done();
			});
	});

	it('Should attempt to send mail', (done) => {
		chai.request(url).get('/sendmail').end(function(err, res) {
			done();
		});
	});

	after(function() {
		server.shutdown();
	});
});
