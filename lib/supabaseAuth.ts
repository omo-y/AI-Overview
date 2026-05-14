export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

type SupabaseAuthUserResponse = {
  id?: unknown;
  email?: unknown;
};

function getAuthConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase Auth設定が不足しています。NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を .env.local に設定してください。"
    );
  }

  return {
    url: url.replace(/\/$/, ""),
    anonKey
  };
}

export function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");

  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function getUserFromAccessToken(
  accessToken: string
): Promise<AuthenticatedUser> {
  const { url, anonKey } = getAuthConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("ログイン情報を確認できませんでした。もう一度ログインしてください。");
  }

  const user = (await response.json()) as SupabaseAuthUserResponse;

  if (typeof user.id !== "string" || user.id.length === 0) {
    throw new Error("Supabase AuthからユーザーIDを取得できませんでした。");
  }

  return {
    id: user.id,
    email: typeof user.email === "string" ? user.email : null
  };
}

export async function requireAuthenticatedUser(
  request: Request
): Promise<AuthenticatedUser> {
  const token = getBearerToken(request);

  if (!token) {
    throw new Error("この機能を使うにはログインが必要です。");
  }

  return getUserFromAccessToken(token);
}
