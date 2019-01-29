# NodeJS WebHook Router  (NodeHookR)


## Introduction

NodeHookR is an easy to use webhook and router written in NodeJS.   With NodeHookR, you just need to write a NodeJS module and setup the configuration file and NodeHookR will take care of the rest!

## Features

* Config file based plugins and router definitions
* Plugin system for extending webhooks
* Pattern matching router to your module functions
* Separate loggers for each component that can be configured independently, including file rotations for maximum file size, daily, and max number of rotations to retain.   Loggers are provided for
  * Web Service
  * Router
  * HTTP Requests
  * Plugins

## Installation


``` bash
# npm
npm install --save nodehookr
```

``` bash
# yarn
yarn add nodehookr
```

# Getting Started

## TL;DR

All you need to do are three things:

1. **Create your plugin**
    1. Create an init(config,logger) function
    2. Create the function(s) you want to route to
    3. Place it in the `/plugins` directory
2. **Create the config.json** file specifying what route goes to which function
3. **Create the starting node.js file** that calls server.start()  (or use the provided `app.js`)

### Plugin js file (i.e. plugins/myPlugin.js)

``` javascript
// myPlugin.js
var plugin = {
  init: (config,logger) => {}
  myFunc: (params,payload) => {
    `... code here ...`
}
```

### Config file (config.json)

``` javascript
{
  "port": 8080,
  "plugins": [
    {
      "name": "",           // Name of your plugin
      "path": "",           // Path to your .js file
      "routes": [           // Array of routes for plugin
        { "match": "",      // RegEx route pattern
          "method": "",     // POST, GET, DELETE, etc.
          "callback": "",   // Function name
          "params": { } }   // Parameters to pass to plugin
      ]
    }
  ]
}
```
### Starting application (i.e. app.js or index.js)

``` javascript
  // app.js
  var server = require('NodeHookR');
  server.start();
```


That's it!

<br/>
<br/>

*...Ok, well a little more info then?...*

<br/>
<br/>

# Creating a Plugin

A plugin is a simple nodejs module that exports an `init()` function and any function that you want the router to have access to.   Below is a sample of a plugin for NodeHookR


``` javascript
var sample = {
  init: function(config, logger) {
    sample._config = config;  // Save the configuration for later use
    sample._logger = logger;  // Save the logger for later use
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
```

## Create the init() function

Technically, `init` is the only function required in your module, but not having any other functions wouldn't be very useful; as it means your router has nothing to route to!   

The `init` function will be called with two parameters: `config` and `logger`.   Config is the object that matches the content in the `config.json` that is used to start the service with.   `logger` is a function that can be used by your plugin to send messages to the logger.

If you do not need any information from the config file or do not wish to do any logging, you can ignore these two parameters.

## Create the function(s) you want to use as a webhook

Any function that the router executes will be called with two parameters: `params` and `payload`.   The first parameter (`params` in this case) will contain the parameters received from the URL merged in with the parameters from the config file.   Payload is the body of any request.

> NOTE: The config file parameters take precedence over any parameters with the same name coming from the URL.   This allows you to pass information to the function that will prevent the user from having control over in the URL.

Thats it!  Now, on to setting up the config file.

# Creating the config file

Techically, the config file is not required, but NodeHooR will look in the current working directory for a file with the name `config.json`.    If this file exists, it will use it to set up the routing, logging and service operation.   

The config file uses a standard JSON format and will look for the following properties:

* `port` - Port number fo the service to listen on
* `log` - Logging startup parameters
* `plugins` - Plugin and routing information

Any other properties in the config file will be ignored and can be used by your plugin(s) for startup information.   The format for the config file should look something along the lines of:

``` javascript
{
  "port":  "",        // Port number of listener service
  "log": {
    "service": {},    // Service log configuration
    "router": {},     // Router log configuration
    "plugins": {},    // Plugin log configuration
    "requests": {}    // HTTP request log configuration
  },
  "plugins": []       // List of plugins to install for routing
}
```

## Port Property

This is a number or a string containing the port number that NodeHookR will start up with.   If you do not specify this value, NodeHookR will default to port 3000.

## Log Property

The log property specifies how each of the loggers will operate.   By default no loggers are enabled, but when they are, NodeHookR will write logs to `logs` in the current directory (if one is not provided).   NodeHookR will create the directory if it does not exist.

There are 4 loggers that could be started:

* `service` - Any NodeHookR service messages will be logged here.   These messages will contain information about startup and shutdown, what the listener port is, service failures, etc.
* `router` - All information regarding what routes were received and processed.
* `plugins` - Any messages logged by your plugins (if desired)
* `requests` - Low level HTTP request information.   Usually used for debugging network traffic.

