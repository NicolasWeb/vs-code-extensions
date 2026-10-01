# Changelog

All notable changes to the Away Mode Indicator extension are documented
here. Format follows Keep a Changelog; versions are SEMVER-ready but the
first tag is a preview release.

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

### Known issues
- Chat-input placement falls back to status bar on builds without the
  status-item chat location (reported in tooltip and Show Status).
- The Settings page cannot host buttons (VS Code API); the shift
  commands are the equivalent control.
