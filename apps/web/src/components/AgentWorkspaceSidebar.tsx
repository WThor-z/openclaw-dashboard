import React, { useState } from "react";
import { Link } from "react-router-dom";

import { LanguageSwitch, useI18n } from "../app/i18n.js";
import { type Agent } from "./AgentCard.js";

type AgentWorkspaceSidebarProps = {
  agents: Agent[];
  currentAgentId: string | null;
  activeSection: "overview" | "pinned-files" | "workspace";
};

function linkClass(active: boolean) {
  return active
    ? "border-[#1f5ba6]/40 bg-[#edf4ff] text-[#123f77] shadow-sm"
    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
}

function itemClass(active: boolean) {
  return active
    ? "border-[#1f5ba6]/35 bg-[#edf4ff] text-[#123f77]"
    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50";
}

export function AgentWorkspaceSidebar({ agents, currentAgentId, activeSection }: AgentWorkspaceSidebarProps) {
  const { t } = useI18n();
  const [workspacesOpen, setWorkspacesOpen] = useState(true);
  const [configurationOpen, setConfigurationOpen] = useState(true);

  return (
    <aside className="hidden w-80 shrink-0 border-r border-slate-200 bg-gradient-to-b from-[#fcfdff] to-[#f4f7fb] p-6 lg:flex lg:flex-col lg:gap-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#1f5ba6]">{t("workspace.sidebar.section")}</p>
        <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Agent Workspace</h2>
        <div className="mt-4">
          <LanguageSwitch />
        </div>
      </div>

      <nav className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3">
          <Link aria-label={t("workspace.sidebar.overview")} to="/dashboard" className={`rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${linkClass(activeSection === "overview")}`}>
            {t("workspace.sidebar.overview")}
          </Link>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70">
            <button
              type="button"
              aria-label={t("workspace.sidebar.workspaces")}
              onClick={() => setWorkspacesOpen((value) => !value)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-900"
            >
              <span>{t("workspace.sidebar.workspaces")}</span>
              <span className="text-xs text-slate-500">{workspacesOpen ? "-" : "+"}</span>
            </button>
            {workspacesOpen ? (
              <div className="grid gap-2 border-t border-slate-200 px-3 py-3">
                {agents.length > 0 ? (
                  agents.map((agent) => (
                    <Link
                      key={agent.id}
                      to={`/agents/${encodeURIComponent(agent.id)}/workspace`}
                      className={`rounded-xl border px-3 py-3 text-sm transition-colors ${itemClass(activeSection === "workspace" && currentAgentId === agent.id)}`}
                    >
                      <p className="font-semibold">{agent.name}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-slate-500">{agent.role}</p>
                    </Link>
                  ))
                ) : (
                  <p className="px-2 py-1 text-xs text-slate-500">{t("workspace.sidebar.noWorkspaces")}</p>
                )}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70">
            <button
              type="button"
              aria-label={t("workspace.sidebar.configuration")}
              onClick={() => setConfigurationOpen((value) => !value)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-900"
            >
              <span>{t("workspace.sidebar.configuration")}</span>
              <span className="text-xs text-slate-500">{configurationOpen ? "-" : "+"}</span>
            </button>
            {configurationOpen ? (
              <div className="grid gap-2 border-t border-slate-200 px-3 py-3">
                {agents.length > 0 ? (
                  agents.map((agent) => (
                    <Link
                      key={`pinned-${agent.id}`}
                      to={`/agents/${encodeURIComponent(agent.id)}/pinned-files`}
                      className={`rounded-xl border px-3 py-3 text-sm transition-colors ${itemClass(activeSection === "pinned-files" && currentAgentId === agent.id)}`}
                    >
                      <p className="font-semibold">{t("workspace.sidebar.pinnedFiles")} · {agent.name}</p>
                      <p className="mt-1 text-[11px] uppercase tracking-[0.25em] text-slate-500">{agent.role}</p>
                    </Link>
                  ))
                ) : (
                  <p className="px-2 py-1 text-xs text-slate-500">{t("workspace.sidebar.noAgentsForPinned")}</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </nav>
    </aside>
  );
}
