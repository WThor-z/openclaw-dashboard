import React from "react";
import { Link } from "react-router-dom";

import { type Agent } from "./AgentCard.js";

type AgentWorkspaceSidebarProps = {
  agents: Agent[];
  selectedAgent: Agent | null;
  activeSection: "overview" | "quick-notes" | "workspace";
  onSelectAgent?: (agent: Agent) => void;
};

function getSectionClass(active: boolean) {
  return active
    ? "border-indigo-500/70 bg-indigo-500/10 text-indigo-100"
    : "border-zinc-800/80 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800/70";
}

function getStatusClass(status: Agent["status"]) {
  switch (status) {
    case "idle":
      return "status-idle";
    case "busy":
      return "status-busy";
    case "error":
      return "status-error";
    default:
      return "status-offline";
  }
}

export function AgentWorkspaceSidebar({ agents, selectedAgent, activeSection, onSelectAgent }: AgentWorkspaceSidebarProps) {
  const selectedAgentPath = selectedAgent ? encodeURIComponent(selectedAgent.id) : null;

  return (
    <aside className="hidden w-80 shrink-0 border-r border-zinc-800 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.18),_transparent_60%),linear-gradient(180deg,_rgba(24,24,27,0.98),_rgba(9,9,11,0.99))] p-6 lg:flex lg:flex-col lg:gap-6">
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-5 shadow-2xl shadow-black/20">
        <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-indigo-300">Workspace</p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-zinc-50">Agent Workspace</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Use this sidebar to choose an agent, manage preview files, or jump into the full workspace editor.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-4">
        <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Selected Agent</p>
        {selectedAgent ? (
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-sm font-bold text-zinc-100">{selectedAgent.name}</p>
              <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">{selectedAgent.role}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className={`status-indicator ${getStatusClass(selectedAgent.status)}`} />
              <span className="capitalize">{selectedAgent.status}</span>
            </div>
            <p className="break-all text-xs text-zinc-400">{selectedAgent.workspacePath}</p>
          </div>
        ) : (
          <p className="mt-3 text-xs leading-6 text-zinc-500">Select an agent from the list to unlock preview-file settings and the full workspace browser.</p>
        )}
      </div>

      <nav className="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-4">
        <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Sections</p>
        <div className="mt-3 grid gap-2">
          <Link to="/dashboard" className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${getSectionClass(activeSection === "overview")}`}>
            Overview
          </Link>
          {selectedAgentPath ? (
            <>
              <Link
                to={`/agents/${selectedAgentPath}/quick-notes`}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${getSectionClass(activeSection === "quick-notes")}`}
              >
                Preview Files
              </Link>
              <Link
                to={`/agents/${selectedAgentPath}/workspace`}
                className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${getSectionClass(activeSection === "workspace")}`}
              >
                Full Workspace
              </Link>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-3 text-sm text-zinc-600">Preview Files</div>
              <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-3 text-sm text-zinc-600">Full Workspace</div>
            </>
          )}
        </div>
      </nav>

      <div className="min-h-0 flex-1 rounded-2xl border border-zinc-800/80 bg-zinc-950/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Agents</p>
          <span className="text-xs text-zinc-500">{agents.length}</span>
        </div>
        <div className="mt-3 max-h-full space-y-2 overflow-auto">
          {agents.map((agent) => {
            const isSelected = selectedAgent?.id === agent.id;
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => onSelectAgent?.(agent)}
                className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                  isSelected
                    ? "border-indigo-500/70 bg-indigo-500/10"
                    : "border-zinc-800/80 bg-zinc-900/40 hover:bg-zinc-800/70"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-100">{agent.name}</p>
                    <p className="truncate text-[11px] uppercase tracking-[0.25em] text-zinc-500">{agent.role}</p>
                  </div>
                  <span className={`status-indicator ${getStatusClass(agent.status)}`} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
