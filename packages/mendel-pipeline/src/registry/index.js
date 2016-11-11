const EventEmitter = require('events').EventEmitter;
const verbose = require('debug')('verbose:mendel:registry');

class MendelRegistry extends EventEmitter {
    constructor(mendelCache) {
        super();

        this._mendelCache = mendelCache;
        this._mendelCache.on('ready', () => this.emit('ready'));
    }

    emit(eventName, entry) {
        if (entry && entry.id) {
            verbose(eventName, entry.id);
        } else {
            verbose(eventName);
        }
        EventEmitter.prototype.emit.apply(this, arguments);
    }

    addToPipeline(dirPath) {
        this.emit('entryRequested', null, dirPath);
    }

    addEntry(filePath) {
        this._mendelCache.addEntry(filePath);
    }

    addRawSource(filePath, source) {
        this._mendelCache.setSource({id: filePath, transformIds: ['raw'], source});
    }

    addTransformedSource({filePath, transformIds, effectiveExt, source}) {
        this._mendelCache.setSource({id: filePath, transformIds, source, effectiveExt});
    }

    setDependencies(filePath, deps) {
        this._mendelCache.setDependencies(filePath, deps);
    }

    setStep(filePath, step) {
        this._mendelCache.setStep(filePath, step);
    }

    remove(filePath) {
        this._mendelCache.deleteEntry(filePath);

        // Because Entry is deleted, we don't really dispatch with the Entry
        this.emit('entryRemoved', filePath);
    }

    getEntry(filePath) {
        return this._mendelCache.getEntry(filePath);
    }

    getAllEntryIds() {
        return Array.from(this._mendelCache._store.keys());
    }

    hasEntry(filePath) {
        return this._mendelCache.hasEntry(filePath);
    }
}

module.exports = MendelRegistry;
