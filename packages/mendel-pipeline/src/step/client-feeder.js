const BaseStep = require('./step');

class ClientFeeder extends BaseStep {
    constructor({registry}) {
        super();

        registry.on('ready', () => {
            const ids = registry.getAllEntryIds();
            ids.forEach(entryId => this.emit('done', {entryId}));
        });
    }
    perform() {
        throw new Error('This method should never get called.');
    }
}

module.exports = ClientFeeder;
