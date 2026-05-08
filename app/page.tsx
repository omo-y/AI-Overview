"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  AnalysisResult,
  AnalyzeErrorResponse,
  RuleScore
} from "@/types/analysis";

type InputMode = "url" | "text";

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

function ScoreTable({ scores }: { scores: RuleScore[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-panel">
            <th className="px-4 py-3 font-semibold">項目</th>
            <th className="w-24 px-4 py-3 font-semibold">スコア</th>
            <th className="px-4 py-3 font-semibold">コメント</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((score) => (
            <tr key={score.item} className="border-b border-line">
              <td className="px-4 py-3 font-medium">{score.item}</td>
              <td className="px-4 py-3">
                <span className={`font-bold ${getScoreTone(score.score * 10)}`}>
                  {score.score}/10
                </span>
              </td>
              <td className="px-4 py-3 text-muted">{score.comment}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Home() {
  const [inputMode, setInputMode] = useState<InputMode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const characterCount = useMemo(() => text.trim().length, [text]);

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

      setResult(data as AnalysisResult);
    } catch {
      setError("通信エラーが発生しました。開発サーバーの状態を確認してください。");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <section className="mb-8">
          <p className="mb-2 text-sm font-semibold text-accent">
            Local LLM + Rule Based
          </p>
          <h1 className="text-3xl font-bold tracking-normal text-ink sm:text-4xl">
            AI Overview診断ツール
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-muted">
            OpenAI APIを使わず、Ollamaで動くローカルLLMとルールベース診断を組み合わせて、
            URLまたは記事本文からAI OverviewやAI検索に引用されやすい構造かを確認する自分用MVPです。
          </p>
        </section>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="mb-5 inline-flex rounded-md border border-line bg-panel p-1">
            <button
              type="button"
              onClick={() => setInputMode("url")}
              className={`rounded px-4 py-2 text-sm font-semibold transition ${
                inputMode === "url"
                  ? "bg-white text-accent shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              URLで診断
            </button>
            <button
              type="button"
              onClick={() => setInputMode("text")}
              className={`rounded px-4 py-2 text-sm font-semibold transition ${
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
              <label htmlFor="target-url" className="text-lg font-semibold text-ink">
                診断対象ページURL
              </label>
              <input
                id="target-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/article"
                className="mt-3 w-full rounded-md border border-line bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-teal-100"
              />
              <p className="mt-2 text-sm text-muted">
                HTMLページを取得し、タイトル、メタディスクリプション、見出し、本文、箇条書き、表を抽出して診断します。
              </p>
            </div>
          ) : (
            <div>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <label htmlFor="article" className="text-lg font-semibold text-ink">
                  記事本文
                </label>
                <span className="text-sm text-muted">
                  文字数: {characterCount.toLocaleString("ja-JP")}文字
                </span>
              </div>

              <textarea
                id="article"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="診断したい記事本文を貼り付けてください。Markdown見出し、HTML見出し、表、FAQもそのまま入力できます。"
                className="min-h-[320px] w-full resize-y rounded-md border border-line bg-white p-4 text-sm leading-7 outline-none transition focus:border-accent focus:ring-2 focus:ring-teal-100"
              />
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {inputMode === "text" ? (
              <button
                type="button"
                onClick={() => setText(sampleText)}
                className="rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink transition hover:bg-panel"
              >
                サンプル本文を入れる
              </button>
            ) : (
              <span className="text-sm text-muted">
                JavaScriptで後から描画される本文は抽出できない場合があります。
              </span>
            )}
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-md bg-accent px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? "診断中..." : "診断開始"}
            </button>
          </div>
        </form>

        {error ? (
          <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        {result ? (
          <section className="mt-8 space-y-6">
            {result.llmStatus === "fallback" && result.llmError ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                {result.llmError}
              </div>
            ) : null}

            <div className="rounded-lg border border-line bg-panel p-4 text-sm text-muted">
              診断元: {result.sourceType === "url" ? "URL" : "本文入力"} / 解析文字数:{" "}
              {result.analyzedTextLength.toLocaleString("ja-JP")}文字
              {result.sourceUrl ? (
                <>
                  {" "}
                  / 取得URL:{" "}
                  <a
                    href={result.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-accent underline"
                  >
                    {result.sourceUrl}
                  </a>
                </>
              ) : null}
            </div>

            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
              <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold text-muted">総合スコア</p>
                <p
                  className={`mt-3 text-6xl font-bold ${getScoreTone(
                    result.totalScore
                  )}`}
                >
                  {result.totalScore}
                </p>
                <p className="mt-2 text-sm text-muted">100点満点</p>
              </div>

              <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold text-ink">評価サマリー</h2>
                <p className="mt-3 leading-7 text-muted">{result.summary}</p>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6">
              <h2 className="mb-4 text-xl font-bold text-ink">項目別スコア表</h2>
              <ScoreTable scores={result.ruleScores} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold text-ink">改善すべき点</h2>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
                  {result.problems.map((problem) => (
                    <li key={problem} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                      <span>{problem}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
                <h2 className="text-xl font-bold text-ink">具体的な改善提案</h2>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
                  {result.improvements.map((improvement) => (
                    <li key={improvement} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      <span>{improvement}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-ink">FAQ案</h2>
              <div className="mt-4 space-y-4">
                {result.faqIdeas.map((faq) => (
                  <div key={faq.question} className="border-b border-line pb-4">
                    <p className="font-semibold text-ink">Q. {faq.question}</p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      A. {faq.answer}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="mb-4 text-xl font-bold text-ink">
                メタディスクリプション案
              </h2>
              <div className="grid gap-4 md:grid-cols-3">
                {result.metaDescriptions.map((description) => (
                  <div
                    key={description}
                    className="rounded-lg border border-line bg-white p-4 text-sm leading-6 text-muted shadow-sm"
                  >
                    {description}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
