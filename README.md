# ADR Explorer

Browse, analyze, and tidy your Architecture Decision Records in a graph + timeline view. Two ways to run it:

- **`npx adr-explorer`** — local web app, opens in your default browser. No editor required.
- **VS Code extension** — same UI, hosted in a webview tab.

Both targets ship from the same repo and share the same UI bundle.

[![VS Code Marketplace version](https://vsmarketplacebadges.dev/version-short/reza-janm.adr-explorer.svg?label=VS%20Code%20Marketplace&style=for-the-badge&color=007ACC&logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=reza-janm.adr-explorer)
[![Installs](https://vsmarketplacebadges.dev/installs-short/reza-janm.adr-explorer.svg?style=for-the-badge&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=reza-janm.adr-explorer)

> **Install the VS Code extension:** [marketplace.visualstudio.com/items?itemName=reza-janm.adr-explorer](https://marketplace.visualstudio.com/items?itemName=reza-janm.adr-explorer)

![ADR Explorer — feature overview](https://raw.githubusercontent.com/janmohammadi/adr-explorer/main/docs/screenshots/adr-explorer-review.gif)

---

## Features

- **Force-directed graph** of decisions with `supersedes` / `amends` / `relates-to` edges.
- **Timeline panel** sorted by date, with status, review, and confidence badges.
- **Health dashboard** — score (A–F), stale decisions, orphans, supersession chains, zombie decisions, missing deciders.
- **Lifecycle analytics** — velocity, status-over-time, decision debt, hotspots, ownership/bus factor, confidence distribution.
- **AI Insights** *(opt-in)* — Claude reviews the whole graph for contradictions, missing relations, and staleness.
- **AI Distill** *(opt-in)* — Claude flags filler, redundant sections, and over-detailed alternatives in individual ADRs, with one-click apply.
- **Live file watching** — edits on disk show up immediately.

### Graph view

Group decisions by tag, status, or decider to see clusters at a glance:

![Graph grouping](https://raw.githubusercontent.com/janmohammadi/adr-explorer/main/docs/screenshots/groups.png)

Trace supersession chains to understand how a decision evolved:

![Supersession chains](https://raw.githubusercontent.com/janmohammadi/adr-explorer/main/docs/screenshots/chains.png)

### Health dashboard

Score the corpus (A–F) and surface stale, orphan, zombie, and incomplete decisions:

![Health dashboard](https://raw.githubusercontent.com/janmohammadi/adr-explorer/main/docs/screenshots/adr-health.png)

### Lifecycle analytics

Velocity, status-over-time, and decision debt:

![Lifecycle overview](https://raw.githubusercontent.com/janmohammadi/adr-explorer/main/docs/screenshots/adr-lifecycle-overview.png)

Hotspots by area / tag:

![Lifecycle by area](https://raw.githubusercontent.com/janmohammadi/adr-explorer/main/docs/screenshots/adr-lifecycle-areas.png)

Ownership and bus-factor by decider:

![Lifecycle by people](https://raw.githubusercontent.com/janmohammadi/adr-explorer/main/docs/screenshots/adr-lifecycle-people.png)

### AI Distill

Claude flags filler and over-detail per ADR, with one-click apply:

![AI Distill — review](https://raw.githubusercontent.com/janmohammadi/adr-explorer/main/docs/screenshots/distill.png)

![AI Distill — applied result](https://raw.githubusercontent.com/janmohammadi/adr-explorer/main/docs/screenshots/distill-result.png)

---

## Authoring ADRs with deep-adr

ADR Explorer reads and audits an ADR corpus. It doesn't write the decisions for you. For that, use its companion: **[deep-adr](https://github.com/janmohammadi/deep-adr)** — four coding-agent skills (`adr-discovery`, `draft-adr`, `adr-critique`, `c4-model`) that co-think each decision with you and push back on weak reasoning. Works with Claude Code, Cursor, OpenCode, GitHub Copilot, and other agents supported by the [`skills`](https://github.com/vercel-labs/skills) CLI.

```text
deep-adr (discover + draft + critique + C4)  →  *.md on disk  →  ADR Explorer (visualize + audit + distill)
```

The two cover opposite halves of the ADR lifecycle:

| | deep-adr | ADR Explorer |
|---|---|---|
| When | While authoring decisions | After many exist |
| Mode | Discover + co-author + critique + model | Visual audit + distill |
| Surface | Coding-agent skills (Claude Code, Cursor, Copilot, …) | Browser / VS Code webview |

Install the skills once and they'll be available next time you ask your coding agent to discover, draft, critique, or model an ADR. See the [deep-adr README](https://github.com/janmohammadi/deep-adr#install) for setup.

---

## Quick start (npx, no VS Code required)

From the directory containing your ADRs:

```bash
npx adr-explorer
```

That's it. A browser tab opens at `http://127.0.0.1:<port>/?token=…` showing the explorer.

By default, ADRs are discovered under any of:

- `**/adr/*.md`
- `**/docs/adr/*.md`
- `**/docs/decisions/*.md`
- `**/docs/architecture/decisions/*.md`

If your ADRs live elsewhere, point `--root` at the right folder:

```bash
npx adr-explorer --root path/to/decisions
```

### Enabling AI features

Distill and Insights require an Anthropic API key (BYOK — calls go directly from your machine to Anthropic, nothing else sees them):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npx adr-explorer --with-ai
```

Without `--with-ai`, the AI buttons are hidden and the tool runs as a viewer/analyzer.

### CLI flags

| Flag | Default | Effect |
|---|---|---|
| `--root <dir>` | `cwd` | Directory to scan for ADRs |
| `--with-ai` | off | Enable Distill + Insights (requires `ANTHROPIC_API_KEY`) |
| `--read-only` | off | Suggestions are visible but Apply is disabled — files cannot be modified |
| `--port <n>` | random | Bind to a specific port |
| `--host <addr>` | `127.0.0.1` | Bind address. **Don't** set this to `0.0.0.0` on untrusted networks |
| `--no-open` | opens | Don't auto-open the browser; just print the URL |
| `--help`, `-h` | — | Show help |
| `--version`, `-v` | — | Print package version |

### Security model

- Bound to `127.0.0.1` by default.
- A random per-session bearer token gates both HTTP and WebSocket; the URL printed in the terminal contains it.
- Apply Distill writes to local files via Node `fs`. Pass `--read-only` to disable that path entirely.

---

## Quick start (VS Code extension)

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=reza-janm.adr-explorer) (or `vsce package` + install locally).
2. Open a folder containing ADRs.
3. Click the **ADR Explorer** icon in the Activity Bar (left sidebar) and hit *Open ADR Explorer*, or run `ADR Explorer: Open` from the command palette.

The VS Code path uses the **GitHub Copilot Language Model API** (Claude via Copilot), so no API key is needed if you have Copilot. The npx path uses the Anthropic API directly.

---

## ADR file format

Standard markdown with YAML frontmatter. Filenames must start with a number (e.g. `0001-use-rest-for-public-api.md`).

```markdown
---
title: "Use REST for the public API"
status: accepted          # proposed | accepted | deprecated | superseded
date: 2025-01-15
deciders: ["Alice", "Bob"]
supersedes: []            # list of ADR numbers/IDs
amends: []
relates-to:
  - id: 0003
    reason: "Builds on the auth model"
tags: ["api", "backend"]
review-by: 2026-01-15     # optional
expires: 2027-01-15       # optional
confidence: high          # optional: high | medium | low
---

# Use REST for the public API

## Context
...

## Decision
...

## Consequences
...
```

The frontmatter parser is lenient — only `status` defaults to `proposed` if missing or invalid, and `date` defaults to today. ADR IDs are derived from the leading number in the filename and zero-padded to 4 digits (`ADR-0001`).

---

## Development

```bash
git clone https://github.com/janmohammadi/adr-explorer
cd adr-vs-code
npm install
npm run build           # produces dist/{extension,explorer,cli,host-shim}.js
npm run watch           # rebuild on change
npm run lint            # tsc --noEmit
node dist/cli.js --root test-fixtures   # smoke test the CLI
```

### Repo layout

```
src/
  core/              # host-neutral: types, parser, repository, analyzers, message router, interfaces
  adapters/
    vscode/          # vscode.lm / Webview / DiagnosticCollection bindings
    node/            # @anthropic-ai/sdk + ws + chokidar + fast-glob bindings
  cli/               # CLI entry, Express + ws server, browser launcher
media/explorer/      # webview UI (D3 force graph, charts, panels)
dist/                # bundled output (extension.js, explorer.js, cli.js, host-shim.js)
test/                # validator tests
test-fixtures/       # example ADRs used for smoke tests
```

The `core/` layer has zero `vscode` imports and runs identically inside the extension and the CLI. The two `adapters/*` directories implement three interfaces — `LMProvider`, `AdrFileSystem`, `Host` — that the message router consumes.

### Building both targets

`esbuild.js` produces four bundles in one pass:

| Bundle | Source | Target |
|---|---|---|
| `dist/extension.js` | `src/adapters/vscode/extension.ts` | Node CJS, vscode external |
| `dist/cli.js` | `src/cli/index.ts` | Node CJS, shebang, vscode external |
| `dist/explorer.js` | `media/explorer/explorer.js` | Browser IIFE |
| `dist/host-shim.js` | `media/explorer/host-shim.js` | Browser IIFE (CLI lane only) |

---

## License

MIT — see [LICENSE](LICENSE).
