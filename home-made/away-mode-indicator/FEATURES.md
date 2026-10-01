# FEATURES — away-mode-indicator (O-A) — rev 3 (2026-10-01 ~18:45)

Status: **DRAFT rev 2 — awaiting user validation** (build gate unchanged:
propose UI -> user chooses -> features file -> USER VALIDATES -> build).
Rev 2 folded the user's ~17:2x list; rev 3 folds the user's
~18:4x list (observatory out, theme-dynamic colors, click=palette command,
error-feedback options, refresh wording, scopeMode option).

Repo location: `vs-code-extensions/home-made/away-mode-indicator/` in the
ai-agents-md repo.

## 1 Purpose
Show, permanently and identically at two places, that the Away mode is
ON, with colors consistent with the VS Code design system in BOTH light
and dark themes, so the user sees the state while typing, before sending.
Sister feature (same extension, §9): an Auto-Approve observatory.

## 2 Source of truth and state (single, global)
- Truth source: the MASTER token line
  `## Autonomous unattended work (Away mode) [STATUS: ON|OFF ...]` inside
  the configured AGENTS file (§3).
- ONE state per user, NOT per workspace (analysis: the MASTER token is
  unique; SESSION.md is per-project PROGRESS, not rule state — it narrows
  what the run does, never whether Away is on). SESSION.md context is
  SURFACED per workspace in the tooltip (focused workspace's SESSION.md
  first 'State'/'Away' lines) instead of duplicating state. Open point
  for validation (§13.1) — user veto honored if he wants per-workspace.
- Refresh: fs.watch (when it fires) + stat-only poll bounded by
  `refreshSeconds` (§8): per tick only `stat()`; re-parse occurs only on
  mtime/size change. Token flip visible within one refresh interval.
  All user-facing strings say 'refresh' consistently: showStatus reads
  'last refreshed <age> ago, refresh interval Ns'; settings GUI titles:
  'Max refresh staleness (seconds)'; help doc uses the same word.
- User clicks the indicator to flip the mode (§4); the extension then
  performs the narrowest possible edit (§4 contract). Chat-side
  activation stays ONLY the exact keyword rule — the extension never
  infers state from anything but the token line.

## 3 Path resolution (WSL distro/version agnostic)
- Config `awayModeIndicator.agentsFile` accepts: POSIX path
  (`/home/nicolas/agents/AGENTS.md`), UNC path
  (`\\wsl.localhost\FedoraLinux-44\home\nicolas\agents\AGENTS.md`), or
  `~/agents/AGENTS.md`. Both spellings resolve to the same file — the
  same URI normalization is applied before watching/reading.
- Reliability chain at activation (first hit wins; each step logged in
  showHelp output):
  1. explicit setting;
  2. derive from the opened workspace: take a workspace folder URI; if
     its authority is `wsl.localhost` (or a hostname matching
     `wsl.localhost`/`<ip>` shapes), map its path with its OWN authority
     — no distro-name assumption ANYWHERE: the distro (Fedora44 today,
     any other tomorrow) simply comes from the URI. Same-window
     re-resolution follows the URI automatically;
  3. same host natively: `$HOME/agents/AGENTS.md` (extension host inside
     WSL — read `/etc/os-release` (NAME/VERSION_ID) only to ANNOTATE the
     tooltip; absence or change of Fedora/44 never affects resolution);
  4. failure => error state (§6), never silent.
- The Windows-side host reads UNC with the same fs APIs; a distro
  reinstall renaming the path is picked up by re-running step 2 against
  the live workspace URI (or one setting edit). Documented in HELP.

## 4 UI surfaces — IDENTICAL appearance at both places
- Surfaces: (a) the chip near the chat input — native chat-input status
  item (`OptionsLocation.Chat`) when the API exists (capability probe, no
  launch flag, silent fallback otherwise); and (b) the Chat-pane tree
  row (`awayModeIndicator.status`, first row, pinned top).
- IDENTICAL presentation rule: same codicon + same label + same color +
  same tooltip at both. Recommendation kept: LABEL the state —
  `$(circle-filled) Away mode ON` (icon alone = ambiguous vs the yellow
  Autopilot chip; text is accessible and self-explaining at a glance).
  Config `awayModeIndicator.compactLabel` (default false) = icon-only +
  `name` for accessibility, if the user prefers minimal.
