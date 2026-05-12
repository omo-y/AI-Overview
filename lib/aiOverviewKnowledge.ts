import type { RuleScore } from "@/types/analysis";

const PEOPLE_FIRST_KEYWORDS = [
  "結論",
  "理由",
  "具体",
  "手順",
  "方法",
  "注意点",
  "メリット",
  "デメリット"
];

const SUPPORTING_LINK_KEYWORDS = [
  "公式",
  "出典",
  "参考",
  "引用",
  "資料",
  "データ",
  "調査",
  "統計",
  "リンク"
];

const QUERY_FAN_OUT_KEYWORDS = [
  "比較",
  "違い",
  "選び方",
  "費用",
  "料金",
  "相場",
  "手順",
  "注意点",
  "事例",
  "FAQ",
  "よくある質問",
  "Q.",
  "Q：",
  "質問"
];

const PREVIEW_BLOCKING_KEYWORDS = [
  "nosnippet",
  "data-nosnippet",
  "max-snippet:0",
  "noindex"
];

const HOW_TO_KEYWORDS = [
  "手順",
  "流れ",
  "ステップ",
  "方法",
  "やり方",
  "始め方",
  "導入",
  "実装",
  "確認",
  "注意点"
];

const ORIGINALITY_KEYWORDS = [
  "独自",
  "自社",
  "実例",
  "事例",
  "検証",
  "調査",
  "データ",
  "体験",
  "経験",
  "実績",
  "監修",
  "専門家",
  "公式"
];

const SEO_AIO_BALANCE_KEYWORDS = [
  "タイトル",
  "メタディスクリプション",
  "見出し",
  "内部リンク",
  "関連",
  "検索意図",
  "キーワード",
  "要約",
  "結論",
  "FAQ",
  "構造化データ"
];

const INTRO_EVIDENCE_KEYWORDS = [
  "要点",
  "この記事でわかること",
  "結論",
  "根拠",
  "出典",
  "公式",
  "参考",
  "引用",
  "データ"
];

const ALTERNATIVE_EXCEPTION_KEYWORDS = [
  "代替",
  "別の方法",
  "例外",
  "できない場合",
  "失敗",
  "注意点",
  "ただし",
  "一方で",
  "ケース",
  "パターン",
  "強み",
  "弱み",
  "メリット",
  "デメリット"
];

function countMatches(text: string, keywords: string[]): number {
  return keywords.filter((keyword) =>
    text.toLowerCase().includes(keyword.toLowerCase())
  ).length;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(10, Math.round(score)));
}

export function scoreAiOverviewOfficialGuidance(text: string): RuleScore {
  const peopleFirstCount = countMatches(text, PEOPLE_FIRST_KEYWORDS);
  const supportingLinkCount = countMatches(text, SUPPORTING_LINK_KEYWORDS);
  const fanOutCount = countMatches(text, QUERY_FAN_OUT_KEYWORDS);
  const previewBlockingCount = countMatches(text, PREVIEW_BLOCKING_KEYWORDS);

  const score = clampScore(
    peopleFirstCount * 1.2 +
      supportingLinkCount * 1.3 +
      fanOutCount * 1.1 -
      previewBlockingCount * 3
  );

  if (previewBlockingCount > 0) {
    return {
      item: "AI Overviews公式方針",
      score,
      comment:
        "nosnippet、max-snippet、noindexなど、AI OverviewsやAI Modeでの引用・スニペット利用を制限しうる語句を検出しました。設定意図を確認してください。"
    };
  }

  const comments = [
    peopleFirstCount > 0
      ? "読者向けの結論・理由・手順に関する要素があります。"
      : "読者がすぐ理解できる結論、理由、手順の明示が弱い状態です。",
    supportingLinkCount > 0
      ? "公式情報や出典など、信頼性を補強する要素があります。"
      : "公式情報、出典、データなどの根拠を追加すると改善できます。",
    fanOutCount > 0
      ? "比較、費用、手順、Q&Aなど関連探索に広がる要素があります。FAQはリッチリザルト目的ではなく、AIが質問意図を理解しやすい本文構造として評価します。"
      : "query fan-outを意識し、比較、費用、選び方、Q&Aなど周辺トピックを補うと改善できます。FAQリッチリザルト目的の構造化データ評価は重視しません。"
  ];

  return {
    item: "AI Overviews公式方針",
    score,
    comment: comments.join(" ")
  };
}

