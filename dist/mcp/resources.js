import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
function asString(v, name) {
    if (typeof v === "string")
        return v;
    if (Array.isArray(v) && v[0])
        return v[0];
    throw new Error(`${name} is required`);
}
export function registerResources(server, registry) {
    // 仕様本体を返す
    server.registerResource("openapi-spec", new ResourceTemplate("openapi://{specId}/spec", { list: undefined }), { title: "OpenAPI spec (raw JSON)", description: "Dereferenced OpenAPI/Swagger document", mimeType: "application/json" }, async (uri, { specId }) => {
        const id = asString(specId, "specId");
        const spec = registry.get(id);
        if (!spec)
            throw new Error(`Spec not found: ${specId}`);
        return {
            contents: [
                {
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify(spec.dereferenced, null, 2)
                }
            ]
        };
    });
    // オペレーション一覧を返す
    server.registerResource("openapi-operations", new ResourceTemplate("openapi://{specId}/operations", { list: undefined }), { title: "Operations list", description: "Indexed operations for a spec", mimeType: "application/json" }, async (uri, { specId }) => {
        const id = asString(specId, "specId");
        const spec = registry.get(id);
        if (!spec)
            throw new Error(`Spec not found: ${specId}`);
        return {
            contents: [
                {
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify(spec.operations.map(o => ({
                        operationId: o.operationId,
                        method: o.method,
                        path: o.path,
                        tags: o.tags,
                        summary: o.summary
                    })), null, 2)
                }
            ]
        };
    });
    // 単一オペレーション
    server.registerResource("openapi-operation", new ResourceTemplate("openapi://{specId}/operations/{opKey}", { list: undefined }), {
        title: "Operation detail",
        description: "Single operation (by operationId or method:path)",
        mimeType: "application/json"
    }, async (uri, { specId, opKey }) => {
        const id = asString(specId, "specId");
        const key = asString(opKey, "opKey");
        const spec = registry.get(id);
        if (!spec)
            throw new Error(`Spec not found: ${specId}`);
        // opKey は operationId か "method:path"
        const [maybeMethod, maybePath] = key.includes(":")
            ? key.split(/:(.+)/)
            : [undefined, undefined];
        const op = spec.operations.find(o => o.operationId === key) ??
            spec.operations.find(o => maybeMethod && o.method === maybeMethod && o.path === maybePath);
        if (!op)
            throw new Error(`Operation not found for key: ${key}`);
        return {
            contents: [
                {
                    uri: uri.href,
                    mimeType: "application/json",
                    text: JSON.stringify({
                        specId: op.specId,
                        method: op.method,
                        path: op.path,
                        operationId: op.operationId,
                        tags: op.tags,
                        summary: op.summary,
                        description: op.description,
                        operation: op._rawOperation
                    }, null, 2)
                }
            ]
        };
    });
}
//# sourceMappingURL=resources.js.map