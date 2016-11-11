const path = require('path');

class Entry {
    static entryFrom(obj) {
        const entry = new Entry(obj.id);
        entry.normalizedId = obj.normalizedId;
        entry.type = obj.type;
        entry.step = obj.step;
        entry.effectiveExt = obj.effectiveExt;
        entry.dependents = obj.dependents;
        entry.variation = obj.variation;
        entry.sourceVersions = new Map(obj.sourceVersions);
        entry.dependencies = new Map(obj.dependencies);
        return entry;
    }

    constructor(id) {
        this.id = id;
        this.normalizedId;
        this.type;
        this.step = 0;
        this.effectiveExt = path.extname(id);
        this.sourceVersions = new Map();
        this.dependencies = new Map();
        this.dependents = [];
    }

    getSource(transformIds) {
        if (!Array.isArray(transformIds)) throw new Error(`Expected "${transformIds}" to be an array.`);
        return this.sourceVersions.get(transformIds.join('_') || 'raw');
    }

    getClosestSource(transformIds) {
        for (let i = transformIds.length; i >= 0; i--) {
            const key = transformIds.slice(0, i).join('_');
            if (this.sourceVersions.has(key)) {
                return {
                    transformIds: key.split('_'),
                    source: this.sourceVersions.get(key),
                };
            }
        }

        return {transformIds: null, source: this.sourceVersions.get('raw')};
    }

    addDependent(dependent) {
        if (this.dependents.indexOf(dependent) >= 0) return;

        this.dependents.push(dependent);
    }

    setDependencies(deps) {
        if (deps instanceof Map) return this.dependencies = deps;
        Object.keys(deps).forEach(dependencyLiteral => this.dependencies.set(dependencyLiteral, deps[dependencyLiteral]));
    }

    setStep(step) {
        this.step = step;
    }

    setSource(transformIds, source, effectiveExt=this.effectiveExt) {
        this.effectiveExt = effectiveExt;
        this.sourceVersions.set(transformIds.join('_'), source);
    }

    setData(obj) {
        Object.keys(obj).forEach(key => {
            this[key] = obj[key];
        });
    }

    // For debugging purposes
    toString() {
        return {
            id: this.id,
            normalizedId: this.normalizedId,
            variation: this.variation,
            type: this.type,
            dependents: this.dependents,
            dependencies: this.dependencies,
        };
    }

    serialize() {
        return {
            id: this.id,
            normalizedId: this.normalizedId,
            type: this.type,
            step: this.step,
            variation: this.variation,
            effectiveExt: this.effectiveExt,
            dependents: this.dependents,
            sourceVersions: Array.from(this.sourceVersions.entries()),
            dependencies: Array.from(this.dependencies.entries()),
        };
    }
}

module.exports = Entry;
