import { NextResponse } from "next/server";
import {
  createHistory,
  findRecentHistoriesByUser,
  type HistoryResponseItem
} from "@/lib/supabaseAdmin";
import { requireAuthenticatedUser } from "@/lib/supabaseAuth";

const HISTORY_LIMIT = 5;
const INPUT_PREVIEW_LIMIT = 100;
const SUMMARY_LIMIT = 500;
const SOURCE_URL_LIMIT = 1000;

type HistoryRequestBody = {
  inputPreview?: unknown;
  sourceUrl?: unknown;
  totalScore?: unknown;
  summary?: unknown;
  isPublic?: unknown;
};

function clampText(value: string, limit: number): string {
  return value.trim().slice(0, limit);
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const histories = await findRecentHistoriesByUser(user.id, HISTORY_LIMIT);

    return NextResponse.json({
      histories
    });
  } catch (error) {
    console.error("[History GET failed]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "診断履歴の取得に失敗しました。Supabase設定とテーブルを確認してください。"
      },
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
    const user = await requireAuthenticatedUser(request);
    const sourceUrl =
      typeof body.sourceUrl === "string" && body.sourceUrl.trim().length > 0
        ? clampText(body.sourceUrl, SOURCE_URL_LIMIT)
        : null;
    const history: HistoryResponseItem = await createHistory({
      userId: user.id,
      inputPreview: clampText(body.inputPreview, INPUT_PREVIEW_LIMIT),
      sourceUrl,
      totalScore: Math.round(body.totalScore),
      summary: clampText(body.summary, SUMMARY_LIMIT),
      isPublic: Boolean(body.isPublic && sourceUrl)
    });

    return NextResponse.json({
      history
    });
  } catch (error) {
    console.error("[History POST failed]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "診断履歴の保存に失敗しました。診断結果は表示されていますが、履歴には残っていません。"
      },
      { status: 500 }
    );
  }
}
