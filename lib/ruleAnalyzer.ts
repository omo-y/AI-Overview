import type {
  DiagnosticInsight,
  RuleScore,
  SearchIntentType
} from "@/types/analysis";

type RuleAnalysis = {
  totalScore: number;
  ruleScores: RuleScore[];
  diagnosticInsights: DiagnosticInsight;
};

const questionHeadingKeywords = [
  "とは",
  "なぜ",
  "方法",
  "どう",
  "いつ",
  "どこ",
  "いくら",
  "できますか",
  "必要か",
  "選び方",
  "違い",
  "比較",
  "料金",
  "費用"
];

const conclusionKeywords = [
  "結論",
  "つまり",
  "要するに",
  "できます",
  "です",
  "おすすめ",
  "重要",
  "最適"
];

const evidenceKeywords = [
  "公式",
  "出典",
  "参考",
  "引用",
  "データ",
  "調査",
  "統計",
  "資料",
  "リンク",
  "根拠",
  "公表"
];

const strongEvidencePatterns = [
  /https?:\/\//i,
  /go\.jp|lg\.jp|or\.jp|ac\.jp/i,
  /developers\.google\.com|support\.google\.com/i,
  /pdf/i,
  /20[0-9]{2}年/,
  /[0-9]+(?:\.[0-9]+)?%/,
  /[0-9,]+(?:件|社|人|円|回|年)/
];

const eeatKeywords = [
  "実績",
  "事例",
  "経験",
  "監修",
  "運営者",
  "専門",
  "対応実績",
  "導入事例",
  "資格",
  "専門家",
  "レビュー",
  "口コミ"
];

const faqKeywords = ["FAQ", "よくある質問", "Q.", "Q：", "質問", "Q&A"];
const comparisonKeywords = ["比較", "違い", "メリット", "デメリット", "選び方"];
const priceKeywords = ["料金", "費用", "価格", "相場", "いくら"];
const howToKeywords = ["方法", "手順", "流れ", "やり方", "ステップ", "使い方", "対策"];
const localKeywords = ["東京", "大阪", "神奈川", "埼玉", "千葉", "地域", "エリア", "市", "区"];
const troubleshootingKeywords = ["原因", "対処", "解決", "できない", "エラー", "故障", "トラブル"];

function clampScore(score: number): number {
  return Math.max(0, Math.min(10, Math.round(score)));
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function countKeywordMatches(text: string, keywords: string[]): number {
  return keywords.filter((keyword) => text.includes(keyword)).length;
}

function extractHeadings(text: string): string[] {
  const markdownHeadings =
    text.match(/^#{1,3}\s+.+$/gm)?.map((heading) => heading.trim()) ?? [];
  const htmlHeadings =
    text
      .match(/<h[1-3][^>]*>[\s\S]*?<\/h[1-3]>/gi)
      ?.map((heading) => heading.replace(/<[^>]+>/g, "").trim()) ?? [];

  return [...markdownHeadings, ...htmlHeadings].filter(Boolean);
}

function getParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}|(?<=。)\s+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length >= 40);
}

function detectSearchIntent(text: string, headings: string[]): SearchIntentType {
  const target = `${headings.join("\n")}\n${text.slice(0, 1500)}`;
  const candidates: Array<{ type: SearchIntentType; score: number }> = [
    { type: "howTo", score: countKeywordMatches(target, howToKeywords) },
    { type: "comparison", score: countKeywordMatches(target, comparisonKeywords) },
    { type: "price", score: countKeywordMatches(target, priceKeywords) },
    { type: "local", score: countKeywordMatches(target, localKeywords) },
    {
      type: "troubleshooting",
      score: countKeywordMatches(target, troubleshootingKeywords)
    },
    {
      type: "definition",
      score: countKeywordMatches(target, ["とは", "意味", "概要", "基本"])
    }
  ];
  const [best] = candidates.sort((a, b) => b.score - a.score);

  return best && best.score > 0 ? best.type : "general";
}

function getSearchIntentLabel(intent: SearchIntentType): string {
  const labels: Record<SearchIntentType, string> = {
    definition: "定義・概要型",
    howTo: "方法・手順型",
    comparison: "比較・選定型",
    price: "料金・費用型",
    local: "地域・ローカル型",
    troubleshooting: "課題解決型",
    general: "一般情報型"
  };

  return labels[intent];
}

