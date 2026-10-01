# Away Mode Indicator — Help

The indicator is **presence, not a status menu**: it shows Away mode only
while it is ON (or on error). While OFF it hides itself; it does not render
"OFF", to avoid cluttering the Chat pane.

## Where it lives
- Default: a chip beside the Autopilot control in the Chat view.
- If that placement API is unavailable in this VS Code build, the extension
  falls back to the window **status bar (left)** and says so in its tooltip;
  a minimal row also appears in the "Away Mode Indicator" explorer view.
- Choose another placement in `awayModeIndicator.position`.

## Click behaviour
- Click while ON (or "Away switching…"): toggle OFF.
- Click while in ERROR: open the fix menu (open setting / retry / help).
- While OFF there is nothing to click (the indicator is hidden); turn it on
  by editing the STATUS token in ~/agents/AGENTS.md.

## Refresh
- A file watcher fires on every save of the agents file (a small 250 ms
  debounce coalesces bursts; no full re-parse until mtime/size actually
  change).
- A periodic guard re-checks file metadata only, every
  `awayModeIndicator.refreshSeconds` seconds.

## Settings
- `awayModeIndicator.agentsFile`: path to the memory file holding the
  STATUS token. Accepts POSIX, UNC or `~` forms. Default `~/agents/AGENTS.md`.
- `awayModeIndicator.position`: `chatInputBesideAutopilot` (default),
  `inputTop`, `statusBarLeft`, `statusBarRight`.
- `awayModeIndicator.style`: `dotWord` (default) or `outlinedPill`.
- `awayModeIndicator.compactLabel`: icon-only rendering.
- `awayModeIndicator.scopeMode`: `global` (default, file is truth) or
  `window` (per-window session override).
- `awayModeIndicator.pendingGraceSeconds`: transient "switching…" state
  window after a toggle (default 3).
- `awayModeIndicator.refreshSeconds`: metadata guard interval (default 5).
- `awayModeIndicator.showSessionScope`: first lines of the workspace
  SESSION.md in the tooltip.
- `awayModeIndicator.preferNativeChatChip`: use the Chat placement API when
  available.
- `awayModeIndicator.onColor` / `pendingColor` / `errorColor`: theme color
  ids. Defaults: editorWarning.foreground / editorInfo.foreground /
  editorError.foreground (light+dark safe, dynamic with theme).
- `awayModeIndicator.heading`: exact heading line anchored by the parser
  (update here if the rule is ever renamed; the [STATUS:] token must stay
  on that line).
- `awayModeIndicator.statusBarPriority`: order of the fallback status-bar
  chip (higher = further left). Use "Shift Status Chip Left/Right"
  commands for stepwise +-100 moves.
- `awayModeIndicator.sessionHeadLines`: SESSION.md lines in the tooltip.
- `awayModeIndicator.arbitrationChannel` + `forceInteractiveArbitration`:
  agent-facing arbitration policy stored in settings.json (never read
  from AGENTS.md at run time); the interactive channel is the GitHub
  Copilot Chat question UI above the Chat input, and with force ON an
  autopilot auto-answer never settles an arbitration.

## Errors
The chip shows in the error color when the truth is unreadable: file
missing, unreadable, heading absent, or STATUS token malformed. The tooltip
lists the resolution chain tried; click for the fix menu.
