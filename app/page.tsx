"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type {
  AnalysisResult,
  AnalyzeErrorResponse,
  AioQueryResearch,
  RuleScore,
  UsageSummary
} from "@/types/analysis";

type InputMode = "url" | "text";
type HistoryViewMode = "recent" | "topSites";
type TopSitesScope = "mine" | "public";
type AuthMode = "signIn" | "signUp" | "resetRequest" | "updatePassword";

type AuthSession = {
  accessToken: string;
  user: {
    id: string;
    email: string | null;
  };
};

type SupabaseAuthResponse = {
  access_token?: string;
  user?: {
    id?: string;
    email?: string;
  };
  msg?: string;
  error_description?: string;
};

type AnalysisHistoryItem = {
  id: number;
  createdAt: string;
  inputPreview: string;
  sourceUrl: string | null;
  totalScore: number;
  summary: string;
  isPublic: boolean;
};

type HistoryListResponse = {
  histories: AnalysisHistoryItem[];
  error?: string;
};

type HistoryCreateResponse = {
  history: AnalysisHistoryItem;
  error?: string;
};

type TopSiteItem = AnalysisHistoryItem & {
  sourceUrl: string;
};

type TopSitesResponse = {
  sites: TopSiteItem[];
  error?: string;
};

type UsageResponse = {
  usage: UsageSummary;
  error?: string;
};

type AdminStatusResponse = {
  isAdmin: boolean;
  role: "user" | "admin";
  error?: string;
};

type AdminResetResponse = {
  message?: string;
  error?: string;
};

type AdminUserItem = {
  userId: string;
  email: string | null;
  role: "user" | "admin";
  createdAt: string;
  usage: UsageSummary;
};

type AdminUsersResponse = {
  users: AdminUserItem[];
  error?: string;
};

type AioResearchErrorResponse = {
  error: string;
};

const SESSION_STORAGE_KEY = "ai-overview-auth-session";

const sampleText = `# AI Overviewに引用されやすい記事構造とは

結論として、AI検索に引用されやすい記事は、冒頭で答えを示し、見出しごとに質問へ明確に回答している記事です。

## なぜ冒頭の結論が必要か
AI Overviewは短時間で回答の核を抽出するため、本文の最初に要点がある記事を理解しやすくなります。

## 改善方法
- 重要な結論を最初に書く
- 公式情報や一次情報を引用する
- FAQと比較表を追加する

| 項目 | 改善内容 |
| --- | --- |
| 見出し | 質問型にする |
| 根拠 | 公式資料を引用する |

## FAQ
Q. AI Overview対策にFAQは必要ですか？
A. リッチリザルト目的ではなく、質問と回答の関係を明確にする目的で有効です。`;

function getSupabaseClientConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  };
}

function getScoreTone(score: number): string {
  if (score >= 80) {
    return "text-emerald-700";
  }

  if (score >= 60) {
    return "text-amber-700";
  }

  return "text-rose-700";
}

function getScoreBackground(score: number): string {
  if (score >= 80) {
    return "bg-emerald-500";
  }

  if (score >= 60) {
    return "bg-amber-500";
  }

  return "bg-rose-500";
}

function getScoreLabel(score: number): string {
  if (score >= 80) {
    return "良好";
  }

  if (score >= 60) {
    return "改善余地あり";
  }

  return "要改善";
}

function getPriorityLabel(index: number): string {
  if (index === 0) {
    return "最優先";
  }

  if (index === 1) {
    return "高";
  }

  if (index === 2) {
    return "中";
  }

  return "通常";
}

