"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  readonly?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: 14,
  md: 20,
  lg: 28,
};

export function StarRating({
  value,
  onChange,
  readonly = false,
  size = "md",
  className,
}: StarRatingProps) {
  const starSize = sizeMap[size];

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(star)}
          className={cn(
            "transition-transform active:scale-110",
            !readonly && "cursor-pointer hover:scale-110",
            readonly && "cursor-default"
          )}
          aria-label={`Rate ${star} star${star !== 1 ? "s" : ""}`}
        >
          <Star
            size={starSize}
            className={cn(
              "transition-colors",
              star <= value
                ? "fill-amber-400 text-amber-400"
                : "fill-transparent text-stone-300"
            )}
          />
        </button>
      ))}
    </div>
  );
}