- CLICK (both surfaces) runs the ONE command
  `awayModeIndicator.toggle` — identical to what ctrl+shift+P -> same
  command does manually; the click never bypasses the command. The
  command rewrites ONLY the token word ON<->OFF inside `[STATUS: ]` of
  the Away section (anchored, byte-exact elsewhere, atomic tmp+rename)
  in global scope; in window scope it writes only the window override
  (§8b scopeMode=window). Chat-side activation (exact keyword) makes
  the SAME token edit as its final act — both routes converge on the
  same transition the watcher observes.
- Transient state is monitored on BOTH routes: toggle command -> file
  write -> watcher confirm. A token change seen within
  pendingGraceSeconds paints the switching color, then settles; a manual
  edit or chat-side flip is seen the same way (no privileged path).
- PENDING (state mid-change, e.g. just flipped by a click while
  in-flight chat work has not converged): the FIRST tree row of the
  Chat pane shows the pending color (`pendingColor`, §5) and label
  `Away mode switching...`; the input chip uses the stable ON color
  until the file confirms. Pending = token changed within the last
  `pendingGraceSeconds` (default 3), then settles to the steady look.

## 5 Colors — design-system ThemeColor ids, NEVER hardcoded hex
- Colors come ONLY from the running theme (user order 2026-10-01: the
  initial #CCA700 requirement is WITHDRAWN; dynamic theme colors win).
- ON: `editorWarning.foreground` — warning tone in any theme, light or
  dark, automatically.
- Switching/pending: `editorInfo.foreground`.
- Error (bad/missing file): `editorError.foreground`.
- OFF: surfaces hidden (absence = off is the clearest grammar).
- All three are settings (ThemeColor ids; e.g. a user may set
  `statusBar_item` ids per taste). Default = the three ids above.
- Hardcoded hex is not a feature; theme switching is the contract.

## 6 Error state (never silent) — 2 designs, user picks at validation
- Verified fact (vscode.d.ts this build): StatusBarItem.tooltip accepts
  MarkdownString (multi-line + $(icons)); TreeItem.tooltip is plain
  string (multi-line \n renders, no markdown). So a multi-line tooltip
  IS the standardized VS Code practice and both surfaces can carry it.
- E1 — rich tooltip: chip `Mode Away` in error color; tooltip =
  `$(error)` + tried path + resolution chain + setting to fix. Zero
  extra UI, standard, but the detail only shows on hover and the user
  must navigate to settings himself.
- E2 (recommended) — tooltip E1 PLUS: clicking the error chip opens a
  quick-pick with the same info as actionable rows: `Open
  awayModeIndicator.agentsFile setting`, `Retry now`, `Show help`;
  fixing becomes one click instead of a hunt. Same surfaces, same
  colors, only the click target changes in error state.

## 7 Commands
- `awayModeIndicator.toggle` — flip the token (writable path required).
- `awayModeIndicator.showStatus` — state, file resolved, last read age,
  resolution chain used.
- `awayModeIndicator.showHelp` — HELP.md rendered as markdown webview
  (purpose, surfaces, click behavior, path settings, distro-change
  recipe, troubleshooting, perf budget).
- `awayModeIndicator.overrideOn/Off` — debug-only manual state, cleared
  by the next file change (the file stays the authority).

## 8 Configuration
| Key | Default | Meaning |
|---|---|---|
| `awayModeIndicator.agentsFile` | `~/agents/AGENTS.md` | truth source (POSIX/UNC/`~`) |
| `awayModeIndicator.refreshSeconds` | `5` | max staleness: stat-only poll ceiling (watcher is primary) |
| `awayModeIndicator.pendingGraceSeconds` | `3` | window showing the switching color |
| `awayModeIndicator.compactLabel` | `false` | icon-only labels |
| `awayModeIndicator.style` | `dotWord` | appearance everywhere and identically: `dotWord` = V2 (colored dot + word, default) \| `outlinedPill` = V5 (dot+word in an outlined badge); applies to all states incl. switching/error |
| `awayModeIndicator.onColor` | `editorWarning.foreground` | ThemeColor id or #hex |
| `awayModeIndicator.pendingColor` | `editorInfo.foreground` | switching state |
| `awayModeIndicator.errorColor` | `editorError.foreground` | config error state |
| `awayModeIndicator.position` | `chatInputBesideAutopilot` | ONE active placement: chatInputBesideAutopilot (default, the chip under the input beside Autopilot) \| inputTop \| statusBarLeft \| statusBarRight; when the chat-area API is absent the active placement falls back to statusBarLeft, fact surfaced in showStatus |
| `awayModeIndicator.preferNativeChatChip` | `true` | input-area chip when API exists |
| `awayModeIndicator.showSessionScope` | `true` | per-workspace SESSION.md context in tooltip |
| `awayModeIndicator.scopeMode` | `global` | `global` = token file is the state, every window shows/edits it (toggle edits AGENTS.md). `window` = the file seeds every window, then PER-WINDOW overrides live only in that window (workspace-state, never on disk): toggles change only that window; a file change resets all overrides. Default `global` (matches the rule's user-global scope); pick `window` when windows must diverge |

## 9 Out of scope
- The Auto-Approve observatory was REMOVED from this
  extension (user order 2026-10-01 ~18:4x). It lives on as the independent
  manual plan PLAN_AUTOAPPROVE_TUNING_20261001.md (analysis by the agent
  from plans/settings/session evidence, no extension code).

## 10 Performance (budget + how it is met + measured)
- Budget: idle CPU < 0.1 % median, < 5 MB RSS, work per refresh < 1 ms.
- Design: watcher + stat-only poll; re-read only on mtime/size change;
  read the file ONCE (UTF-8), locate the single heading with one anchor
  indexOf then a 2-line slice (no whole-file regex passes); debounce
  watch bursts 250 ms; zero timers in hot path besides one poll;
  single state machine; surfaces re-render only on state change
  (no-op when unchanged); TreeDataProvider caches rows.
- Tests (bench, run in dev-host + a node harness): parse 10 k synthetic
  AGENTS.md variants (wall-clock + ops/sec), stat-tick cost with the
  file touched vs untouched, watch-burst storm (100 writes -> one
  parse), big file (1 MB) parse < 2 ms, idle 60 s CPU sample via
  `process.cpuUsage` deltas. Tokens: `PERF_PARSE_OK`, `PERF_IDLE_OK`.

## 11 Test plan
- Unit: token parser (ON / OFF+reason / malformed / moved line), path
  resolution (UNC/POSIX/~/derivation, distro-name-free — synthetic
  authorities), state machine (toggle write keeps bytes outside the
  token, atomic rename, concurrent click), pending window timing.
- Integration (dev-host): flip token -> both surfaces within
  refreshSeconds; identical look at both (screenshot compare);
  click flips the file (byte-diff = one word); missing file -> error
  chip + tooltip path; theme switch light<->dark recolors with no
  settings change (ThemeColor ids).
- Perf: the §10 benches, tokens asserted.

## 12 Non-goals
- No auto-activation from chat text; no per-workspace rule state
  (§2 analysis, §13.1 open); no writes beyond the one-token toggle; no
  Copilot-internal reading; no telemetry/network/dependencies.

## 13 Decision ledger
- VALIDATED by user (2026-10-01): visual identity (§4); refreshSeconds
  naming; theme-dynamic colors (hex #CCA700 withdrawn); click = palette
  toggle command; observatory OUT of the extension.
- VALIDATED later same day: scopeMode default = `global`; compactLabel
  default = `false` (labeled).
- VALIDATED later same day: error feedback = **E2** (tooltip + click
  quick-pick in error state). Position (user order ~19:3x): DEFAULT =
  the chip UNDER the chat input beside the Autopilot chip (the
  OptionsLocation.Chat area); settings option `position` to move it
  (one active placement at a time): `chatInputBesideAutopilot` (default)
  | `inputTop` | `statusBarLeft` | `statusBarRight`; when the chat-area
  API is absent the ONE active placement auto-falls back to
  statusBarLeft with the fact shown in showStatus (visible, never
  silent). compactLabel stays the fallback toggle for V3-like minimal.
- OPEN at this validation round:
  1. V2 (dot + word) vs V5 (outlined pill): all-states side-by-side
     built (one_shot/away_ui_v2v5_states_20261001.html, chat screenshot)
     — user pick pending.
