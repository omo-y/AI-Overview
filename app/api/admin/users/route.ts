import { NextResponse } from "next/server";
import { findAdminUsers, requireAdminRole } from "@/lib/supabaseAdmin";
import { requireAuthenticatedUser } from "@/lib/supabaseAuth";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    await requireAdminRole(user.id);
    const users = await findAdminUsers();

    return NextResponse.json({
      users
    });
  } catch (error) {
    console.error("[Admin users GET failed]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "管理者用ユーザー一覧の取得に失敗しました。"
      },
      { status: 403 }
    );
  }
}
