var chai = require('chai');
var chaiHttp = require('chai-http');
var Router = require('../router.js');

var expect = chai.expect;
chai.use(chaiHttp);

var router = new Router();

const stub_path = './test/__tests__/';
const stubs = {
	good_plugin: stub_path + 'plugins/good-plugin.js'
};

//=============================================================================
//													Test Plugin Registration
//=============================================================================
describe('Plugin Registration', function() {
	beforeEach(() => {
		router._nodehookr = {
			config: () => {},
			logger: () => {}
		};
		router._logger = () => {};
		router._plugins = [];
		router._routes = [];
	});

	it('Should not allow empty plugin object, but should exit gracefully', function() {
		router._registerPlugins();
		expect(router._plugins).to.be.empty;
	});

	it('Should not register plugin if it has no routes', function() {
		router._registerPlugins([]);
		expect(router._plugins).to.be.empty;
	});

	it('Should throw an error if the plugin file is not found', function() {
		var param = [ { routes: [ { path: 'bad path' } ] } ];
		expect(() => router._registerPlugins(param)).to.throw(Error, /Plugin file .* not found/);
	});

	it('Should not register plugin if routes array does not exist', function() {
		var param = [ { path: stubs.good_plugin } ];
		router._registerPlugins(param);
		expect(router._plugins).to.be.empty;
	});

	it('Should not register plugin if routes array is empty', function() {
		var param = [ { path: stubs.good_plugin, routes: [] } ];
		router._registerPlugins(param);
		expect(router._plugins).to.be.empty;
	});

	it('Should throw an error if empty match pattern', function() {
		var param = [ { path: stubs.good_plugin, routes: [ {} ] } ];
		expect(() => router._registerPlugins(param)).to.throw(Error, /No route match pattern specified/);
	});

	it('Should not allow route without callback', function() {
		var param = [ { path: stubs.good_plugin, routes: [ { match: '/fred/' } ] } ];
		expect(() => router._registerPlugins(param)).to.throw(Error, /Callback method not defined/);
	});

	it('Should throw an error if the callback is not in the plugin', function() {
		var param = [ { path: stubs.good_plugin, routes: [ { match: '/fred/', callback: 'bad' } ] } ];
		expect(() => router._registerPlugins(param)).to.throw(Error, /Callback .* not found/);
	});

	it('Should not allow callback to be a non function', function() {
		var param = [ { path: stubs.good_plugin, routes: [ { match: '/fred/', callback: 'propString' } ] } ];
		expect(() => router._registerPlugins(param)).to.throw(Error, /Callback .* is not a function/);
	});

	it('Should not allow duplicate routes', function() {
		var param = [
			{
				path: stubs.good_plugin,
				routes: [ { match: '/fred/', callback: 'fnString' }, { match: '/fred/', callback: 'fnString' } ]
			}
		];
		expect(() => router._registerPlugins(param)).to.throw(Error, /Duplicate route/);
	});
});

//=============================================================================
//													Test Route Matching
//=============================================================================
describe('Pattern matching for routes', function() {
	before(() => {
		router._plugins = [];
		router._routes = [];
		var param = [
			{
				path: stubs.good_plugin,
				routes: [
					{ method: 'GET', match: '/UPPERCASE', callback: 'fnString' },
					{ method: 'GET', match: '/lowercase', callback: 'fnString' },
					{ method: 'POST', match: '/lowercase', callback: 'fnString' },
					{ method: 'DELETE', match: '/lowercase', callback: 'fnString' },
					{ method: 'GET', match: '/reg.*path', callback: 'fnString' },
					{ method: 'GET', match: '/strictpath$', callback: 'fnString' },
					{ method: 'GET', match: '/myapi/path', callback: 'fnString' }
				]
			}
		];
		router._registerPlugins(param);
	});

	it('Should find properly specified routes', function() {
		expect(router.get('GET', '/UPPERCASE')).to.have.property('match', '/UPPERCASE');
		expect(router.get('GET', '/lowercase')).to.have.property('match', '/lowercase');
		expect(router.get('GET', '/myapi/path')).to.have.property('match', '/myapi/path');
	});

	it('Should find regex routes', function() {
		expect(router.get('GET', '/uppercasewithmoreafterit')).to.have.property('match', '/UPPERCASE');
		expect(router.get('GET', '/regpath')).to.have.property('match', '/reg.*path');
		expect(router.get('GET', '/registerpath')).to.have.property('match', '/reg.*path');
		expect(router.get('GET', '/rEGister  path')).to.have.property('match', '/reg.*path');
	});

	it('Should find a route regardless of upper/lower case', function() {
		expect(router.get('GET', '/uppercase')).to.have.property('match', '/UPPERCASE');
		expect(router.get('GET', '/LOWERCASE')).to.have.property('match', '/lowercase');
		expect(router.get('GET', '/LOWerCAse')).to.have.property('match', '/lowercase');
	});

	it('Should not find a route where slightly different', function() {
		expect(router.get('GET', 'uppercases')).to.be.false;
		expect(router.get('GET', '/uppercas')).to.be.false;
		expect(router.get('GET', '/strictpath/')).to.be.false;
		expect(router.get('GET', 'uppercase/')).to.be.false;
	});

	it('Should not find a routes that have different method', function() {
		expect(router.get('POST', '/uppercase')).to.be.false;
		expect(router.get('POST', '/myapi/path')).to.be.false;
	});

	it('Should find same route with different methods', function() {
		expect(router.get('GET', '/lowercase')).to.have.property('method', 'GET');
		expect(router.get('POST', '/lowercase')).to.have.property('method', 'POST');
		expect(router.get('DELETE', '/lowercase')).to.have.property('method', 'DELETE');
	});
});

//=============================================================================
//													Test Misc Corner Cases
//=============================================================================
describe('Internal corner cases', function() {
	before(() => {
		router._routes = [ { method: 'GET', _match: new RegExp('/path'), _callback: 'string' } ];
	});
	it('Should throw an error if attempting to execute a non existent route', function() {
		expect(() => router.exec('GET', 'NotFound')).to.throw(Error, /Route .* not found/);
	});

	it('Should throw an error if callback function becomes a non-function', function() {
		expect(() => router.exec('GET', '/path')).to.throw(Error, /Callback defined .* is not a function/);
	});
});
