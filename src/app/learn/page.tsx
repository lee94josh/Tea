import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { TEA_EDUCATION, TEA_TYPE_KEYS, CAFFEINE_LABELS } from "@/lib/tea-education";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

export default function LearnPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <PageHeader title="Learn About Tea" />

      <div className="px-4 py-4">
        <p className="text-sm text-stone-500 mb-4">
          Explore the six true tea types plus herbal infusions — their origins, flavors, and how to brew them perfectly.
        </p>

        <div className="space-y-3">
          {TEA_TYPE_KEYS.map((key) => {
            const edu = TEA_EDUCATION[key];
            return (
              <Link key={key} href={`/learn/${key}`}>
                <div className="bg-white rounded-2xl border border-stone-200 p-4 flex items-center gap-4 active:opacity-80 transition-opacity">
                  <div
                    className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0",
                      edu.bgColor
                    )}
                  >
                    {typeEmoji(key)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-stone-800">{edu.displayName}</h2>
                    <p className="text-xs text-stone-500 mt-0.5 line-clamp-1">
                      {edu.tagline}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span
                        className={cn(
                          "text-xs rounded-full px-2 py-0.5 font-medium",
                          edu.bgColor,
                          edu.color
                        )}
                      >
                        {edu.oxidationLevel} oxidation
                      </span>
                      <span className="text-xs text-stone-400">
                        Caffeine: {CAFFEINE_LABELS[edu.caffeineLevel]}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-stone-300 shrink-0" />
                </div>
              </Link>
            );
          })}
        </div>

        <p className="text-xs text-stone-400 text-center mt-6">
          Tap any type to explore flavor profiles, brewing guides, famous varieties, and more.
        </p>
      </div>
    </div>
  );
}

function typeEmoji(key: string): string {
  const map: Record<string, string> = {
    green: "🍵",
    black: "☕",
    white: "🌿",
    oolong: "🫖",
    puerh: "🏔️",
    herbal: "🌸",
    yellow: "✨",
  };
  return map[key] ?? "🍵";
}
