import React from "react";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: string;
  color: "blue" | "green" | "orange" | "red";
}

export function StatCard({ title, value, change, changeType = "neutral", icon, color }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-label">{title}</div>
      <div className="stat-value">{value}</div>
      {change && (
        <div className={`stat-change ${changeType}`}>
          {changeType === "positive" && "↑ "}
          {changeType === "negative" && "↓ "}
          {change}
        </div>
      )}
    </div>
  );
}

interface OverviewPanelProps {
  stats: {
    totalEvents: number;
    pendingTasks: number;
    pendingApprovals: number;
    todayCost: number;
  };
}

export function OverviewPanel({ stats }: OverviewPanelProps) {
  return (
    <div className="stats-grid">
      <StatCard
        title="今日事件"
        value={stats.totalEvents}
        change="+12%"
        changeType="positive"
        icon="⚡"
        color="blue"
      />
      <StatCard
        title="待处理任务"
        value={stats.pendingTasks}
        change="-5%"
        changeType="positive"
        icon="📋"
        color="orange"
      />
      <StatCard
        title="待审批"
        value={stats.pendingApprovals}
        icon="✅"
        color="green"
      />
      <StatCard
        title="今日成本"
        value={`$${stats.todayCost.toFixed(2)}`}
        change="+8%"
        changeType="negative"
        icon="💰"
        color="red"
      />
    </div>
  );
}
