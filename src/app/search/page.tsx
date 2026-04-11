"use client";

import { useState, useCallback } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { TeaCard } from "@/components/tea/tea-card";
import { PageHeader } from "@/components/layout/page-header";
import { TEA_EDUCATION, TEA_TYPE_KEYS } from "@/lib/tea-education";
import { cn } from "@/lib/utils";

interface Session {
  id: string;
  rating: number;
  notes: string | null;
  photoUrl: string | null;
  consumedAt: string;
  tea: {
    id: string;
    name: string;
    type: string;
    origin: string | null;
    brand: string | null;
  };
}

function useDebounce<T extends (...args: Parameters<T>) => void>(fn: T, delay: number): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [results, setResults] = useState<Session[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const doSearch = useCallback(async (q: string, type: string) => {
    if (!q.trim() && !type) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (type) params.set("type", type);
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      setResults(data.results);
      setSearched(true);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedSearch = useDebounce(doSearch, 300);

  function handleQueryChange(q: string) {
    setQuery(q);
    debouncedSearch(q, typeFilter);
  }

  function handleTypeChange(type: string) {
    const next = type === typeFilter ? "" : type;
    setTypeFilter(next);
    doSearch(query, next);
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <PageHeader title="Search" />

      <div className="px-4 pt-3 space-y-3">
        {/* Search input */}
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
          />
          <Input
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search teas, notes, origins…"
            className="pl-10"
          />
        </div>

        {/* Type filter chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {TEA_TYPE_KEYS.map((key) => {
            const edu = TEA_EDUCATION[key];
            const isActive = typeFilter === key;
            return (
              <button
                key={key}
                onClick={() => handleTypeChange(key)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                  isActive
                    ? `${edu.bgColor} ${edu.color} ring-2 ring-offset-1 ring-amber-400`
                    : "bg-stone-100 text-stone-600"
                )}
              >
                {edu.displayName}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pt-4">
        {loading && (
          <p className="text-center py-8 text-sm text-stone-400">Searching…</p>
        )}

        {!loading && searched && results.length === 0 && (
          <p className="text-center py-8 text-sm text-stone-400">No teas found.</p>
        )}

        {!loading && !searched && (
          <p className="text-center py-8 text-sm text-stone-400">
            Search by tea name, origin, or tasting notes.
          </p>
        )}

        {!loading && results.length > 0 && (
          <div className="space-y-4">
            <p className="text-xs text-stone-400">{results.length} result{results.length !== 1 ? "s" : ""}</p>
            {results.map((session) => (
              <TeaCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
