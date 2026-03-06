import { useEffect, useRef, useState } from "react";

type AgentStatus = "idle" | "busy" | "offline" | "error";

function isAgentStatus(value: unknown): value is AgentStatus {
  return value === "idle" || value === "busy" || value === "offline" || value === "error";
}

type UseAgentStatusParams = {
  agentId: string | null;
  token: string | null;
  initialStatus: AgentStatus;
};

export function useAgentStatus({ agentId, token, initialStatus }: UseAgentStatusParams) {
  const [status, setStatus] = useState<AgentStatus>(initialStatus);
  const consecutiveFailuresRef = useRef(0);
  const lastAgentIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastAgentIdRef.current === agentId) {
      return;
    }

    lastAgentIdRef.current = agentId;
    setStatus(initialStatus);
    consecutiveFailuresRef.current = 0;
  }, [agentId, initialStatus]);

  useEffect(() => {
    if (!agentId) {
      return;
    }

    let active = true;
    let controller: AbortController | null = null;

    const pollStatus = async () => {
      if (controller) {
        controller.abort();
      }

      const nextController = new AbortController();
      controller = nextController;

      try {
        const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/status`, {
          headers: {
            authorization: `Bearer ${token ?? ""}`
          },
          signal: nextController.signal
        });

        if (!response.ok) {
          throw new Error(`Status polling failed with ${response.status}`);
        }

        const payload: { status?: unknown } = await response.json();
        if (!active) {
          return;
        }

        consecutiveFailuresRef.current = 0;
        setStatus(isAgentStatus(payload.status) ? payload.status : "offline");
      } catch (error) {
        if (!active) {
          return;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        consecutiveFailuresRef.current += 1;
        if (consecutiveFailuresRef.current >= 3) {
          setStatus("offline");
        }
      }
    };

    void pollStatus();
    const timer = window.setInterval(() => {
      void pollStatus();
    }, 3000);

    return () => {
      active = false;
      if (controller) {
        controller.abort();
      }
      window.clearInterval(timer);
    };
  }, [agentId, token]);

  return status;
}
