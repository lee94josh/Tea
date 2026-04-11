import { notFound } from "next/navigation";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/layout/page-header";
import { TypeBadge } from "@/components/tea/type-badge";
import { StarRating } from "@/components/ui/star-rating";
import { EducationPanel } from "@/components/tea/education-panel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatRelativeDate, formatSteepTime, formatTemp } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

export default async function TeaDetailPage({ params }: Props) {
  const tea = await prisma.tea.findUnique({
    where: { id: params.id },
    include: { sessions: { orderBy: { consumedAt: "desc" } } },
  });

  if (!tea) notFound();

  const avgRating =
    tea.sessions.length > 0
      ? tea.sessions.reduce((sum, s) => sum + s.rating, 0) / tea.sessions.length
      : 0;

  return (
    <div className="min-h-screen bg-stone-50">
      <PageHeader title={tea.name} showBack />

      {/* Hero */}
      <div className="bg-white border-b border-stone-100 px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-stone-900">{tea.name}</h2>
            {tea.brand && <p className="text-sm text-stone-500">{tea.brand}</p>}
            {tea.origin && <p className="text-xs text-stone-400 mt-0.5">{tea.origin}</p>}
            <div className="flex items-center gap-3 mt-2">
              <TypeBadge type={tea.type} />
              {tea.sessions.length > 0 && (
                <>
                  <StarRating value={Math.round(avgRating)} readonly size="sm" />
                  <span className="text-xs text-stone-400">
                    {avgRating.toFixed(1)} avg · {tea.sessions.length} session
                    {tea.sessions.length !== 1 ? "s" : ""}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 pt-4">
        <Tabs defaultValue="sessions">
          <TabsList className="w-full">
            <TabsTrigger value="sessions" className="flex-1">
              Sessions ({tea.sessions.length})
            </TabsTrigger>
            <TabsTrigger value="learn" className="flex-1">
              Learn
            </TabsTrigger>
          </TabsList>

          {/* Sessions Tab */}
          <TabsContent value="sessions">
            {tea.sessions.length === 0 ? (
              <p className="text-center py-10 text-sm text-stone-400">
                No sessions logged yet.
              </p>
            ) : (
              <div className="space-y-3 mt-2">
                {tea.sessions.map((session) => (
                  <div
                    key={session.id}
                    className="bg-white rounded-2xl border border-stone-200 overflow-hidden"
                  >
                    {session.photoUrl && (
                      <div className="relative h-40 w-full">
                        <Image
                          src={session.photoUrl}
                          alt="Tea session"
                          fill
                          className="object-cover"
                          sizes="640px"
                        />
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <StarRating value={session.rating} readonly size="sm" />
                        <span className="text-xs text-stone-400">
                          {formatRelativeDate(session.consumedAt)}
                        </span>
                      </div>
                      {session.notes && (
                        <p className="mt-2 text-sm text-stone-700">{session.notes}</p>
                      )}
                      {(session.brewTempC || session.steepTimeSec) && (
                        <div className="flex gap-3 mt-2 text-xs text-stone-400">
                          {session.brewTempC && (
                            <span>{formatTemp(session.brewTempC)}</span>
                          )}
                          {session.steepTimeSec && (
                            <span>{formatSteepTime(session.steepTimeSec)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Learn Tab */}
          <TabsContent value="learn">
            <div className="mt-2 pb-4">
              <EducationPanel teaType={tea.type} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
