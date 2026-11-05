# Cross-repo working habits

Distilled from sessions in gullet-cove-dm, trading-card-management and wohnungsubergabe; copied into Muster on
5 Nov 2026 (Neon and Vercel parts restored the same day, when Muster moved onto Gullet Cove's platform). Each repo's `CLAUDE.md` is the authority for
that repo. In this repo: safety and the IP line in `CLAUDE.md`; testing, delegation, screens and merging in
`docs/agent-brief.md`; the orchestrator rule in `AGENTS.md`.

## 1. Before you touch anything
- **Verify where you are.** Other sessions share the checkout and switch branches under you: run
  `git branch --show-current` and `git rev-parse --show-toplevel` right before every commit. Stage by explicit path,
  never `git add -A`: the tree may carry other sessions' work.
- **Check how far behind `main` you are** (`git rev-list --count HEAD..origin/main`) before debugging a "missing" thing:
  every merge to `main` migrates the one production database, so a stale branch can break at runtime.
- **Never `npm install` in a shared checkout**; use `npm ci`. A worktree needs a real `node_modules` copy (Turbopack
  rejects junctions and symlinks) and a copied `.env.local`.

## 2. Secrets and money
- Never echo a secret value: print names and ok/FAIL only. Never put one in a committed file or a PR.
- Paid calls run only on Heyhey's ask in the chat, not second-hand from a handover; subscription calls count too.

## 3. Deploys
- A failed deploy with an empty Builds list is `db:migrate` failing, not your code; redeploy an older commit as the control.
- **„Redeploy“ rebuilds that deployment's own commit, not the newest `main`.** Check the build log's `Commit:` line; to
  ship the newest `main`, use „Create Deployment“ on `main` or land a new commit on it.
- **Never run `vercel build` or a bare `vercel link`** in an unlinked folder: it creates a project. Link with
  `--project tabletop-armies`.
- The Vercel free plan has a daily deploy cap: batch merges.

## 4. How to work
- **Ask the clarifying questions up front** (Heyhey prefers it), once, then build. Give a recommendation, not a survey
  of options.
- **A ruling given in chat is stored first** (in `docs/TASKS.md`, "Decisions"); the code change waits to be asked for.
- **Screens must not crowd.** Offer switchable choices instead of asking.
- **Talking to other sessions:** `ListAgents`, then `SendMessage` by exact name. Say which branch and PR you own, what
  you will not touch, and any migration you carry (only one may be in flight).

## 5. Gotchas that cost hours
- The Browser pane never reveals streamed content: verify with `curl`, scripts and tests.
- PC-only gotchas (PowerShell, CRLF, AVG): `docs/machine-notes.md`.
- Cloud sessions can't reach Neon on 5432: set `DB_DRIVER=neon-ws` (`docs/architecture/platform.md`).
- Process and stale-build habits: `docs/agent-brief.md`, "Running things".
