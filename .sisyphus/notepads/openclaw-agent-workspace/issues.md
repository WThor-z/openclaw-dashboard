## Issues
- Encountered  in tests that don't mock this endpoint, but handled it by ensuring the placeholder element is still rendered.
## Issues
- Encountered Unhandled fetch URL: /api/agents in tests that don't mock this endpoint, but handled it by ensuring the placeholder element is still rendered.
AgentList was previously rendering the placeholder only in error/empty states, which could cause race conditions in tests; moving it to the parent container solved this.
- `apps/web/src/components/MarkdownViewer.tsx` was not present in this workspace, so a safe baseline viewer component had to be created before `MarkdownEditor` preview integration.
