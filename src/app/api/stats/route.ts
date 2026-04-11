import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const [ratingDist, typeStats, weeklyTrend, totals] = await Promise.all([
    // Rating distribution
    prisma.$queryRaw<{ rating: number; count: bigint }[]>`
      SELECT rating, COUNT(*) as count
      FROM TeaSession
      GROUP BY rating
      ORDER BY rating
    `,

    // Type stats with avg rating
    prisma.$queryRaw<{ type: string; sessionCount: bigint; avgRating: number }[]>`
      SELECT t.type, COUNT(*) as sessionCount, AVG(s.rating) as avgRating
      FROM TeaSession s
      JOIN Tea t ON s.teaId = t.id
      GROUP BY t.type
      ORDER BY sessionCount DESC
    `,

    // Weekly trend over last 6 months
    prisma.$queryRaw<{ week: string; count: bigint }[]>`
      SELECT strftime('%Y-%W', consumedAt) as week, COUNT(*) as count
      FROM TeaSession
      WHERE consumedAt >= date('now', '-6 months')
      GROUP BY week
      ORDER BY week
    `,

    // Totals
    prisma.$queryRaw<{ totalSessions: bigint; avgRating: number }[]>`
      SELECT COUNT(*) as totalSessions, AVG(rating) as avgRating
      FROM TeaSession
    `,
  ]);

  const total = totals[0] ?? { totalSessions: BigInt(0), avgRating: 0 };

  return NextResponse.json({
    ratingDistribution: ratingDist.map((r) => ({
      rating: r.rating,
      count: Number(r.count),
    })),
    typeStats: typeStats.map((t) => ({
      type: t.type,
      sessionCount: Number(t.sessionCount),
      avgRating: Math.round(t.avgRating * 10) / 10,
    })),
    weeklyTrend: weeklyTrend.map((w) => ({
      week: w.week,
      count: Number(w.count),
    })),
    totalSessions: Number(total.totalSessions),
    avgRating: Math.round((total.avgRating || 0) * 10) / 10,
  });
}