export function scoreHowToStructure(text: string): RuleScore {
  const matchedCount = countMatches(text, HOW_TO_KEYWORDS);
  const orderedStepCount =
    text.match(/(?:^|\n)\s*(?:\d+[.)]|Step\s*\d+|STEP\s*\d+)/g)?.length ?? 0;
  const score = clampScore(matchedCount * 1.4 + orderedStepCount * 2);

  return {
    item: "How-to・手順構造",
    score,
    comment:
      score >= 7
        ? "手順、流れ、注意点などのHow-to要素を検出しました。AI検索が実行手順として整理しやすい構造です。"
        : "手順、流れ、注意点などのHow-to要素が弱い状態です。作業ステップや確認ポイントを追加すると改善できます。"
  };
}

export function scoreOriginalityAndPrimaryValue(text: string): RuleScore {
  const matchedCount = countMatches(text, ORIGINALITY_KEYWORDS);
  const score = clampScore(matchedCount * 1.2);

  return {
    item: "独自性・一次性",
    score,
    comment:
      score >= 7
        ? "独自データ、事例、経験、監修、公式情報など一次性を補強する要素を検出しました。"
        : "独自調査、自社データ、実例、経験、監修、公式情報などの一次性を示す要素を追加すると改善できます。"
  };
}

export function scoreSeoAioBalance(text: string): RuleScore {
  const matchedCount = countMatches(text, SEO_AIO_BALANCE_KEYWORDS);
  const hasTitleLikeHeading = /^#\s+.+$/m.test(text);
  const hasSummaryBlock =
    text.includes("この記事でわかること") ||
    text.includes("要約") ||
    text.includes("まとめ") ||
    text.includes("結論");
  const score = clampScore(
    matchedCount * 0.9 + (hasTitleLikeHeading ? 1.5 : 0) + (hasSummaryBlock ? 2 : 0)
  );

  return {
    item: "SEO/AIO両立",
    score,
    comment:
      score >= 7
        ? "タイトル、見出し、検索意図、要約、FAQなどSEOとAIOの両方に関わる要素を検出しました。"
        : "SEOとAIOの両立要素が弱い状態です。タイトル、検索意図、関連トピック、要約、内部リンクを整理すると改善できます。"
  };
}

export function scoreIntroKeyPointsAndEvidence(text: string): RuleScore {
  const intro = text.slice(0, 700);
  const introKeywordCount = countMatches(intro, INTRO_EVIDENCE_KEYWORDS);
  const introBulletCount =
    intro.match(/^(\s*[-*]\s+|\s*・|\s*\d+[.)]\s+).+$/gm)?.length ?? 0;
  const hasLinkLikeText = /https?:\/\/|出典|参考|引用|公式/.test(intro);
  const score = clampScore(
    introKeywordCount * 1.5 + introBulletCount * 1.5 + (hasLinkLikeText ? 2 : 0)
  );

  return {
    item: "冒頭の要点・根拠ブロック",
    score,
    comment:
      score >= 7
        ? "冒頭に要点、結論、根拠、箇条書きなどがまとまっています。AI Overviewsが要約しやすい導入構造です。"
        : "冒頭の要点・根拠ブロックが弱い状態です。結論、要点の箇条書き、根拠リンクを冒頭にまとめると改善できます。"
  };
}

export function scoreAlternativesAndExceptions(text: string): RuleScore {
  const matchedCount = countMatches(text, ALTERNATIVE_EXCEPTION_KEYWORDS);
  const score = clampScore(matchedCount * 1.1);

  return {
    item: "代替案・例外対応",
    score,
    comment:
      score >= 7
        ? "代替案、例外、注意点、強み・弱みなど、追従質問に備える要素を検出しました。"
        : "代替案、例外、できない場合、注意点、強み・弱みなどを追加すると、AI検索の追加質問に対応しやすくなります。"
  };
}

export const aiOverviewGuidanceSources = [
  "Google Search Central: AI features and your website",
  "Google Search Central: Robots meta tags, nosnippet, max-snippet",
  "Google Search Central: FAQ rich results deprecation notice, May 7 2026"
];
