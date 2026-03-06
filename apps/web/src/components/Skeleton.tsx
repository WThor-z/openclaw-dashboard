import React from "react";

type SkeletonVariant = "line" | "card" | "panel";

interface SkeletonProps {
  variant?: SkeletonVariant;
  className?: string;
}

const variantClasses: Record<SkeletonVariant, string> = {
  line: "h-4 w-full rounded",
  card: "h-20 w-full rounded-lg border border-zinc-800/70",
  panel: "h-48 w-full rounded-lg border border-zinc-800/70"
};

export function Skeleton({ variant = "line", className }: SkeletonProps) {
  return (
    <div
      className={`${variantClasses[variant]} bg-zinc-800/70 animate-pulse ${className ?? ""}`.trim()}
      aria-hidden="true"
    />
  );
}
