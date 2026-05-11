import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const HISTORY_LIMIT = 5;
const INPUT_PREVIEW_LIMIT = 100;
const SUMMARY_LIMIT = 500;
const SOURCE_URL_LIMIT = 1000;

type HistoryRequestBody = {
  inputPreview?: unknown;
  sourceUrl?: unknown;
  totalScore?: unknown;
  summary?: unknown;
};

type HistoryResponseItem = {
  id: number;
  createdAt: string;
  inputPreview: string;
  sourceUrl: string | null;
  totalScore: number;
  summary: string;
};

function toHistoryResponse(history: {
  id: number;
  createdAt: Date;
  inputPreview: string;
  sourceUrl: string | null;
  totalScore: number;
  summary: string;
}): HistoryResponseItem {
  return {
    id: history.id,
    createdAt: history.createdAt.toISOString(),
    inputPreview: history.inputPreview,
    sourceUrl: history.sourceUrl,
    totalScore: history.totalScore,
    summary: history.summary
  };
}

function clampText(value: string, limit: number): string {
  return value.trim().slice(0, limit);
}

export async function GET() {
  try {
    const histories = await prisma.diagnosisHistory.findMany({
      orderBy: {
        createdAt: "desc"
      },
      take: HISTORY_LIMIT
    });

    return NextResponse.json({
      histories: histories.map(toHistoryResponse)
    });
  } catch (error) {
    console.error("[History GET failed]", error);

    return NextResponse.json(
      { error: "診断履歴の取得に失敗しました。DB接続とPrisma設定を確認してください。" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let body: HistoryRequestBody;

  try {
    body = (await request.json()) as HistoryRequestBody;
  } catch {
    return NextResponse.json(
      { error: "履歴保存リクエストのJSON形式が正しくありません。" },
      { status: 400 }
    );
  }

  if (typeof body.inputPreview !== "string") {
    return NextResponse.json(
      { error: "入力プレビューを文字列で送信してください。" },
      { status: 400 }
    );
  }

  if (
    typeof body.totalScore !== "number" ||
    !Number.isFinite(body.totalScore) ||
    body.totalScore < 0 ||
    body.totalScore > 100
  ) {
    return NextResponse.json(
      { error: "総合スコアは0〜100の数値で送信してください。" },
      { status: 400 }
    );
  }

  if (typeof body.summary !== "string" || body.summary.trim().length === 0) {
    return NextResponse.json(
      { error: "評価サマリーは空にできません。" },
      { status: 400 }
    );
  }

  try {
    const history = await prisma.diagnosisHistory.create({
      data: {
        inputPreview: clampText(body.inputPreview, INPUT_PREVIEW_LIMIT),
        sourceUrl:
          typeof body.sourceUrl === "string" && body.sourceUrl.trim().length > 0
            ? clampText(body.sourceUrl, SOURCE_URL_LIMIT)
            : null,
        totalScore: Math.round(body.totalScore),
        summary: clampText(body.summary, SUMMARY_LIMIT)
      }
    });

    return NextResponse.json({
      history: toHistoryResponse(history)
    });
  } catch (error) {
    console.error("[History POST failed]", error);

    return NextResponse.json(
      { error: "診断履歴の保存に失敗しました。診断結果は表示されていますが、履歴には残っていません。" },
      { status: 500 }
    );
  }
}
