// Can use Websocket!
const net = require('net');

// Consistent API as WS or others this way.
const realWrite = net.Socket.prototype.write;
const realEmit = net.Socket.prototype.emit;
const CONTENT_DELIMITER = '\u0004';
let buffer = '';
net.Socket.prototype.send = function(str) {
    if (typeof str === 'object') str = JSON.stringify(str);
    this.write(str);
};

net.Socket.prototype.write = function(str) {
    // end of transmission
    realWrite.call(this, str + CONTENT_DELIMITER);
};

net.Socket.prototype.emit = function(name, content) {
    if (name !== 'data') return realEmit.apply(this, arguments);

    let delimitInd;
    while ((delimitInd = content.indexOf(CONTENT_DELIMITER)) >= 0) {
        realEmit.call(this, 'data', buffer + content.slice(0, delimitInd));
        content = content.slice(delimitInd + CONTENT_DELIMITER.length);
        buffer = '';
    }

    buffer += content;
};

module.exports = {
    getServer(addr) {
        const server = net.createServer().listen({path: addr});
        process.on('exit', () => server.close());
        process.on('SIGINT', () => server.close());
        server.on('connection', socket => socket.setEncoding('utf8'));
        return server;
    },
    getClient(addr) {
        const connection = net.connect({path: addr});
        connection.setEncoding('utf8');
        process.on('exit', () => connection.end());
        return connection;
    },
};
