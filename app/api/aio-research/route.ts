import { NextResponse } from "next/server";
import { researchAiOverviewQueries } from "@/lib/aioQueryResearch";
import { createAioQueryResearch } from "@/lib/supabaseAdmin";
import {
  requireAuthenticatedUser,
  type AuthenticatedUser
} from "@/lib/supabaseAuth";
import type { AioQueryResearch } from "@/types/analysis";

type AioResearchRequestBody = {
  queries?: unknown;
  sourceUrl?: unknown;
};

type AioResearchErrorResponse = {
  error: string;
};

export async function POST(request: Request) {
  let user: AuthenticatedUser;

  try {
    user = await requireAuthenticatedUser(request);
  } catch (error) {
    return NextResponse.json<AioResearchErrorResponse>(
      {
        error:
          error instanceof Error
            ? error.message
            : "この機能を使うにはログインが必要です。"
      },
      { status: 401 }
    );
  }

  let body: AioResearchRequestBody;

  try {
    body = (await request.json()) as AioResearchRequestBody;
  } catch {
    return NextResponse.json<AioResearchErrorResponse>(
      { error: "リクエストのJSON形式が正しくありません。" },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.queries)) {
    return NextResponse.json<AioResearchErrorResponse>(
      { error: "実測対象のクエリを指定してください。" },
      { status: 400 }
    );
  }

  const queries = body.queries
    .filter((query): query is string => typeof query === "string")
    .map((query) => query.trim())
    .filter(Boolean);

  if (queries.length === 0) {
    return NextResponse.json<AioResearchErrorResponse>(
      { error: "実測対象のクエリを1件以上入力してください。" },
      { status: 400 }
    );
  }

  const sourceUrl =
    typeof body.sourceUrl === "string" && body.sourceUrl.trim().length > 0
      ? body.sourceUrl.trim()
      : undefined;
  const research = await researchAiOverviewQueries(queries, sourceUrl);

  try {
    const saved = await createAioQueryResearch({
      userId: user.id,
      sourceUrl: sourceUrl ?? null,
      research
    });

    return NextResponse.json<AioQueryResearch>({
      ...research,
      persistenceStatus: "success",
      savedAt: saved.createdAt
    });
  } catch (error) {
    console.error("[AIO query research save failed]", error);

    return NextResponse.json<AioQueryResearch>({
      ...research,
      persistenceStatus: "failed",
      persistenceError:
        "AI Overview実測結果のDB保存に失敗しました。実測結果は表示されていますが、履歴には残っていません。"
    });
  }
}
