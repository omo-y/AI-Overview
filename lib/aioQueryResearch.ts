import type {
  AioQueryCheck,
  AioQueryResearch,
  DiagnosticInsight
} from "@/types/analysis";

type SerpApiResult = Record<string, unknown>;

const MAX_GENERATED_QUERIES = 10;
const MAX_QUERY_LENGTH = 80;
const DEFAULT_QUERY_CHECK_LIMIT = 5;
const SERPAPI_TIMEOUT_MS = 15_000;
const MARKDOWN_PREFIX_PATTERN = /^#{1,6}\s+|^[-*・]\s+/;

const genericHeadingOnlyPatterns = [
  /^引用[・･]参照元リンクはどう決まるのか[？?]?$/,
  /^まとめ$/,
  /^よくある質問$/,
  /^FAQ$/i,
  /^注意点$/,
  /^メリット$/,
  /^デメリット$/
];

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeHostname(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map(normalizeWhitespace).filter(Boolean)));
}

function sanitizeQueryCandidate(value: string) {
  return normalizeWhitespace(
    value
      .replace(MARKDOWN_PREFIX_PATTERN, "")
      .replace(/^Q[.：]\s*/, "")
      .replace(/[「」『』【】]/g, "")
  ).slice(0, MAX_QUERY_LENGTH);
}

function extractTitle(text: string) {
  const markdownTitle = text.match(/^#\s+(.+)$/m)?.[1];

  if (markdownTitle) {
    return sanitizeQueryCandidate(markdownTitle);
  }

  return sanitizeQueryCandidate(text.split("\n").find(Boolean) ?? "");
}

function extractThemeTerms(title: string) {
  const knownThemes = [
    "AI Overview",
    "AI Overviews",
    "AI Mode",
    "AIO",
    "SEO",
    "Google"
  ].filter((term) => title.toLowerCase().includes(term.toLowerCase()));

  if (knownThemes.length > 0) {
    return knownThemes;
  }

  return title
    .replace(/[！？?].*$/, "")
    .split(/[｜|:：\-ー]/)
    .map((part) => sanitizeQueryCandidate(part))
    .filter((part) => part.length >= 3)
    .slice(0, 2);
}

function extractHeadings(text: string) {
  const markdownHeadings =
    text.match(/^#{1,3}\s+.+$/gm)?.map((heading) => sanitizeQueryCandidate(heading)) ??
    [];
  const htmlHeadings =
    text
      .match(/<h[1-3][^>]*>[\s\S]*?<\/h[1-3]>/gi)
      ?.map((heading) => sanitizeQueryCandidate(heading.replace(/<[^>]+>/g, ""))) ??
    [];

  return uniqueStrings([...markdownHeadings, ...htmlHeadings])
    .filter((heading) => heading.length >= 4)
    .filter(
      (heading) =>
        !genericHeadingOnlyPatterns.some((pattern) => pattern.test(heading))
    );
}

function extractFaqQueries(text: string) {
  const faqLines = text
    .split("\n")
    .map((line) => sanitizeQueryCandidate(line))
    .filter((line) => line.endsWith("？") || line.endsWith("?"));

  return uniqueStrings(faqLines).filter((line) => line.length >= 4);
}

function buildIntentQueries(title: string, insight: DiagnosticInsight) {
  const themeTerms = extractThemeTerms(title);
  const base = themeTerms[0] || title.replace(/[｜|].+$/, "").slice(0, 40);

  if (!base) {
    return [];
  }

  switch (insight.searchIntent) {
    case "definition":
      return [`${base} とは`, `${base} わかりやすく`];
    case "howTo":
      return [`${base} 対策`, `${base} 方法`, `${base} やり方`];
    case "comparison":
      return [`${base} 比較`, `${base} 違い`, `${base} 選び方`];
    case "price":
      return [`${base} 料金`, `${base} 費用`, `${base} 相場`];
    case "local":
      return [`${base} 地域`, `${base} 対応エリア`, `${base} 近く`];
    case "troubleshooting":
      return [`${base} 原因`, `${base} 対処法`, `${base} 解決方法`];
    case "general":
    default:
      return [`${base} とは`, `${base} 対策`, `${base} 注意点`];
  }
}

function contextualizeQuery(candidate: string, title: string) {
  const sanitized = sanitizeQueryCandidate(candidate);
  const themeTerms = extractThemeTerms(title);

  if (!sanitized) {
    return "";
  }

  if (
    themeTerms.some((term) =>
      sanitized.toLowerCase().includes(term.toLowerCase())
    )
  ) {
    return sanitized;
  }

  const theme = themeTerms[0];

  if (!theme) {
    return sanitized;
  }

  if (sanitized.length > 36 || genericHeadingOnlyPatterns.some((pattern) => pattern.test(sanitized))) {
    return `${theme} ${sanitized.replace(/[？?]$/, "")}`;
  }

  return `${theme} ${sanitized}`;
}

function getQueryCheckLimit() {
  const rawLimit = process.env.AIO_QUERY_CHECK_LIMIT;
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : NaN;

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    return DEFAULT_QUERY_CHECK_LIMIT;
  }

  return Math.min(parsedLimit, MAX_GENERATED_QUERIES);
}

function collectUrls(value: unknown, urls = new Set<string>()) {
  if (!value) {
    return urls;
  }

  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) {
      urls.add(value);
    }

    return urls;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectUrls(item, urls));
    return urls;
  }

  if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      const lowerKey = key.toLowerCase();

      if (
        ["url", "link", "source", "source_url", "reference_url"].includes(
          lowerKey
        )
      ) {
        collectUrls(item, urls);
      } else if (typeof item === "object") {
        collectUrls(item, urls);
      }
    });
  }

  return urls;
}

