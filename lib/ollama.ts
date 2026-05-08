import type { LlmResult, RuleScore } from "@/types/analysis";

type OllamaGenerateResponse = {
  response?: string;
  error?: string;
};

type OllamaSuccess = {
  status: "success";
  data: LlmResult;
};

type OllamaFallback = {
  status: "fallback";
  data: LlmResult;
  error: string;
};

export type OllamaAnalysisResult = OllamaSuccess | OllamaFallback;

const baseFallbackResult: LlmResult = {
  summary:
    "ルールベース診断のみ完了しました。ローカルLLMの回答を取得できなかったため、改善提案は簡易表示です。",
  problems: ["本文の見出し、FAQ、表、根拠情報を増やすとAI検索向けの構造を強化できます。"],
  improvements: [
    "冒頭に結論を1から2文で明記する",
    "検索意図に近い質問型見出しを追加する",
    "比較できる情報は表に整理する",
    "公式情報、出典、実績、事例を本文中に明記する"
  ],
  faqIdeas: [
    {
      question: "この記事で最も重要な結論は何ですか？",
      answer: "本文の冒頭で、読者が最初に知りたい結論を簡潔に示してください。"
    }
  ],
  metaDescriptions: [
    "記事の要点、対象読者、得られるメリットを120文字前後でまとめてください。"
  ]
};

function buildPrompt(article: string, totalScore: number, ruleScores: RuleScore[]) {
  const ruleSummary = ruleScores
    .map((item) => `- ${item.item}: ${item.score}/10 ${item.comment}`)
    .join("\n");

  return `
あなたはAI OverviewやAI検索に引用されやすい記事構造を診断する編集アシスタントです。
以下のルールベース診断結果と記事本文をもとに、改善案を作ってください。

制約:
- OpenAI APIの利用を前提にしない
- 総合スコアは変更しない
- 出力はJSONのみ
- Markdown、説明文、コードフェンス、前置き、後書きは出力しない
- faqIdeasは必ず5個
- metaDescriptionsは必ず3個
- 日本語で具体的に書く

返却JSON形式:
{
  "summary": "string",
  "problems": ["string"],
  "improvements": ["string"],
  "faqIdeas": [
    {
      "question": "string",
      "answer": "string"
    }
  ],
  "metaDescriptions": ["string"]
}

総合スコア: ${totalScore}/100

項目別スコア:
${ruleSummary}

記事本文:
${article}
`.trim();
}

function extractJsonObject(text: string): string {
  const withoutThinkBlocks = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const start = withoutThinkBlocks.indexOf("{");
  const end = withoutThinkBlocks.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("LLMの回答からJSONオブジェクトを見つけられませんでした。");
  }

  return withoutThinkBlocks.slice(start, end + 1);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function validateLlmResult(value: unknown): LlmResult {
  if (typeof value !== "object" || value === null) {
    throw new Error("LLMのJSON形式が想定と異なります。");
  }

  const candidate = value as Partial<LlmResult>;
  const faqIdeas = Array.isArray(candidate.faqIdeas)
    ? candidate.faqIdeas
        .filter(
          (item): item is { question: string; answer: string } =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as { question?: unknown }).question === "string" &&
            typeof (item as { answer?: unknown }).answer === "string"
        )
        .slice(0, 5)
    : [];

  if (typeof candidate.summary !== "string") {
    throw new Error("LLMのJSONにsummaryがありません。");
  }

  return {
    summary: candidate.summary,
    problems: toStringArray(candidate.problems),
    improvements: toStringArray(candidate.improvements),
    faqIdeas,
    metaDescriptions: toStringArray(candidate.metaDescriptions).slice(0, 3)
  };
}

function createFallback(error: string): OllamaFallback {
  return {
    status: "fallback",
    data: {
      ...baseFallbackResult,
      problems: [error, ...baseFallbackResult.problems]
    },
    error
  };
}

function translateOllamaError(message: string): string {
  if (/model/i.test(message) && /(not found|pull|does not exist)/i.test(message)) {
    return "指定されたOllamaモデルが見つかりません。.env.localのOLLAMA_MODELを確認し、必要なら ollama pull を実行してください。";
  }

  return `Ollamaからエラーが返されました: ${message}`;
}

export async function generateLlmSuggestions(
  article: string,
  totalScore: number,
  ruleScores: RuleScore[]
): Promise<OllamaAnalysisResult> {
  const model = process.env.OLLAMA_MODEL;
  const endpoint =
    process.env.OLLAMA_ENDPOINT ?? "http://localhost:11434/api/generate";

  if (!model) {
    return createFallback(
      ".env.localにOLLAMA_MODELが設定されていません。例: OLLAMA_MODEL=qwen3:latest"
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180_000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        prompt: buildPrompt(article, totalScore, ruleScores),
        stream: false,
        format: "json",
        options: {
          temperature: 0.2,
          num_predict: 1000
        }
      }),
      signal: controller.signal
    });

    const body = (await response.json().catch(() => ({}))) as OllamaGenerateResponse;

    if (!response.ok) {
      return createFallback(
        translateOllamaError(body.error ?? `HTTP ${response.status}`)
      );
    }

    if (!body.response) {
      return createFallback("Ollamaのレスポンスに回答本文が含まれていません。");
    }

    const parsed = JSON.parse(extractJsonObject(body.response));
    return {
      status: "success",
      data: validateLlmResult(parsed)
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createFallback(
        "LLMのJSON出力が崩れたため、ルールベース診断のみ表示します。"
      );
    }

    if (error instanceof Error && error.name === "AbortError") {
      return createFallback(
        "Ollamaの応答がタイムアウトしました。モデルの起動状況やPCの負荷を確認してください。"
      );
    }

    if (error instanceof TypeError) {
      return createFallback(
        "Ollamaに接続できません。Ollamaが起動しているか、エンドポイントが正しいか確認してください。"
      );
    }

    return createFallback(
      error instanceof Error
        ? error.message
        : "Ollamaとの通信中に不明なエラーが発生しました。"
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