function scoreTextLength(length: number): RuleScore {
  if (length < 1000) {
    return {
      item: "本文文字数",
      score: 3,
      comment: `本文は${length.toLocaleString("ja-JP")}文字です。AI検索向けには情報量が不足しやすい状態です。`
    };
  }

  if (length < 3000) {
    return {
      item: "本文文字数",
      score: 7,
      comment: `本文は${length.toLocaleString("ja-JP")}文字です。基本情報は入りやすい分量です。`
    };
  }

  return {
    item: "本文文字数",
    score: 10,
    comment: `本文は${length.toLocaleString("ja-JP")}文字です。網羅性を出しやすい分量です。`
  };
}

function scoreHeadingCount(headings: string[]): RuleScore {
  const count = headings.length;
  const score = count === 0 ? 0 : count <= 2 ? 4 : count <= 5 ? 7 : 10;

  return {
    item: "見出し数",
    score,
    comment:
      count === 0
        ? "MarkdownまたはHTMLの見出しが見つかりませんでした。"
        : `${count}個の見出しを検出しました。見出しで論点を分けるほど引用されやすくなります。`
  };
}

function scoreQuestionHeadings(headings: string[]): RuleScore {
  const matchedCount = headings.filter((heading) =>
    hasAnyKeyword(heading, questionHeadingKeywords)
  ).length;

  return {
    item: "質問型見出し",
    score: matchedCount === 0 ? 2 : matchedCount === 1 ? 7 : 10,
    comment:
      matchedCount === 0
        ? "質問型の見出しが見つかりませんでした。検索意図に近い見出しを追加すると改善できます。"
        : `${matchedCount}個の質問型見出しを検出しました。`
  };
}

function scoreIntroConclusion(text: string): RuleScore {
  const intro = text.slice(0, 300);
  const hasConclusion = hasAnyKeyword(intro, conclusionKeywords);

  return {
    item: "冒頭の結論",
    score: hasConclusion ? 9 : 3,
    comment: hasConclusion
      ? "冒頭300文字以内に結論らしい表現があります。"
      : "冒頭300文字以内に結論を示す表現が弱い状態です。"
  };
}

function scoreBullets(text: string): RuleScore {
  const found = /^(\s*[-*]\s+|\s*・).+$/gm.test(text) || /<li[\s>]/i.test(text);

  return {
    item: "箇条書き",
    score: found ? 10 : 2,
    comment: found
      ? "箇条書きを検出しました。要点を抽出しやすい構造です。"
      : "箇条書きが見つかりませんでした。重要点をリスト化すると読み取りやすくなります。"
  };
}

function scoreTables(text: string): RuleScore {
  const found = /^\s*\|.+\|\s*$/m.test(text) || /<table[\s>]/i.test(text);

  return {
    item: "表",
    score: found ? 10 : 2,
    comment: found
      ? "表を検出しました。比較や条件整理に向いた構造です。"
      : "表が見つかりませんでした。比較情報がある場合は表にすると改善できます。"
  };
}

function scoreFaq(text: string): RuleScore {
  const found = hasAnyKeyword(text, faqKeywords);

  return {
    item: "FAQ・Q&A構造",
    score: found ? 10 : 2,
    comment: found
      ? "FAQまたは質問形式の要素を検出しました。AIが質問と回答の関係を理解しやすい構造です。"
      : "FAQ要素が見つかりませんでした。読者の疑問に答えるQ&Aを追加すると改善できます。"
  };
}

function scoreEvidence(text: string): RuleScore {
  const keywordCount = countKeywordMatches(text, evidenceKeywords);
  const strongEvidenceCount = strongEvidencePatterns.filter((pattern) =>
    pattern.test(text)
  ).length;
  const score = clampScore(keywordCount * 1.2 + strongEvidenceCount * 1.5);

  return {
    item: "根拠・一次情報",
    score,
    comment:
      score >= 7
        ? "出典、公式情報、データなど信頼性を補強する要素があります。"
        : "根拠や出典を示す要素が弱い状態です。公式情報、統計、調査年、引用URLを追加すると改善できます。"
  };
}

function scoreEeat(text: string): RuleScore {
  const matchedCount = countKeywordMatches(text, eeatKeywords);

  return {
    item: "E-E-A-T要素",
    score: clampScore(matchedCount * 1.8),
    comment:
      matchedCount === 0
        ? "経験、専門性、実績、監修などを示す要素が見つかりませんでした。"
        : `${matchedCount}種類のE-E-A-T関連要素を検出しました。`
  };
}

function scoreStructuredElements(text: string): RuleScore {
  const checks = [
    hasAnyKeyword(text, faqKeywords),
    /^\s*\|.+\|\s*$/m.test(text) || /<table[\s>]/i.test(text),
    /Q[.：]/.test(text) || /Q&A/i.test(text),
    /^(\s*[-*]\s+|\s*・).+$/gm.test(text) || /<li[\s>]/i.test(text),
    text.includes("比較表")
  ];
  const matchedCount = checks.filter(Boolean).length;

  return {
    item: "構造化しやすい要素",
    score: clampScore(matchedCount * 2),
    comment:
      matchedCount === 0
        ? "表、Q&A、箇条書きなど、本文構造を把握しやすい要素が不足しています。"
        : `${matchedCount}種類の構造化しやすい要素を検出しました。`
  };
}

