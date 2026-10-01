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

### Known issues
- Chat-input placement falls back to status bar on builds without the
  status-item chat location (reported in tooltip and Show Status).
