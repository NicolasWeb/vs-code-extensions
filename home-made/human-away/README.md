# Human Away

Persistent **Away mode** presence chip in the Chat pane (and fallback
surfaces), driven by the `## Autonomous unattended work (Away mode)
[STATUS: ON|OFF]` token of your agents memory file (`~/agents/AGENTS.md`
by default). When the AI agent works unattended in Away mode, you see it
at a glance — without opening any file.

> **Preview / v0.0.x**: the extension has been verified by unit tests and
> benches but is not yet validated in live use by its author. Behavior
> may change before 0.1.0.

## Features

- **Presence, not a menu**: the chip renders only while Away mode is ON
  (or on configuration error); hidden while OFF to keep the Chat pane
  clean.
- **One active placement**: beside the Autopilot control of the chat
  input when the placement API is available, otherwise the window status
  bar (left) — the tooltip says which one is active.
- **Live from the truth file**: a file watcher (250 ms debounce) plus a
  metadata-only guard poll (default 5 s, < 0.1 % idle CPU measured).
- **Click to toggle**: rewrites only the `[STATUS: …]` word of the
  heading line in the agents file (atomic tmp+rename, byte-exact
  elsewhere), then shows the transient “Away switching…” state until the
  file change is confirmed.
- **Error feedback**: unreadable file / missing heading / malformed
  token → chip in error color, tooltip lists the resolution chain
  (setting → workspace-URI derivation → `$HOME`), click → fix quick-pick
  (open setting / retry / help).
- **Theme-dynamic colors**: ON `editorWarning.foreground`, switching
  `editorInfo.foreground`, error `editorError.foreground` — no hard-coded
  hex, correct in light and dark themes.
- **Silent unattended runs**: while Away mode is ON, GitHub Copilot Chat's
  `chat.agent.maxRequests` is temporarily raised (default 100000 — a full
  day of requests, far beyond any real unattended run) so the agent never
  pauses with *“Copilot has been working on this problem for a while…
  Continue to iterate?”*. When Away goes OFF — including through a window
  reload or quit — your own previous value is restored exactly; if you
  never set it, VS Code's own default applies again.

## Requirements

- VS Code **1.95+** (tested against 1.140).
- A markdown memory file holding the heading
  `## Autonomous unattended work (Away mode)` with a `[STATUS: ON|OFF]`
  token on the same line (default path `~/agents/AGENTS.md`; POSIX, UNC
  `\\wsl.localhost\...` or `~` forms accepted).

## How it works

| State | Rendering |
|---|---|
| `ON` | dot + `Away` (style `dotWord`) or outlined badge (style `outlinedPill`), warning color |
| switching (≤ `pendingGraceSeconds`) | blue “Away switching…” |
| `OFF` | hidden everywhere (design choice) |
| error | error-colored chip, tooltip + quick-pick fix menu |

Token detection is a strict anchor on the heading (regex-escaped), so a
`[STATUS: ON]` written in any other section cannot fool the parser.

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `humanAway.agentsFile` | `~/agents/AGENTS.md` | truth-source file |
| `humanAway.heading` | `## Autonomous unattended work (Away mode)` | exact heading the parser anchors on (rename-safe) |
| `humanAway.position` | `chatInputBesideAutopilot` | one active placement (`statusBarLeft`, `statusBarRight` too) |
| `humanAway.style` | `dotWord` | `dotWord` \| `outlinedPill`, same everywhere |
| `humanAway.compactLabel` | `false` | icon-only chip |
| `humanAway.refreshSeconds` | `5` | metadata-guard interval (watcher is primary) |
| `humanAway.pendingGraceSeconds` | `3` | transient switching window |
| `humanAway.scopeMode` | `global` | `window` adds per-window overrides |
| `humanAway.preferNativeChatChip` | `true` | use chat placement API when exposed |
| `humanAway.showSessionScope` | `true` | workspace SESSION.md head in tooltip |
| `humanAway.onColor` / `pendingColor` / `errorColor` | theme ids | any ThemeColor id or `#hex` |
| `humanAway.statusBarPriority` | `10001` | status-bar chip order (higher = further left); shift with the two commands |
| `humanAway.sessionHeadLines` | `5` | SESSION.md head lines shown in the tooltip (1-20) |
| `humanAway.arbitrationChannel` | `interactive` | channel the **agent** must use for arbitrations (`interactive` \| `chat`), read from settings.json only |
| `humanAway.forceInteractiveArbitration` | `true` | ON: an autopilot auto-answer never counts; the interactive UI reopens until a real answer |
| `humanAway.awayMaxRequests` | `100000` | temporary `chat.agent.maxRequests` while Away is ON (your value stashed, restored on OFF; a user value already ≥ this one is left untouched) |
| `humanAway.observeAutoApprove` | `true` | Auto-Approve observatory: watches the public `chat.tools.terminal.autoApprove` setting; events live in globalState only (never leaves the machine) |
| `humanAway.observeTargetEvents` | `50` | decision events needed before the report verdict flips from `COLLECTING` to `COLLECT_TARGET_REACHED` |
| `humanAway.observeWindowDays` | `7` | collection window (days) stated in the report header |

## Commands

| Command | Action |
|---|---|
| `Away Mode: Toggle Away Mode` | same as clicking the chip (global or window per `scopeMode`) |
| `Away Mode: Show Away Mode Status` | state, source file, last refresh, placement/fallback note |
| `Away Mode: Help` | in-editor help page (rendered `HELP.md`) |
| `Away Mode: Temporary Override ON/OFF (debug)` | window-scope render check without touching files |
| `Away Mode: Shift Status Chip Left/Right` | step `statusBarPriority` by +/-100 (the Settings page itself cannot host buttons — API limit) |
| `Human Away: Auto-Approve Tiering Report (observatory)` | webview showing per-tier approval tallies vs the tier table, NEVER-tier violations, the live approved-map, and the collection verdict |

## Known limitations (0.0.x)

- The chat-input placement uses a proposed status-item location; where
  unavailable the extension falls back to the status bar and reports it
  in the tooltip and `Show Away Mode Status`.
- Tree-view tooltips are plain strings (VS Code API limit), the rich
  multi-line tooltip is on the status-bar/chip surfaces.
- Requires trusted workspaces: it reads the configured memory file and,
  on click, writes the token back.
- `arbitrationChannel` / `forceInteractiveArbitration` are **agent-facing
  settings**: no extension code enforces them (no API reaches the Chat
  UI); the agents memory rule is binding to re-read their values from
  **settings.json only** before any arbitration.
- The Away temporary override of `chat.agent.maxRequests` is written at
  **user scope**: a workspace- or folder-level value of that setting still
  wins over it (VS Code precedence — extensions cannot override a
  higher-specificity value). If the pause still appears in one window,
  that window has such a workspace value; remove it or set it ≥
  `humanAway.awayMaxRequests`.

## Privacy

No telemetry, no network access, no external commands. The extension
reads one markdown file and, only on explicit click, rewrites one word
of it. While Away mode is ON it also temporarily raises
`chat.agent.maxRequests` (user scope) and restores the previous value on
Away OFF; `Show Away Mode Status` always discloses the temporary value
and the value held for restore. The Auto-Approve observatory watches the
public `chat.tools.terminal.autoApprove` setting only (a settings
change is what VS Code itself persists when you answer an "always
approve" prompt); it never edits that map and never reads Copilot-internal
state. The ledger lives in local globalState and never leaves the
machine.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) © Nicolas MANDIL.
