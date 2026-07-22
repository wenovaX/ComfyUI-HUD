export class HUDSelectionState {
    constructor() {
        this.names = new Set();
        this.lastIndex = -1;
    }

    clear({ resetIndex = false } = {}) {
        this.names.clear();
        if (resetIndex) this.lastIndex = -1;
    }

    has(name) {
        return this.names.has(name);
    }

    add(name) {
        this.names.add(name);
    }

    delete(name) {
        this.names.delete(name);
    }

    toggle(name) {
        if (this.names.has(name)) this.names.delete(name);
        else this.names.add(name);
    }

    setOnly(name, index = this.lastIndex) {
        this.names.clear();
        if (name) this.names.add(name);
        this.lastIndex = index;
    }

    addRange(items, start, end) {
        const s = Math.max(0, Math.min(start, end));
        const e = Math.max(start, end);
        for (let i = s; i <= e; i++) {
            const name = items?.[i]?.name;
            if (name) this.names.add(name);
        }
    }

    selectAll(items) {
        this.names.clear();
        for (let i = 0; i < items.length; i++) {
            const name = items[i]?.name;
            if (name) this.names.add(name);
        }
    }

    toArray() {
        return Array.from(this.names);
    }

    get size() {
        return this.names.size;
    }
}

export class HUDClipboardState {
    constructor() {
        this.data = { type: null, paths: [] };
        this.pathSet = new Set();
    }

    replace(value) {
        const type = value?.type === "cut" || value?.type === "copy" ? value.type : null;
        const paths = Array.isArray(value?.paths) ? value.paths.slice() : [];
        this.data = { type, paths };
        this.pathSet = new Set(paths);
    }

    set(type, paths) {
        const safeType = type === "cut" ? "cut" : "copy";
        const safePaths = Array.isArray(paths) ? paths.filter(Boolean) : [];
        this.data = { type: safeType, paths: safePaths };
        this.pathSet = new Set(safePaths);
    }

    clear() {
        this.data = { type: null, paths: [] };
        this.pathSet.clear();
    }

    hasPaths() {
        return this.data.paths.length > 0;
    }

    isCut() {
        return this.data.type === "cut";
    }

    includes(path) {
        return this.pathSet.has(path);
    }
}

export class HUDPathHistory {
    constructor(maxEntries = 50) {
        this.maxEntries = maxEntries;
        this.entries = [];
        this.index = -1;
    }

    setEntries(entries) {
        this.entries = Array.isArray(entries) ? entries.slice() : [];
        this.index = this.entries.length - 1;
    }

    record(currentPath, nextPath) {
        if (!nextPath || nextPath === currentPath) return;
        if (this.index < this.entries.length - 1) {
            this.entries = this.entries.slice(0, this.index + 1);
        }
        this.entries.push(nextPath);
        if (this.entries.length > this.maxEntries) {
            this.entries.shift();
        }
        this.index = this.entries.length - 1;
    }

    back() {
        if (this.index <= 0) return null;
        this.index -= 1;
        return this.entries[this.index] || null;
    }

    forward() {
        if (this.index >= this.entries.length - 1) return null;
        this.index += 1;
        return this.entries[this.index] || null;
    }
}
