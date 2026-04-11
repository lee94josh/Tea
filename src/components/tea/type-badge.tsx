import { cn } from "@/lib/utils";
import { TEA_EDUCATION } from "@/lib/tea-education";
import type { TeaTypeKey } from "@/lib/tea-education";

interface TypeBadgeProps {
  type: string;
  className?: string;
}

export function TypeBadge({ type, className }: TypeBadgeProps) {
  const edu = TEA_EDUCATION[type as TeaTypeKey];
  if (!edu) {
    return (
      <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-stone-100 text-stone-600", className)}>
        {type}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        edu.bgColor,
        edu.color,
        className
      )}
    >
      {edu.displayName}
    </span>
  );
}
