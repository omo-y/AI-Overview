import { NextResponse } from "next/server";
import {
  requireAdminRole,
  resetCurrentMonthUsage
} from "@/lib/supabaseAdmin";
import { requireAuthenticatedUser } from "@/lib/supabaseAuth";

type ResetRequestBody = {
  userId?: unknown;
};

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    await requireAdminRole(user.id);
    const body = (await request.json()) as ResetRequestBody;

    if (typeof body.userId !== "string" || body.userId.trim().length === 0) {
      return NextResponse.json(
        { error: "リセット対象のユーザーIDを指定してください。" },
        { status: 400 }
      );
    }

    await resetCurrentMonthUsage(body.userId.trim());

    return NextResponse.json({
      message: "対象ユーザーの今月分の診断回数をリセットしました。"
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
