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

function buildRetryPrompt(
  article: string,
  totalScore: number,
  ruleScores: RuleScore[]
) {
  const weakScores = ruleScores
    .filter((item) => item.score < 8)
    .map((item) => `- ${item.item}: ${item.score}/10 ${item.comment}`)
    .join("\n");
  const articleExcerpt = article.slice(0, 2_000);

  return `
次の診断結果をもとに、AI Overview向けの記事改善案を作ってください。
必ずJSONオブジェクトだけを返してください。コードフェンス、説明文、前置き、後書きは禁止です。
配列は空にしないでください。本文情報が不足する場合も、診断結果から妥当な提案を作ってください。

必須JSON形式:
{
  "summary": "評価サマリーを1文で書く",
  "problems": ["改善インパクトが大きい課題を3個以上"],
  "improvements": ["優先度が高い順の具体的な改善提案を4個以上"],
  "faqIdeas": [
    { "question": "質問", "answer": "回答" },
    { "question": "質問", "answer": "回答" },
    { "question": "質問", "answer": "回答" },
    { "question": "質問", "answer": "回答" },
    { "question": "質問", "answer": "回答" }
  ],
  "metaDescriptions": ["120文字前後の案1", "120文字前後の案2", "120文字前後の案3"]
}

総合スコア: ${totalScore}/100

弱い項目:
${weakScores || "大きく弱い項目はありません。より引用されやすくする改善案を作ってください。"}

記事抜粋:
${articleExcerpt}
`.trim();
}

function normalizeLlmResponse(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```(?:json|JSON)?/g, "")
    .replace(/```/g, "")
    .trim();
}

function extractBalancedJsonObject(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let isEscaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

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
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function repairJsonCandidate(candidate: string): string {
  return candidate
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/^\uFEFF/, "")
    .trim();
}

function hasExpectedLlmKeys(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return Boolean(
    candidate.summary ||
      candidate["評価サマリー"] ||
      candidate["サマリー"] ||
      candidate.problems ||
      candidate["改善すべき点"] ||
      candidate["課題"] ||
      candidate.improvements ||
      candidate["具体的な改善提案"] ||
      candidate["改善提案"] ||
      candidate.faqIdeas ||
      candidate["FAQ案"] ||
      candidate.faq ||
      candidate.metaDescriptions ||
      candidate["メタディスクリプション案"] ||
      candidate.meta
  );
}

function readProperty(
  source: Record<string, unknown>,
  keys: string[]
): unknown {
  for (const key of keys) {
    if (key in source) {
      return source[key];
    }
  }

  return undefined;
}

function parseJsonFromLlmResponse(text: string): unknown {
  const normalized = normalizeLlmResponse(text);

  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] !== "{") {
      continue;
    }

    const candidate = extractBalancedJsonObject(normalized, index);

    if (!candidate) {
      continue;
    }

    try {
      const parsed = JSON.parse(repairJsonCandidate(candidate));

      if (hasExpectedLlmKeys(parsed)) {
        return parsed;
      }
    } catch {
      // Try the next balanced object. LLMs often include braces in prose.
    }
  }

  throw new Error("LLMの回答から読み取り可能なJSONを見つけられませんでした。");
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (typeof item === "number" || typeof item === "boolean") {
        return String(item);
      }

      return "";
    })
    .filter(Boolean);
}

function validateLlmResult(value: unknown): LlmResult {
  if (typeof value !== "object" || value === null) {
    throw new Error("LLMのJSON形式が想定と異なります。");
  }

  const source = value as Record<string, unknown>;
  const summary = readProperty(source, ["summary", "評価サマリー", "サマリー"]);
  const problems = readProperty(source, ["problems", "改善すべき点", "課題"]);
  const improvements = readProperty(source, [
    "improvements",
    "具体的な改善提案",
    "改善提案"
  ]);
  const faqIdeasValue = readProperty(source, ["faqIdeas", "FAQ案", "faq"]);
  const metaDescriptions = readProperty(source, [
    "metaDescriptions",
    "メタディスクリプション案",
    "meta"
  ]);

  const faqIdeas = Array.isArray(faqIdeasValue)
    ? faqIdeasValue
        .filter(
          (item): item is { question: string; answer: string } =>
            typeof item === "object" &&
            item !== null &&
            typeof readProperty(item as Record<string, unknown>, [
              "question",
              "質問"
            ]) === "string" &&
            typeof readProperty(item as Record<string, unknown>, [
              "answer",
              "回答"
            ]) === "string"
        )
        .map((item) => ({
          question: readProperty(item, ["question", "質問"]) as string,
          answer: readProperty(item, ["answer", "回答"]) as string
        }))
        .slice(0, 5)
    : [];

  return {
    summary:
      typeof summary === "string"
        ? summary
        : "ローカルLLMの回答から一部の提案を読み取りました。",
    problems: toStringArray(problems),
    improvements: toStringArray(improvements),
    faqIdeas,
    metaDescriptions: toStringArray(metaDescriptions).slice(0, 3)
  };
}

function hasUsefulLlmResult(result: LlmResult): boolean {
  return Boolean(
    result.summary.trim() &&
      (result.problems.length > 0 ||
        result.improvements.length > 0 ||
        result.faqIdeas.length > 0 ||
        result.metaDescriptions.length > 0)
  );
}

function parseAndValidateLlmResponse(responseText: string): LlmResult {
  const parsed = parseJsonFromLlmResponse(responseText);
  const result = validateLlmResult(parsed);

  if (!hasUsefulLlmResult(result)) {
    throw new Error("LLMのJSONは読み取れましたが、提案内容が空でした。");
  }

  return result;
}

async function requestOllamaGenerate(
  endpoint: string,
  model: string,
  prompt: string,
  signal: AbortSignal
): Promise<OllamaGenerateResponse & { ok: boolean; status: number }> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      format: "json",
      options: {
        temperature: 0.2,
        num_predict: 1000
      }
    }),
    signal
  });

  const body = (await response.json().catch(() => ({}))) as OllamaGenerateResponse;

  return {
    ...body,
    ok: response.ok,
    status: response.status
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
    const body = await requestOllamaGenerate(
      endpoint,
      model,
      buildPrompt(article, totalScore, ruleScores),
      controller.signal
    );

    if (!body.ok) {
      return createFallback(
        translateOllamaError(body.error ?? `HTTP ${body.status}`)
      );
    }

    if (!body.response) {
      return createFallback("Ollamaのレスポンスに回答本文が含まれていません。");
    }

    try {
      return {
        status: "success",
        data: parseAndValidateLlmResponse(body.response)
      };
    } catch (firstError) {
      console.error("[Ollama JSON parse retry]", {
        error: firstError,
        rawResponse: body.response
      });
    }

    const retryBody = await requestOllamaGenerate(
      endpoint,
      model,
      buildRetryPrompt(article, totalScore, ruleScores),
      controller.signal
    );

    if (!retryBody.ok) {
      return createFallback(
        translateOllamaError(retryBody.error ?? `HTTP ${retryBody.status}`)
      );
    }

    if (!retryBody.response) {
      return createParseFallback(
        "Ollamaの再試行レスポンスに回答本文が含まれていません。"
      );
    }

    try {
      return {
        status: "success",
        data: parseAndValidateLlmResponse(retryBody.response)
      };
    } catch (retryError) {
      return createParseFallback(retryError, retryBody.response);
    }
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

    return {
      status: "fallback",
      data: parseFallbackResult,
      error:
        error instanceof Error
          ? error.message
          : "Ollamaとの通信中に不明なエラーが発生しました。"
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
