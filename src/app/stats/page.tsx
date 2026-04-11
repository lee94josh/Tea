import { PageHeader } from "@/components/layout/page-header";
import { RatingDistribution } from "@/components/stats/rating-distribution";
import { TypeBreakdown } from "@/components/stats/type-breakdown";
import { TimelineChart } from "@/components/stats/timeline-chart";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getStats() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/stats`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  return res.json();
}

export default async function StatsPage() {
  const stats = await getStats();

  if (!stats || stats.totalSessions === 0) {
    return (
      <div className="min-h-screen bg-stone-50">
        <PageHeader title="My Stats" />
        <div className="flex flex-col items-center justify-center py-20 text-center px-4">
          <div className="text-5xl mb-4">📊</div>
          <h2 className="text-lg font-semibold text-stone-700 mb-2">No data yet</h2>
          <p className="text-sm text-stone-500 mb-6">
            Log a few tea sessions to start seeing your trends.
          </p>
          <Link
            href="/log"
            className="bg-amber-800 text-amber-50 rounded-xl px-6 py-3 text-sm font-medium"
          >
            Log a Tea
          </Link>
        </div>
      </div>
    );
  }

  const topType = stats.typeStats[0];

  return (
    <div className="min-h-screen bg-stone-50">
      <PageHeader title="My Stats" />

      <div className="px-4 py-4 space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="pt-4">
              <p className="text-3xl font-bold text-amber-800">{stats.totalSessions}</p>
              <p className="text-xs text-stone-500 mt-0.5">Total Sessions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-3xl font-bold text-amber-800">{stats.avgRating}★</p>
              <p className="text-xs text-stone-500 mt-0.5">Average Rating</p>
            </CardContent>
          </Card>
        </div>

        {topType && (
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-stone-500 mb-1">Your Most Drunk</p>
              <p className="text-lg font-semibold text-stone-800 capitalize">
                {topType.type} tea
              </p>
              <p className="text-xs text-stone-400 mt-0.5">
                {topType.sessionCount} sessions · {topType.avgRating}★ avg
              </p>
            </CardContent>
          </Card>
        )}

        {/* Rating Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rating Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <RatingDistribution data={stats.ratingDistribution} />
          </CardContent>
        </Card>

        {/* Type Breakdown */}
        {stats.typeStats.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tea Types</CardTitle>
            </CardHeader>
            <CardContent>
              <TypeBreakdown data={stats.typeStats} />
            </CardContent>
          </Card>
        )}

        {/* Weekly Timeline */}
        {stats.weeklyTrend.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sessions Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <TimelineChart data={stats.weeklyTrend} />
            </CardContent>
          </Card>
        )}

        {/* Insights */}
        {stats.typeStats.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Insights</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.typeStats
                .filter((t: { avgRating: number }) => t.avgRating >= 4)
                .map((t: { type: string; avgRating: number; sessionCount: number }) => (
                  <p key={t.type} className="text-sm text-stone-700">
                    ✓ You tend to love{" "}
                    <span className="font-medium capitalize">{t.type}</span> tea
                    {" "}({t.avgRating}★ average from {t.sessionCount} sessions)
                  </p>
                ))}
              {stats.typeStats
                .filter((t: { avgRating: number; sessionCount: number }) => t.avgRating < 3 && t.sessionCount >= 2)
                .map((t: { type: string; avgRating: number; sessionCount: number }) => (
                  <p key={t.type} className="text-sm text-stone-500">
                    ○{" "}
                    <span className="font-medium capitalize">{t.type}</span> tea
                    {" "}hasn&apos;t been your favourite ({t.avgRating}★ avg)
                  </p>
                ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
