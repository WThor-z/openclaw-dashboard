import React, { useState } from "react";
import { Link } from "react-router-dom";

import { LanguageSwitch, useI18n } from "../app/i18n.js";
import { ThemeSwitch } from "../app/theme.js";
import { type Agent } from "./AgentCard.js";

type AgentWorkspaceSidebarProps = {
  agents: Agent[];
  currentAgentId: string | null;
  activeSection: "overview" | "pinned-files" | "workspace";
};

function linkClass(active: boolean) {
  return active
    ? "border-[#1f5ba6]/25 bg-[#eef5ff] text-[#123f77]"
    : "border-transparent bg-transparent text-slate-700 hover:bg-slate-50/90";
}

function itemClass(active: boolean) {
  return active
    ? "border-[#1f5ba6]/20 bg-[#eef5ff] text-[#123f77]"
    : "border-transparent bg-transparent text-slate-600 hover:bg-slate-50/75";
}

function treeLineClass(active: boolean) {
  return active ? "bg-[#1f5ba6]" : "bg-slate-200";
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
      viewBox="0 0 16 16"
      fill="none"
    >
      <path d="M4.25 6.5L8 10.25L11.75 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NodeGlyph({ kind }: { kind: "overview" | "workspace" | "config" | "pinned" | "agent" }) {
  const baseClassName = "h-3.5 w-3.5 text-slate-400";

  if (kind === "overview") {
    return (
      <svg aria-hidden="true" className={baseClassName} viewBox="0 0 16 16" fill="none">
        <rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.2" />
        <path d="M5 8H11M8 5V11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === "workspace") {
    return (
      <svg aria-hidden="true" className={baseClassName} viewBox="0 0 16 16" fill="none">
        <path d="M2.5 4.5H13.5V11.5H2.5V4.5Z" stroke="currentColor" strokeWidth="1.2" rx="1.2" />
        <path d="M5.5 7H10.5M5.5 9.5H9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === "config") {
    return (
      <svg aria-hidden="true" className={baseClassName} viewBox="0 0 16 16" fill="none">
        <path d="M8 2.75V5.25M8 10.75V13.25M2.75 8H5.25M10.75 8H13.25" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }

  if (kind === "pinned") {
    return (
      <svg aria-hidden="true" className={baseClassName} viewBox="0 0 16 16" fill="none">
        <path d="M5 2.75H11V7L8 9.25L5 7V2.75Z" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 9.5V13.25" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className={baseClassName} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="5.1" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.4 12.8C5.1 10.9 6.4 10 8 10C9.6 10 10.9 10.9 11.6 12.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function AgentWorkspaceSidebar({ agents, currentAgentId, activeSection }: AgentWorkspaceSidebarProps) {
  const { t } = useI18n();
  const [workspacesOpen, setWorkspacesOpen] = useState(true);
  const [configurationOpen, setConfigurationOpen] = useState(true);
  const [pinnedFilesOpen, setPinnedFilesOpen] = useState(true);

  return (
    <aside className="hidden w-[17.5rem] shrink-0 border-r border-slate-200 bg-gradient-to-b from-[#fcfdff] to-[#f4f7fb] p-4 lg:flex lg:flex-col lg:gap-3.5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.35em] text-[#1f5ba6]">{t("workspace.sidebar.section")}</p>
        <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900">Agent Workspace</h2>
        <div className="sidebar-lang-switch mt-3">
          <LanguageSwitch />
          <ThemeSwitch />
        </div>
      </div>

      <nav className="rounded-2xl border border-slate-200 bg-white px-2.5 py-3 shadow-sm">
        <div className="grid gap-1.5">
          <Link aria-label={t("workspace.sidebar.overview")} to="/dashboard" className={`flex min-h-[2.2rem] items-center rounded-lg border px-2.5 py-2 text-[13px] font-semibold transition-all duration-200 hover:translate-x-[1px] ${linkClass(activeSection === "overview")}`}>
            <NodeGlyph kind="overview" />
            <span className={`mr-3 h-5 w-0.5 rounded-full ${treeLineClass(activeSection === "overview")}`} aria-hidden="true" />
            <span>{t("workspace.sidebar.overview")}</span>
          </Link>

          <div className="rounded-lg px-1.5 py-1">
            <button
              type="button"
              aria-label={t("workspace.sidebar.workspaces")}
              onClick={() => setWorkspacesOpen((value) => !value)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 transition-colors hover:bg-slate-50"
            >
              <span className="inline-flex items-center gap-2">
                <NodeGlyph kind="workspace" />
                {t("workspace.sidebar.workspaces")}
              </span>
              <Chevron open={workspacesOpen} />
            </button>
            {workspacesOpen ? (
              <div className="ml-2 border-l border-slate-200 pl-2.5 pt-1">
                {agents.length > 0 ? (
                  <div className="grid gap-1">
                    {agents.map((agent) => (
                      <Link
                        key={agent.id}
                        to={`/agents/${encodeURIComponent(agent.id)}/workspace`}
                        className={`rounded-lg border px-2.5 py-2 text-[13px] transition-all duration-200 hover:translate-x-[1px] ${itemClass(activeSection === "workspace" && currentAgentId === agent.id)}`}
                      >
                        <div className="flex items-start gap-2.5">
                          <NodeGlyph kind="agent" />
                          <span className={`mt-0.5 h-4 w-0.5 rounded-full ${treeLineClass(activeSection === "workspace" && currentAgentId === agent.id)}`} aria-hidden="true" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{agent.name}</p>
                            <p className="mt-0.5 text-[9px] uppercase tracking-[0.24em] text-slate-400">{agent.role}</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="px-2 py-1 text-xs text-slate-500">{t("workspace.sidebar.noWorkspaces")}</p>
                )}
              </div>
            ) : null}
          </div>

          <div className="rounded-lg px-1.5 py-1">
            <button
              type="button"
              aria-label={t("workspace.sidebar.configuration")}
              onClick={() => setConfigurationOpen((value) => !value)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 transition-colors hover:bg-slate-50"
            >
              <span className="inline-flex items-center gap-2">
                <NodeGlyph kind="config" />
                {t("workspace.sidebar.configuration")}
              </span>
              <Chevron open={configurationOpen} />
            </button>
            {configurationOpen ? (
              <div className="ml-2 border-l border-slate-200 pl-2.5 pt-1">
                <button
                  type="button"
                  aria-label={t("workspace.sidebar.pinnedFiles")}
                  onClick={() => setPinnedFilesOpen((value) => !value)}
                  className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-[13px] font-medium transition-all duration-200 hover:translate-x-[1px] ${linkClass(activeSection === "pinned-files")}`}
                >
                  <div className="flex items-center gap-2.5">
                    <NodeGlyph kind="pinned" />
                    <span className={`h-4 w-0.5 rounded-full ${treeLineClass(activeSection === "pinned-files")}`} aria-hidden="true" />
                    <span>{t("workspace.sidebar.pinnedFiles")}</span>
                  </div>
                  <Chevron open={pinnedFilesOpen} />
                </button>

                {pinnedFilesOpen ? (
                  agents.length > 0 ? (
                    <div className="ml-3 mt-1.5 grid gap-1 border-l border-slate-100 pl-2.5">
                      {agents.map((agent) => (
                        <Link
                          key={`pinned-${agent.id}`}
                          to={`/agents/${encodeURIComponent(agent.id)}/pinned-files`}
                          className={`rounded-lg border px-2.5 py-1.5 text-[13px] transition-all duration-200 hover:translate-x-[1px] ${itemClass(activeSection === "pinned-files" && currentAgentId === agent.id)}`}
                        >
                          <div className="flex items-start gap-2.5">
                            <NodeGlyph kind="agent" />
                            <span className={`mt-0.5 h-3.5 w-0.5 rounded-full ${treeLineClass(activeSection === "pinned-files" && currentAgentId === agent.id)}`} aria-hidden="true" />
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-700">{agent.name}</p>
                              <p className="mt-0.5 text-[9px] uppercase tracking-[0.24em] text-slate-400">{agent.role}</p>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="px-2 py-2 text-xs text-slate-500">{t("workspace.sidebar.noAgentsForPinned")}</p>
                  )
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </nav>
    </aside>
  );
}