function scoreSearchIntentFit(intent: SearchIntentType, text: string): RuleScore {
  const hasTable = /^\s*\|.+\|\s*$/m.test(text) || /<table[\s>]/i.test(text);
  const hasBullets = /^(\s*[-*]\s+|\s*・).+$/gm.test(text) || /<li[\s>]/i.test(text);
  const hasFaq = hasAnyKeyword(text, faqKeywords);
  const hasEvidence = countKeywordMatches(text, evidenceKeywords) > 0;
  const hasArea = countKeywordMatches(text, localKeywords) > 0;
  const hasPrice = countKeywordMatches(text, priceKeywords) > 0;
  const hasHowTo = countKeywordMatches(text, howToKeywords) > 0;
  const hasTrouble = countKeywordMatches(text, troubleshootingKeywords) > 0;
  const intentChecks: Record<SearchIntentType, boolean[]> = {
    definition: [hasFaq, hasEvidence, hasBullets],
    howTo: [hasHowTo, hasBullets, hasFaq],
    comparison: [hasTable, hasBullets, hasEvidence],
    price: [hasPrice, hasTable, hasEvidence],
    local: [hasArea, hasEvidence, hasFaq],
    troubleshooting: [hasTrouble, hasHowTo, hasBullets],
    general: [hasFaq, hasBullets, hasEvidence]
  };
  const matchedCount = intentChecks[intent].filter(Boolean).length;

  return {
    item: "検索意図タイプ適合",
    score: clampScore(matchedCount * 3.3),
    comment: `${getSearchIntentLabel(intent)}として判定しました。この意図に必要な構成要素は${matchedCount}/3個そろっています。`
  };
}

function scoreEvidenceQuality(text: string): RuleScore {
  const evidenceKeywordKinds = countKeywordMatches(text, evidenceKeywords);
  const strongEvidenceCount = strongEvidencePatterns.filter((pattern) =>
    pattern.test(text)
  ).length;
  const hasExternalUrl = /https?:\/\//i.test(text);
  const hasNumber = /[0-9]+(?:\.[0-9]+)?%|[0-9,]+(?:件|社|人|円|回|年)/.test(text);
  const hasOfficialLikeSource =
    /公式|公表|出典|引用|参考|調査|統計|資料|go\.jp|lg\.jp|or\.jp|ac\.jp/i.test(text);
  const qualitySignals = [hasExternalUrl, hasNumber, hasOfficialLikeSource].filter(Boolean).length;
  const score = clampScore(
    Math.min(evidenceKeywordKinds, 4) * 1.1 +
      Math.min(strongEvidenceCount, 3) * 1.2 +
      qualitySignals * 1.2
  );

  return {
    item: "根拠の質",
    score,
    comment:
      score >= 7
        ? "根拠キーワードだけでなく、URL、年次、数値など検証しやすい情報が含まれています。"
        : "根拠キーワードだけでなく、公式URL、調査年、数値、一次資料名を明記すると精度が上がります。"
  };
}

function scoreAnswerability(text: string, headings: string[]): RuleScore {
  const paragraphs = getParagraphs(text);
  const conciseAnswerBlocks = paragraphs.filter((paragraph) => {
    const length = paragraph.length;
    return (
      length >= 60 &&
      length <= 260 &&
      hasAnyKeyword(paragraph, conclusionKeywords)
    );
  }).length;
  const questionHeadingCount = headings.filter((heading) =>
    hasAnyKeyword(heading, questionHeadingKeywords)
  ).length;
  const headingCount = Math.max(headings.length, 1);
  const paragraphCount = Math.max(paragraphs.length, 1);
  const answerBlockRatio = conciseAnswerBlocks / paragraphCount;
  const questionHeadingRatio = questionHeadingCount / headingCount;
  const hasIntroConclusion = hasAnyKeyword(text.slice(0, 300), conclusionKeywords);
  const score = clampScore(
    answerBlockRatio * 5 +
      questionHeadingRatio * 3 +
      Math.min(conciseAnswerBlocks, 3) * 0.6 +
      (hasIntroConclusion ? 1 : 0)
  );

  return {
    item: "回答可能性",
    score,
    comment:
      score >= 7
        ? "見出しや短い回答ブロックから、AIが回答を作りやすい構造になっています。"
        : "見出し直下に60〜260文字程度の結論ブロックを置くと、AIが回答に使いやすくなります。"
  };
}

