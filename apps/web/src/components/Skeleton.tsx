import React from "react";

type SkeletonVariant = "line" | "card" | "panel";

interface SkeletonProps {
  variant?: SkeletonVariant;
  className?: string;
}

const variantClasses: Record<SkeletonVariant, string> = {
  line: "h-4 w-full rounded-xl",
  card: "h-20 w-full rounded-2xl border border-slate-200",
  panel: "h-48 w-full rounded-2xl border border-slate-200"
};

export function Skeleton({ variant = "line", className }: SkeletonProps) {
  return (
    <div
      className={`${variantClasses[variant]} animate-pulse bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 ${className ?? ""}`.trim()}
      aria-hidden="true"
    />
  );
}
