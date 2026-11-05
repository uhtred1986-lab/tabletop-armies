# Cross-repo working habits

Distilled from sessions in gullet-cove-dm, trading-card-management and wohnungsubergabe; copied into Muster on
5 Nov 2026 with the Gullet-only parts (Neon, Vercel deploys) removed. Each repo's `CLAUDE.md` is the authority for
that repo. In this repo: safety and the IP line in `CLAUDE.md`; testing, delegation, screens and merging in
`docs/agent-brief.md`; the orchestrator rule in `AGENTS.md`.

## 1. Before you touch anything
- **Verify where you are.** Other sessions share the checkout and switch branches under you: run
  `git branch --show-current` and `git rev-parse --show-toplevel` right before every commit. Stage by explicit path,
  never `git add -A`: the tree may carry other sessions' work.
- **Check how far behind `main` you are** (`git rev-list --count HEAD..origin/main`) before debugging a "missing" thing.
- **Never `npm install` in a shared checkout**; use `npm ci`. A worktree needs a real `node_modules` copy.

## 2. Secrets and money
- Never echo a secret value: print names and ok/FAIL only. Never put one in a committed file or a PR.
- Paid calls run only on Heyhey's ask in the chat, not second-hand from a handover; subscription calls count too.

## 3. How to work
- **Ask the clarifying questions up front** (Heyhey prefers it), once, then build. Give a recommendation, not a survey
  of options.
- **A ruling given in chat is stored first** (in `docs/TASKS.md`, "Decisions"); the code change waits to be asked for.
- **Screens must not crowd.** Offer switchable choices instead of asking.
- **Talking to other sessions:** `ListAgents`, then `SendMessage` by exact name. Say which branch and PR you own, what
  you will not touch, and any Dexie version bump you carry (only one may be in flight).

## 4. Gotchas that cost hours
- The Browser pane never reveals streamed content: verify with `curl`, scripts and tests.
- PC-only gotchas (PowerShell, CRLF, AVG): `docs/machine-notes.md`.
- Process and stale-build habits: `docs/agent-brief.md`, "Running things".