You can control the filenames and locations for these log files, but if the option is not specified, it will use the following format:

```
      ./logs/{name}_YYYY-MM-DD-HH.log
```

Where `name` is one of the above log names.   You can override how logging is processed by providing logging options in the config file using the format:

``` javascript
  "log": {
    "requests": {},    // Logging options for HTTP requests
    "service": {},     // Logging options for NodeHookR service
    "router": {},      // Logging options for router
    "plugins": {},     // Logging options for plugins
  }
```

The standard definition for a log entry options is as follows:

``` javascript
{
  "enabled": false,     // Enable/disable logging
  "path": "",           // Directory to place log files
  "prefix": "",         // Log name prefix (defaults to log entry)
  "console": false      // Enable/disable console logging
}
```

* `enabled` - Setting this value to `true` will start the logging for that log service.
* `path` - This property specifies the location where the log files will be written.   Default is `./logs`
* `prefix` - If you do not wish to use the name of the logger as the beginning of the file, you can change it using the prefix property.  For example, you can rename the router log file to start with `daily_routes`.  The date timestamp will still be appended.
* `console` - Setting this property to `true` will enable console *in addition to* the written logger.   This is useful when running the service in interactive mode and debugging.

> NOTE:  Under the covers, NodeHookR uses the [winston](https://github.com/winstonjs/winston) and [winston-daily-rotate-file](https://github.com/winstonjs/winston-daily-rotate-file) logging modules.   If you wish to perform some advanced logging capabilities, such as altering the max file size, archiving, date naming patterns, etc., you can pass any parameters acceptable by the [winston-daily-rotate-file](https://github.com/winstonjs/winston-daily-rotate-file) from the config file.


## Plugins Property

The plugins property is what provides all of the information for what plugins to load and what routing is to occur.   Each plugin you specify can have multiple routes, however, no two routes can equate to the same value for the same HTTP method, even across multiple plugins.

For example, `/myroute` can go to two different functions, one for POST and one for GET, but two different plugins cannot use the same `/myroute`.

The following is a from the `config.json` file you will find in this repository.

``` json
    {
      "name": "sample",
      "path": "./plugins/sample.js",
      "routes": [
        { "match": "{regex ", "method": "POST", "callback": "myFunction2" },
        {
          "match": "/(((Test)*Route/1)|(Route/1/Test))$",
          "method": "GET",
          "callback": "myFunction1",
          "params": { "configParam": "Config from Route #1" }
        },
        {
          "match": "/(((Test)*Route/2)|(Route/2/Test))$",
          "method": "GET",
          "callback": "myFunction1",
          "params": { "configParam": "Config From Route #2" }
        }
      ]
    }
  ]
```

* `name` is a textual description for the plugin which is used in error reporting.
* `path` provides the location of the plugin js file.  It uses `require` so you can either specify a .js filename or a directory with a file in it labeled index.js.
* `match` is the regex expression for what the url will be matched against to determine if the function is to be called.   I find [regextester](https://www.regextester.com/) handy for helping determine if I have it all right.
* `method` specifies which http method the route applies, such as GET, POST, DELETE, etc.
* `callback` is the name of the function in the plugin module that is to be called.  The callback function will be passed a params object (merge parameters from the url and from he config file) as well as a payload (body of the request).


Hope you find NodeHookR useful!    Let me know if you have any bugs or suggestions!


## TODOs

There are a few things that are on my TODO list, and will be implemented as soon as I am able.

* HTTPS support
* 100% code coverage on tests

Let me know if you have any others 


## Credits

### OpenSource software used in NodeHookR
* [Winston](https://github.com/winstonjs/winston) is a fantastic logger module which allows you to configure multiple transports and formats for all types of logging.
* [Http-Shutdown](https://github.com/thedillonb/http-shutdown) provides a graceful shutdown to a node server rather than a forced close.

### Testing software used

* [mocha](https://mochajs.org/) JavaScript testing frameworks for doing all the automated testing in NodeHookR
* [chai](https://www.chaijs.com/) assertion library for evaluating the test cases.
* [istanbul](https://istanbul.js.org/) is an excellent package for managing test case code coverage.
* [sinon](https://sinonjs.org/) allows for stubs and spies to be used in the test cases for NodeHookR.
* [proxyquire](https://github.com/thlorenz/proxyquire) enables stubbing out 'require'd modules for getting at those difficult test cases on dependent libraries.

### Big thank you to everyone who put together these fine open source packages!

### License

NodeHookR is [MIT licensed](https://opensource.org/licenses/MIT).
