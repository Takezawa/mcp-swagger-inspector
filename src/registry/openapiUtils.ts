import SwaggerParser from "@apidevtools/swagger-parser";
import type { AnyOpenAPI, HttpMethod, IndexedOperation } from "../types.js";

const HTTP_METHODS: HttpMethod[] = [
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace"
];

export async function loadAndDereference(
  urlOrPath: string
): Promise<{ raw: AnyOpenAPI; dereferenced: AnyOpenAPI }> {
  // SwaggerParser は URL もローカルパスも扱える
  const raw = (await SwaggerParser.parse(urlOrPath)) as AnyOpenAPI;
  const dereferenced = (await SwaggerParser.dereference(
    urlOrPath
  )) as AnyOpenAPI;
  return { raw, dereferenced };
}

export function indexOperations(specId: string, openapi: AnyOpenAPI): IndexedOperation[] {
  const paths = (openapi as any).paths ?? {};
  const out: IndexedOperation[] = [];
  for (const path of Object.keys(paths)) {
    const item: any = paths[path] ?? {};
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op) continue;
      out.push({
        specId,
        operationId: op.operationId,
        method,
        path,
        tags: op.tags,
        summary: op.summary,
        description: op.description,
        _rawOperation: op
      });
    }
  }
  return out;
}

export function pickFirst<T>(obj: Record<string, T> | undefined): [string, T] | undefined {
  if (!obj) return undefined;
  const k = Object.keys(obj)[0];
  if (!k) return undefined;
  const v = (obj as Record<string, T>)[k] as T;
  return [k, v];

}

type SchemaObject = any;

// 超ざっくり：JSON Schema/OpenAPI Schema から簡易ダミーを生成（深さ・配列長は浅め）
export function buildSampleFromSchema(schema: SchemaObject, depth = 0): any {
  if (!schema || depth > 4) return null;

  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;

  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }

  switch (type) {
    case "string":
      if (schema.format === "date-time") return new Date().toISOString();
      if (schema.format === "date") return new Date().toISOString().slice(0, 10);
      if (schema.format === "uuid") return "00000000-0000-0000-0000-000000000000";
      return "string";
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return true;
    case "array":
      return [buildSampleFromSchema(schema.items ?? {}, depth + 1)];
    case "object": {
      const obj: Record<string, any> = {};
      const props = schema.properties ?? {};
      for (const key of Object.keys(props)) {
        obj[key] = buildSampleFromSchema(props[key], depth + 1);
      }
      return obj;
    }
    default:
      // oneOf / anyOf / allOf を簡易サポート
      if (schema.oneOf?.[0]) return buildSampleFromSchema(schema.oneOf[0], depth + 1);
      if (schema.anyOf?.[0]) return buildSampleFromSchema(schema.anyOf[0], depth + 1);
      if (schema.allOf?.length) {
        return schema.allOf.reduce((acc: any, s: any) => {
          const v = buildSampleFromSchema(s, depth + 1);
          return typeof v === "object" ? { ...acc, ...v } : acc;
        }, {});
      }
      return null;
  }
}

export function buildCurlExample(args: {
  baseUrl: string;
  method: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: any;
}): string {
  const u = new URL(args.baseUrl.replace(/\/+$/, "") + args.path);
  for (const [k, v] of Object.entries(args.query ?? {})) {
    if (v === undefined) continue;
    u.searchParams.set(k, String(v));
  }
  const lines = [`curl -X ${args.method.toUpperCase()} "${u.toString()}"`];

  for (const [k, v] of Object.entries(args.headers ?? {})) {
    lines.push(`  -H "${k}: ${v}"`);
  }

  if (args.body !== undefined && args.body !== null) {
    lines.push(`  -d '${JSON.stringify(args.body, null, 2)}'`);
  }

  return lines.join(" \\\n");
}

export function buildFetchExample(args: {
  baseUrl: string;
  method: string;
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  body?: any;
}): string {
  const u = new URL(args.baseUrl.replace(/\/+$/, "") + args.path);
  for (const [k, v] of Object.entries(args.query ?? {})) {
    if (v === undefined) continue;
    u.searchParams.set(k, String(v));
  }

  return `// Node 18+ (fetch)
const res = await fetch(${JSON.stringify(u.toString())}, {
  method: ${JSON.stringify(args.method.toUpperCase())},
  headers: ${JSON.stringify(args.headers ?? {}, null, 2)},
  ${args.body !== undefined ? `body: JSON.stringify(${JSON.stringify(args.body, null, 2)}),` : ""}
});
console.log(res.status, await res.text());`;
}

// パスパラメータをダミーに置換
export function fillPathParams(path: string): string {
  return path.replace(/\{([^}]+)\}/g, (_m, name) => {
    // よくある id 系は数値に、それ以外は文字列に
    return name.match(/(id|Id|ID)$/) ? "123" : "sample";
  });
}

