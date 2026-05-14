import { NextResponse } from "next/server";
import { findTopSiteHistories } from "@/lib/supabaseAdmin";
import { requireAuthenticatedUser } from "@/lib/supabaseAuth";

const TOP_SITE_LIMIT = 5;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") === "public" ? "public" : "mine";
    const user = await requireAuthenticatedUser(request);
    const sites = await findTopSiteHistories(
      TOP_SITE_LIMIT,
      scope,
      scope === "mine" ? user.id : undefined
    );

    return NextResponse.json({
      sites: sites.map((site) =>
        scope === "public"
          ? {
              id: site.id,
              createdAt: site.createdAt,
              inputPreview: "",
              sourceUrl: site.sourceUrl,
              totalScore: site.totalScore,
              summary: "",
              isPublic: site.isPublic
            }
          : site
      )
    });
  } catch (error) {
    console.error("[Top sites GET failed]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "高スコアサイト5選の取得に失敗しました。Supabase設定とテーブルを確認してください。"
      },
      { status: 500 }
    );
  }
}
