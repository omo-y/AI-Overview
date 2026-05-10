export type RuleScore = {
  item: string;
  score: number;
  comment: string;
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
  llmStatus: "success" | "fallback";
  llmError?: string;
  sourceType: "text" | "url";
  sourceUrl?: string;
  analyzedTextLength: number;
  analyzedTextPreview: string;
};

export type AnalyzeErrorResponse = {
  error: string;
};
