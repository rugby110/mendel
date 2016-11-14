const debug = require('debug')('mendel:pipeline');
const analyticsCollector = require('./helpers/analytics/analytics-collector');
const AnalyticsCliPrinter = require('./helpers/analytics/cli-printer');
const Transformer = require('./transformer');
const MendelRegistry = require('./registry');
const MendelCache = require('./cache');
const Initialize = require('./step/initialize');
const Watcher = require('./step/fs-watcher');
const Reader = require('./step/fs-reader');
const IST = require('./step/ist');
const DepResolver = require('./step/deps');
const ClientFeeder = require('./step/client-feeder');
const fs = require('fs');
const network = require('./network');

module.exports = MendelPipeline;

function MendelPipeline(options) {
    analyticsCollector.setOptions({
        printer: new AnalyticsCliPrinter({enableColor: true}),
    });

    // TODO: need standalone in case of no watcher
    let mode = 'server';
    const location = '.mendel.fd';
    try {
        fs.statSync(location);
        mode = 'client';
    } catch (e) {
        // no empty block
    }

    const registry = new MendelRegistry(
        mode === 'server' ? new MendelCache.Server(network.getServer(location)) : new MendelCache.Client(network.getClient(location)),
        options
    );
    const transformer = new Transformer(options.transforms, options);

    let steps;
    // Pipeline steps
    const initializer = new Initialize({registry, transformer}, options);
    const depsResolver = new DepResolver({registry, transformer}, options);
    const ist = new IST({registry, transformer}, options);
    let fileStep; // Steps that can give us # of file/entries

    if (mode === 'server') {
        const watcher = new Watcher({registry, transformer}, options);
        const reader = new Reader({registry, transformer}, options);
        steps = [watcher, reader, ist, depsResolver];
        fileStep = watcher;
    } else {
        const feeder = new ClientFeeder({registry, transformer}, options);
        const ist = new IST({registry, transformer}, options);
        steps = [feeder, ist, depsResolver];
        fileStep = feeder;
    }

    for (let i = 0; i < steps.length - 1; i++) {
        const curStep = steps[i];
        const nextStep = steps[i + 1];
        curStep.on('done', function({entryId}) {
            registry.setStep(entryId, i);
            registry.getEntry(entryId)
            .then(entry => {
                nextStep.perform.apply(nextStep, [entry].concat(Array.prototype.slice.call(arguments, 1)));
            })
            .catch(e => console.error(e));
        });
    }
    steps[steps.length - 1].on('done', ({entryId}) => registry.setStep(entryId, steps.length - 1));

    if (options.watch !== true) {
        let doneDeps = 0;
        let totalEntries = 0;

        fileStep.on('done', () => totalEntries++);
        depsResolver.on('done', () => {
            doneDeps++;
            if (totalEntries === doneDeps) {
                debug(`${totalEntries} entries were processed.`);
                debug(
                    Array.from(registry._mendelCache._store.values())
                    .map(({id}) => id)
                    .join('\n')
                );
                process.exit(0);
            }
        });
    }

    // COMMENCE!
    registry.on('ready', () => initializer.start());
}
