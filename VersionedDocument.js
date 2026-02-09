class VersionedDocument {
    constructor(inputData, schema) {
        this.schemaFields = schema.fields;
        this.config = {
            maxHistory: schema._maxHistory || 10,
            minTimeGap: schema._minTimeGap || 2000,
            maxCharLimit: schema._maxCharLimit || 2000
        };

        if (inputData && typeof inputData._version === 'number') {
            this.doc = {
                ...inputData,
                _archive: inputData._archive || []
            };
        } else {
            this.doc = {
                ...inputData,
                _version: 1,
                _lastUpdatedAt: 0,
                _archive: []
            };
            this._validate(this.doc);
        }
    }

    // Pomoćna metoda za računanje trenutne veličine u karakterima
    _getCurrentSize() {
        return JSON.stringify(this.doc).length;
    }

    // NOVA METODA: Vraća broj preostalih karaktera do limita
    getRemainingChars() {
        const currentSize = this._getCurrentSize();
        const remaining = this.config.maxCharLimit - currentSize;
        return remaining > 0 ? remaining : 0;
    }

    _checkSize(targetDoc) {
        const size = JSON.stringify(targetDoc).length;
        if (size > this.config.maxCharLimit) {
            throw new Error(`Size limit error: ${size}/${this.config.maxCharLimit} chars.`);
        }
        return size;
    }

    _validate(data) {
        for (const key in this.schemaFields) {
            const rule = this.schemaFields[key];
            const value = data[key];

            if (rule.required && (value === undefined || value === null)) {
                throw new Error(`Field '${key}' is required.`);
            }
            if (value !== undefined && value !== null) {
                if (typeof value !== rule.type) {
                    throw new Error(`Field '${key}' must be ${rule.type}.`);
                }
                if (rule.type === "string" && value.length > rule.maxLength) {
                    throw new Error(`Field '${key}' exceeds max length.`);
                }
            }
        }
    }

    _getDiff(newData) {
        const diffs = [];
        for (const key in this.schemaFields) {
            if (Object.prototype.hasOwnProperty.call(newData, key)) {
                if (this.doc[key] !== newData[key]) {
                    diffs.push({
                        field: key,
                        from: this.doc[key] !== undefined ? this.doc[key] : null,
                        to: newData[key]
                    });
                }
            }
        }
        return diffs;
    }

    update(newData, expectedVersion) {
        const now = Date.now();

        if (this.doc._version !== expectedVersion) {
            throw new Error(`Concurrency error: Current v${this.doc._version}, sent v${expectedVersion}.`);
        }
        
        if (now - this.doc._lastUpdatedAt < this.config.minTimeGap) {
            throw new Error("Rate limit: Too many updates.");
        }

        this._validate({ ...this.doc, ...newData });

        const diff = this._getDiff(newData);
        if (diff.length === 0) return this.doc;

        const archiveEntry = {
            _v: this.doc._version,
            _at: new Date().toISOString(),
            _diff: diff
        };

        const nextDoc = {
            ...this.doc,
            ...newData,
            _version: this.doc._version + 1,
            _lastUpdatedAt: now,
            _archive: [...this.doc._archive, archiveEntry].slice(-this.config.maxHistory)
        };

        this._checkSize(nextDoc);

        this.doc = nextDoc;
        return this.doc;
    }

    getSnapshot(targetVersion) {
        if (targetVersion === this.doc._version) return this._stripMeta(this.doc);

        let currentData = { ...this.doc };
        const sortedArchive = [...this.doc._archive].sort((a, b) => b._v - a._v);

        for (const entry of sortedArchive) {
            if (entry._v < targetVersion) break;
            entry._diff.forEach(change => { currentData[change.field] = change.from; });
            if (entry._v === targetVersion) return this._stripMeta(currentData);
        }
        throw new Error(`Version ${targetVersion} not found.`);
    }

    _stripMeta(obj) {
        const clean = {};
        for (const key in obj) { if (!key.startsWith('_')) clean[key] = obj[key]; }
        return clean;
    }

    toJSON() {
        return this.doc;
    }
}

module.exports = VersionedDocument;