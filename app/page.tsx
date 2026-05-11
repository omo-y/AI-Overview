"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type {
  AnalysisResult,
  AnalyzeErrorResponse,
  RuleScore
} from "@/types/analysis";

type InputMode = "url" | "text";

type AnalysisHistoryItem = {
  id: number;
  createdAt: string;
  inputPreview: string;
  sourceUrl: string | null;
  totalScore: number;
  summary: string;
};

type HistoryListResponse = {
  histories: AnalysisHistoryItem[];
  error?: string;
};

type HistoryCreateResponse = {
  history: AnalysisHistoryItem;
  error?: string;
};

const sampleText = `# AI Overviewに引用されやすい記事構造とは

結論として、AI検索に引用されやすい記事は、冒頭で答えを示し、見出しごとに質問へ明確に回答している記事です。

## なぜ冒頭の結論が必要か
AI Overviewは短時間で回答の核を抽出するため、本文の最初に要点がある記事を理解しやすくなります。

## 改善方法
- 重要な結論を最初に書く
- 公式情報や出典を明記する
- FAQと比較表を追加する

| 項目 | 改善内容 |
| --- | --- |
| 見出し | 質問型にする |
| 根拠 | 公式資料を引用する |

## FAQ
Q. AI Overview対策にFAQは必要ですか？
A. 必須ではありませんが、質問と回答の対応関係が明確になり、AI検索に理解されやすくなります。`;

function getScoreTone(score: number): string {
  if (score >= 80) {
    return "text-emerald-700";
  }

  if (score >= 60) {
    return "text-amber-700";
  }

  return "text-rose-700";
}

function getScoreBackground(score: number): string {
  if (score >= 80) {
    return "bg-emerald-500";
  }

  if (score >= 60) {
    return "bg-amber-500";
  }

  return "bg-rose-500";
}

function getScoreLabel(score: number): string {
  if (score >= 80) {
    return "良好";
  }

  if (score >= 60) {
    return "改善余地あり";
  }

  return "要改善";
}

function getPriorityLabel(index: number): string {
  if (index === 0) {
    return "最優先";
  }

  if (index === 1) {
    return "高";
  }

  if (index === 2) {
    return "中";
  }

  return "通常";
}

