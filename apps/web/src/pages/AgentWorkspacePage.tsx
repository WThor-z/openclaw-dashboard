import React, { useEffect, useMemo, useState } from "react";

import { useAuth } from "../app/auth.js";
import { AgentList } from "../components/AgentList.js";
import { type Agent } from "../components/AgentCard.js";
import { AgentWorkspaceSidebar } from "../components/AgentWorkspaceSidebar.js";
import { saveSelectedAgentId, loadSelectedAgentId } from "../features/agent-workspace/storage.js";

export function AgentWorkspacePage() {
  const { token } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(() => loadSelectedAgentId());

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId]
  );

  useEffect(() => {
    if (!selectedAgentId) {
      return;
    }

    if (selectedAgent) {
      return;
    }

    saveSelectedAgentId(null);
    setSelectedAgentId(null);
  }, [selectedAgent, selectedAgentId]);

  useEffect(() => {
    if (!token) {
      setSelectedAgentId(null);
      saveSelectedAgentId(null);
    }
  }, [token]);

  const onlineCount = agents.filter((agent) => agent.status !== "offline").length;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-950 font-mono text-zinc-200 selection:bg-indigo-500/30">
      <AgentWorkspaceSidebar
        agents={agents}
        selectedAgent={selectedAgent}
        activeSection="overview"
        onSelectAgent={(agent) => {
          setSelectedAgentId(agent.id);
          saveSelectedAgentId(agent.id);
        }}
      />

      <main className="relative flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-zinc-800 bg-zinc-900/30 px-8 backdrop-blur-md">
          <div className="flex h-16 items-center justify-between gap-4">
            <div>
              <h1 data-testid="agent-workspace-title" className="text-xl font-bold tracking-tight text-zinc-100">
                Agent Workspace
              </h1>
              <p className="text-xs text-zinc-500">Pick an agent, then jump into preview-file management or the full workspace editor from the left sidebar.</p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8" data-testid="agent-list-placeholder">
          <div className="mx-auto max-w-6xl space-y-6">
            <div data-testid="drawer-placeholder" className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/50 p-5 shadow-lg shadow-black/20">
                <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-indigo-300">Overview</p>
                <p className="mt-3 text-2xl font-bold text-zinc-50">{agents.length}</p>
                <p className="mt-2 text-xs text-zinc-500">Tracked agents in this workspace</p>
              </div>
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-emerald-300">Online</p>
                <p className="mt-3 text-2xl font-bold text-zinc-50">{onlineCount}</p>
                <p className="mt-2 text-xs text-zinc-500">Agents not currently marked offline</p>
              </div>
              <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-zinc-400">Current Selection</p>
                <p className="mt-3 text-lg font-bold text-zinc-50">{selectedAgent?.name ?? "No agent selected"}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  {selectedAgent ? "Use the fixed sidebar to open Preview Files or Full Workspace." : "Select an agent card to activate workspace navigation."}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800/70 bg-zinc-950/30 p-4">
              <AgentList
                onAgentClick={(agent) => {
                  setSelectedAgentId(agent.id);
                  saveSelectedAgentId(agent.id);
                }}
                onAgentsChange={setAgents}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
