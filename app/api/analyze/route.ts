import { NextResponse } from "next/server";
import { generateLlmSuggestions } from "@/lib/ollama";
import { analyzeRules } from "@/lib/ruleAnalyzer";
import { fetchTextFromUrl } from "@/lib/urlContent";
import type { AnalysisResult, AnalyzeErrorResponse } from "@/types/analysis";

type AnalyzeRequestBody = {
  text?: unknown;
  url?: unknown;
};

export async function POST(request: Request) {
  let body: AnalyzeRequestBody;

  try {
    body = (await request.json()) as AnalyzeRequestBody;
  } catch {
    return NextResponse.json<AnalyzeErrorResponse>(
      { error: "リクエストのJSON形式が正しくありません。" },
      { status: 400 }
    );
  }

  const hasUrl = typeof body.url === "string" && body.url.trim().length > 0;
  const hasText = typeof body.text === "string" && body.text.trim().length > 0;

  if (!hasUrl && !hasText) {
    return NextResponse.json<AnalyzeErrorResponse>(
      { error: "記事本文または診断対象URLを入力してください。" },
      { status: 400 }
    );
  }

  let article = "";
  let sourceType: AnalysisResult["sourceType"] = "text";
  let sourceUrl: string | undefined;

  if (hasUrl) {
    try {
      const fetched = await fetchTextFromUrl(body.url as string);
      article = fetched.text;
      sourceType = "url";
      sourceUrl = fetched.finalUrl;
    } catch (error) {
      return NextResponse.json<AnalyzeErrorResponse>(
        {
          error:
            error instanceof Error
              ? error.message
              : "URLのページ取得に失敗しました。"
        },
        { status: 400 }
      );
    }
  } else {
    article = (body.text as string).trim();
  }

  if (article.length < 100) {
    return NextResponse.json<AnalyzeErrorResponse>(
      { error: "本文が短すぎます。100文字以上の記事本文を入力してください。" },
      { status: 400 }
    );
  }

  const ruleAnalysis = analyzeRules(article);
  const llmResult = await generateLlmSuggestions(
    article,
    ruleAnalysis.totalScore,
    ruleAnalysis.ruleScores
  );

  const response: AnalysisResult = {
    totalScore: ruleAnalysis.totalScore,
    ruleScores: ruleAnalysis.ruleScores,
    ...llmResult.data,
    llmStatus: llmResult.status,
    sourceType,
    ...(sourceUrl ? { sourceUrl } : {}),
    analyzedTextLength: article.length,
    analyzedTextPreview: article.slice(0, 100),
    ...(llmResult.status === "fallback" ? { llmError: llmResult.error } : {})
  };

  return NextResponse.json(response);
}
