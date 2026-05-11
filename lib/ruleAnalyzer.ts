import type { RuleScore } from "@/types/analysis";
import { scoreAiOverviewOfficialGuidance } from "@/lib/aiOverviewKnowledge";

type RuleAnalysis = {
  totalScore: number;
  ruleScores: RuleScore[];
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
  "必要か"
];

const conclusionKeywords = ["結論", "つまり", "要するに", "です", "できます"];
const evidenceKeywords = [
  "公式",
  "出典",
  "参考",
  "引用",
  "データ",
  "調査",
  "統計",
  "資料",
  "リンク"
];
const eeatKeywords = [
  "実績",
  "事例",
  "経験",
  "監修",
  "運営者",
  "専門",
  "対応実績",
  "導入事例"
];
const faqKeywords = ["FAQ", "よくある質問", "Q.", "Q：", "質問"];

function clampScore(score: number): number {
  return Math.max(0, Math.min(10, Math.round(score)));
}

function hasAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function extractHeadings(text: string): string[] {
  const markdownHeadings =
    text.match(/^#{1,3}\s+.+$/gm)?.map((heading) => heading.trim()) ?? [];
  const htmlHeadings =
    text
      .match(/<h[23][^>]*>[\s\S]*?<\/h[23]>/gi)
      ?.map((heading) => heading.replace(/<[^>]+>/g, "").trim()) ?? [];

  return [...markdownHeadings, ...htmlHeadings].filter(Boolean);
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
        : `${count}個の見出しを検出しました。見出しで論点を分けると引用されやすくなります。`
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
  const markdownBullets = /^(\s*[-*]\s+|\s*・).+$/gm.test(text);
  const htmlLists = /<li[\s>]/i.test(text);
  const found = markdownBullets || htmlLists;

  return {
    item: "箇条書き",
    score: found ? 10 : 2,
    comment: found
      ? "箇条書きを検出しました。要点を抽出しやすい構造です。"
      : "箇条書きが見つかりませんでした。重要点をリスト化すると読み取りやすくなります。"
  };
}

function scoreTables(text: string): RuleScore {
  const markdownTable = /^\s*\|.+\|\s*$/m.test(text);
  const htmlTable = /<table[\s>]/i.test(text);
  const found = markdownTable || htmlTable;

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
    item: "FAQ・Q&A本文構造",
    score: found ? 10 : 2,
    comment: found
      ? "FAQまたは質問形式の要素を検出しました。FAQリッチリザルト目的ではなく、AI検索が質問と回答の対応関係を理解しやすくする本文構造として評価します。"
      : "FAQ要素が見つかりませんでした。FAQリッチリザルト目的ではなく、読者の疑問に答えるQ&A本文構造を追加するとAI検索向けに改善できます。"
  };
}

function scoreEvidence(text: string): RuleScore {
  const matchedCount = evidenceKeywords.filter((keyword) =>
    text.includes(keyword)
  ).length;

  return {
    item: "根拠・一次情報",
    score: clampScore(matchedCount * 2),
    comment:
      matchedCount === 0
        ? "根拠や出典を示す語句が見つかりませんでした。"
        : `${matchedCount}種類の根拠関連語句を検出しました。公式情報や出典リンクを明示するとさらに強くなります。`
  };
}

function scoreEeat(text: string): RuleScore {
  const matchedCount = eeatKeywords.filter((keyword) =>
    text.includes(keyword)
  ).length;

  return {
    item: "E-E-A-T要素",
    score: clampScore(matchedCount * 2),
    comment:
      matchedCount === 0
        ? "経験、専門性、実績を示す語句が見つかりませんでした。"
        : `${matchedCount}種類のE-E-A-T関連語句を検出しました。`
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
        ? "表、Q&A、箇条書きなど、AIが本文構造を把握しやすい要素が不足しています。"
        : `${matchedCount}種類の構造化しやすい要素を検出しました。FAQPageリッチリザルトではなく、本文理解を助ける構造として評価します。`
  };
}

export function analyzeRules(text: string): RuleAnalysis {
  const normalizedText = text.trim();
  const headings = extractHeadings(normalizedText);
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
    scoreAiOverviewOfficialGuidance(normalizedText)
  ];

  const totalScore = Math.round(
    (ruleScores.reduce((sum, item) => sum + item.score, 0) /
      (ruleScores.length * 10)) *
      100
  );

  return {
    totalScore,
    ruleScores
  };
}
