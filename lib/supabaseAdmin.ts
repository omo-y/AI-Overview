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

type SupabaseUsageRow = {
  id: number;
  user_id: string;
  action: string;
  created_at: string;
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

export type UsageSummary = {
  monthlyLimit: number;
  usedThisMonth: number;
  remainingThisMonth: number;
  periodStart: string;
  isAvailable: boolean;
  message?: string;
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
const USAGE_SELECT = "id,user_id,action,created_at";
const DEFAULT_MONTHLY_DIAGNOSIS_LIMIT = 10;
const USAGE_TABLE_MISSING_MESSAGE =
  "利用回数テーブルが未作成です。診断は実行できますが、月間回数制限はまだ有効ではありません。";

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase設定が不足しています。.env.local を確認してください。"
    );
  }

  return {
    url: url.replace(/\/$/, ""),
    serviceRoleKey
  };
}

function getMonthlyDiagnosisLimit() {
  const rawLimit = process.env.MONTHLY_DIAGNOSIS_LIMIT;
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : NaN;

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    return DEFAULT_MONTHLY_DIAGNOSIS_LIMIT;
  }

  return parsedLimit;
}

function getCurrentMonthStart() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
  ).toISOString();
}

function isUsageTableMissingError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes("usage_events") ||
    error.message.includes("PGRST205")
  );
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

  if (response.status === 204) {
    return [] as T;
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

export async function getDiagnosisUsageSummary(
  userId: string
): Promise<UsageSummary> {
  const monthlyLimit = getMonthlyDiagnosisLimit();
  const periodStart = getCurrentMonthStart();
  const query = new URLSearchParams({
    select: USAGE_SELECT,
    user_id: `eq.${userId}`,
    action: "eq.diagnosis",
    created_at: `gte.${periodStart}`,
    limit: String(Math.max(monthlyLimit + 50, 100))
  });

  try {
    const rows = await requestSupabase<SupabaseUsageRow[]>(
      `/usage_events?${query.toString()}`
    );
    const usedThisMonth = rows.length;

    return {
      monthlyLimit,
      usedThisMonth,
      remainingThisMonth: Math.max(monthlyLimit - usedThisMonth, 0),
      periodStart,
      isAvailable: true
    };
  } catch (error) {
    if (!isUsageTableMissingError(error)) {
      throw error;
    }

    console.warn("[Usage table missing]", error);

    return {
      monthlyLimit,
      usedThisMonth: 0,
      remainingThisMonth: monthlyLimit,
      periodStart,
      isAvailable: false,
      message: USAGE_TABLE_MISSING_MESSAGE
    };
  }
}

export async function assertDiagnosisUsageAvailable(userId: string) {
  const usage = await getDiagnosisUsageSummary(userId);

  if (!usage.isAvailable) {
    return usage;
  }

  if (usage.remainingThisMonth <= 0) {
    throw new Error(
      `今月の診断回数上限（${usage.monthlyLimit}回）に達しました。来月になると再び診断できます。`
    );
  }

  return usage;
}

export async function recordDiagnosisUsage(userId: string) {
  try {
    await requestSupabase<SupabaseUsageRow[]>("/usage_events", {
      method: "POST",
      headers: {
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        user_id: userId,
        action: "diagnosis"
      })
    });
  } catch (error) {
    if (!isUsageTableMissingError(error)) {
      throw error;
    }

    console.warn("[Usage record skipped because table is missing]", error);
  }
}
