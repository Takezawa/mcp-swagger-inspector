# MCP OpenAPI Server

Node.js + TypeScript で動く **OpenAPI/Swagger 仕様を読み込み・索引化**する MCP サーバ（stdio）。  
API 指定が無いときは **全ての読み込み済み仕様のオペレーション**を対象に検索・取得します。

## セットアップ

```bash
npm i

cp openapi-sources.example.json openapi-sources.json
# openapi-sources.json を編集して仕様URL/パスを追加
cat openapi-sources.json
[
  {
    "id": "petstore",
    "urlOrPath": "https://petstore3.swagger.io/api/v3/openapi.json"
  }
]


npm run dev
```

## ローカルでテスト

```bash
# MCPサーバー起動
npm run dev

# 別ターミナルでテスト実行
npm run test:petstore
```

## Claud Desktopの設定

事前にビルド

```bash
npm run build
```

「設定」→「設定を編集」から設定ファイルを以下のように設定  
Pathは自分の環境に合わせて変更

```json
{
  "mcpServers": {
    "takezawaapi": {
      "command": "/Users/takezawa/.volta/bin/node",
      "args": ["/Users/takezawa/projects/mcp-swagger-inspector/dist/server.js"],
      "env": {
        "OPENAPI_SOURCES": "/Users/takezawa/projects/mcp-swagger-inspector/openapi-sources.json"
      }
    }
  }
}

```
