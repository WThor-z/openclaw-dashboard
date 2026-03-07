import React, { useEffect, useRef, useState } from "react";
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
  const agentsRef = useRef<Agent[]>([]);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

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
        const data = (await response.json()) as { items?: Agent[] };
        const nextAgents = Array.isArray(data.items) ? data.items : [];
        const previousById = new Map(agentsRef.current.map((agent) => [agent.id, agent]));

        const hydratedAgents = await Promise.all(
          nextAgents.map(async (agent) => {
            try {
              const statusResponse = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/status`, {
                headers: {
                  authorization: `Bearer ${token ?? ""}`
                }
              });

              if (!statusResponse.ok) {
                throw new Error(`Failed to fetch status for ${agent.id}`);
              }

              const statusData = await statusResponse.json();
              const nextStatus =
                statusData.status === "idle" ||
                statusData.status === "busy" ||
                statusData.status === "offline" ||
                statusData.status === "error"
                  ? statusData.status
                  : agent.status;

              return {
                ...agent,
                status: nextStatus,
                updatedAt: typeof statusData.updatedAt === "string" ? statusData.updatedAt : agent.updatedAt
              } satisfies Agent;
            } catch {
              const previousAgent = previousById.get(agent.id);
              return previousAgent ? { ...agent, status: previousAgent.status, updatedAt: previousAgent.updatedAt ?? agent.updatedAt } : agent;
            }
          })
        );

        agentsRef.current = hydratedAgents;
        setAgents(hydratedAgents);
        onAgentsChange?.(hydratedAgents);
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
              <button className="rounded-lg bg-[#1f5ba6] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#174d92]">
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
