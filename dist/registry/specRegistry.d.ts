import type { IndexedOperation, LoadedSpec } from "../types.js";
export declare class SpecRegistry {
    private specs;
    list(): LoadedSpec[];
    get(id: string): LoadedSpec | undefined;
    add(id: string, urlOrPath: string): Promise<LoadedSpec>;
    reload(id: string): Promise<LoadedSpec>;
    remove(id: string): boolean;
    findOperation(args: {
        specId?: string;
        operationId?: string;
        method?: string;
        path?: string;
    }): IndexedOperation | undefined;
    searchOperations(filter: {
        specId?: string;
        tag?: string;
        method?: string;
        pathPattern?: string;
        text?: string;
        limit?: number;
    }): IndexedOperation[];
}
//# sourceMappingURL=specRegistry.d.ts.map