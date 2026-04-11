import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { TeaCard } from "@/components/tea/tea-card";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";

async function getRecentSessions(cursor?: string) {
  return prisma.teaSession.findMany({
    take: 20,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: { consumedAt: "desc" },
    include: {
      tea: { select: { id: true, name: true, type: true, origin: true, brand: true } },
    },
  });
}

export default async function HomePage() {
  const sessions = await getRecentSessions();
  const totalCount = await prisma.teaSession.count();

  return (
    <div className="min-h-screen bg-stone-50">
      <PageHeader
        title="Tea Journal"
        right={
          <Link
            href="/log"
            className="flex items-center gap-1.5 text-sm font-medium text-amber-800"
          >
            <PlusCircle size={18} />
            Log
          </Link>
        }
      />

      <div className="px-4 py-3">
        {totalCount > 0 && (
          <p className="text-xs text-stone-400 mb-4">
            {totalCount} session{totalCount !== 1 ? "s" : ""} logged
          </p>
        )}

        {sessions.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {sessions.map((session) => (
              <TeaCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>

      {/* Floating action button */}
      <Link
        href="/log"
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-amber-800 text-white shadow-lg active:scale-95 transition-transform"
        aria-label="Log a tea"
      >
        <PlusCircle size={26} />
      </Link>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-6xl mb-4">🍵</div>
      <h2 className="text-xl font-semibold text-stone-700 mb-2">
        Your tea journey starts here
      </h2>
      <p className="text-sm text-stone-500 mb-6 max-w-xs">
        Log your first tea session to start tracking what you love — and learning why.
      </p>
      <Link
        href="/log"
        className="inline-flex items-center gap-2 bg-amber-800 text-amber-50 rounded-xl px-6 py-3 text-sm font-medium"
      >
        <PlusCircle size={18} />
        Log Your First Tea
      </Link>
    </div>
  );
}
