import { NextResponse } from "next/server";
import { getDiagnosisUsageSummary } from "@/lib/supabaseAdmin";
import { requireAuthenticatedUser } from "@/lib/supabaseAuth";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const usage = await getDiagnosisUsageSummary(user.id);

    return NextResponse.json({
      usage
    });
  } catch (error) {
    console.error("[Usage GET failed]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "利用回数の取得に失敗しました。"
      },
      { status: 500 }
    );
  }
}
