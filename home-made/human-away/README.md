# Human Away Extension

**Human Away Mode** chip in the Chat pane (and fallback surfaces), driven
by the conf file `~/agents/human_away_mode` — one `ON`/`OFF` word that is
gitignored and rewritten directly on disk, so switching the mode never
touches a memory file and leaves nothing to commit. `ON` activates the mode
and its request-limit behavior; `OFF` deactivates it. The displayed labels are
the user-selected switch wording, not a sensor of actual human presence.

> Naming: the extension is referenced as **Human Away Extension**,
> **Human Away Ext** or **Human Away Ext.**; the state it renders is
> **Human Away Mode**.

> **Preview / v0.4.0**: the extension has been verified by unit tests and
> benches but is not yet validated in live use by its author. Behavior
> may change before 0.1.0.

## Features

- **One chip, two labels**: `Human : Here` while Human Away Mode is ON,
  `Human : Away` while it is OFF — always rendered, so one click is always
  within reach.
- **One active placement**: beside the Autopilot control of the chat
  input when the placement API is available, otherwise the window status
  bar (left) — the tooltip says which one is active.
- **Live from the truth file**: a file watcher (250 ms debounce) plus a
  metadata-only guard poll (default 5 s, < 0.1 % idle CPU measured).
- **Click to toggle**: rewrites the Human Away Mode conf file atomicly
  (tmp+rename: the new word plus a `#` audit line), then shows the
  transient “Human : switching…” state until the file change is confirmed.
  No memory file is touched, so a switch never shows up in a commit.
- **Error feedback**: unreadable file / content that is neither `ON` nor
  `OFF` → chip in error color, tooltip lists the resolution chain
  (setting → workspace-URI derivation → `$HOME`), click → fix quick-pick
  (open setting / retry / help).
- **Theme-dynamic colors**: ON `editorWarning.foreground`, switching
  `editorInfo.foreground`, error `editorError.foreground` — no hard-coded
  hex, correct in light and dark themes.
- **Silent unattended runs**: while Human Away Mode is ON, GitHub Copilot Chat's
  `chat.agent.maxRequests` is temporarily raised (default 100000 — a full
  day of requests, far beyond any real unattended run) so the agent never
  pauses with *“Copilot has been working on this problem for a while…
  Continue to iterate?”*. When Away goes OFF — including through a window
  reload or quit — your own previous value is restored exactly; if you
  never set it, VS Code's own default applies again. Ownership is recorded
  in the conf file itself as `key value` records shared with the agent
  (`mrOwner`, `prevMaxRequests`, `awayMaxRequests`): a record owned by `agent`
  is never stepped on (that is the non-concurrence), one owned by `extension`
  makes the raise idempotent, a `prevMaxRequests` the agent left is adopted so
  the earlier value is never lost, and when the live value no longer equals the
  target the extension releases its own record instead of overwriting the other
  writer.

## Requirements

- VS Code **1.95+** (tested against 1.140).
- GitHub Copilot Chat extension — the chat-input chip placement, the
  `chat.agent.maxRequests` unattended raise and the Auto-Approve
  observatory all target Copilot Chat surfaces and settings
  (`chat.agent.maxRequests`, `chat.tools.terminal.autoApprove`);
  without it the chip stays on the status bar and those three features
  remain inert.
- A Human Away Mode conf file holding a single
  `ON` or `OFF` word (an absent file counts as OFF; the first click creates
  it). Default path `~/agents/human_away_mode`, gitignored. POSIX, UNC
  `\\wsl.localhost\...` or `~` forms accepted).

## How it works

| State | Rendering |
|---|---|
| `ON` | `Human : Here` — dot + word (style `dotWord`) or outlined badge (style `outlinedPill`), warning color |
| switching (≤ `pendingGraceSeconds`) | blue `Human : switching…` |
| `OFF` | `Human : Away`, same shape in the neutral foreground color |
| error | error-colored chip, tooltip + quick-pick fix menu |

The parser reads the first non-comment word of the conf file and accepts
only `ON` and `OFF`; anything else is reported as an error, never guessed.

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `humanAway.configFile` | `~/agents/human_away_mode` | Human Away Mode conf file (gitignored, written directly on disk): the `ON`/`OFF` state word plus shared `key value` records |
| `humanAway.position` | `chatInputBesideAutopilot` | one active placement (`statusBarLeft`, `statusBarRight` too) |
| `humanAway.style` | `outlinedPill` | `outlinedPill` (V5) \| `dotWord` (V2), same everywhere |
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
| `humanAway.awayMaxRequests` | `100000` | `chat.agent.maxRequests` while Human Away Mode is ON: the extension owns the setting while its value matches this one (previous value stashed, restored on OFF) and releases ownership as soon as the value no longer matches; an `awayMaxRequests` conf record overrides it |
| `humanAway.observeAutoApprove` | `true` | Auto-Approve observatory: watches the public `chat.tools.terminal.autoApprove` setting; events live in globalState only (never leaves the machine) |
| `humanAway.observeTargetEvents` | `50` | decision events needed before the report verdict flips from `COLLECTING` to `COLLECT_TARGET_REACHED` |
| `humanAway.observeWindowDays` | `7` | collection window (days) stated in the report header |

## Commands

| Command | Action |
|---|---|
| `Toggle Human Away Mode` | same as clicking the chip (global or window per `scopeMode`) |
| `Show Human Away Mode Status` | state, conf file, last refresh, placement/fallback note |
| `Human Away: Help` | in-editor help page (rendered `HELP.md`) |
| `Human Away: Temporary Override ON/OFF (debug)` | window-scope render check without touching files |
| `Human Away: Shift Status Chip Left/Right` | step `statusBarPriority` by +/-100 (the Settings page itself cannot host buttons — API limit) |
| `Human Away: Auto-Approve Tiering Report (observatory)` | webview showing per-tier approval tallies vs the tier table, NEVER-tier violations, the live approved-map, and the collection verdict |

## Known limitations (0.4.0)

- The chat-input placement uses a proposed status-item location; where
  unavailable the extension falls back to the status bar and reports it
  in the tooltip and `Show Human Away Mode Status`.
- Tree-view tooltips are plain strings (VS Code API limit), the rich
  multi-line tooltip is on the status-bar/chip surfaces.
- Requires trusted workspaces: it reads the configured conf file and,
  on click, writes the conf file back.
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
reads one conf file and, only on explicit click, rewrites its state word and
the shared `key value` records of it. While Human Away Mode is ON it also
temporarily raises `chat.agent.maxRequests` (user scope) and restores the
previous value on Away OFF; `Show Human Away Mode Status` always discloses the
temporary value, the value held for restore and who owns the override. The
Auto-Approve observatory watches the
public `chat.tools.terminal.autoApprove` setting only (a settings
change is what VS Code itself persists when you answer an "always
approve" prompt); it never edits that map and never reads Copilot-internal
state. The ledger lives in local globalState and never leaves the
machine.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) © Nitro Nicola SOFT.
