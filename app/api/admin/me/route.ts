import { NextResponse } from "next/server";
import { getUserRole } from "@/lib/supabaseAdmin";
import { requireAuthenticatedUser } from "@/lib/supabaseAuth";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const role = await getUserRole(user.id);

    return NextResponse.json({
      isAdmin: role === "admin",
      role
    });
  } catch (error) {
    console.error("[Admin me GET failed]", error);

    return NextResponse.json(
      {
        isAdmin: false,
        role: "user",
        error:
          "管理者権限の確認に失敗しました。Supabase設定とprofilesテーブルを確認してください。"
      },
      { status: 500 }
    );
  }
}
