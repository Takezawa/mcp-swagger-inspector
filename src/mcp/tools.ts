import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SpecRegistry } from "../registry/specRegistry.js";
import SwaggerParser from "@apidevtools/swagger-parser";
import { buildCurlExample, buildFetchExample, pickFirst, fillPathParams, buildSampleFromSchema } from "../registry/openapiUtils.js";

export function registerTools(server: McpServer, registry: SpecRegistry) {
  // 仕様の追加
  server.registerTool(
    "add_spec",
    {
      title: "Add OpenAPI/Swagger spec",
      description: "Load and index an OpenAPI/Swagger document from URL or local path",
      inputSchema: {
        id: z.string().min(1),
        urlOrPath: z.string().min(1)
      }
    },
    async ({ id, urlOrPath }) => {
      const spec = await registry.add(id, urlOrPath);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: spec.id,
                urlOrPath: spec.urlOrPath,
                operations: spec.operations.length,
                loadedAt: spec.loadedAt
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  server.registerTool(
    "remove_spec",
    {
      title: "Remove spec",
      description: "Remove a loaded spec by id",
      inputSchema: { id: z.string().min(1) }
    },
    async ({ id }) => {
      const ok = registry.remove(id);
      return {
        content: [{ type: "text", text: ok ? `Removed: ${id}` : `Not found: ${id}` }]
      };
    }
  );

  server.registerTool(
    "reload_spec",
    {
      title: "Reload spec",
      description: "Reload and reindex a spec",
      inputSchema: { id: z.string().min(1) }
    },
    async ({ id }) => {
      const spec = await registry.reload(id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                id: spec.id,
                urlOrPath: spec.urlOrPath,
                operations: spec.operations.length,
                reloadedAt: spec.loadedAt
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  server.registerTool(
    "validate_spec",
    {
      title: "Validate OpenAPI/Swagger",
      description: "Validate a spec (URL or path) using @apidevtools/swagger-parser",
      inputSchema: { urlOrPath: z.string().min(1) }
    },
    async ({ urlOrPath }) => {
      try {
        const validated = await SwaggerParser.validate(urlOrPath);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  valid: true,
                  info: (validated as any).info ?? {},
                  version: (validated as any).openapi ?? (validated as any).swagger
                },
                null,
                2
              )
            }
          ]
        };
      } catch (e: any) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { valid: false, error: String(e?.message ?? e) },
                null,
                2
              )
            }
          ]
        };
      }
    }
  );

  // 仕様一覧
  server.registerTool(
    "list_specs",
    {
      title: "List loaded specs",
      description: "List all loaded spec IDs and summaries",
      inputSchema: {}
    },
    async () => {
      const data = registry.list().map(s => {
        const oai: any = s.dereferenced;
        return {
          id: s.id,
          urlOrPath: s.urlOrPath,
          title: oai?.info?.title,
          version: oai?.info?.version,
          servers: (oai?.servers ?? []).map((sv: any) => sv.url),
          pathsCount: Object.keys(oai?.paths ?? {}).length,
          operations: s.operations.length,
          loadedAt: s.loadedAt
        };
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // オペレーション一覧（spec 指定なしなら全件対象）
  server.registerTool(
    "list_operations",
    {
      title: "List operations",
      description:
        "List operations from a spec or across all specs. Filter by tag/method/path regex/text.",
      inputSchema: {
        specId: z.string().optional(),
        tag: z.string().optional(),
        method: z.string().optional(),
        pathPattern: z.string().optional(),
        text: z.string().optional(),
        limit: z.number().int().positive().max(500).optional()
      }
    },
    async (args) => {
      // exactOptionalPropertyTypes 対策：定義されているものだけ詰める
      const filter: {
        specId?: string; tag?: string; method?: string; pathPattern?: string; text?: string; limit?: number;
      } = {};
      if (args.specId) filter.specId = args.specId;
      if (args.tag) filter.tag = args.tag;
      if (args.method) filter.method = args.method;
      if (args.pathPattern) filter.pathPattern = args.pathPattern;
      if (args.text) filter.text = args.text;
      if (typeof args.limit === "number") filter.limit = args.limit;
      const ops = registry.searchOperations(filter);
      // 出力を軽量化
      const data = ops.map(o => ({
        specId: o.specId,
        operationId: o.operationId,
        method: o.method,
        path: o.path,
        summary: o.summary,
        tags: o.tags
      }));
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );

  // 単一オペレーションを取得
  server.registerTool(
    "get_operation",
    {
      title: "Get operation",
      description:
        "Get a single operation by (specId + operationId) or by (specId + method + path). If specId is omitted, operationId must be globally unique.",
      inputSchema: {
        specId: z.string().optional(),
        operationId: z.string().optional(),
        method: z.string().optional(),
        path: z.string().optional()
      }
    },
    async ({ specId, operationId, method, path }) => {
      const finder: { specId?: string; operationId?: string; method?: string; path?: string } = {};
      if (specId) finder.specId = specId;
      if (operationId) finder.operationId = operationId;
      if (method) finder.method = method;
      if (path) finder.path = path;
      const op = registry.findOperation(finder);
      if (!op) {
        return { content: [{ type: "text", text: "Operation not found" }] };
      }
      const spec = registry.get(op.specId)!;
      // 元のオペレーション定義を返す
      const payload = {
        specId: op.specId,
        method: op.method,
        path: op.path,
        operationId: op.operationId,
        summary: op.summary,
        tags: op.tags,
        operation: op._rawOperation
      };
      const linksNote =
        `\n\n[resources]\n` +
        `- operation: openapi://${op.specId}/operations/${op.operationId ?? `${op.method}:${op.path}`}\n` +
        `- spec:      openapi://${spec.id}/spec\n`;
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) + linksNote }] };
    }
  );

  // リクエスト例を生成（cURL / fetch）
  server.registerTool(
    "generate_request_example",
    {
      title: "Generate request example",
      description:
        "Generate cURL and fetch examples for an operation. Resolves simple parameters/body examples.",
      inputSchema: {
        specId: z.string().optional(),
        operationId: z.string().optional(),
        method: z.string().optional(),
        path: z.string().optional(),
        serverIndex: z.number().int().nonnegative().optional()
      }
    },
    async ({ specId, operationId, method, path, serverIndex }) => {
      const finder: { specId?: string; operationId?: string; method?: string; path?: string } = {};
      if (specId) finder.specId = specId;
      if (operationId) finder.operationId = operationId;
      if (method) finder.method = method;
      if (path) finder.path = path;
      const op = registry.findOperation(finder);
      if (!op) {
        return { content: [{ type: "text", text: "Operation not found" }] };
      }
      const spec = registry.get(op.specId)!;
      const oai: any = spec.dereferenced;

      const servers: string[] = (oai.servers ?? [{ url: "/" }]).map((s: any) => s.url);
      const baseUrl = servers[Math.min(serverIndex ?? 0, servers.length - 1)] ?? "/";

      // パラメータ
      const params = ((op._rawOperation.parameters ?? []) as any[]).filter(Boolean);
      const query: Record<string, any> = {};
      let filledPath = fillPathParams(op.path);
      for (const p of params) {
        if (p.in === "query") {
          query[p.name] = p.example ?? p.default ?? "sample";
        }
        // header / cookie は省略、path は fillPathParams 済み
      }

      // リクエストボディ
      let headers: Record<string, string> = {};
      let body: any = undefined;
      if (op._rawOperation.requestBody?.content) {
        const [ct, media] = pickFirst<any>(op._rawOperation.requestBody.content) ?? [];
        if (ct && media) {
          headers["Content-Type"] = ct;
          // example / examples / schema からダミー生成
          if (media.example !== undefined) {
            body = media.example;
          } else if (media.examples) {
            const keys = Object.keys(media.examples);
            if (keys.length > 0) {
              const key = keys[0]!;
              body = media.examples[key]?.value ?? null;
            }
          } else if (media.schema) {
            body = buildSampleFromSchema(media.schema);
          }
        }
      }

      headers["Accept"] = "application/json";

      const curl = buildCurlExample({
        baseUrl,
        method: op.method,
        path: filledPath,
        query,
        headers,
        body
      });

      const fetch = buildFetchExample({
        baseUrl,
        method: op.method,
        path: filledPath,
        query,
        headers,
        body
      });

      const text = [
        `# ${op.method.toUpperCase()} ${op.path}${op.operationId ? ` (operationId: ${op.operationId})` : ""}`,
        "",
        "## cURL",
        "```bash",
        curl,
        "```",
        "",
        "## fetch (Node 18+)",
        "```ts",
        fetch,
        "```"
      ].join("\n");

      const linksNote =
        `\n\n[resources]\n` +
        `- operation: openapi://${op.specId}/operations/${op.operationId ?? `${op.method}:${op.path}`}\n`;
      return { content: [{ type: "text", text: text + linksNote }] };
    }
  );
}

