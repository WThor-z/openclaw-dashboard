import React from "react";
import { useParams } from "react-router-dom";

import { AgentRuntimeShell } from "../components/AgentRuntimeShell.js";

export function AgentRuntimeConversationPage() {
  const { agentId, conversationId } = useParams<{ agentId: string; conversationId: string }>();

  return (
    <AgentRuntimeShell
      agentId={agentId ?? "unknown-agent"}
      conversationId={conversationId ?? "unknown-conversation"}
    />
  );
}
