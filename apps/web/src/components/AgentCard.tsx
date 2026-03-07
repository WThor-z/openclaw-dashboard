import React from "react";

export interface Agent {
  id: string;
  name: string;
  role: string;
  workspacePath: string;
  status: "idle" | "busy" | "offline" | "error";
  updatedAt?: string;
}

interface AgentCardProps {
  agent: Agent;
  onClick: (agent: Agent) => void;
}

export function AgentCard({ agent, onClick }: AgentCardProps) {
  const getStatusClass = (status: Agent["status"]) => {
    switch (status) {
      case "idle":
        return "status-idle";
      case "busy":
        return "status-busy";
      case "offline":
        return "status-offline";
      case "error":
        return "status-error";
      default:
        return "status-offline";
    }
  };

  return (
    <div
      data-testid={`agent-card-${agent.id}`}
      onClick={() => onClick(agent)}
      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#1f5ba6]/40 hover:shadow-lg"
    >
      <div className="absolute left-0 top-0 h-full w-1 bg-transparent transition-colors group-hover:bg-[#1f5ba6]" />
      
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors group-hover:bg-[#eaf2ff] group-hover:text-[#1f5ba6]">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 transition-colors group-hover:text-[#123f77]">{agent.name}</h4>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{agent.role}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`status-indicator ${getStatusClass(agent.status)}`} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{agent.status}</span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">ID</span>
          <span className="font-mono text-slate-700">{agent.id.slice(0, 8)}...</span>
        </div>
        {agent.updatedAt && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Last Active</span>
            <span className="text-slate-700">{agent.updatedAt}</span>
          </div>
        )}
      </div>

      <div className="mt-4 flex justify-end border-t border-slate-200/80 pt-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#1f5ba6] opacity-0 transition-opacity group-hover:opacity-100">
          View Details →
        </span>
      </div>
    </div>
  );
}
