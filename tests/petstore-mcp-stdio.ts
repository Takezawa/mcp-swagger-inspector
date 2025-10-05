#!/usr/bin/env tsx
/**
 * 作成した MCP サーバ（stdio）を子プロセスで起動し、
 * JSON-RPC で tools を叩いて OpenAPI/Swagger の全 Operation 詳細を収集するテスト。
 * 仕様の URL/パスは、CLI引数 --spec か、未指定なら対話プロンプトから入力できます。
 *
 * 例:
 *   npx tsx tests/petstore-mcp-stdio.ts --out dump.json
 *   npx tsx tests/petstore-mcp-stdio.ts --spec https://petstore3.swagger.io/api/v3/openapi.json --id petstore3 --out dump.json
 */

import { spawn } from "node:child_process";
import * as fsp from "node:fs/promises";
import * as fsSync from "node:fs";
import path from "node:path";
import * as readline from "node:readline/promises";
import process from "node:process";

type Json = any;
type Pending = { resolve: (v: any) => void; reject: (e: any) => void };

// 既定（Enterだけで進めたときのフォールバック）
const DEFAULT_SPEC = "https://petstore3.swagger.io/api/v3/openapi.json";
const DEFAULT_ID = "petstore3";
const PROTOCOL_VERSION = "2025-03-26";

// ---------------- CLI 引数 ----------------
const argv = process.argv.slice(2);
let outPath: string | undefined;
let specUrlOrPath: string | undefined;
let specId: string | undefined;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--out") {
    outPath = argv[++i];
  } else if (a === "--spec") {
    specUrlOrPath = argv[++i];
  } else if (a === "--id") {
    specId = argv[++i];
  } else if (!a.startsWith("-")) {
    // 先頭位置に素の引数が来たら --spec とみなす（互換）
    specUrlOrPath = a;
  }
}

function deriveId(input: string): string {
  try {
    const u = new URL(input);
    const last = u.pathname.split("/").filter(Boolean).pop() || "spec";
    return (u.hostname + "-" + last).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60);
  } catch {
    // ローカルパス
    const base = path.basename(input) || "spec";
    return ("local-" + base).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60);
  }
}

// ---------------- JSON-RPC/stdio クライアント ----------------
class StdIoJsonRpc {
  private child;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private buf = "";

  constructor() {
    const { cmd, args } = resolveServerLaunch();
    this.child = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "inherit"],
      env: { ...process.env },
      cwd: process.cwd()
    });

    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.onData(chunk));
  }

  private onData(chunk: string) {
    this.buf += chunk;
    let idx: number;
    while ((idx = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined) {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            if (msg.error) p.reject(msg.error);
            else p.resolve(msg.result);
          }
        } else {
          // notifications は今回は無視
        }
      } catch {
        // ログ行などは無視
      }
    }
  }

  private sendRaw(obj: Json) {
    this.child.stdin.write(JSON.stringify(obj) + "\n", "utf8");
  }

  request(method: string, params?: Json): Promise<any> {
    const id = this.nextId++;
    const payload = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.sendRaw(payload);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 60_000);
    });
  }

  notify(method: string, params?: Json) {
    this.sendRaw({ jsonrpc: "2.0", method, params });
  }

  async close() {
    try {
      this.child.stdin.end();
      await new Promise<void>((res) => {
        const t = setTimeout(() => res(), 1500);
        this.child.once("exit", () => {
          clearTimeout(t);
          res();
        });
      });
    } catch {
      // noop
    }
  }
}

function resolveServerLaunch(): { cmd: string; args: string[] } {
  const dist = path.resolve(process.cwd(), "dist/server.js");
  if (fsSync.existsSync(dist)) {
    return { cmd: process.execPath, args: [dist] };
  }
  // tsx ローダー経由（開発時）
  return { cmd: process.execPath, args: ["--loader", "tsx", "./src/server.ts"] };
}

// ---------- ユーティリティ ----------
function firstTextContent(result: any): string | undefined {
  const c = result?.content;
  if (Array.isArray(c)) {
    const t = c.find((x: any) => x?.type === "text")?.text;
    if (typeof t === "string") return t;
  }
  return undefined;
}

// ---------------- メイン ----------------
async function main() {
  // 対話入力（未指定なら聞く）
  if (!specUrlOrPath) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = await rl.question(
      `OpenAPI/Swagger の URL またはローカルパスを入力してください\n` +
      `(未入力なら既定: ${DEFAULT_SPEC})\n> `
    );
    rl.close();
    specUrlOrPath = ans.trim() || DEFAULT_SPEC;
  }
  if (!specId) {
    specId = deriveId(specUrlOrPath!);
  }

  const rpc = new StdIoJsonRpc();
  try {
    // 1) initialize → initialized
    await rpc.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { sampling: {}, roots: { listChanged: true } },
      clientInfo: { name: "mcp-openapi-stdio-test", version: "1.1.0" }
    });
    rpc.notify("notifications/initialized");

    // 2) add_spec（既に存在していればサーバ側が上書き or エラー→無視）
    await rpc
      .request("tools/call", {
        name: "add_spec",
        arguments: { id: specId, urlOrPath: specUrlOrPath }
      })
      .catch(() => { /* 既存ならスルー */ });

    // 3) list_operations（指定の spec で全件）
    const listRes = await rpc.request("tools/call", {
      name: "list_operations",
      arguments: { specId }
    });

    const listText = firstTextContent(listRes);
    if (!listText) throw new Error("list_operations: no text content");
    const ops: Array<{ method: string; path: string; operationId?: string }> = JSON.parse(listText);

    console.error(`Found ${ops.length} operations in ${specId}.`);

    // 4) 各オペレーション詳細 & 例
    const details: any[] = [];
    for (const [i, op] of ops.entries()) {
      process.stderr.write(`  [${i + 1}/${ops.length}] ${op.method.toUpperCase()} ${op.path}\r`);
      const getRes = await rpc.request("tools/call", {
        name: "get_operation",
        arguments: { specId, method: op.method, path: op.path }
      });
      const getText = firstTextContent(getRes);
      if (!getText) continue;
      const payload = JSON.parse(getText);

      const exRes = await rpc
        .request("tools/call", {
          name: "generate_request_example",
          arguments: { specId, method: op.method, path: op.path }
        })
        .catch(() => undefined);
      const exText = exRes ? firstTextContent(exRes) : undefined;

      details.push({
        method: op.method,
        path: op.path,
        operationId: op.operationId,
        detail: payload,
        exampleMd: exText
      });
    }
    process.stderr.write("\n");

    const output = {
      collectedAt: new Date().toISOString(),
      specId,
      specUrlOrPath,
      operations: details
    };

    const json = JSON.stringify(output, null, 2);
    if (outPath) {
      await fsp.mkdir(path.dirname(outPath), { recursive: true });
      await fsp.writeFile(outPath, json, "utf8");
      console.error(`✅ Wrote ${details.length} operations to ${outPath}`);
    } else {
      console.log(json);
    }
  } finally {
    await (global as any).setImmediate?.(() => {});
    await rpc.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
