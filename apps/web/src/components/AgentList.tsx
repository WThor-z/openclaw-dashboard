import React, { useEffect, useState } from "react";
import { Agent, AgentCard } from "./AgentCard.js";
import { EmptyState } from "./EmptyState.js";
import { Skeleton } from "./Skeleton.js";
import { useAuth } from "../app/auth.js";

interface AgentListProps {
  onAgentClick: (agent: Agent) => void;
  onAgentsChange?: (agents: Agent[]) => void;
}

export function AgentList({ onAgentClick, onAgentsChange }: AgentListProps) {
  const { token } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setAgents([]);
      setError(null);
      return;
    }

    const fetchAgents = async () => {
      const shouldShowInitialLoading = agents.length === 0;
      if (shouldShowInitialLoading) {
        setLoading(true);
      }

      try {
        const response = await fetch("/api/agents", {
          headers: {
            authorization: `Bearer ${token ?? ""}`
          }
        });
        if (!response.ok) {
          throw new Error("Failed to fetch agents");
        }
        const data = await response.json();
        const nextAgents = data.items || [];
        setAgents(nextAgents);
        onAgentsChange?.(nextAgents);
        setError(null);
      } catch (err) {
        console.error("Error fetching agents:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (shouldShowInitialLoading) {
          setLoading(false);
        }
      }
    };

    void fetchAgents();
    const timer = window.setInterval(() => {
      void fetchAgents();
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, [agents.length, onAgentsChange, token]);

  if (loading) {
    return (
      <div className="content-grid-3" aria-label="Loading agents">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} variant="card" className="h-40" />
        ))}
      </div>
    );
  }

  // Even if there's an error or no agents, we must ensure agent-list-placeholder exists for login.test.tsx
  if (error || agents.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <EmptyState
          className="px-12"
          title="暂无 Agent"
          message={error ? "无法加载 Agent 列表，请稍后再试。" : "部署您的第一个 Agent 以开始监控工作区活动。"}
          action={
            !error ? (
              <button className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded transition-colors shadow-lg shadow-indigo-500/20">
                Initialize Agent
              </button>
            ) : null
          }
        />
      </div>
    );
  }

  return (
    <div className="content-grid-3">
      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} onClick={onAgentClick} />
      ))}
    </div>
  );
}