function ScoreTable({ scores }: { scores: RuleScore[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-slate-50 text-xs uppercase tracking-normal text-muted">
            <th className="px-4 py-3 font-semibold">診断項目</th>
            <th className="w-32 px-4 py-3 font-semibold">スコア</th>
            <th className="w-44 px-4 py-3 font-semibold">状態</th>
            <th className="px-4 py-3 font-semibold">コメント</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((score) => {
            const percentage = score.score * 10;

            return (
              <tr key={score.item} className="border-b border-line last:border-0">
                <td className="px-4 py-4 font-medium text-ink">{score.item}</td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className={`w-10 font-bold ${getScoreTone(percentage)}`}>
                      {score.score}/10
                    </span>
                    <div className="h-2 w-20 rounded-full bg-slate-100">
                      <div
                        className={`h-2 rounded-full ${getScoreBackground(
                          percentage
                        )}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold text-muted">
                    {getScoreLabel(percentage)}
                  </span>
                </td>
                <td className="px-4 py-4 leading-6 text-muted">{score.comment}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatAnalyzedAt(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default function Home() {
  const [inputMode, setInputMode] = useState<InputMode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const characterCount = useMemo(() => text.trim().length, [text]);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/history", {
        method: "GET",
        cache: "no-store"
      });
      const data = (await response.json()) as HistoryListResponse;

      if (!response.ok) {
        setHistoryError(
          data.error ?? "診断履歴の取得に失敗しました。DB設定を確認してください。"
        );
        return;
      }

      setHistory(data.histories);
      setHistoryError("");
    } catch (loadError) {
      console.error("[History load failed]", loadError);
      setHistoryError(
        "診断履歴の取得に失敗しました。DB接続とPrisma設定を確認してください。"
      );
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadHistory();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [loadHistory]);

  async function saveHistoryItem(analysisResult: AnalysisResult) {
    try {
      const response = await fetch("/api/history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          inputPreview:
            analysisResult.analyzedTextPreview.trim() ||
            (inputMode === "url" ? url.trim() : text.trim()).slice(0, 100),
          sourceUrl: analysisResult.sourceUrl ?? null,
          totalScore: analysisResult.totalScore,
          summary: analysisResult.summary
        })
      });
      const data = (await response.json()) as HistoryCreateResponse;

      if (!response.ok) {
        setHistoryError(
          data.error ??
            "診断履歴の保存に失敗しました。診断結果は表示されていますが、履歴には残っていません。"
        );
        return;
      }

      setHistoryError("");
      await loadHistory();
    } catch (saveError) {
      console.error("[History save failed]", saveError);
      setHistoryError(
        "診断履歴の保存に失敗しました。診断結果は表示されていますが、履歴には残っていません。"
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);

    if (inputMode === "url" && url.trim().length === 0) {
      setError("診断対象ページのURLを入力してください。");
      return;
    }

    if (inputMode === "text" && characterCount < 100) {
      setError("本文が短すぎます。100文字以上の記事本文を入力してください。");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body:
          inputMode === "url"
            ? JSON.stringify({ url })
            : JSON.stringify({ text })
      });

      const data = (await response.json()) as
        | AnalysisResult
        | AnalyzeErrorResponse;

      if (!response.ok) {
        setError("error" in data ? data.error : "診断に失敗しました。");
        return;
      }

      const analysisResult = data as AnalysisResult;
      setResult(analysisResult);
      await saveHistoryItem(analysisResult);
    } catch {
      setError("通信エラーが発生しました。開発サーバーの状態を確認してください。");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-normal text-accent">
              Local LLM + Rule Based
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-normal text-ink sm:text-3xl">
              AI Overview診断ツール
            </h1>
          </div>
          <div className="rounded-full border border-line bg-slate-50 px-4 py-2 text-sm text-muted">
            OpenAI APIなし / SQLite + Prisma / ローカルMVP
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <section className="rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6 xl:sticky xl:top-6 xl:self-start">
            <div className="mb-5">
              <h2 className="text-lg font-bold text-ink">診断対象</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                URLまたは記事本文から、AI検索に引用されやすい構造かを診断します。
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="mb-5 grid grid-cols-2 rounded-md border border-line bg-slate-50 p-1">
                <button
                  type="button"
                  aria-pressed={inputMode === "url"}
                  onClick={() => setInputMode("url")}
                  className={`rounded px-3 py-2 text-sm font-semibold transition ${
                    inputMode === "url"
                      ? "bg-white text-accent shadow-sm"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  URLで診断
                </button>
                <button
                  type="button"
                  aria-pressed={inputMode === "text"}
                  onClick={() => setInputMode("text")}
                  className={`rounded px-3 py-2 text-sm font-semibold transition ${
                    inputMode === "text"
                      ? "bg-white text-accent shadow-sm"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  本文で診断
                </button>
              </div>

              {inputMode === "url" ? (
                <div>
                  <label
                    htmlFor="target-url"
                    className="text-sm font-semibold text-ink"
                  >
                    診断対象ページURL
                  </label>
                  <input
                    id="target-url"
                    type="url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://example.com/article"
                    className="mt-2 w-full rounded-md border border-line bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-teal-100"
                  />
                  <p className="mt-2 text-xs leading-5 text-muted">
                    HTMLからタイトル、見出し、本文、箇条書き、表を抽出します。
                  </p>
                </div>
              ) : (
                <div>
                  <div className="mb-2 flex items-end justify-between gap-3">
                    <label
                      htmlFor="article"
                      className="text-sm font-semibold text-ink"
                    >
                      記事本文
                    </label>
                    <span className="text-xs text-muted">
                      {characterCount.toLocaleString("ja-JP")}文字
                    </span>
                  </div>
                  <textarea
                    id="article"
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="診断したい記事本文を貼り付けてください。"
                    className="min-h-[300px] w-full resize-y rounded-md border border-line bg-white p-4 text-sm leading-7 outline-none transition focus:border-accent focus:ring-2 focus:ring-teal-100"
                  />
                </div>
              )}

              <div className="mt-5 flex flex-col gap-3">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="rounded-md bg-accent px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? "診断中..." : "診断開始"}
                </button>
                {inputMode === "text" ? (
                  <button
                    type="button"
                    onClick={() => setText(sampleText)}
                    className="rounded-md border border-line px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-slate-50"
                  >
                    サンプル本文を入れる
                  </button>
                ) : (
                  <p className="text-xs leading-5 text-muted">
                    JavaScriptで後から描画される本文は抽出できない場合があります。
                  </p>
                )}
              </div>
            </form>
          </section>

          <section className="space-y-6">
            <div className="rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-lg font-bold text-ink">診断結果</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                総合スコア、構造チェック、改善提案、FAQ案、メタディスクリプション案をここに表示します。
              </p>
            </div>

            {error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                {error}
              </div>
            ) : null}

            {!result && !error ? (
              <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center text-sm text-muted">
                診断を開始すると、ここに結果カードが表示されます。
              </div>
            ) : null}

            {result ? (
              <>
                {result.llmStatus === "fallback" && result.llmError ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    {result.llmError}
                  </div>
                ) : null}

                <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                  <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-muted">
                          総合スコア
                        </p>
                        <p
                          className={`mt-3 text-7xl font-bold leading-none ${getScoreTone(
                            result.totalScore
                          )}`}
                        >
                          {result.totalScore}
                        </p>
                      </div>
                      <span className="rounded-full border border-line bg-slate-50 px-3 py-1 text-xs font-bold text-muted">
                        {getScoreLabel(result.totalScore)}
                      </span>
                    </div>
                    <div className="mt-5 h-3 rounded-full bg-slate-100">
                      <div
                        className={`h-3 rounded-full ${getScoreBackground(
                          result.totalScore
                        )}`}
                        style={{ width: `${result.totalScore}%` }}
                      />
                    </div>
                    <p className="mt-3 text-sm text-muted">100点満点</p>
                  </div>

                  <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-lg font-bold text-ink">評価サマリー</h3>
                      <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-muted">
                        {result.sourceType === "url" ? "URL診断" : "本文診断"} /{" "}
                        {result.analyzedTextLength.toLocaleString("ja-JP")}文字
                      </span>
                    </div>
                    <p className="leading-7 text-muted">{result.summary}</p>
                    {result.sourceUrl ? (
                      <a
                        href={result.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 block break-all text-sm font-medium text-accent underline"
                      >
                        {result.sourceUrl}
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
                    <p className="text-sm font-semibold text-muted">診断項目</p>
                    <p className="mt-2 text-3xl font-bold text-ink">
                      {result.ruleScores.length}
                    </p>
                    <p className="mt-1 text-xs text-muted">ルールベース評価</p>
                  </div>
                  <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
                    <p className="text-sm font-semibold text-muted">改善提案</p>
                    <p className="mt-2 text-3xl font-bold text-ink">
                      {result.improvements.length}
                    </p>
                    <p className="mt-1 text-xs text-muted">優先度順に表示</p>
                  </div>
                  <div className="rounded-lg border border-line bg-white p-5 shadow-sm">
                    <p className="text-sm font-semibold text-muted">FAQ案</p>
                    <p className="mt-2 text-3xl font-bold text-ink">
                      {result.faqIdeas.length}
                    </p>
                    <p className="mt-1 text-xs text-muted">Q&A候補</p>
                  </div>
                </div>

                <div className="rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-lg font-bold text-ink">項目別スコア</h3>
                    <span className="text-sm text-muted">0〜10点で評価</span>
                  </div>
                  <ScoreTable scores={result.ruleScores} />
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  <div>
                    <h3 className="text-lg font-bold text-ink">改善すべき点</h3>
                    <div className="mt-4 space-y-3">
                      {result.problems.map((problem, index) => (
                        <div
                          key={`${problem}-${index}`}
                          className="rounded-lg border border-rose-100 bg-rose-50 p-4"
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-rose-700">
                              課題 {index + 1}
                            </span>
                          </div>
                          <p className="text-sm leading-6 text-rose-950">
                            {problem}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-ink">
                      優先度順の改善提案
                    </h3>
                    <div className="mt-4 space-y-3">
                      {result.improvements.map((improvement, index) => (
                        <div
                          key={`${improvement}-${index}`}
                          className="rounded-lg border border-line bg-white p-4 shadow-sm"
                        >
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-white">
                              優先度 {index + 1}
                            </span>
                            <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-muted">
                              {getPriorityLabel(index)}
                            </span>
                          </div>
                          <p className="text-sm leading-6 text-muted">
                            {improvement}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-ink">FAQ案</h3>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {result.faqIdeas.map((faq, index) => (
                      <div
                        key={`${faq.question}-${index}`}
                        className="rounded-lg border border-line bg-white p-4 shadow-sm"
                      >
                        <p className="text-xs font-bold text-accent">
                          FAQ {index + 1}
                        </p>
                        <p className="mt-2 font-semibold leading-6 text-ink">
                          Q. {faq.question}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-muted">
                          A. {faq.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-bold text-ink">
                    メタディスクリプション案
                  </h3>
                  <div className="mt-4 grid gap-4 lg:grid-cols-3">
                    {result.metaDescriptions.map((description, index) => (
                      <div
                        key={`${description}-${index}`}
                        className="rounded-lg border border-line bg-slate-50 p-4"
                      >
                        <p className="mb-2 text-xs font-bold text-muted">
                          案 {index + 1}
                        </p>
                        <p className="text-sm leading-6 text-ink">
                          {description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </section>
        </div>

        <section className="mt-6 rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold text-ink">診断履歴</h2>
              <p className="mt-1 text-sm text-muted">
                SQLiteに保存された最新5件の診断履歴です。
              </p>
            </div>
            <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-muted">
              SQLite + Prisma
            </span>
          </div>

          {historyError ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              {historyError}
            </div>
          ) : null}

          {history.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line bg-slate-50 p-6 text-center text-sm text-muted">
              まだ診断履歴はありません。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-slate-50 text-xs uppercase tracking-normal text-muted">
                    <th className="px-4 py-3 font-semibold">日時</th>
                    <th className="px-4 py-3 font-semibold">診断URL</th>
                    <th className="px-4 py-3 font-semibold">入力プレビュー</th>
                    <th className="w-28 px-4 py-3 text-right font-semibold">
                      スコア
                    </th>
                    <th className="px-4 py-3 font-semibold">サマリー</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id} className="border-b border-line last:border-0">
                      <td className="whitespace-nowrap px-4 py-4 text-muted">
                        {formatAnalyzedAt(item.createdAt)}
                      </td>
                      <td className="max-w-[260px] px-4 py-4">
                        {item.sourceUrl ? (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block truncate font-medium text-accent underline"
                            title={item.sourceUrl}
                          >
                            {item.sourceUrl}
                          </a>
                        ) : (
                          <span className="text-muted">本文入力</span>
                        )}
                      </td>
                      <td className="max-w-[280px] px-4 py-4 font-medium leading-6 text-ink">
                        {item.inputPreview}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className={`font-bold ${getScoreTone(item.totalScore)}`}>
                          {item.totalScore}
                        </span>
                      </td>
                      <td className="px-4 py-4 leading-6 text-muted">
                        {item.summary}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
