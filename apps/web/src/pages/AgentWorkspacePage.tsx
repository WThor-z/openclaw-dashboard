import React, { useState } from "react";
import { AgentList } from "../components/AgentList";
import { Agent } from "../components/AgentCard";
import { useAuth } from "../app/auth";
import { useAgentStatus } from "../hooks/useAgentStatus";

export function AgentWorkspacePage() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const { token } = useAuth();
  const selectedAgentStatus = useAgentStatus({
    agentId: isDrawerOpen ? selectedAgent?.id ?? null : null,
    token,
    initialStatus: selectedAgent?.status ?? "offline"
  });

  const handleAgentClick = (agent: Agent) => {
    setSelectedAgent(agent);
    setIsDrawerOpen(true);
  };

  const closeDrawer = () => {
    setIsDrawerOpen(false);
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-200 font-mono selection:bg-indigo-500/30 overflow-hidden">
      {/* Sidebar */}
      <aside 
        data-testid="drawer-placeholder"
        className="w-64 border-r border-zinc-800 bg-zinc-900/50 flex flex-col"
      >
        <div className="p-6 border-b border-zinc-800">
          <div className="flex items-center gap-2 text-indigo-400">
            <div className="w-3 h-3 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-xs font-bold tracking-widest uppercase">System Active</span>
          </div>
        </div>
        <div className="flex-1 p-4 space-y-2">
          <div className="h-4 w-3/4 bg-zinc-800 rounded animate-pulse" />
          <div className="h-4 w-1/2 bg-zinc-800 rounded animate-pulse delay-75" />
          <div className="h-4 w-2/3 bg-zinc-800 rounded animate-pulse delay-150" />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 border-b border-zinc-800 flex items-center px-8 bg-zinc-900/30 backdrop-blur-md">
          <h1 
            data-testid="agent-workspace-title"
            className="text-xl font-bold tracking-tight text-zinc-100"
          >
            Agent Workspace
          </h1>
        </header>

        <div className="flex-1 overflow-y-auto p-8" data-testid="agent-list-placeholder">
          <div className="max-w-6xl mx-auto">
            <AgentList onAgentClick={handleAgentClick} />
          </div>
        </div>

        {/* Right-side Drawer */}
        {isDrawerOpen && (
          <div 
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={closeDrawer}
          />
        )}
        
        <div 
          className={`fixed top-0 right-0 h-full bg-zinc-900 border-l border-zinc-800 shadow-2xl z-50 transition-transform duration-300 ease-in-out transform ${
            isDrawerOpen ? "translate-x-0" : "translate-x-full"
          }`}
          style={{ width: "600px" }}
        >
          {selectedAgent && (
            <div className="flex flex-col h-full">
              <div className="h-16 border-b border-zinc-800 flex items-center justify-between px-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center text-zinc-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>
                  </div>
                  <h2 className="font-bold text-zinc-100">{selectedAgent.name}</h2>
                </div>
                <button 
                  onClick={closeDrawer}
                  className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-500 hover:text-zinc-300"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                <section>
                  <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-4">Identity</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-lg p-4">
                      <span className="block text-[10px] text-zinc-500 uppercase mb-1">Agent ID</span>
                      <span className="text-sm font-mono text-zinc-300">{selectedAgent.id}</span>
                    </div>
                    <div className="bg-zinc-950/50 border border-zinc-800/50 rounded-lg p-4">
                      <span className="block text-[10px] text-zinc-500 uppercase mb-1">Type</span>
                      <span className="text-sm text-zinc-300">{selectedAgent.type}</span>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-4">Status</h3>
                  <div className="flex items-center gap-4 bg-zinc-950/50 border border-zinc-800/50 rounded-lg p-4">
                    <span className={`status-indicator ${
                      selectedAgentStatus === "idle" ? "status-idle" :
                      selectedAgentStatus === "busy" ? "status-busy" :
                      selectedAgentStatus === "offline" ? "status-offline" :
                      "status-error"
                    }`} />
                    <span className="text-sm text-zinc-300 capitalize">{selectedAgentStatus}</span>
                  </div>
                </section>

                <section className="opacity-50">
                  <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold mb-4">Workspace (Coming Soon)</h3>
                  <div className="border border-dashed border-zinc-800 rounded-lg p-12 flex flex-col items-center justify-center text-center">
                    <p className="text-xs text-zinc-600">File tree and terminal access will be available in Wave 3.</p>
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
