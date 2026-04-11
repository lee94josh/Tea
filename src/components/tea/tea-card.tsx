import Link from "next/link";
import Image from "next/image";
import { StarRating } from "@/components/ui/star-rating";
import { TypeBadge } from "@/components/tea/type-badge";
import { formatRelativeDate } from "@/lib/utils";

interface TeaCardProps {
  session: {
    id: string;
    rating: number;
    notes: string | null;
    photoUrl: string | null;
    consumedAt: Date | string;
    tea: {
      id: string;
      name: string;
      type: string;
      origin: string | null;
      brand: string | null;
    };
  };
}

export function TeaCard({ session }: TeaCardProps) {
  return (
    <Link href={`/tea/${session.tea.id}`}>
      <article className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden active:opacity-90 transition-opacity">
        {session.photoUrl && (
          <div className="relative h-44 w-full">
            <Image
              src={session.photoUrl}
              alt={session.tea.name}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, 640px"
            />
          </div>
        )}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="font-semibold text-stone-900 truncate">{session.tea.name}</h2>
              {session.tea.brand && (
                <p className="text-xs text-stone-400 truncate">{session.tea.brand}</p>
              )}
            </div>
            <TypeBadge type={session.tea.type} className="shrink-0" />
          </div>
          <div className="flex items-center gap-3 mt-2">
            <StarRating value={session.rating} readonly size="sm" />
            <span className="text-xs text-stone-400">
              {formatRelativeDate(session.consumedAt)}
            </span>
          </div>
          {session.notes && (
            <p className="mt-2 text-sm text-stone-600 line-clamp-2">{session.notes}</p>
          )}
          {session.tea.origin && (
            <p className="mt-1.5 text-xs text-stone-400">{session.tea.origin}</p>
          )}
        </div>
      </article>
    </Link>
  );
}
