export type RuleScore = {
  item: string;
  score: number;
  comment: string;
};

export type SearchIntentType =
  | "definition"
  | "howTo"
  | "comparison"
  | "price"
  | "local"
  | "troubleshooting"
  | "general";

export type DiagnosticInsight = {
  searchIntent: SearchIntentType;
  searchIntentLabel: string;
  answerabilityScore: number;
  evidenceQualityScore: number;
  queryCoverageScore: number;
  schemaSuggestions: string[];
  comments: string[];
};

export type AioQueryCheck = {
  query: string;
  aiOverviewFound: boolean;
  ownSiteCited: boolean;
  citedUrls: string[];
  status: "success" | "error" | "skipped";
  error?: string;
};

export type AioQueryResearch = {
  status: "success" | "partial" | "skipped";
  message: string;
  generatedQueries: string[];
  checkedCount: number;
  aiOverviewCount: number;
  aiOverviewRate: number;
  ownSiteCitationCount: number;
  ownSiteCitationRate: number;
  citedUrls: string[];
  checks: AioQueryCheck[];
};

export type FaqIdea = {
  question: string;
  answer: string;
};

export type LlmResult = {
  summary: string;
  problems: string[];
  improvements: string[];
  faqIdeas: FaqIdea[];
  metaDescriptions: string[];
};

export type AnalysisResult = LlmResult & {
  totalScore: number;
  ruleScores: RuleScore[];
  diagnosticInsights: DiagnosticInsight;
  aioQueryResearch: AioQueryResearch;
  llmStatus: "success" | "fallback";
  llmError?: string;
  sourceType: "text" | "url";
  sourceUrl?: string;
  sourceWarnings?: string[];
  analyzedTextLength: number;
  analyzedTextPreview: string;
};

export type AnalyzeErrorResponse = {
  error: string;
};

export type UsageSummary = {
  monthlyLimit: number;
  usedThisMonth: number;
  remainingThisMonth: number;
  periodStart: string;
  isAvailable: boolean;
  message?: string;
};
