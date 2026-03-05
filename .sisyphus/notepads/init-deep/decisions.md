# Decisions

AGENTS location scoring result:
- Root (`.`): always create.
- `reliability/`: score below threshold (<8), covered by root AGENTS.md.
- `reliability/tests/`: score below threshold (<8), covered by root AGENTS.md.

Generation scope for this run:
- Create only `AGENTS.md` at repository root.
- Do not create subdirectory AGENTS.md files unless project complexity increases.
