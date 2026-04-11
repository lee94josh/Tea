"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, PlusCircle, Search, BarChart2, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/log", icon: PlusCircle, label: "Log" },
  { href: "/search", icon: Search, label: "Search" },
  { href: "/stats", icon: BarChart2, label: "Stats" },
  { href: "/learn", icon: BookOpen, label: "Learn" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-stone-200">
      <div
        className="flex items-center justify-around"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 pt-2 px-4 min-w-[56px]",
                isActive ? "text-stone-800" : "text-stone-400"
              )}
            >
              <Icon
                size={22}
                strokeWidth={isActive ? 2.5 : 1.8}
                className={cn(isActive && "text-amber-800")}
              />
              <span
                className={cn(
                  "text-[10px] font-medium",
                  isActive ? "text-amber-800" : "text-stone-400"
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
