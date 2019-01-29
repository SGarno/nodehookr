var chai = require('chai');
var chaiHttp = require('chai-http');
var sinon = require('sinon');
var server = require('../server.js');
var proxyquire = require('proxyquire');

var assert = chai.assert;
var expect = chai.expect;
chai.use(chaiHttp);

var url = 'http://localhost:3820';
const stub_path = './test/__tests__/';
const stubs = {
	logs_path: 'logs',
	good_plugin: stub_path + 'plugins/good-plugin.js',
	bad_init: stub_path + 'plugins/bad-init.js',
	config_valid: stub_path + 'configs/test_config.json',
	config_invalid: stub_path + 'configs/invalid_config.json'
};

describe('Configuration', function() {
	before(() => {}),
		it('Should load default config file', function() {
			var results = server.config();
			assert(results.default);
		});

	it('Should throw error message if config file is invalid', function() {
		server._configFile = stubs.config_invalid;
		delete server._config;
		assert.throws(server.config, Error, 'Unexpected token');
	});

	it('Should load test config', function() {
		server._configFile = stubs.config_valid;
		delete server._config;
		var results = server.config();
		assert(results.test);
	});

	it('Should not reload config file if already loaded', function() {
		server._configFile = 'test/__tests__/configs/bad_config.json';
		var results = server.config().pathcheck;
		assert(results === 'Valid', 'configuration file not reloaded');
	});
});

describe('Server initialization failures', function() {
	var routerStub = {
		createRouter: () => {
			throw new Error('testing router error');
		}
	};
	var server = proxyquire('../server.js', { './router': routerStub });
	var logspy = sinon.spy(server, '_servicelog');

	it('Should throw an error if the router throws one and quit', function(done) {
		expect(() => {
			server.start(stubs.test_config);
		}).to.throw(Error, /Error occured during router intialization/);
		done();
	});

	it('Should also report an error to the service log since it is running', function(done) {
		assert(logspy.calledWithMatch('error', 'Error occured during router intialization'));
		done();
	});
});

describe('Server', function() {
	before(function() {
		server.start(stubs.config_valid);
	});

	it('Should return 422', function(done) {
		chai.request(url).get('/badmethod').end(function(err, res) {
			expect(res).to.have.status(422);
			done();
		});
	});

	it('Should return route 1 static config parameter', function(done) {
		chai.request(url).get('/TestRoute/1').end(function(err, res) {
			expect(res).to.have.status(200);
			expect(res).to.be.text;
			assert.equal(res.text, 'Config from Route #1');
			done();
		});
	});

	it('Should return route 2 static config parameter', function(done) {
		chai.request(url).get('/Route/2/Test').end(function(err, res) {
			expect(res).to.have.status(200);
			expect(res).to.be.text;
			assert.equal(res.text, 'Config From Route #2');
			done();
		});
	});

	it('Should call TestFN2 and return a JSON object', function(done) {
		chai.request(url).post('/TestFN2').end(function(err, res) {
			expect(res).to.have.status(200);
			expect(res).to.be.json;
			expect(res.body).has.property('samples');
			expect(res.body).has.property('text', 'You can use any type of object');
			done();
		});
	});

	it('Should call TestFN2 with body of JSON', function(done) {
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

	after(function() {
		server.shutdown();
	});
});
