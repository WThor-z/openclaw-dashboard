## Learnings
- Ensured  exists even on fetch failure to satisfy .
- Implemented responsive 3-col grid and pulsing dot animation for busy status.
- Used fixed width (600px) for the right-side drawer as requested.
## Learnings
- Ensured agent-list-placeholder exists even on fetch failure to satisfy login.test.tsx.
- Implemented responsive 3-col grid and pulsing dot animation for busy status.
- Used fixed width (600px) for the right-side drawer as requested.
Implemented stable placeholder wrapper in AgentWorkspacePage to ensure login tests pass even when /api/agents fails. Unified status visualization using custom CSS classes across AgentCard and the right drawer.
- Markdown editor save flow must call `/api/control/arm` before each file write request, and each save requires a fresh `idempotency-key` header.