async function fetchSerpApi(params: URLSearchParams, signal: AbortSignal) {
  const response = await fetch(`https://serpapi.com/search.json?${params}`, {
    signal,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`SerpApiへの問い合わせに失敗しました。HTTP ${response.status}`);
  }

  return (await response.json()) as SerpApiResult;
}

async function checkQueryWithSerpApi(
  query: string,
  sourceUrl: string | undefined,
  apiKey: string
): Promise<AioQueryCheck> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SERPAPI_TIMEOUT_MS);

  try {
    const searchParams = new URLSearchParams({
      engine: "google",
      q: query,
      api_key: apiKey,
      hl: "ja",
      gl: "jp",
      google_domain: "google.co.jp"
    });
    const searchResult = await fetchSerpApi(searchParams, controller.signal);
    const aiOverview = searchResult.ai_overview as
      | Record<string, unknown>
      | undefined;
    const pageToken =
      typeof aiOverview?.page_token === "string" ? aiOverview.page_token : "";
    let overviewResult: SerpApiResult | undefined;

    if (pageToken) {
      const overviewParams = new URLSearchParams({
        engine: "google_ai_overview",
        page_token: pageToken,
        api_key: apiKey
      });
      overviewResult = await fetchSerpApi(overviewParams, controller.signal);
    }

    const citedUrls = uniqueStrings(
      Array.from(collectUrls([aiOverview, overviewResult]))
    );
    const ownHost = sourceUrl ? normalizeHostname(sourceUrl) : "";
    const ownSiteCited = Boolean(
      ownHost &&
        citedUrls.some((citedUrl) => normalizeHostname(citedUrl) === ownHost)
    );

    return {
      query,
      aiOverviewFound: Boolean(aiOverview || overviewResult),
      ownSiteCited,
      citedUrls,
      status: "success"
    };
  } catch (error) {
    return {
      query,
      aiOverviewFound: false,
      ownSiteCited: false,
      citedUrls: [],
      status: "error",
      error:
        error instanceof Error
          ? error.message
          : "AI Overview実測チェックに失敗しました。"
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function generateExpectedQueries(
  article: string,
  insight: DiagnosticInsight
) {
  const title = extractTitle(article);
  const headings = extractHeadings(article).map((heading) =>
    contextualizeQuery(heading, title)
  );
  const faqQueries = extractFaqQueries(article).map((query) =>
    contextualizeQuery(query, title)
  );
  const intentQueries = buildIntentQueries(title, insight);

  return uniqueStrings([
    ...intentQueries,
    ...faqQueries,
    ...headings
  ]).slice(0, MAX_GENERATED_QUERIES);
}

export function createSkippedAioQueryResearch(
  generatedQueries: string[],
  message = "想定クエリ候補を生成しました。必要に応じて編集してから実測チェックを実行してください。"
): AioQueryResearch {
  return {
    status: "skipped",
    message,
    generatedQueries,
    checkedCount: 0,
    aiOverviewCount: 0,
    aiOverviewRate: 0,
    ownSiteCitationCount: 0,
    ownSiteCitationRate: 0,
    citedUrls: [],
    checks: generatedQueries.map((query) => ({
      query,
      aiOverviewFound: false,
      ownSiteCited: false,
      citedUrls: [],
      status: "skipped"
    }))
  };
}

export async function researchAiOverviewQueries(
  queries: string[],
  sourceUrl?: string
): Promise<AioQueryResearch> {
  const generatedQueries = uniqueStrings(
    queries.map((query) => sanitizeQueryCandidate(query))
  ).slice(0, MAX_GENERATED_QUERIES);
  const apiKey = process.env.SERPAPI_API_KEY;

  if (generatedQueries.length === 0) {
    return createSkippedAioQueryResearch([], "実測対象のクエリがありません。");
  }

  if (!apiKey) {
    return createSkippedAioQueryResearch(
      generatedQueries,
      "SERPAPI_API_KEYが未設定のため、実測チェックは実行していません。"
    );
  }

  const targetQueries = generatedQueries.slice(0, getQueryCheckLimit());
  const checks = await Promise.all(
    targetQueries.map((query) => checkQueryWithSerpApi(query, sourceUrl, apiKey))
  );
  const successfulChecks = checks.filter((check) => check.status === "success");
  const checkedCount = successfulChecks.length;
  const aiOverviewCount = successfulChecks.filter(
    (check) => check.aiOverviewFound
  ).length;
  const ownSiteCitationCount = successfulChecks.filter(
    (check) => check.ownSiteCited
  ).length;

  return {
    status: checks.some((check) => check.status === "error") ? "partial" : "success",
    message:
      checkedCount > 0
        ? `${checkedCount}件の確定クエリでAI Overview実測チェックを行いました。`
        : "AI Overview実測チェックを完了できませんでした。",
    generatedQueries,
    checkedCount,
    aiOverviewCount,
    aiOverviewRate:
      checkedCount > 0 ? Math.round((aiOverviewCount / checkedCount) * 100) : 0,
    ownSiteCitationCount,
    ownSiteCitationRate:
      checkedCount > 0
        ? Math.round((ownSiteCitationCount / checkedCount) * 100)
        : 0,
    citedUrls: uniqueStrings(checks.flatMap((check) => check.citedUrls)).slice(
      0,
      20
    ),
    checks
  };
}
