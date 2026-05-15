import { NextResponse } from "next/server";
import {
  requireAdminRole,
  resetCurrentMonthUsage
} from "@/lib/supabaseAdmin";
import { requireAuthenticatedUser } from "@/lib/supabaseAuth";

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    await requireAdminRole(user.id);
    await resetCurrentMonthUsage(user.id);

    return NextResponse.json({
      message: "今月の診断回数をリセットしました。"
    });
  } catch (error) {
    console.error("[Admin usage reset failed]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "診断回数のリセットに失敗しました。"
      },
      { status: 403 }
    );
  }
}
