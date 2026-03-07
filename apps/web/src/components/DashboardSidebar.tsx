import React, { useState, useEffect } from "react";
import { useAuth } from "../app/auth.js";

interface SidebarProps {
  activeModule: string;
  onModuleChange: (module: string) => void;
  connectionStatus: string;
}

const MODULE_GROUPS = [
  {
    title: "Core",
    modules: [
      { id: "overview", label: "总览", icon: "OV" },
      { id: "events", label: "事件", icon: "EV" },
      { id: "tasks", label: "任务", icon: "TK" },
      { id: "approvals", label: "审批", icon: "AP" }
    ]
  },
  {
    title: "Operations",
    modules: [
      { id: "config", label: "配置", icon: "CF" },
      { id: "sessions", label: "会话", icon: "SE" },
      { id: "webhooks", label: "Webhooks", icon: "WH" }
    ]
  },
  {
    title: "Health",
    modules: [
      { id: "costs", label: "成本", icon: "CO" },
      { id: "monitoring", label: "监控", icon: "MO" }
    ]
  }
] as const;

export function DashboardSidebar({ activeModule, onModuleChange, connectionStatus }: SidebarProps) {
  const { signOut } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isMobileMenuOpen && !target.closest('.dashboard-sidebar') && !target.closest('.mobile-menu-toggle')) {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobileMenuOpen]);

  const getStatusClass = () => {
    switch (connectionStatus) {
      case "connected": return "connected";
      case "disconnected": return "disconnected";
      case "loading": return "loading";
      default: return "degraded";
    }
  };

  return (
    <>
      <aside className={`dashboard-sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">OC</div>
            <span>OpenClaw Console</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {MODULE_GROUPS.map((group) => (
            <div className="sidebar-nav-section" key={group.title}>
              <div className="sidebar-nav-title">{group.title}</div>
              <ul className="sidebar-nav-list">
                {group.modules.map((module) => (
                  <li key={module.id} className="sidebar-nav-item">
                    <button
                      className={`sidebar-nav-link ${activeModule === module.id ? 'active' : ''}`}
                      onClick={() => {
                        onModuleChange(module.id);
                        setIsMobileMenuOpen(false);
                      }}
                      data-testid={`nav-${module.id}`}
                    >
                      <span className="sidebar-nav-icon" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em" }}>{module.icon}</span>
                      <span>{module.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">A</div>
            <div className="user-details">
              <span className="user-name">管理员</span>
              <span className="user-role" data-testid="connection-status">
                <span className={`status-indicator ${getStatusClass()}`} />
                <span style={{ marginLeft: 8 }}>
                  {connectionStatus === "connected"
                    ? "connected"
                    : connectionStatus === "disconnected"
                      ? "disconnected"
                      : connectionStatus === "loading"
                        ? "loading"
                        : "degraded"}
                </span>
              </span>
            </div>
          </div>
          <button 
            className="btn btn-ghost btn-sm"
            onClick={signOut}
            title="退出登录"
          >
            Exit
          </button>
        </div>
      </aside>

      <button 
        className="mobile-menu-toggle"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        aria-label="切换菜单"
      >
        ☰
      </button>
    </>
  );
}
