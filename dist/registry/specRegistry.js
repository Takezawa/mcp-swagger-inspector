import { loadAndDereference, indexOperations } from "./openapiUtils.js";
export class SpecRegistry {
    specs = new Map();
    list() {
        return Array.from(this.specs.values());
    }
    get(id) {
        return this.specs.get(id);
    }
    async add(id, urlOrPath) {
        const { raw, dereferenced } = await loadAndDereference(urlOrPath);
        const operations = indexOperations(id, dereferenced);
        const item = {
            id,
            urlOrPath,
            raw,
            dereferenced,
            loadedAt: new Date().toISOString(),
            operations
        };
        this.specs.set(id, item);
        return item;
    }
    async reload(id) {
        const existing = this.specs.get(id);
        if (!existing)
            throw new Error(`Spec not found: ${id}`);
        return this.add(id, existing.urlOrPath);
    }
    remove(id) {
        return this.specs.delete(id);
    }
    // 検索ヘルパ
    findOperation(args) {
        const haystack = args.specId ? (this.get(args.specId)?.operations ?? []) : this.list().flatMap(s => s.operations);
        if (args.operationId) {
            const ops = haystack.filter(o => o.operationId === args.operationId);
            if (ops.length === 1)
                return ops[0];
            // specId 指定がないとき重複する可能性があるので path+method も見る
        }
        if (args.path && args.method) {
            const m = args.method.toLowerCase();
            return haystack.find(o => o.path === args.path && o.method === m);
        }
        return undefined;
    }
    searchOperations(filter) {
        const haystack = filter.specId ? (this.get(filter.specId)?.operations ?? []) : this.list().flatMap(s => s.operations);
        let result = haystack;
        if (filter.tag) {
            result = result.filter(o => o.tags?.includes(filter.tag));
        }
        if (filter.method) {
            const m = filter.method.toLowerCase();
            result = result.filter(o => o.method === m);
        }
        if (filter.pathPattern) {
            const re = new RegExp(filter.pathPattern);
            result = result.filter(o => re.test(o.path));
        }
        if (filter.text) {
            const q = filter.text.toLowerCase();
            result = result.filter(o => (o.summary ?? "").toLowerCase().includes(q) ||
                (o.description ?? "").toLowerCase().includes(q) ||
                (o.operationId ?? "").toLowerCase().includes(q) ||
                o.path.toLowerCase().includes(q));
        }
        if (filter.limit && result.length > filter.limit) {
            result = result.slice(0, filter.limit);
        }
        return result;
    }
}
//# sourceMappingURL=specRegistry.js.map