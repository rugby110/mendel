const path = require('path');
const Entry = require('./entry');
const EventEmitter = require('events').EventEmitter;

class MendelCache extends EventEmitter {
    constructor() {
        super();
        this._store = new Map();
    }

    getNormalizedId(id) {
        if (isNodeModule(id)) return id;
        return id;
    }

    getType(id) {
        if (isNodeModule(id)) return 'node_modules';

        const extname = path.extname(id);
        if (['.js', '.jsx', '.json'].indexOf(extname) >= 0) return 'source';
        return 'binary';
    }

    getVariation() {
        return 'still working on it';
    }

    addEntry(id) {
        this._store.set(id, new Entry(id));
        const entry = this._store.get(id);
        entry.variation = this.getVariation(id);
        entry.normalizedId = this.getNormalizedId(id);
        entry.type = this.getType(id);
    }

    hasEntry(id) {
        return Promise.resolve(this._store.has(id));
    }

    getEntry(id) {
        return Promise.resolve(this._store.get(id));
    }

    deleteEntry(id) {
        this._store.delete(id);
    }

    setStep(id, step) {
        this._store.get(id).setStep(step);
    }

    setSource({id, transformIds, source, effectiveExt}) {
        if (!this._store.get(id)) {
            console.error(id);
        }
        this._store.get(id).setSource(transformIds, source, effectiveExt);
    }

    setDependencies(id, dependencyMap) {
        const entry = this._store.get(id);

        Object.keys(dependencyMap).forEach(dependencyKey => {
            const dep = dependencyMap[dependencyKey];
            dep.browser = this.getNormalizedId(dep.browser);
            dep.main = this.getNormalizedId(dep.main);
        });

        entry.setDependencies(dependencyMap);

        return dependencyMap;
    }
}

function isNodeModule(id) {
    return id.indexOf('node_modules') >= 0;
}

class MendelCacheServer extends MendelCache {
    constructor(server, config) {
        super(config);

        this.clients = [];

        server.on('listening', () => this.emit('ready'));
        server.on('connection', (client) => {
            this.clients.push(client);
            client.on('end', () => {
                this.clients.splice(this.clients.indexOf(client), 1);
            });

            client.on('data', (data) => {
                data = typeof data === 'object' ? data : JSON.parse(data);
                if (!data || !data.type) return;

                switch (data.type) {
                    case 'sync':
                        {
                            Object.assign(data, {
                                value: Array.from(this._store.entries())
                                    .map(([key, value]) => [key, value.serialize()]),
                            });
                            break;
                        }
                    case 'hasEntry':
                        {
                            return super.hasEntry(data.id).then(has => {
                                return client.send(Object.assign(data, {value: has}));
                            });
                        }
                    case 'getEntry':
                        {
                            return super.getEntry(data.id).then(entry => {
                                return client.send(Object.assign(data, {value: entry.serialize()}));
                            });
                        }
                    case 'setChange':
                        {
                            const entry = super.getEntry(data.id);
                            const value = data.value;

                            if (value.type === 'transform') {
                                entry.setSource({
                                    transformIds: value.transformIds,
                                    source: value.source,
                                    effectiveExt: value.effectiveExt,
                                });
                            } else if (value.type === 'deps') {
                                entry.setDependencies(value.deps);
                            } else {
                                entry.setData(value.value);
                            }
                            return;
                        }
                    default:
                        return;
                }
                client.send(data);
            });
        });
    }
}

class MendelCacheClient extends MendelCache {
    constructor(client, config) {
        super(config);

        this._unresolvedHasEntry = new Map();
        this._unresolvedGetEntry = new Map();

        this.connection = client;
        this.connection.on('data', (data) => {
            // console.log('client got some data!', data.length);
            data = JSON.parse(data);
            if (!data || !data.type) return;

            switch (data.type) {
                case 'sync':
                    {
                        data.value.forEach(([key, value]) => {
                            this._store.set(key, Entry.entryFrom(value));
                        });
                        this.emit('ready');
                        break;
                    }
                case 'hasEntry':
                    {
                        const resolve = this._unresolvedHasEntry.get(data.id);
                        this._unresolvedHasEntry.delete(data.id);
                        resolve(data.value);
                        break;
                    }
                case 'getEntry':
                    {
                        const resolve = this._unresolvedGetEntry.get(data.id);
                        this._unresolvedGetEntry.delete(data.id);

                        const entry = Entry.entryFrom(data.value);
                        this._store.set(data.id, entry);
                        // Deserialize Entry
                        resolve(entry);
                        break;
                    }
                default:
                    return;
            }
        });

        // Request for all entries for warming the cache.
        this.connection.on('connect', () => this.connection.send({type: 'sync'}));
        this.connection.on('end', () => {
            // Disconnected from the master
        });
    }

    addEntry(id) {
        super.addEntry(id);
        this.send({
            type: 'addEntry',
            id,
        });
    }

    // delete should not happen on the client
    deleteEntry() {
        throw new Error('deleteEntry should not happen on the client side');
    }

    hasEntry(id) {
        return super.hasEntry(id).then(hasEntry => {
            if (hasEntry) return true;

            return new Promise((resolve) => {
                this._unresolvedHasEntry.set(id, resolve);
                this.send({
                    type: 'hasEntry',
                    id,
                });
            });
        });
    }

    getEntry(id) {
        return super.hasEntry(id).then(hasEntry => {
            if (hasEntry) return super.getEntry(id);

            return new Promise((resolve) => {
                this._unresolvedGetEntry.set(id, resolve);
                this.connection.send({
                    type: 'getEntry',
                    id,
                });
            });
        });
    }

    setSource({id, transformIds, source, effectiveExt}) {
        super.setSource({id, transformIds, source, effectiveExt});
        this.connection.send({
            type: 'setData',
            id,
            value: {
                type: 'transform',
                transformIds,
                source,
                effectiveExt,
            },
        });
    }

    setStep() {
        // noop; child process cannot set an arbitrary step
    }

    setDependencies(id, dependencyMap) {
        const deps = super.setDependencies(id, dependencyMap);
        this.connection.send({
            type: 'setData',
            id,
            value: {
                type: 'deps',
                deps,
            },
        });
    }
}

module.exports = {
    Server: MendelCacheServer,
    Client: MendelCacheClient,
};
