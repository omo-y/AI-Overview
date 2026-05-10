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

const MAX_LLM_ARTICLE_CHARS = 6_000;

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

const parseFallbackResult: LlmResult = {
  summary:
    "ルールベース診断のみ完了しました。ローカルLLMの出力形式を読み取れなかったため、提案項目は表示できませんでした。",
  problems: [],
  improvements: [],
  faqIdeas: [],
  metaDescriptions: []
};

function buildPrompt(article: string, totalScore: number, ruleScores: RuleScore[]) {
  const articleForLlm = article.slice(0, MAX_LLM_ARTICLE_CHARS);
  const omittedLength = article.length - articleForLlm.length;
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
- improvementsは重要度が高い順に並べる
- problemsは改善インパクトが大きい順に並べる
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
${articleForLlm}

${omittedLength > 0 ? `注記: 記事本文は長いため、LLMには先頭${MAX_LLM_ARTICLE_CHARS.toLocaleString("ja-JP")}文字のみ渡しています。省略文字数: ${omittedLength.toLocaleString("ja-JP")}文字。` : ""}
`.trim();
}

function normalizeLlmResponse(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json|JSON)?/g, "")
    .replace(/```/g, "")
    .trim();
}

function extractJsonObject(text: string): string {
  const normalized = normalizeLlmResponse(text);
  const start = normalized.indexOf("{");

  if (start === -1) {
    throw new Error("LLMの回答からJSONオブジェクトを見つけられませんでした。");
  }

  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = start; index < normalized.length; index += 1) {
    const char = normalized[index];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (inString && char === "\\") {
      isEscaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return normalized.slice(start, index + 1);
      }
    }
  }

  throw new Error("LLMのJSONオブジェクトが閉じられていません。");
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
  console.error("[Ollama fallback]", error);

  return {
    status: "fallback",
    data: {
      ...baseFallbackResult,
      summary: `ルールベース診断のみ完了しました。ローカルLLMの回答を取得できなかった理由: ${error}`,
      problems: [error, ...baseFallbackResult.problems]
    },
    error
  };
}

function createParseFallback(error: unknown, rawResponse?: string): OllamaFallback {
  console.error("[Ollama JSON parse fallback]", {
    error,
    rawResponse
  });

  return {
    status: "fallback",
    data: parseFallbackResult,
    error:
      "LLMのJSON出力が崩れたため、ルールベース診断のみ表示します。もう一度診断するか、別のモデルを試してください。"
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

    let parsed: unknown;

    try {
      parsed = JSON.parse(extractJsonObject(body.response));
    } catch (parseError) {
      return createParseFallback(parseError, body.response);
    }

    let data: LlmResult;

    try {
      data = validateLlmResult(parsed);
    } catch (validationError) {
      return createParseFallback(validationError, body.response);
    }

    return {
      status: "success",
      data
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createParseFallback(error);
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
