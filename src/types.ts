import type { OpenAPIV2, OpenAPIV3, OpenAPIV3_1 } from "openapi-types";

export type AnyOpenAPI =
  | OpenAPIV2.Document
  | OpenAPIV3.Document
  | OpenAPIV3_1.Document
  | Record<string, unknown>;

export type HttpMethod =
  | "get"
  | "put"
  | "post"
  | "delete"
  | "options"
  | "head"
  | "patch"
  | "trace";

export interface LoadedSpec {
  id: string;
  urlOrPath: string;
  raw: AnyOpenAPI;
  dereferenced: AnyOpenAPI;
  loadedAt: string; // ISO
  operations: IndexedOperation[];
}

export interface IndexedOperation {
  specId: string;
  operationId?: string;
  method: HttpMethod;
  path: string;
  tags?: string[];
  summary?: string;
  description?: string;
  // 仕様ドキュメント内の参照を保持
  _rawOperation: any;
}

