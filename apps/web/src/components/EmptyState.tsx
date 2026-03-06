import React, { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, message, action, className }: EmptyStateProps) {
  return (
    <div
      className={`rounded-lg border border-zinc-800/70 bg-zinc-950/40 px-5 py-8 text-center ${
        className ?? ""
      }`.trim()}
      role="status"
      aria-live="polite"
    >
      <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">No data</p>
      <h3 className="mt-2 text-sm font-semibold text-zinc-100">{title}</h3>
      {message ? <p className="mt-2 text-xs text-zinc-400">{message}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
