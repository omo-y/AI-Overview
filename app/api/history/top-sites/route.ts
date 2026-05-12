import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const TOP_SITE_LIMIT = 5;

type TopSiteResponseItem = {
  id: number;
  createdAt: string;
  inputPreview: string;
  sourceUrl: string;
  totalScore: number;
  summary: string;
};

export async function GET() {
  try {
    const histories = await prisma.diagnosisHistory.findMany({
      where: {
        sourceUrl: {
          not: null
        }
      },
      orderBy: [
        {
          totalScore: "desc"
        },
        {
          createdAt: "desc"
        }
      ],
      take: 100
    });

    const uniqueSites = new Map<string, TopSiteResponseItem>();

    for (const history of histories) {
      if (!history.sourceUrl || uniqueSites.has(history.sourceUrl)) {
        continue;
      }

      uniqueSites.set(history.sourceUrl, {
        id: history.id,
        createdAt: history.createdAt.toISOString(),
        inputPreview: history.inputPreview,
        sourceUrl: history.sourceUrl,
        totalScore: history.totalScore,
        summary: history.summary
      });

      if (uniqueSites.size >= TOP_SITE_LIMIT) {
        break;
      }
    }

    return NextResponse.json({
      sites: Array.from(uniqueSites.values())
    });
  } catch (error) {
    console.error("[Top sites GET failed]", error);

    return NextResponse.json(
      { error: "高スコアサイト5選の取得に失敗しました。DB接続とPrisma設定を確認してください。" },
      { status: 500 }
    );
  }
}
