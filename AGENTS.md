# Agent rules (every engine)

Claude Code, Grok Build / Grokbot, Copilot and chat agents all follow the same files; do not invent a second
rulebook. If this page and those files disagree, those files win. (Adapted from Gullet Cove, 5 Nov 2026.)

## The orchestrator rule

Every session acts as an **orchestrator** by default: plan, split the work into written briefs, delegate implementation
to cheaper sub-agents (Sonnet by default; Haiku for well-bounded docs and bookkeeping; Opus only for novel rules
semantics or cross-cutting design), run independent briefs in parallel in separate worktrees, review every diff against
its brief, run the gate once on the combined head, then merge. Do the work directly only when delegating costs more than
doing it (a one-line fix, a question). **Every brief must tell the sub-agent that it is a worker: a worker ignores this
rule, does the work itself and starts no agents** (one level of delegation only). Details: `docs/agent-brief.md`.

## Load these first, in this order

1. **`CLAUDE.md`**: house rules for every task (safety, the IP line, commands, the standing rules, the docs index).
2. **`docs/agent-brief.md`**: how an agent works an issue, testing, delegation, review and merge.
3. **Only the `docs/` file `CLAUDE.md`'s table names for your area**, and the matching skill in `.claude/skills/`
   (`ui-work`, `game-module`, `data-change`).
4. The **issue body and comments**, and the milestone description if the issue is on one.
5. When choosing *what* to work next: **`docs/TASKS.md`** (roadmap and queue).

## Non-negotiables (full text in `CLAUDE.md`)

- Address the owner as **Heyhey**.
- **No publisher data in the repo**: no rules text, stats, points, card scans, art, logos or trademarks. Tests use
  invented units.
- Nothing is invented or fixed silently: a doubt goes to `docs/TASKS.md` "To verify" and an issue, then code.
- Paid calls only on Heyhey's ask in the chat.
- Tokens only, never raw hex; every UI string in `src/i18n/en.ts` and `de.ts`; Dexie upgrades additive only.
- Branch from `origin/main`; never force-push or reset someone else's branch; never push to `main`.

## How to pick work (low-hanging first)

Follow the roadmap phase order in `docs/TASKS.md`. Prefer an open issue with no unmet "depends on" and no missing rules
data to invent. An issue that needs publisher data the owner has not entered waits.
