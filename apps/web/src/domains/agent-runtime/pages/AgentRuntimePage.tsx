import React from "react";
import { useParams } from "react-router-dom";

import { AgentRuntimeShell } from "../components/AgentRuntimeShell.js";

export function AgentRuntimePage() {
  const { agentId } = useParams<{ agentId: string }>();

  return <AgentRuntimeShell agentId={agentId ?? "unknown-agent"} />;
}
