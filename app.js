var Server = require('./server.js');

server = new Server();
server.start('./test/__tests__/configs/test_config.json');
