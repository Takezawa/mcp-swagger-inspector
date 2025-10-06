import type { AnyOpenAPI, IndexedOperation } from "../types.js";
export declare function loadAndDereference(urlOrPath: string): Promise<{
    raw: AnyOpenAPI;
    dereferenced: AnyOpenAPI;
}>;
export declare function indexOperations(specId: string, openapi: AnyOpenAPI): IndexedOperation[];
export declare function pickFirst<T>(obj: Record<string, T> | undefined): [string, T] | undefined;
type SchemaObject = any;
export declare function buildSampleFromSchema(schema: SchemaObject, depth?: number): any;
export declare function buildCurlExample(args: {
    baseUrl: string;
    method: string;
    path: string;
    query?: Record<string, string | number | boolean | undefined>;
    headers?: Record<string, string>;
    body?: any;
}): string;
export declare function buildFetchExample(args: {
    baseUrl: string;
    method: string;
    path: string;
    query?: Record<string, string | number | boolean | undefined>;
    headers?: Record<string, string>;
    body?: any;
}): string;
export declare function fillPathParams(path: string): string;
export {};
//# sourceMappingURL=openapiUtils.d.ts.map