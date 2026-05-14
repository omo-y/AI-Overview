type SupabaseHistoryRow = {
  id: number;
  user_id: string | null;
  created_at: string;
  input_preview: string;
  source_url: string | null;
  total_score: number;
  summary: string;
  is_public: boolean;
};

export type HistoryResponseItem = {
  id: number;
  createdAt: string;
  inputPreview: string;
  sourceUrl: string | null;
  totalScore: number;
  summary: string;
  isPublic: boolean;
};

type InsertHistoryInput = {
  userId: string;
  inputPreview: string;
  sourceUrl: string | null;
  totalScore: number;
  summary: string;
  isPublic: boolean;
};

const HISTORY_SELECT =
  "id,user_id,created_at,input_preview,source_url,total_score,summary,is_public";

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase設定が不足しています。NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を .env.local に設定してください。"
    );
  }

  return {
    url: url.replace(/\/$/, ""),
    serviceRoleKey
  };
}

function toHistoryResponse(row: SupabaseHistoryRow): HistoryResponseItem {
  return {
    id: row.id,
    createdAt: row.created_at,
    inputPreview: row.input_preview,
    sourceUrl: row.source_url,
    totalScore: row.total_score,
    summary: row.summary,
    isPublic: row.is_public
  };
}

async function requestSupabase<T>(path: string, init?: RequestInit): Promise<T> {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(
      `Supabase API error: HTTP ${response.status}${message ? ` ${message}` : ""}`
    );
  }

  return (await response.json()) as T;
}

export async function findRecentHistoriesByUser(
  userId: string,
  limit: number
) {
  const query = new URLSearchParams({
    select: HISTORY_SELECT,
    user_id: `eq.${userId}`,
    order: "created_at.desc",
    limit: String(limit)
  });
  const rows = await requestSupabase<SupabaseHistoryRow[]>(
    `/diagnosis_histories?${query.toString()}`
  );

  return rows.map(toHistoryResponse);
}

export async function createHistory(input: InsertHistoryInput) {
  const rows = await requestSupabase<SupabaseHistoryRow[]>(
    "/diagnosis_histories",
    {
      method: "POST",
      headers: {
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        user_id: input.userId,
        input_preview: input.inputPreview,
        source_url: input.sourceUrl,
        total_score: input.totalScore,
        summary: input.summary,
        is_public: input.isPublic
      })
    }
  );

  if (!rows[0]) {
    throw new Error("Supabaseから保存後の履歴が返されませんでした。");
  }

  return toHistoryResponse(rows[0]);
}

export async function findTopSiteHistories(
  limit: number,
  scope: "mine" | "public",
  userId?: string
) {
  if (scope === "mine" && !userId) {
    throw new Error("自分の高スコアサイト取得にはログインユーザーIDが必要です。");
  }

  const query = new URLSearchParams({
    select: HISTORY_SELECT,
    source_url: "not.is.null",
    order: "total_score.desc,created_at.desc",
    limit: "100"
  });

  if (scope === "mine" && userId) {
    query.set("user_id", `eq.${userId}`);
  }

  if (scope === "public") {
    query.set("is_public", "eq.true");
  }

  const rows = await requestSupabase<SupabaseHistoryRow[]>(
    `/diagnosis_histories?${query.toString()}`
  );
  const uniqueSites = new Map<string, HistoryResponseItem>();

  for (const row of rows) {
    if (!row.source_url || uniqueSites.has(row.source_url)) {
      continue;
    }

    uniqueSites.set(row.source_url, toHistoryResponse(row));

    if (uniqueSites.size >= limit) {
      break;
    }
  }

  return Array.from(uniqueSites.values());
}
