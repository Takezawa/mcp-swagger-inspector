import { z } from "zod";
export function registerPrompts(server) {
    server.registerPrompt("api_overview_ja", {
        title: "API 概要の要約（日本語）",
        description: "与えられた OpenAPI 仕様の要点（サーバー、主要リソース、代表的なエンドポイントなど）を日本語で簡潔に要約します。",
        argsSchema: {
            // openapi://.../spec の JSON をテキストとして渡す想定
            specJson: z.string().describe("openapi://.../spec の JSON 文字列")
        }
    }, 
    // ← 第2引数 extra は使わないので _extra で受けておくと型が満たしやすい
    ({ specJson }, _extra) => {
        return {
            messages: [
                {
                    // system は不可。assistant で前置きテキストにします
                    role: "assistant",
                    content: { type: "text", text: "あなたは API アーキテクトです。与えられた OpenAPI を日本語で要約してください。" }
                },
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: [
                            "次の OpenAPI 仕様（JSON）を読み、以下を箇条書きで要約してください：",
                            "- API タイトル・バージョン",
                            "- サーバー URL",
                            "- 代表的なパス（3〜5個）とメソッド",
                            "- よく使うパラメータやスキーマのポイント",
                            "",
                            specJson
                        ].join("\n")
                    }
                }
            ]
        };
    });
    server.registerPrompt("api_request_drafter_ja", {
        title: "API リクエスト下書き（日本語）",
        description: "与えられたオペレーション情報から、実用的なリクエスト例（curl / fetch）を日本語コメント付きで下書きします。",
        argsSchema: {
            operationJson: z
                .string()
                .describe("openapi://{specId}/operations/{operationId} の JSON 文字列")
        }
    }, ({ operationJson }, _extra) => {
        return {
            messages: [
                {
                    role: "assistant",
                    content: {
                        type: "text",
                        text: "あなたは API クライアント実装の支援を行うエンジニアです。日本語コメントを入れて、実行可能に近いリクエスト例を作ってください。"
                    }
                },
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: [
                            "次のオペレーション定義（JSON）に基づいて、必要パラメータの説明と、curl / fetch の例を提示してください：",
                            "",
                            operationJson
                        ].join("\n")
                    }
                }
            ]
        };
    });
}
//# sourceMappingURL=prompts.js.map