# Human Away — Help

The indicator renders **Human Away Mode** as one chip with two labels:
`Human : Here` when the mode is ON (a human is here, the AI is attended)
and `Human : Away` when it is OFF (the AI works unattended). Both states
are always visible, so a click is always available.

## Where it lives
- Default: a chip beside the Autopilot control in the Chat view.
- If that placement API is unavailable in this VS Code build, the extension
  falls back to the window **status bar (left)** and says so in its tooltip;
  a minimal row also appears in the "Human Away Mode" explorer view.
- Choose another placement in `humanAway.position`.

## Click behaviour
- Click on `Human : Here` (or on `Human : switching…`): switch OFF.
- Click on `Human : Away`: switch ON.
- Click while in ERROR: open the fix menu (open setting / retry / help).
- A click writes ~/agents/human_away_mode directly on disk (atomic
  tmp+rename) — the state word and the shared `key value` records together —
  then applies the coordinated `chat.agent.maxRequests` action; git never sees
  the change because the file is gitignored.

## Refresh
- A file watcher fires on every save of the conf file (a small 250 ms
  debounce coalesces bursts; no full re-parse until mtime/size actually
  change).
- A periodic guard re-checks file metadata only, every
  `humanAway.refreshSeconds` seconds.

## Settings
- `humanAway.configFile`: path to the Human Away Mode conf file (one
  `ON`/`OFF` word). Accepts POSIX, UNC or `~` forms. Default
  `~/agents/human_away_mode` (gitignored; an absent file counts as OFF).
- `humanAway.position`: `chatInputBesideAutopilot` (default),
  `statusBarLeft`, `statusBarRight`.
- `humanAway.style`: `outlinedPill` (default, V5) or `dotWord` (V2).
- `humanAway.compactLabel`: icon-only rendering.
- `humanAway.scopeMode`: `global` (default, file is truth) or
  `window` (per-window session override).
- `humanAway.pendingGraceSeconds`: transient "switching…" state
  window after a toggle (default 3).
- `humanAway.refreshSeconds`: metadata guard interval (default 5).
- `humanAway.showSessionScope`: first lines of the workspace
  SESSION.md in the tooltip.
- `humanAway.preferNativeChatChip`: use the Chat placement API when
  available.
- `humanAway.onColor` / `pendingColor` / `errorColor`: theme color
  ids. Defaults: editorWarning.foreground / editorInfo.foreground /
  editorError.foreground (light+dark safe, dynamic with theme).
- `humanAway.statusBarPriority`: order of the fallback status-bar
  chip (higher = further left). Use "Shift Status Chip Left/Right"
  commands for stepwise +-100 moves.
- `humanAway.sessionHeadLines`: SESSION.md lines in the tooltip.
- `humanAway.arbitrationChannel` + `forceInteractiveArbitration`:
  agent-facing arbitration policy stored in settings.json (never read
  from AGENTS.md at run time); the interactive channel is the GitHub
  Copilot Chat question UI above the Chat input, and with force ON an
  autopilot auto-answer never settles an arbitration.
- `humanAway.awayMaxRequests` (default 100000): while Human Away Mode
  is ON, the extension sets GitHub Copilot Chat's
  `chat.agent.maxRequests` to this value, so long unattended runs never
  stop with "Copilot has been working on this problem for a while…
  Continue to iterate?" (100000 requests ≈ a full day at ~20 s each — no
  interruption for 24 h). Your previous value is kept aside and restored
  exactly when Away goes OFF (also on window reload/quit); if you never
  set it, VS Code's own default (200) comes back. If your own value is
  already ≥ this setting, it is left untouched. Ownership of the override is
  recorded in the conf file as `key value` records shared with the agent
  (`mrOwner` = `extension`|`agent`, `prevMaxRequests` = the value held before
  the override or `default`, `awayMaxRequests` = the target): while the record
  says `agent` the extension never touches the setting; while it says
  `extension` the value is ours (one that merely equals the target is taken
  over, never written twice); a `prevMaxRequests` left by the agent is adopted,
  so the earlier value is never lost; and as soon as the live value no longer
  equals the target the extension releases its own record and never overwrites
  the other writer. Note: the
  temporary
  value is written at user scope, so a workspace-level
  `chat.agent.maxRequests` still takes precedence — keep the setting at
  user level for the silence to apply. What the extension currently
  holds is always shown by "Show Human Away Mode Status".
- `humanAway.observeAutoApprove` (default true): a small passive
  observatory that watches the public
  `chat.tools.terminal.autoApprove` setting (the one VS Code writes
  when you answer an "always approve" terminal prompt). Each change is
  stored in a local session ledger (globalState, never uploaded) and
  folded into a tiered report (T0 read-only → T5 destructive, NEVER
  tiers flagged if they ever see an approval). It never edits the map
  itself. Use "Human Away: Auto-Approve Tiering Report" to see the
  tallies and whether the target (~50 events) is reached. Settings:
  `humanAway.observeTargetEvents` (default 50) and
  `humanAway.observeWindowDays` (default 7) shape the verdict line.

## Errors
The chip shows in the error color when the conf file is unreadable or its
content is neither `ON` nor `OFF`. A missing conf file is not an error: it
counts as OFF, and the first click creates it. The tooltip
lists the resolution chain tried; click for the fix menu.
