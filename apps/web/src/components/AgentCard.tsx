import React from "react";

export interface Agent {
  id: string;
  name: string;
  status: "idle" | "busy" | "offline" | "error";
  type: string;
  lastActive?: string;
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
      className="group relative bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 hover:border-indigo-500/50 hover:bg-zinc-900 transition-all cursor-pointer overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-1 h-full bg-transparent group-hover:bg-indigo-500 transition-colors" />
      
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-indigo-400 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
          </div>
          <div>
            <h4 className="font-bold text-zinc-100 group-hover:text-white transition-colors">{agent.name}</h4>
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">{agent.type}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`status-indicator ${getStatusClass(agent.status)}`} />
          <span className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">{agent.status}</span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-500">ID</span>
          <span className="text-zinc-300 font-mono">{agent.id.slice(0, 8)}...</span>
        </div>
        {agent.lastActive && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500">Last Active</span>
            <span className="text-zinc-300">{agent.lastActive}</span>
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-zinc-800/50 flex justify-end">
        <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
          View Details →
        </span>
      </div>
    </div>
  );
}
