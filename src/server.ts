#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SpecRegistry } from "./registry/specRegistry.js";
import { registerTools } from "./mcp/tools.js";
import { registerResources } from "./mcp/resources.js";
import { registerPrompts } from "./mcp/prompts.js";
import fs from "node:fs/promises";
import path from "node:path";

async function loadBootstrapSpecs(registry: SpecRegistry) {
  // 優先: 環境変数 OPENAPI_SOURCES（パス or 直接 JSON 配列）
  const env = process.env.OPENAPI_SOURCES;
  let entries: Array<{ id: string; urlOrPath: string }> = [];
  try {
    if (env) {
      let json: any;
      if (env.trim().startsWith("[")) {
        json = JSON.parse(env);
      } else {
        const filePath = path.resolve(env);
        const text = await fs.readFile(filePath, "utf-8");
        json = JSON.parse(text);
      }
      entries = json;
    } else {
      // プロジェクト直下 openapi-sources.json（存在すれば）
      const fallback = path.resolve(process.cwd(), "openapi-sources.json");
      const text = await fs.readFile(fallback, "utf-8").catch(() => "");
      if (text) {
        entries = JSON.parse(text);
      }
    }
  } catch (e) {
    console.warn("Failed to load OPENAPI_SOURCES:", e);
  }

  for (const ent of entries) {
    try {
      await registry.add(ent.id, ent.urlOrPath);
      console.error(`[bootstrap] loaded spec ${ent.id} from ${ent.urlOrPath}`);
    } catch (e) {
      console.warn(`[bootstrap] failed to load ${ent.id}:`, e);
    }
  }
}

async function main() {
  const server = new McpServer({
    name: "openapi-mcp-server",
    version: "1.0.0"
  });

  const registry = new SpecRegistry();

  // MCP エンドポイント登録
  registerTools(server, registry);
  registerResources(server, registry);
  registerPrompts(server);

  // 初期ロード
  await loadBootstrapSpecs(registry);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("OpenAPI MCP server (stdio) ready.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

