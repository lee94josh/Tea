"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  showBack?: boolean;
  backHref?: string;
  right?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  showBack = false,
  right,
  className,
}: PageHeaderProps) {
  const router = useRouter();

  return (
    <header
      className={cn(
        "flex items-center justify-between px-4 py-3 bg-white border-b border-stone-100 sticky top-0 z-40",
        className
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {showBack && (
          <button
            onClick={() => router.back()}
            className="p-1 -ml-1 text-stone-500 hover:text-stone-800 transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        <h1 className="text-lg font-semibold text-stone-800 truncate">
          {title}
        </h1>
      </div>
      {right && <div className="flex items-center gap-2 ml-2">{right}</div>}
    </header>
  );
}
