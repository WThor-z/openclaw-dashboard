import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../app/auth.js";
import { LanguageSwitch, useI18n } from "../app/i18n.js";

interface SidebarProps {
  activeModule: string;
  onModuleChange: (module: string) => void;
  connectionStatus: string;
}

export function DashboardSidebar({ activeModule, onModuleChange, connectionStatus }: SidebarProps) {
  const { signOut } = useAuth();
  const { t } = useI18n();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const moduleGroups = useMemo(
    () => [
      {
        title: t("dashboard.group.core"),
        modules: [
          { id: "overview", label: t("dashboard.module.overview"), icon: "OV" },
          { id: "events", label: t("dashboard.module.events"), icon: "EV" },
          { id: "tasks", label: t("dashboard.module.tasks"), icon: "TK" },
          { id: "approvals", label: t("dashboard.module.approvals"), icon: "AP" }
        ]
      },
      {
        title: t("dashboard.group.operations"),
        modules: [
          { id: "config", label: t("dashboard.module.config"), icon: "CF" },
          { id: "sessions", label: t("dashboard.module.sessions"), icon: "SE" },
          { id: "webhooks", label: t("dashboard.module.webhooks"), icon: "WH" }
        ]
      },
      {
        title: t("dashboard.group.health"),
        modules: [
          { id: "costs", label: t("dashboard.module.costs"), icon: "CO" },
          { id: "monitoring", label: t("dashboard.module.monitoring"), icon: "MO" }
        ]
      }
    ],
    [t]
  );

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
          {moduleGroups.map((group) => (
            <div className="sidebar-nav-section" key={group.title}>
              <div className="sidebar-nav-title">{group.title}</div>
              <ul className="sidebar-nav-list">
                {group.modules.map((module) => (
                  <li key={module.id} className="sidebar-nav-item">
                    <button
                      type="button"
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
              <span className="user-name">{t("dashboard.user.admin")}</span>
              <span className="user-role" data-testid="connection-status">
                <span className={`status-indicator ${getStatusClass()}`} />
                <span style={{ marginLeft: 8 }}>
                  {connectionStatus === "connected"
                    ? t("dashboard.connection.connected")
                    : connectionStatus === "disconnected"
                      ? t("dashboard.connection.disconnected")
                      : connectionStatus === "loading"
                        ? t("dashboard.connection.loading")
                        : t("dashboard.connection.degraded")}
                </span>
              </span>
            </div>
          </div>
          <LanguageSwitch />
          <button 
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={signOut}
            title={t("dashboard.action.exit")}
          >
            {t("dashboard.action.exit")}
          </button>
        </div>
      </aside>

      <button 
        type="button"
        className="mobile-menu-toggle"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        aria-label={t("dashboard.menu.toggle")}
      >
        ☰
      </button>
    </>
  );
}