function formatAnalyzedAt(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function getAuthTitle(authMode: AuthMode) {
  if (authMode === "signUp") {
    return "アカウント作成";
  }

  if (authMode === "resetRequest") {
    return "パスワードリセット";
  }

  if (authMode === "updatePassword") {
    return "新しいパスワードを設定";
  }

  return "ログイン";
}

function ScoreTable({ scores }: { scores: RuleScore[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-slate-50 text-xs uppercase tracking-normal text-muted">
            <th className="px-4 py-3 font-semibold">診断項目</th>
            <th className="w-32 px-4 py-3 font-semibold">スコア</th>
            <th className="w-44 px-4 py-3 font-semibold">状態</th>
            <th className="px-4 py-3 font-semibold">コメント</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((score) => {
            const percentage = score.score * 10;

            return (
              <tr key={score.item} className="border-b border-line last:border-0">
                <td className="px-4 py-4 font-medium text-ink">{score.item}</td>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className={["w-10 font-bold", getScoreTone(percentage)].join(" ")}>
                      {score.score}/10
                    </span>
                    <div className="h-2 w-20 rounded-full bg-slate-100">
                      <div
                        className={[
                          "h-2 rounded-full",
                          getScoreBackground(percentage)
                        ].join(" ")}
                        style={{ width: percentage + "%" }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className="rounded-full border border-line bg-white px-2.5 py-1 text-xs font-semibold text-muted">
                    {getScoreLabel(percentage)}
                  </span>
                </td>
                <td className="px-4 py-4 leading-6 text-muted">{score.comment}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function Home() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetAccessToken, setResetAccessToken] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const [inputMode, setInputMode] = useState<InputMode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [isPublicRankingEnabled, setIsPublicRankingEnabled] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [topSites, setTopSites] = useState<TopSiteItem[]>([]);
  const [historyViewMode, setHistoryViewMode] =
    useState<HistoryViewMode>("recent");
  const [topSitesScope, setTopSitesScope] = useState<TopSitesScope>("mine");
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [usageNotice, setUsageNotice] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUserItem[]>([]);
  const [adminMessage, setAdminMessage] = useState("");
  const [resettingUserId, setResettingUserId] = useState("");
  const [isResettingUsage, setIsResettingUsage] = useState(false);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [aioQueryInput, setAioQueryInput] = useState("");
  const [isAioResearchLoading, setIsAioResearchLoading] = useState(false);
  const [aioResearchError, setAioResearchError] = useState("");

  const characterCount = useMemo(() => text.trim().length, [text]);

  useEffect(() => {
    function handleScroll() {
      setShowBackToTop(window.scrollY > 600);
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const authHeaders = useMemo(() => {
    if (!session) {
      return undefined;
    }

    return {
      Authorization: `Bearer ${session.accessToken}`
    };
  }, [session]);

  const clearSession = useCallback(() => {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setSession(null);
    setHistory([]);
    setTopSites([]);
    setUsage(null);
    setUsageNotice("");
    setIsAdmin(false);
    setAdminUsers([]);
    setAdminMessage("");
    setResettingUserId("");
    setResult(null);
    setAioQueryInput("");
    setAioResearchError("");
  }, []);

  const saveSession = useCallback((nextSession: AuthSession) => {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
  }, []);

  const validateStoredSession = useCallback(
    async (storedSession: AuthSession) => {
      const { url: supabaseUrl, anonKey } = getSupabaseClientConfig();

      if (!supabaseUrl || !anonKey) {
        clearSession();
        setAuthError(
          "Supabase Auth設定が不足しています。.env.local を確認してください。"
        );
        return;
      }

      const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${storedSession.accessToken}`
        },
        cache: "no-store"
      });

      if (!response.ok) {
        clearSession();
        return;
      }

      setSession(storedSession);
    },
    [clearSession]
  );

  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hashParams.get("access_token");
    const type = hashParams.get("type");

    if (!accessToken || type !== "recovery") {
      return;
    }

    const timerId = window.setTimeout(() => {
      clearSession();
      setResetAccessToken(accessToken);
      setAuthMode("updatePassword");
      setAuthMessage("新しいパスワードを入力してください。");
      window.history.replaceState(null, "", window.location.pathname);
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [clearSession]);

  useEffect(() => {
    const rawSession = window.localStorage.getItem(SESSION_STORAGE_KEY);

    if (!rawSession) {
      return;
    }

    const timerId = window.setTimeout(() => {
      try {
        void validateStoredSession(JSON.parse(rawSession) as AuthSession);
      } catch {
        clearSession();
      }
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [clearSession, validateStoredSession]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");

    const { url: supabaseUrl, anonKey } = getSupabaseClientConfig();

    if (!supabaseUrl || !anonKey) {
      setAuthError(
        "Supabase Auth設定が不足しています。.env.local を確認してください。"
      );
      return;
    }

    if (authMode === "resetRequest") {
      if (!email.trim()) {
        setAuthError("パスワードリセット用のメールアドレスを入力してください。");
        return;
      }

      setIsAuthLoading(true);

      try {
        const response = await fetch(
          `${supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(
            window.location.origin
          )}`,
          {
            method: "POST",
            headers: {
              apikey: anonKey,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              email: email.trim()
            })
          }
        );
        const data = (await response.json().catch(() => ({}))) as SupabaseAuthResponse;

        if (!response.ok) {
          setAuthError(
            data.error_description ??
              data.msg ??
              "パスワードリセットメールの送信に失敗しました。"
          );
          return;
        }

        setAuthMessage("パスワードリセット用のメールを送信しました。メール内のリンクを開いてください。");
      } catch (authSubmitError) {
        console.error("[Password reset request failed]", authSubmitError);
        setAuthError("パスワードリセットメールの送信に失敗しました。");
      } finally {
        setIsAuthLoading(false);
      }

      return;
    }

    if (authMode === "updatePassword") {
      if (!resetAccessToken) {
        setAuthError("パスワード変更用のトークンが見つかりません。もう一度リセットメールを送信してください。");
        return;
      }

      if (newPassword.length < 6) {
        setAuthError("新しいパスワードは6文字以上で入力してください。");
        return;
      }

      setIsAuthLoading(true);

      try {
        const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
          method: "PUT",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${resetAccessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            password: newPassword
          })
        });
        const data = (await response.json().catch(() => ({}))) as SupabaseAuthResponse;

        if (!response.ok) {
          setAuthError(
            data.error_description ??
              data.msg ??
              "パスワードの変更に失敗しました。"
          );
          return;
        }

        setResetAccessToken("");
        setNewPassword("");
        setPassword("");
        setAuthMode("signIn");
        setAuthMessage("パスワードを変更しました。新しいパスワードでログインしてください。");
      } catch (authSubmitError) {
        console.error("[Password update failed]", authSubmitError);
        setAuthError("パスワードの変更に失敗しました。");
      } finally {
        setIsAuthLoading(false);
      }

      return;
    }

    if (!email.trim() || password.length < 6) {
      setAuthError("メールアドレスと6文字以上のパスワードを入力してください。");
      return;
    }

    setIsAuthLoading(true);

    try {
      const endpoint =
        authMode === "signIn"
          ? `${supabaseUrl}/auth/v1/token?grant_type=password`
          : `${supabaseUrl}/auth/v1/signup`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: anonKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: email.trim(),
          password
        })
      });
      const data = (await response.json()) as SupabaseAuthResponse;

      if (!response.ok) {
        setAuthError(
          data.error_description ??
            data.msg ??
            "ログインまたはアカウント作成に失敗しました。"
        );
        return;
      }

      if (!data.access_token || !data.user?.id) {
        setAuthMessage(
          "アカウントを作成しました。メール確認が有効な場合は、確認後にログインしてください。"
        );
        return;
      }

      saveSession({
        accessToken: data.access_token,
        user: {
          id: data.user.id,
          email: data.user.email ?? email.trim()
        }
      });
      setPassword("");
      setAuthMessage("ログインしました。");
    } catch (authSubmitError) {
      console.error("[Auth failed]", authSubmitError);
      setAuthError("認証通信に失敗しました。SupabaseのURLとネットワーク状態を確認してください。");
    } finally {
      setIsAuthLoading(false);
    }
  }

  const loadUsage = useCallback(async () => {
    if (!authHeaders) {
      return;
    }

    try {
      const response = await fetch("/api/usage", {
        method: "GET",
        headers: authHeaders,
        cache: "no-store"
      });
      const data = (await response.json()) as UsageResponse;

      if (!response.ok) {
        setUsageNotice(data.error ?? "利用回数の取得に失敗しました。");
        return;
      }

      setUsage(data.usage);
      setUsageNotice(data.usage.message ?? "");
    } catch (loadError) {
      console.error("[Usage load failed]", loadError);
      setUsageNotice("利用回数の取得に失敗しました。診断は実行できます。");
    }
  }, [authHeaders]);

  const loadAdminStatus = useCallback(async () => {
    if (!authHeaders) {
      return;
    }

    try {
      const response = await fetch("/api/admin/me", {
        method: "GET",
        headers: authHeaders,
        cache: "no-store"
      });
      const data = (await response.json()) as AdminStatusResponse;

      setIsAdmin(response.ok && data.isAdmin);
    } catch (adminStatusError) {
      console.error("[Admin status load failed]", adminStatusError);
      setIsAdmin(false);
    }
  }, [authHeaders]);

  const loadAdminUsers = useCallback(async () => {
    if (!authHeaders || !isAdmin) {
      setAdminUsers([]);
      return;
    }

    try {
      const response = await fetch("/api/admin/users", {
        method: "GET",
        headers: authHeaders,
        cache: "no-store"
      });
      const data = (await response.json()) as AdminUsersResponse;

      if (!response.ok) {
        setAdminMessage(
          data.error ?? "管理者用ユーザー一覧の取得に失敗しました。"
        );
        return;
      }

      setAdminUsers(data.users);
      const currentUser = data.users.find(
        (adminUser) => adminUser.userId === session?.user.id
      );

      if (currentUser) {
        setUsage(currentUser.usage);
        setUsageNotice(currentUser.usage.message ?? "");
      }
    } catch (adminUsersError) {
      console.error("[Admin users load failed]", adminUsersError);
      setAdminMessage("管理者用ユーザー一覧の取得に失敗しました。");
    }
  }, [authHeaders, isAdmin, session?.user.id]);

  const loadHistory = useCallback(async () => {
    if (!authHeaders) {
      return;
    }

    try {
      const response = await fetch("/api/history", {
        method: "GET",
        headers: authHeaders,
        cache: "no-store"
      });
      const data = (await response.json()) as HistoryListResponse;

      if (!response.ok) {
        setHistoryError(
          data.error ??
            "診断履歴の取得に失敗しました。Supabase設定とテーブルを確認してください。"
        );
        return;
      }

      setHistory(data.histories);
      setHistoryError("");
    } catch (loadError) {
      console.error("[History load failed]", loadError);
      setHistoryError(
        "診断履歴の取得に失敗しました。Supabase設定とテーブルを確認してください。"
      );
    }
  }, [authHeaders]);

  const loadTopSites = useCallback(async () => {
    if (!authHeaders) {
      return;
    }

    try {
      const response = await fetch(`/api/history/top-sites?scope=${topSitesScope}`, {
        method: "GET",
        headers: authHeaders,
        cache: "no-store"
      });
      const data = (await response.json()) as TopSitesResponse;

      if (!response.ok) {
        setHistoryError(
          data.error ??
            "高スコアサイト5選の取得に失敗しました。Supabase設定とテーブルを確認してください。"
        );
        return;
      }

      setTopSites(data.sites);
      setHistoryError("");
    } catch (loadError) {
      console.error("[Top sites load failed]", loadError);
      setHistoryError(
        "高スコアサイト5選の取得に失敗しました。Supabase設定とテーブルを確認してください。"
      );
    }
  }, [authHeaders, topSitesScope]);

  const refreshHistoryViews = useCallback(async () => {
    await Promise.all([
      loadHistory(),
      loadTopSites(),
      loadUsage(),
      loadAdminStatus()
    ]);
  }, [loadAdminStatus, loadHistory, loadTopSites, loadUsage]);

  useEffect(() => {
    if (!session) {
      return;
    }

    const timerId = window.setTimeout(() => {
      void refreshHistoryViews();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [refreshHistoryViews, session]);

  useEffect(() => {
    if (!session || !isAdmin) {
      return;
    }

    const timerId = window.setTimeout(() => {
      void loadAdminUsers();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [isAdmin, loadAdminUsers, session]);

  async function saveHistoryItem(analysisResult: AnalysisResult) {
    if (!authHeaders) {
      setHistoryError("診断履歴を保存するにはログインが必要です。");
      return;
    }

    try {
      const response = await fetch("/api/history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({
          inputPreview:
            analysisResult.analyzedTextPreview.trim() ||
            (inputMode === "url" ? url.trim() : text.trim()).slice(0, 100),
          sourceUrl: analysisResult.sourceUrl ?? null,
          totalScore: analysisResult.totalScore,
          summary: analysisResult.summary,
          isPublic: inputMode === "url" && isPublicRankingEnabled
        })
      });
      const data = (await response.json()) as HistoryCreateResponse;

      if (!response.ok) {
        setHistoryError(
          data.error ??
            "診断履歴の保存に失敗しました。診断結果は表示されていますが、履歴には残っていません。"
        );
        return;
      }

      setHistoryError("");
      await refreshHistoryViews();
      if (isAdmin) {
        await loadAdminUsers();
      }
    } catch (saveError) {
      console.error("[History save failed]", saveError);
      setHistoryError(
        "診断履歴の保存に失敗しました。診断結果は表示されていますが、履歴には残っていません。"
      );
    }
  }

  async function handleResetUserMonthlyUsage(userId: string) {
    if (!authHeaders || !isAdmin) {
      return;
    }

    setIsResettingUsage(true);
    setResettingUserId(userId);
    setAdminMessage("");

    try {
      const response = await fetch("/api/admin/usage/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({ userId })
      });
      const data = (await response.json()) as AdminResetResponse;

      if (!response.ok) {
        setAdminMessage(data.error ?? "診断回数のリセットに失敗しました。");
        return;
      }

      setAdminMessage(data.message ?? "対象ユーザーの今月分をリセットしました。");
      await loadUsage();
      await loadAdminUsers();
    } catch (resetError) {
      console.error("[Usage reset failed]", resetError);
      setAdminMessage("診断回数のリセットに失敗しました。");
    } finally {
      setIsResettingUsage(false);
      setResettingUserId("");
    }
  }

  function handleBackToTop() {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  async function handleRunAioResearch() {
    if (!authHeaders || !result) {
      return;
    }

    const queries = aioQueryInput
      .split("\n")
      .map((query) => query.trim())
      .filter(Boolean);

    if (queries.length === 0) {
      setAioResearchError("実測対象のクエリを1件以上入力してください。");
      return;
    }

    setIsAioResearchLoading(true);
    setAioResearchError("");

    try {
      const response = await fetch("/api/aio-research", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        },
        body: JSON.stringify({
          queries,
          sourceUrl: result.sourceUrl
        })
      });
      const data = (await response.json()) as
        | AioQueryResearch
        | AioResearchErrorResponse;

      if (!response.ok) {
        setAioResearchError(
          "error" in data ? data.error : "AI Overview実測チェックに失敗しました。"
        );
        return;
      }

      setResult({
        ...result,
        aioQueryResearch: data as AioQueryResearch
      });
    } catch (researchError) {
      console.error("[AIO research failed]", researchError);
      setAioResearchError("AI Overview実測チェックに失敗しました。");
    } finally {
      setIsAioResearchLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setAioQueryInput("");
    setAioResearchError("");

    if (!authHeaders) {
      setError("診断を実行するにはログインが必要です。");
      return;
    }

    if (usage?.isAvailable && usage.remainingThisMonth <= 0) {
      setError(`今月の診断回数上限（${usage.monthlyLimit}回）に達しました。`);
      return;
    }

    if (inputMode === "url" && url.trim().length === 0) {
      setError("診断対象ページのURLを入力してください。");
      return;
    }

    if (inputMode === "text" && characterCount < 100) {
      setError("本文が短すぎます。100文字以上の記事本文を入力してください。");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders
        },
        body:
          inputMode === "url"
            ? JSON.stringify({ url })
            : JSON.stringify({ text })
      });

      const data = (await response.json()) as
        | AnalysisResult
        | AnalyzeErrorResponse;

      if (!response.ok) {
        setError("error" in data ? data.error : "診断に失敗しました。");
        await loadUsage();
        return;
      }

      const analysisResult = data as AnalysisResult;
      setResult(analysisResult);
      setAioQueryInput(analysisResult.aioQueryResearch.generatedQueries.join("\n"));
      await saveHistoryItem(analysisResult);
    } catch {
      setError(
        "通信エラーが発生しました。開発サーバーの状態を確認してください。"
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-normal text-accent">
              Local LLM + Rule Based
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-normal text-ink sm:text-3xl">
              AI Overview診断ツール
            </h1>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="rounded-full border border-line bg-slate-50 px-4 py-2 text-sm text-muted">
              OpenAI APIなし / Supabase Postgres / ログイン必須
            </span>
            {session ? (
              <button
                type="button"
                onClick={clearSession}
                className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50"
              >
                ログアウト
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {!session ? (
          <section className="mx-auto max-w-xl rounded-lg border border-line bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-ink">{getAuthTitle(authMode)}</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              診断実行と履歴保存にはログインが必要です。履歴はユーザーごとに分離されます。
            </p>

            <form onSubmit={handleAuthSubmit} className="mt-6 space-y-4">
              {authMode !== "updatePassword" ? (
                <div>
                  <label htmlFor="email" className="text-sm font-semibold text-ink">
                    メールアドレス
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-2 w-full rounded-md border border-line bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-teal-100"
                    autoComplete="email"
                  />
                </div>
              ) : null}

              {authMode === "signIn" || authMode === "signUp" ? (
                <div>
                  <label
                    htmlFor="password"
                    className="text-sm font-semibold text-ink"
                  >
                    パスワード
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-2 w-full rounded-md border border-line bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-teal-100"
                    autoComplete={
                      authMode === "signIn" ? "current-password" : "new-password"
                    }
                  />
                </div>
              ) : null}

              {authMode === "updatePassword" ? (
                <div>
                  <label
                    htmlFor="new-password"
                    className="text-sm font-semibold text-ink"
                  >
                    新しいパスワード
                  </label>
                  <input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="mt-2 w-full rounded-md border border-line bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-teal-100"
                    autoComplete="new-password"
                  />
                </div>
              ) : null}

              {authError ? (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                  {authError}
                </div>
              ) : null}
              {authMessage ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  {authMessage}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isAuthLoading}
                className="w-full rounded-md bg-accent px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAuthLoading
                  ? "処理中..."
                  : authMode === "signUp"
                    ? "アカウント作成"
                    : authMode === "resetRequest"
                      ? "リセットメールを送信"
                      : authMode === "updatePassword"
                        ? "パスワードを変更"
                        : "ログイン"}
              </button>
            </form>

            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === "signIn" ? "signUp" : "signIn");
                  setAuthError("");
                  setAuthMessage("");
                }}
                className="font-semibold text-accent underline"
              >
                {authMode === "signIn"
                  ? "アカウントを作成する"
                  : "ログイン画面に戻る"}
              </button>
              {authMode !== "updatePassword" ? (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("resetRequest");
                    setAuthError("");
                    setAuthMessage("");
                  }}
                  className="font-semibold text-accent underline"
                >
                  パスワードを忘れた場合
                </button>
              ) : null}
            </div>
          </section>
        ) : (
          <>
            <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="rounded-lg border border-line bg-white p-4 text-sm text-muted shadow-sm">
                ログイン中:{" "}
                <span className="font-semibold text-ink">
                  {session.user.email ?? session.user.id}
                </span>
              </div>
              <div className="rounded-lg border border-line bg-white p-4 text-sm shadow-sm">
                <p className="font-semibold text-ink">今月の診断回数</p>
                <p className="mt-1 text-muted">
                  {usage
                    ? usage.isAvailable
                      ? `${usage.usedThisMonth} / ${usage.monthlyLimit}回 使用中`
                      : "制限未設定"
                    : "取得中..."}
                </p>
                {usageNotice ? (
                  <p className="mt-2 text-xs leading-5 text-amber-700">
                    {usageNotice}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
              <section className="rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6 xl:sticky xl:top-6 xl:self-start">
                <div className="mb-5">
                  <h2 className="text-lg font-bold text-ink">診断対象</h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    URLまたは記事本文から、AI検索に引用されやすい構造かを診断します。
                  </p>
                </div>

                <form onSubmit={handleSubmit}>
                  <div className="mb-5 grid grid-cols-2 rounded-md border border-line bg-slate-50 p-1">
                    <button
                      type="button"
                      aria-pressed={inputMode === "url"}
                      onClick={() => setInputMode("url")}
                      className={`rounded px-3 py-2 text-sm font-semibold transition ${
                        inputMode === "url"
                          ? "bg-white text-accent shadow-sm"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      URLで診断
                    </button>
                    <button
                      type="button"
                      aria-pressed={inputMode === "text"}
                      onClick={() => setInputMode("text")}
                      className={`rounded px-3 py-2 text-sm font-semibold transition ${
                        inputMode === "text"
                          ? "bg-white text-accent shadow-sm"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      本文で診断
                    </button>
                  </div>

                  {inputMode === "url" ? (
                    <div>
                      <label
                        htmlFor="target-url"
                        className="text-sm font-semibold text-ink"
                      >
                        診断対象ページURL
                      </label>
                      <input
                        id="target-url"
                        type="url"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        placeholder="https://example.com/article"
                        className="mt-2 w-full rounded-md border border-line bg-white px-4 py-3 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-teal-100"
                      />
                      <label className="mt-4 flex items-start gap-3 rounded-md border border-line bg-slate-50 p-3 text-sm text-muted">
                        <input
                          type="checkbox"
                          checked={isPublicRankingEnabled}
                          onChange={(event) =>
                            setIsPublicRankingEnabled(event.target.checked)
                          }
                          className="mt-1"
                        />
                        <span>
                          全体の高スコアサイト5選に含める。公開されるのはURL、スコア、診断日時のみです。
                        </span>
                      </label>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-2 flex items-end justify-between gap-3">
                        <label
                          htmlFor="article"
                          className="text-sm font-semibold text-ink"
                        >
                          記事本文
                        </label>
                        <span className="text-xs text-muted">
                          {characterCount.toLocaleString("ja-JP")}文字
                        </span>
                      </div>
                      <textarea
                        id="article"
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        placeholder="診断したい記事本文を貼り付けてください。"
                        className="min-h-[300px] w-full resize-y rounded-md border border-line bg-white p-4 text-sm leading-7 outline-none transition focus:border-accent focus:ring-2 focus:ring-teal-100"
                      />
                    </div>
                  )}

                  <div className="mt-5 flex flex-col gap-3">
                    <button
                      type="submit"
                      disabled={
                        isLoading ||
                        Boolean(usage?.isAvailable && usage.remainingThisMonth <= 0)
                      }
                      className="rounded-md bg-accent px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLoading ? "診断中..." : "診断開始"}
                    </button>
                    {inputMode === "text" ? (
                      <button
                        type="button"
                        onClick={() => setText(sampleText)}
                        className="rounded-md border border-line px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-slate-50"
                      >
                        サンプル本文を入れる
                      </button>
                    ) : (
                      <p className="text-xs leading-5 text-muted">
                        SSRF対策として、localhost、内部IP、特殊ポート、内部URLへのリダイレクトはブロックします。
                      </p>
                    )}
                  </div>
                </form>
              </section>

              <section className="space-y-6">
                <div className="rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6">
                  <h2 className="text-lg font-bold text-ink">診断結果</h2>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    総合スコア、構造チェック、改善提案、FAQ案、メタディスクリプション案を表示します。
                  </p>
                </div>

                {error ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                    {error}
                  </div>
                ) : null}

                {!result && !error ? (
                  <div className="rounded-lg border border-dashed border-line bg-white p-8 text-center text-sm text-muted">
                    診断を開始すると、ここに結果カードが表示されます。
                  </div>
                ) : null}

                {result ? (
                  <>
                    {result.llmStatus === "fallback" && result.llmError ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        {result.llmError}
                      </div>
                    ) : null}

                    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
                      <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-muted">
                              総合スコア
                            </p>
                            <p
                              className={`mt-3 text-7xl font-bold leading-none ${getScoreTone(
                                result.totalScore
                              )}`}
                            >
                              {result.totalScore}
                            </p>
                          </div>
                          <span className="rounded-full border border-line bg-slate-50 px-3 py-1 text-xs font-bold text-muted">
                            {getScoreLabel(result.totalScore)}
                          </span>
                        </div>
                        <div className="mt-5 h-3 rounded-full bg-slate-100">
                          <div
                            className={`h-3 rounded-full ${getScoreBackground(
                              result.totalScore
                            )}`}
                            style={{ width: `${result.totalScore}%` }}
                          />
                        </div>
                        <p className="mt-3 text-sm text-muted">100点満点</p>
                      </div>

                      <div className="rounded-lg border border-line bg-white p-6 shadow-sm">
                        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <h3 className="text-lg font-bold text-ink">
                            評価サマリー
                          </h3>
                          <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-muted">
                            {result.sourceType === "url" ? "URL診断" : "本文診断"} /{" "}
                            {result.analyzedTextLength.toLocaleString("ja-JP")}
                            文字
                          </span>
                        </div>
                        <p className="leading-7 text-muted">{result.summary}</p>
                        {result.sourceUrl ? (
                          <a
                            href={result.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-4 block break-all text-sm font-medium text-accent underline"
                          >
                            {result.sourceUrl}
                          </a>
                        ) : null}
                        {result.sourceWarnings?.length ? (
                          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                            <p className="font-semibold">URL診断の注意</p>
                            <ul className="mt-2 list-disc space-y-1 pl-5">
                              {result.sourceWarnings.map((warning) => (
                                <li key={warning}>{warning}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6">
                      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-lg font-bold text-ink">
                            AI Overview実測チェック
                          </h3>
                          <p className="mt-1 text-sm text-muted">
                            記事から想定クエリ候補を抽出します。必要に応じて編集してから実測チェックを実行してください。
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-muted">
                          {result.aioQueryResearch.status === "skipped"
                            ? "想定クエリのみ"
                            : result.aioQueryResearch.status === "partial"
                              ? "一部取得"
                              : "実測済み"}
                        </span>
                      </div>
                      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                        {result.aioQueryResearch.message}
                      </p>
                      <div className="mt-4">
                        <label
                          htmlFor="aio-query-input"
                          className="text-sm font-semibold text-ink"
                        >
                          実測対象クエリ
                        </label>
                        <textarea
                          id="aio-query-input"
                          value={aioQueryInput}
                          onChange={(event) => setAioQueryInput(event.target.value)}
                          className="mt-2 min-h-36 w-full resize-y rounded-md border border-line bg-white p-3 text-sm leading-6 outline-none transition focus:border-accent focus:ring-2 focus:ring-teal-100"
                          placeholder="1行に1クエリずつ入力してください"
                        />
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs leading-5 text-muted">
                            API料金の無駄を防ぐため、実測は編集後の確定クエリだけで行います。
                          </p>
                          <button
                            type="button"
                            onClick={handleRunAioResearch}
                            disabled={isAioResearchLoading}
                            className="rounded-md bg-accent px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isAioResearchLoading
                              ? "実測チェック中..."
                              : "実測チェックを実行"}
                          </button>
                        </div>
                        {aioResearchError ? (
                          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                            {aioResearchError}
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-lg border border-line bg-slate-50 p-4">
                          <p className="text-xs font-semibold text-muted">
                            自サイト引用率
                          </p>
                          <p className="mt-2 text-2xl font-bold text-ink">
                            {result.aioQueryResearch.ownSiteCitationRate}%
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {result.aioQueryResearch.ownSiteCitationCount} /{" "}
                            {result.aioQueryResearch.checkedCount}件
                          </p>
                          <p className="mt-2 text-xs leading-5 text-muted">
                            AI Overview内で診断対象URLが引用・参照された割合です。
                          </p>
                        </div>
                        <div className="rounded-lg border border-line bg-slate-50 p-4">
                          <p className="text-xs font-semibold text-muted">
                            AI Overview出現
                          </p>
                          <p className="mt-2 text-2xl font-bold text-ink">
                            {result.aioQueryResearch.aiOverviewCount}件
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {result.aioQueryResearch.aiOverviewCount} /{" "}
                            {result.aioQueryResearch.checkedCount}件
                          </p>
                          <p className="mt-2 text-xs leading-5 text-muted">
                            実測クエリのうち、AI Overviewが表示された件数です。
                          </p>
                        </div>
                        <div className="rounded-lg border border-line bg-slate-50 p-4">
                          <p className="text-xs font-semibold text-muted">
                            実測クエリ数
                          </p>
                          <p className="mt-2 text-2xl font-bold text-ink">
                            {result.aioQueryResearch.checkedCount}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            候補数: {result.aioQueryResearch.generatedQueries.length}件
                          </p>
                          <p className="mt-2 text-xs leading-5 text-muted">
                            編集後に実際にGoogle検索で確認したクエリ数です。
                          </p>
                        </div>
                      </div>
                      <div className="mt-4">
                        <div>
                          <p className="text-sm font-semibold text-ink">
                            実測結果
                          </p>
                          <div className="mt-3 space-y-2">
                            {result.aioQueryResearch.checks.map((check) => (
                              <div
                                key={check.query}
                                className="rounded-lg border border-line p-3 text-sm"
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                  <p className="font-semibold text-ink">
                                    {check.query}
                                  </p>
                                  <span className="text-xs font-semibold text-muted">
                                    {check.status === "skipped"
                                      ? "未実測"
                                      : check.status === "error"
                                        ? "取得失敗"
                                        : check.aiOverviewFound
                                          ? "AI Overviewあり"
                                          : "AI Overviewなし"}
                                  </span>
                                </div>
                                {check.ownSiteCited ? (
                                  <p className="mt-2 text-xs font-semibold text-emerald-700">
                                    自サイト引用あり
                                  </p>
                                ) : null}
                                {check.error ? (
                                  <p className="mt-2 text-xs text-rose-700">
                                    {check.error}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      {result.aioQueryResearch.citedUrls.length > 0 ? (
                        <div className="mt-4">
                          <p className="text-sm font-semibold text-ink">
                            AI Overviewで引用されたURL
                          </p>
                          <ul className="mt-3 space-y-2 text-sm leading-6">
                            {result.aioQueryResearch.citedUrls.map((citedUrl) => (
                              <li key={citedUrl}>
                                <a
                                  href={citedUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="break-all text-accent underline"
                                >
                                  {citedUrl}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6">
                      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <h3 className="text-lg font-bold text-ink">
                          精度向上指標
                        </h3>
                        <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-muted">
                          {result.diagnosticInsights.searchIntentLabel}
                        </span>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        {[
                          {
                            label: "回答可能性",
                            score: result.diagnosticInsights.answerabilityScore,
                            description: "AIが短い回答を作りやすい構造か"
                          },
                          {
                            label: "根拠の質",
                            score: result.diagnosticInsights.evidenceQualityScore,
                            description: "公式情報、数値、年次、出典が明確か"
                          },
                          {
                            label: "想定質問カバー率",
                            score: result.diagnosticInsights.queryCoverageScore,
                            description: "関連質問や周辺トピックを拾えているか"
                          }
                        ].map((item) => (
                          <div
                            key={item.label}
                            className="rounded-lg border border-line bg-slate-50 p-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-semibold text-ink">{item.label}</p>
                              <span className={`text-lg font-bold ${getScoreTone(item.score * 10)}`}>
                                {item.score}/10
                              </span>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-muted">
                              {item.description}
                            </p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_260px]">
                        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-muted">
                          {result.diagnosticInsights.comments.map((comment) => (
                            <li key={comment}>{comment}</li>
                          ))}
                        </ul>
                        <div className="rounded-lg border border-line p-4">
                          <p className="text-sm font-semibold text-ink">
                            推奨構造化データ候補
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {result.diagnosticInsights.schemaSuggestions.map(
                              (schema) => (
                                <span
                                  key={schema}
                                  className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-muted"
                                >
                                  {schema}
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6">
                      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <h3 className="text-lg font-bold text-ink">
                          項目別スコア
                        </h3>
                        <span className="text-sm text-muted">0〜10点で評価</span>
                      </div>
                      <ScoreTable scores={result.ruleScores} />
                    </div>

                    <div className="grid gap-6 xl:grid-cols-2">
                      <div>
                        <h3 className="text-lg font-bold text-ink">改善すべき点</h3>
                        <div className="mt-4 space-y-3">
                          {result.problems.map((problem, index) => (
                            <div
                              key={`${problem}-${index}`}
                              className="rounded-lg border border-rose-100 bg-rose-50 p-4"
                            >
                              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-rose-700">
                                課題 {index + 1}
                              </span>
                              <p className="mt-2 text-sm leading-6 text-rose-950">
                                {problem}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h3 className="text-lg font-bold text-ink">
                          優先度順の改善提案
                        </h3>
                        <div className="mt-4 space-y-3">
                          {result.improvements.map((improvement, index) => (
                            <div
                              key={`${improvement}-${index}`}
                              className="rounded-lg border border-line bg-white p-4 shadow-sm"
                            >
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-bold text-white">
                                  優先度 {index + 1}
                                </span>
                                <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-muted">
                                  {getPriorityLabel(index)}
                                </span>
                              </div>
                              <p className="text-sm leading-6 text-muted">
                                {improvement}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-ink">FAQ案</h3>
                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        {result.faqIdeas.map((faq, index) => (
                          <div
                            key={`${faq.question}-${index}`}
                            className="rounded-lg border border-line bg-white p-4 shadow-sm"
                          >
                            <p className="text-xs font-bold text-accent">
                              FAQ {index + 1}
                            </p>
                            <p className="mt-2 font-semibold leading-6 text-ink">
                              Q. {faq.question}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-muted">
                              A. {faq.answer}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-bold text-ink">
                        メタディスクリプション案
                      </h3>
                      <div className="mt-4 grid gap-4 lg:grid-cols-3">
                        {result.metaDescriptions.map((description, index) => (
                          <div
                            key={`${description}-${index}`}
                            className="rounded-lg border border-line bg-slate-50 p-4"
                          >
                            <p className="mb-2 text-xs font-bold text-muted">
                              案 {index + 1}
                            </p>
                            <p className="text-sm leading-6 text-ink">
                              {description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}
              </section>
            </div>

            <section className="mt-6 rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6">
              <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-ink">診断データ</h2>
                  <p className="mt-1 text-sm text-muted">
                    自分の履歴と高スコアサイトを確認できます。全体ランキングは公開許可されたURLのみ表示します。
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="grid grid-cols-2 rounded-md border border-line bg-slate-50 p-1">
                    <button
                      type="button"
                      onClick={() => setHistoryViewMode("recent")}
                      className={`rounded px-3 py-2 text-sm font-semibold transition ${
                        historyViewMode === "recent"
                          ? "bg-white text-accent shadow-sm"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      診断履歴
                    </button>
                    <button
                      type="button"
                      onClick={() => setHistoryViewMode("topSites")}
                      className={`rounded px-3 py-2 text-sm font-semibold transition ${
                        historyViewMode === "topSites"
                          ? "bg-white text-accent shadow-sm"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      高スコアサイト5選
                    </button>
                  </div>
                  <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-semibold text-muted">
                    Supabase Auth + Postgres
                  </span>
                </div>
              </div>

              {historyViewMode === "topSites" ? (
                <div className="mb-4 inline-grid grid-cols-2 rounded-md border border-line bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setTopSitesScope("mine")}
                    className={`rounded px-3 py-2 text-sm font-semibold transition ${
                      topSitesScope === "mine"
                        ? "bg-white text-accent shadow-sm"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    自分だけ
                  </button>
                  <button
                    type="button"
                    onClick={() => setTopSitesScope("public")}
                    className={`rounded px-3 py-2 text-sm font-semibold transition ${
                      topSitesScope === "public"
                        ? "bg-white text-accent shadow-sm"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    全体
                  </button>
                </div>
              ) : null}

              {historyError ? (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  {historyError}
                </div>
              ) : null}

              {historyViewMode === "recent" && history.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line bg-slate-50 p-6 text-center text-sm text-muted">
                  まだ診断履歴はありません。
                </div>
              ) : null}

              {historyViewMode === "recent" && history.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-line bg-slate-50 text-xs uppercase tracking-normal text-muted">
                        <th className="px-4 py-3 font-semibold">日時</th>
                        <th className="px-4 py-3 font-semibold">診断URL</th>
                        <th className="px-4 py-3 font-semibold">
                          入力プレビュー
                        </th>
                        <th className="w-28 px-4 py-3 text-right font-semibold">
                          スコア
                        </th>
                        <th className="w-28 px-4 py-3 font-semibold">公開</th>
                        <th className="px-4 py-3 font-semibold">サマリー</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-line last:border-0"
                        >
                          <td className="whitespace-nowrap px-4 py-4 text-muted">
                            {formatAnalyzedAt(item.createdAt)}
                          </td>
                          <td className="max-w-[260px] px-4 py-4">
                            {item.sourceUrl ? (
                              <a
                                href={item.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="block truncate font-medium text-accent underline"
                                title={item.sourceUrl}
                              >
                                {item.sourceUrl}
                              </a>
                            ) : (
                              <span className="text-muted">本文入力</span>
                            )}
                          </td>
                          <td className="max-w-[280px] px-4 py-4 font-medium leading-6 text-ink">
                            {item.inputPreview}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span
                              className={`font-bold ${getScoreTone(
                                item.totalScore
                              )}`}
                            >
                              {item.totalScore}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-muted">
                              {item.isPublic ? "公開" : "非公開"}
                            </span>
                          </td>
                          <td className="px-4 py-4 leading-6 text-muted">
                            {item.summary}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {historyViewMode === "topSites" && topSites.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line bg-slate-50 p-6 text-center text-sm text-muted">
                  URL診断の履歴がまだありません。
                </div>
              ) : null}

              {historyViewMode === "topSites" && topSites.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-line bg-slate-50 text-xs uppercase tracking-normal text-muted">
                        <th className="w-20 px-4 py-3 text-right font-semibold">
                          順位
                        </th>
                        <th className="w-28 px-4 py-3 text-right font-semibold">
                          スコア
                        </th>
                        <th className="px-4 py-3 font-semibold">診断URL</th>
                        {topSitesScope === "mine" ? (
                          <th className="px-4 py-3 font-semibold">サマリー</th>
                        ) : null}
                        <th className="whitespace-nowrap px-4 py-3 font-semibold">
                          診断日時
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topSites.map((site, index) => (
                        <tr
                          key={site.id}
                          className="border-b border-line last:border-0"
                        >
                          <td className="px-4 py-4 text-right font-bold text-muted">
                            {index + 1}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span
                              className={`text-lg font-bold ${getScoreTone(
                                site.totalScore
                              )}`}
                            >
                              {site.totalScore}
                            </span>
                          </td>
                          <td className="max-w-[360px] px-4 py-4">
                            <a
                              href={site.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block truncate font-medium text-accent underline"
                              title={site.sourceUrl}
                            >
                              {site.sourceUrl}
                            </a>
                          </td>
                          {topSitesScope === "mine" ? (
                            <td className="px-4 py-4 leading-6 text-muted">
                              {site.summary}
                            </td>
                          ) : null}
                          <td className="whitespace-nowrap px-4 py-4 text-muted">
                            {formatAnalyzedAt(site.createdAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>

            {isAdmin ? (
              <section className="mt-6 rounded-lg border border-line bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-ink">管理者パネル</h2>
                    <p className="mt-1 text-sm text-muted">
                      登録ユーザーの今月の診断回数を確認し、対象ユーザーだけリセットできます。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={loadAdminUsers}
                    className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-slate-50"
                  >
                    再読み込み
                  </button>
                </div>

                {adminMessage ? (
                  <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    {adminMessage}
                  </div>
                ) : null}

                {adminUsers.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-line bg-slate-50 p-6 text-center text-sm text-muted">
                    管理対象ユーザーがまだありません。
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-line bg-slate-50 text-xs uppercase tracking-normal text-muted">
                          <th className="px-4 py-3 font-semibold">ユーザー</th>
                          <th className="px-4 py-3 font-semibold">権限</th>
                          <th className="px-4 py-3 text-right font-semibold">
                            今月の診断回数
                          </th>
                          <th className="px-4 py-3 font-semibold">登録日時</th>
                          <th className="px-4 py-3 text-right font-semibold">
                            操作
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminUsers.map((adminUser) => (
                          <tr
                            key={adminUser.userId}
                            className="border-b border-line last:border-0"
                          >
                            <td className="px-4 py-4">
                              <p className="font-semibold text-ink">
                                {adminUser.email ?? "メール取得不可"}
                              </p>
                              <p className="mt-1 break-all text-xs text-muted">
                                ID: {adminUser.userId.slice(0, 8)}...
                              </p>
                            </td>
                            <td className="px-4 py-4">
                              <span className="rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-muted">
                                {adminUser.role === "admin" ? "管理者" : "一般"}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right font-semibold text-ink">
                              {adminUser.usage.isAvailable
                                ? `${adminUser.usage.usedThisMonth} / ${adminUser.usage.monthlyLimit}回`
                                : "制限未設定"}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-muted">
                              {formatAnalyzedAt(adminUser.createdAt)}
                            </td>
                            <td className="px-4 py-4 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  handleResetUserMonthlyUsage(adminUser.userId)
                                }
                                disabled={
                                  isResettingUsage &&
                                  resettingUserId === adminUser.userId
                                }
                                className="rounded-md border border-line bg-white px-3 py-2 text-xs font-semibold text-ink transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isResettingUsage &&
                                resettingUserId === adminUser.userId
                                  ? "リセット中..."
                                  : "今月分をリセット"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            ) : null}
          </>
        )}
      </div>
      {showBackToTop ? (
        <button
          type="button"
          onClick={handleBackToTop}
          className="fixed bottom-5 right-5 z-50 rounded-full border border-line bg-white px-4 py-3 text-sm font-bold text-accent shadow-lg transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-200 sm:bottom-6 sm:right-6"
          aria-label="ページ上部へ戻る"
        >
          TOPへ戻る
        </button>
      ) : null}
    </main>
  );
}

