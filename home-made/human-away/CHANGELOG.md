# Changelog

All notable changes to the Human Away extension (ex Away Mode Indicator,
renamed 2026-10-02 at 0.1.0) are documented here. Format follows Keep a
Changelog; versions are SEMVER-ready but the first tag is a preview release.

## [Unreleased]

### Changed
- Make the V5 outlined badge the default `humanAway.style`; explicit user
  settings continue to override the default.

## [0.2.0] - 2026-10-02

### Added
- **Auto-Approve observatory** (`humanAway.observeAutoApprove`,
  default on): `src/collector.js` watches the PUBLIC local setting
  `chat.tools.terminal.autoApprove` via `onDidChangeConfiguration`
  and records approve/revoke/baseline events in a session ledger
  persisted in globalState (FIFO, cap 5000, never leaves the
  machine).
- New command `Human Away: Auto-Approve Tiering Report`: a webview
  that folds the ledger into per-tier tallies against the plan
  §1 tier table, lists any NEVER-tier approvals as violations, and
  closes on a verdict token `COLLECTING` or
  `COLLECT_TARGET_REACHED` vs the target settings.
- Public tier table mirrored from PLAN_AUTOAPPROVE_TUNING §1
  (T0 read-only inspection incl. the already-approved
  `code --diff`, T1 local execution incl. in-place `sed -i`,
  T2 commits, T3 push/gh, T4 shared hardware,
  T5 destructive, UNTIERED).
- Settings: `humanAway.observeTargetEvents` (50),
  `humanAway.observeWindowDays` (7) — drive the verdict
  threshold + header copy.
- Test: `test/collector_unit.js`, 21 assertions covering tiering,
  NEVER-lists, snapshot diffs, ledger away-context,
  aggregation and verdict tokens. Token `TIER_UNIT_OK`.

### Notes
- The observatory does not edit the approval map or read Copilot
  internals — §12 non-goals respected (no network, no deps,
  no telemetry). Re-edits (step 4) remain user-gated at window end.

## [0.0.1] - 2026-10-01

### Added
- First preview build: Away-mode chip driven by the `[STATUS: ON|OFF]`
  token of the agents memory file (`awayModeIndicator.agentsFile`).
- Surfaces: chat-input placement when available, status-bar fallback,
  Chat-view tree row + minimal activity-bar view (`when` context gate).
- States: ON (warning color), switching (info color, `pendingGraceSeconds`
  window), hidden while OFF, error (error color + resolution-chain tooltip
  + fix quick-pick).
- Toggle rewrites only the token word (atomic tmp+rename, byte-exact
  elsewhere); file watcher + stat-only poll guard under a 0.1 % idle-CPU
  budget (measured 0.018 %, parse 4.35 µs mean, 1 000 iterations).
- 11 settings (position, style dotWord/outlinedPill, compactLabel,
  refreshSeconds, pendingGraceSeconds, scopeMode global/window,
  preferNativeChatChip, showSessionScope, onColor/pendingColor/errorColor).
- Commands: Toggle, Show Status, Help, window overrides (debug).
- Unit tests (parser 10 assertions, WSL path candidate derivation 3 cases)
  and performance benches under `test/`; `HELP.md` rendered in a webview.
- Marketplace-ready package.json: icon, repository, bugs, homepage,
  keywords, `preview: true`, capabilities (no virtual/untrusted support).

### Variabilisation pass (same 0.0.1, user-reviewed item by item)
- Setting `heading` (parser anchor rename-safe) + `statusBarPriority`
  (+ Shift Status Chip Left/Right commands, +-100) + `sessionHeadLines`
  (1-20).
- Settings `arbitrationChannel` (interactive|chat) and
  `forceInteractiveArbitration` (default ON): agent-facing arbitration
  policy, executed by the agents memory rule reading settings.json only.
- Named constants (WATCH_DEBOUNCE_MS/MIN_POLL_MS/CONFIRM_DELAY_CAP_MS/
  BAR_SHIFT_STEP/FOREGROUND_SUFFIX); icon ids centralised in ICONS;
  single auditStamp() for toggle reasons; consistent ERR_PREFIX; dead
  code removed (sessionScope, chatChip, HEADING import); test benches
  default to the home-based truth-file path; unit coverage 14 assertions
  incl. custom heading and stamp format; benches PERF_PARSE_OK 2.5 us /
  PERF_IDLE_OK 0.012 %.

## [0.1.0] - 2026-10-02

### Changed — BREAKING: renamed to "Human Away" (user order)
- Extension id `human-away`, prefix `awayModeIndicator.*` ->
  `humanAway.*` (settings, commands, view ids). Previously stored
  `awayModeIndicator.*` personal values do NOT carry over — re-set
  them once if you had any.
- Folder `away-mode-indicator` -> `human-away`; uninstall the old
  extension once so chip and tree row never double-render.

### Removed (validated legacy review)
- Dead `inputTop` position value (never rendered differently from
  `chatInputBesideAutopilot`); dead internal `triedPaths` field;
  misplaced parser docstring relocated to `parseAwayToken`.

## [0.0.2] - 2026-10-02

### Added — Away-mode silent run (user request 2026-10-02)
- Setting `awayMaxRequests` (default 100000 ≈ a full day of tool requests,
  no stop-and-confirm for 24 h): while Away is ON, the extension
  temporarily raises GitHub Copilot Chat's `chat.agent.maxRequests` so a
  long unattended run never pauses with "Copilot has been working on this
  problem for a while… Continue to iterate?".
- Stash/restore in globalState: the user's own value is held while Away
  is ON and restored exactly on Away OFF — also after a window reload or
  quit (the surviving stash is restored by the first render of the next
  activation when the token is OFF; deactivate is the best-effort extra);
  a never-set value restores VS Code's own default. The temporary value
  is written at user scope: a workspace-level `chat.agent.maxRequests`
  (higher precedence) still wins, documented in README/HELP.
- A user value already >= the temporary one is left untouched (no stash,
  no write). `Show Away Mode Status` discloses the temporary value and
  the held restore value.
- New unit mirror test `test/maxrequests_unit.js` (8 cases:
  stash/apply/idempotence/restore exact/unset→default/already-high/
  raise-setting/crash-surviving stash) — MAXREQ_UNIT_OK.

### Known issues
- Chat-input placement falls back to status bar on builds without the
  status-item chat location (reported in tooltip and Show Status).
- The Settings page cannot host buttons (VS Code API); the shift
  commands are the equivalent control.
