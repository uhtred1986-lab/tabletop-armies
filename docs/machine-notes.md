# Machine notes: Heyhey's PC and phone

*Moved out of `docs/best-practices.md` §6 on 6 Oct 2026, so the working agreement every session loads stays
short. These only matter on Heyhey's Windows PC or his Samsung phone.*

- PowerShell 5.1 scripts must be pure ASCII (one em dash breaks the parse elsewhere).
- A Node rewrite can flip CRLF/LF and diff a whole file: check `git diff --ignore-cr-at-eol`.
- AVG HTTPS scanning breaks Node TLS locally: `NODE_USE_SYSTEM_CA=1`. (The AVG certificate exists only on the PC;
  cloud sessions don't need `NODE_EXTRA_CA_CERTS`.)
- Samsung forced dark repaints images: `/p` uses plain-CSS frames; only the phone confirms.
- Git Bash: pass routes with `MSYS_NO_PATHCONV=1` (for example `MSYS_NO_PATHCONV=1 npm run shots -- /campaign`),
  or `/campaign` becomes `C:/Program Files/Git/campaign`.
- To use the Neon MCP on the PC the same way as in the cloud, set `NEON_API_KEY` as a Windows user environment
  variable (the value from `.env.local`; `setx NEON_API_KEY "<value>"`, then restart the terminal). The committed
  `.mcp.json` reads it. Don't add a second user-scope `neon` server with OAuth: the project entry would shadow it.
- The Vercel MCP lives on the PC only (`claude mcp add --transport http --scope user vercel https://mcp.vercel.com`,
  then `/mcp` to sign in as Heyhey, team `gullet-cove`). Its sign-in needs a browser, so cloud sessions don't have it.
