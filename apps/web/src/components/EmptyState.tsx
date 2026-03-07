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
      className={`rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm ${
        className ?? ""
      }`.trim()}
      role="status"
      aria-live="polite"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#1f5ba6]">No data</p>
      <h3 className="mt-3 text-lg font-semibold text-slate-900" style={{ fontFamily: "var(--font-serif)" }}>{title}</h3>
      {message ? <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">{message}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