function scoreQueryCoverage(intent: SearchIntentType, text: string, headings: string[]): RuleScore {
  const questionCount = headings.filter((heading) =>
    hasAnyKeyword(heading, questionHeadingKeywords)
  ).length;
  const faqCount = (text.match(/Q[.：]/g) ?? []).length;
  const topicGroups = [
    countKeywordMatches(text, comparisonKeywords) > 0,
    countKeywordMatches(text, priceKeywords) > 0,
    countKeywordMatches(text, howToKeywords) > 0,
    countKeywordMatches(text, troubleshootingKeywords) > 0,
    hasAnyKeyword(text, ["注意点", "失敗", "代替", "メリット", "デメリット"])
  ];
  const coveredTopicGroups = topicGroups.filter(Boolean).length;
  const intentBonus = intent === "general" ? 0 : 1;
  const headingCount = Math.max(headings.length, 1);
  const questionRatio = questionCount / headingCount;
  const score = clampScore(
    questionRatio * 3 +
      Math.min(faqCount, 5) * 0.7 +
      coveredTopicGroups * 1.1 +
      intentBonus
  );

  return {
    item: "想定質問カバー率",
    score,
    comment:
      score >= 7
        ? "関連質問や周辺トピックを複数カバーしています。"
        : "関連質問、注意点、比較、料金、手順などの周辺トピックを増やすと改善できます。"
  };
}

function buildSchemaSuggestions(text: string, intent: SearchIntentType): string[] {
  const suggestions = new Set<string>(["Article"]);

  if (hasAnyKeyword(text, faqKeywords)) {
    suggestions.add("FAQPage");
  }

  if (intent === "howTo" || countKeywordMatches(text, howToKeywords) >= 2) {
    suggestions.add("HowTo");
  }

  if (intent === "local" || countKeywordMatches(text, localKeywords) >= 2) {
    suggestions.add("LocalBusiness");
  }

  if (intent === "comparison" || /^\s*\|.+\|\s*$/m.test(text)) {
    suggestions.add("比較表・ItemList");
  }

  return Array.from(suggestions);
}

function buildDiagnosticInsights(
  text: string,
  intent: SearchIntentType,
  evidenceQualityScore: number,
  answerabilityScore: number,
  queryCoverageScore: number
): DiagnosticInsight {
  const comments: string[] = [
    `検索意図は「${getSearchIntentLabel(intent)}」として判定しました。`
  ];

  if (answerabilityScore < 7) {
    comments.push("見出し直下に短い結論ブロックを追加すると、AIが回答に使いやすくなります。");
  }

  if (evidenceQualityScore < 7) {
    comments.push("公式URL、調査年、数値、一次資料名を明記すると根拠の質が上がります。");
  }

  if (queryCoverageScore < 7) {
    comments.push("関連質問、比較、注意点、料金、代替案などの周辺トピックを増やす余地があります。");
  }

  return {
    searchIntent: intent,
    searchIntentLabel: getSearchIntentLabel(intent),
    answerabilityScore,
    evidenceQualityScore,
    queryCoverageScore,
    schemaSuggestions: buildSchemaSuggestions(text, intent),
    comments
  };
}

export function analyzeRules(text: string): RuleAnalysis {
  const normalizedText = text.trim();
  const headings = extractHeadings(normalizedText);
  const searchIntent = detectSearchIntent(normalizedText, headings);
  const searchIntentFit = scoreSearchIntentFit(searchIntent, normalizedText);
  const evidenceQuality = scoreEvidenceQuality(normalizedText);
  const answerability = scoreAnswerability(normalizedText, headings);
  const queryCoverage = scoreQueryCoverage(searchIntent, normalizedText, headings);
  const ruleScores = [
    scoreTextLength(normalizedText.length),
    scoreHeadingCount(headings),
    scoreQuestionHeadings(headings),
    scoreIntroConclusion(normalizedText),
    scoreBullets(normalizedText),
    scoreTables(normalizedText),
    scoreFaq(normalizedText),
    scoreEvidence(normalizedText),
    scoreEeat(normalizedText),
    scoreStructuredElements(normalizedText),
    searchIntentFit,
    evidenceQuality,
    answerability,
    queryCoverage
  ];
  const totalScore = Math.round(
    (ruleScores.reduce((sum, item) => sum + item.score, 0) /
      (ruleScores.length * 10)) *
      100
  );

  return {
    totalScore,
    ruleScores,
    diagnosticInsights: buildDiagnosticInsights(
      normalizedText,
      searchIntent,
      evidenceQuality.score,
      answerability.score,
      queryCoverage.score
    )
  };
}
