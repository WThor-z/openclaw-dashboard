import React, { useState, useEffect } from "react";
import { useAuth } from "../app/auth.js";

interface SidebarProps {
  activeModule: string;
  onModuleChange: (module: string) => void;
  connectionStatus: string;
}

const MODULES = [
  { id: "overview", label: "总览", icon: "📊" },
  { id: "events", label: "事件", icon: "⚡" },
  { id: "tasks", label: "任务", icon: "📋" },
  { id: "approvals", label: "审批", icon: "✅" },
  { id: "config", label: "配置", icon: "⚙️" },
  { id: "costs", label: "成本", icon: "💰" },
  { id: "sessions", label: "会话", icon: "💬" },
  { id: "webhooks", label: "Webhooks", icon: "🔔" },
  { id: "monitoring", label: "监控", icon: "📈" }
];

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
            <span>OpenClaw</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-nav-section">
            <ul className="sidebar-nav-list">
              {MODULES.map((module) => (
                <li key={module.id} className="sidebar-nav-item">
                  <button
                    className={`sidebar-nav-link ${activeModule === module.id ? 'active' : ''}`}
                    onClick={() => {
                      onModuleChange(module.id);
                      setIsMobileMenuOpen(false);
                    }}
                    data-testid={`nav-${module.id}`}
                  >
                    <span className="sidebar-nav-icon">{module.icon}</span>
                    <span>{module.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">A</div>
            <div className="user-details">
              <span className="user-name">管理员</span>
              <span className="user-role" data-testid="connection-status">
                <span className={`status-indicator ${getStatusClass()}`}>
                  {connectionStatus === "connected" ? "connected" : 
                   connectionStatus === "disconnected" ? "disconnected" : 
                   connectionStatus === "loading" ? "loading" : "degraded"}
                </span>
              </span>
            </div>
          </div>
          <button 
            className="btn btn-ghost btn-sm"
            onClick={signOut}
            title="退出登录"
          >
            🚪
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
