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
  "よくある質問"
];

const PREVIEW_BLOCKING_KEYWORDS = [
  "nosnippet",
  "data-nosnippet",
  "max-snippet:0",
  "noindex"
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
      ? "比較、費用、手順、FAQなど関連探索に広がる要素があります。"
      : "query fan-outを意識し、比較、費用、選び方、FAQなど周辺トピックを補うと改善できます。"
  ];

  return {
    item: "AI Overviews公式方針",
    score,
    comment: comments.join(" ")
  };
}

export const aiOverviewGuidanceSources = [
  "Google Search Central: AI features and your website",
  "Google Search Central: Robots meta tags, nosnippet, max-snippet"
];
