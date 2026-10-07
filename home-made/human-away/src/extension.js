"use strict";
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { parseConf, toggleAwayMode, setConfValue, dropConfValue, humanAwayLabel, CONF_KEYS, PREV_DEFAULT_TOKEN } = require("./parser");
const CONF_NAME = "human_away_mode"; // Human Away Mode truth file: <home>/agents/human_away_mode
const COL = require("./collector");

const P = "humanAway";
let ctx;
const state = {
  fileState: "unknown", reason: "not read yet", resolutionChain: [],
  lastChangeAt: 0, windowOverride: null, lastReadMs: 0, fallbackUsed: false,
  confKv: {}, // shared conf records read from the config file (see parser.CONF_KEYS)
};
let statusBarItem = null;
let chatItem = null;
let tree = null;
let debounced = null;
let pollTimer = null;

const WATCH_DEBOUNCE_MS = 250; // coalesces watcher bursts (incl. our own tmp+rename)
const MIN_POLL_MS = 1000; // guard floor: poll never spins faster than 1 Hz
const CONFIRM_DELAY_CAP_MS = 1000; // post-toggle re-read scheduled within 1 s
const BAR_SHIFT_STEP = 100; // one press of the Shift chip commands
const MR_KEY = "chat.agent.maxRequests"; // GitHub Copilot Chat stop-and-confirm threshold
const AWAY_MR_FALLBACK = 100000; // used when neither the conf record nor humanAway.awayMaxRequests gives a target
function cfg(key) { return vscode.workspace.getConfiguration(P).get(key); }
const ICONS = { on: "circle-filled", pill: "record", pending: "sync~spin", error: "error" };
const ERR_PREFIX = "Human Away: "; // single grep-able signature for error notifications
// ThemeIcon color ids have no ".foreground" suffix (unlike text/StatusBar
// colors); the strip below keeps them valid - do not "simplify" it away.
const FOREGROUND_SUFFIX = ".foreground";
function colorFor(st) {
  return st === "on" ? cfg("onColor") : st === "pending" ? cfg("pendingColor") : st === "error" ? cfg("errorColor") : undefined;
}
function iconFor(st) {
  if (st === "error") return ICONS.error;
  if (st === "pending") return ICONS.pending;
  return cfg("style") === "outlinedPill" ? ICONS.pill : ICONS.on;
}
function labelFor(st) {
  // wording fixed by the user 2026-10-07: ON = "Human : Here", OFF = "Human : Away"
  const word = humanAwayLabel(st === "pending" ? "switching" : st);
  if (cfg("compactLabel")) return "$(" + iconFor(st) + ")";
  return "$(" + iconFor(st) + ") " + word;
}
function resolveChain() {
  const tried = [];
  const chain = [];
  const raw = (cfg("configFile") || "~/agents/" + CONF_NAME).trim();
  const expand = (p) => p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
  const candidates = [];
  chain.push("setting: " + raw);
  candidates.push(expand(raw));
  const ws = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
  if (ws) {
    const auth = ws.uri.authority || "";
    if (auth && /^wsl(\.localhost|\$)?$/i.test(auth)) {
      chain.push("workspace WSL URI: " + ws.uri.toString(true));
      const seg = ws.uri.path.split("/"); // ["", distro, "home", user, ...]
      const hi = seg.lastIndexOf("home");
      if (hi >= 0 && seg.length > hi + 1) {
        const pair = seg.slice(hi, hi + 2); // ["home", user]
        // POSIX form: host runs inside WSL/Linux (e.g. Remote-WSL extension host)
        candidates.push("/" + pair.join("/") + "/agents/" + CONF_NAME);
        // UNC form: host runs on Windows, workspace opened via \\wsl.localhost\...
        if (process.platform === "win32") {
          const root = seg.slice(0, hi).filter(Boolean).join("\\");
          candidates.push("\\\\" + auth + "\\" + root + "\\" + pair.join("\\") + "\\agents\\" + CONF_NAME);
        }
      }
    }
  }
  chain.push("$HOME fallback");
  candidates.push(path.join(os.homedir(), "agents", CONF_NAME));
  for (const c of candidates) {
    if (!c) continue;
    tried.push(c);
    try { if (fs.statSync(c).isFile()) return { file: c, chain, tried }; } catch (e) { /* keep looking */ }
  }
  return { file: null, chain, tried };
}
function currentTruthState() {
  const r = resolveChain();
  state.resolutionChain = r.chain;
  if (!r.file) { // no conf file yet = OFF, and the write target stays visible
    state.fileState = "off"; state.configPath = r.tried[0]; state.confKv = {};
    state.reason = "config file absent, OFF (write target " + r.tried[0] + ")"; return;
  }
  try {
    const text = fs.readFileSync(r.file, "utf8");
    state.lastReadMs = Date.now();
    const p = parseConf(text);
    state.confKv = p.kv;
    if (p.state === "unknown") { state.fileState = "error"; state.reason = p.reason + " in " + r.file; return; }
    state.fileState = p.state; state.reason = p.reason; state.configPath = r.file;
  } catch (e) { state.fileState = "error"; state.reason = "read failed: " + e.message + " (" + r.file + ")"; }
}
function effectiveState() {
  const fsState = state.fileState;
  if (cfg("scopeMode") === "window" && state.windowOverride !== null) return state.windowOverride ? "on" : "off";
  return fsState;
}
function pendingWindowActive() {
  return state.lastChangeAt && (Date.now() - state.lastChangeAt) < cfg("pendingGraceSeconds") * 1000;
}
function sessionScopeText() {
  if (!cfg("showSessionScope")) return "";
  const ws = vscode.workspace.workspaceFolders;
  for (const w of (ws || [])) {
    try {
      const f = path.join(w.uri.fsPath, "SESSION.md");
      if (fs.statSync(f).isFile()) {
        const lines = fs.readFileSync(f, "utf8").split("\n").slice(0, cfg("sessionHeadLines") || 5).join("\n");
        return "\n\nWorkspace context (" + w.name + " SESSION.md):\n" + lines;
      }
    } catch (e) { /* next */ }
  }
  return "";
}
function tooltipFor(st) {
  const head = st === "error"
    ? new vscode.MarkdownString("$(error) **Human Away Mode configuration error**\n\n" + state.reason + "\n\nResolution chain:\n" + state.resolutionChain.map((c) => "- " + c).join("\n") + "\n\nFix setting: `" + P + ".configFile`", true)
    : new vscode.MarkdownString("**" + humanAwayLabel(st) + "** (" + (st === "on" ? "mode ON" : "mode OFF") + ")\n\n- config file: `" + (state.configPath || "?") + "`\n- state line: " + state.reason + "\n- last refreshed: " + new Date(state.lastReadMs).toLocaleTimeString() + ", refresh interval " + cfg("refreshSeconds") + "s\n- position: " + cfg("position") + (state.fallbackUsed ? " (fell back to statusBarLeft)" : "") + "\n\nClick to switch " + (st === "on" ? "OFF (\"Human : Away\")." : "ON (\"Human : Here\")."), true);
  const kv = state.confKv || {};
  if (kv[CONF_KEYS.mrOwner] || kv[CONF_KEYS.prevMaxRequests]) {
    head.appendMarkdown("\n\n- " + MR_KEY + ": owner=" + (kv[CONF_KEYS.mrOwner] || "-") +
      ", previous value=" + (kv[CONF_KEYS.prevMaxRequests] || "-") +
      ", target=" + (kv[CONF_KEYS.awayMaxRequests] || cfg("awayMaxRequests") || "default"));
  }
  const extra = sessionScopeText();
  if (extra) head.appendMarkdown("\n\n---\n" + extra.split("\n").join("  \n"));
  if (st === "error") head.isTrusted = true;
  return head;
}
// While Human Away Mode is ON, GitHub Copilot Chat is raised over its stop-and-confirm
// threshold ("Copilot has been working on this problem for a while... Continue to iterate?",
// fires at chat.agent.maxRequests). The previous value and the ownership of the override are
// recorded in the Human Away Mode conf file itself (`key value` records): that file is the ONE
// recording surface, shared with the agent. prevMaxRequests holds the user's own value
// ("default" when the setting was unset), mrOwner holds "extension" or "agent".
// Owner rules: our record -> idempotent, never a second write; the agent's record -> we stay
// out of it entirely (this is the non-concurrence the shared agent tool refuses to assume);
// no owner record but the live value already equals the target -> ownership taken without
// writing; a previous value recorded by the other owner -> we adopt it, so it is never lost;
// otherwise the live value is recorded before we write the target. On OFF the recorded value is
// restored exactly ("default" restores the VS Code default), a foreign value makes us release
// our own record without overwriting theirs. A user value already >= the target is left
// untouched. Precedence for the target: conf record awayMaxRequests > setting
// humanAway.awayMaxRequests > built-in fallback. Scope note: the override is written at Global
// scope; a workspace/folder value of chat.agent.maxRequests still wins over it, so keep this
// extension's own settings at user scope.
function confPatch(sets, drops, who) {
  // Atomically record/remove shared conf entries; false when the conf file is unusable.
  if (!state.configPath) return false;
  try {
    const text = fs.existsSync(state.configPath) ? fs.readFileSync(state.configPath, "utf8") : "";
    let next = text;
    for (const k of Object.keys(sets || {})) {
      const r = setConfValue(next, k, sets[k], who);
      if (r.error) { vscode.window.showErrorMessage(ERR_PREFIX + MR_KEY + " record: " + r.error); return false; }
      next = r.text;
    }
    for (const k of drops || []) {
      const r = dropConfValue(next, k, who);
      if (r.error) { vscode.window.showErrorMessage(ERR_PREFIX + MR_KEY + " record: " + r.error); return false; }
      if (r.text) next = r.text; // absent entry: nothing to drop
    }
    if (next === text) return true; // nothing changed on disk
    const tmp = state.configPath + ".humanaway.tmp";
    fs.writeFileSync(tmp, next); fs.renameSync(tmp, state.configPath);
    state.confKv = parseConf(next).kv;
    return true;
  } catch (e) {
    vscode.window.showErrorMessage(ERR_PREFIX + "could not record " + MR_KEY + " ownership: " + e.message);
    return false;
  }
}
function applyAwayMaxRequests(wanted) {
  const rootCfg = vscode.workspace.getConfiguration();
  const kv = state.confKv || {};
  const owner = kv[CONF_KEYS.mrOwner];
  const prev = kv[CONF_KEYS.prevMaxRequests];
  const cur = rootCfg.get(MR_KEY);
  const target = Number(kv[CONF_KEYS.awayMaxRequests]) || Number(cfg("awayMaxRequests")) || AWAY_MR_FALLBACK;
  const prevText = prev === undefined ? "unknown" : prev;
  if (wanted) {
    if (owner === "agent") { // raised by the agent under MASTER AGENTS: never a second writer
      state.mrNote = "\u2014 " + MR_KEY + " held by the agent at " + (cur === undefined ? "default" : cur) + ": left alone (non-concurrence)";
      return;
    }
    if (owner === "extension") {
      state.mrNote = "\u2014 " + MR_KEY + " held at " + target + " for Human Away Mode (restore " + prevText + " on OFF)";
      return; // already ours: never re-record, never re-write
    }
    if (cur === target) {
      // corresponds without an owner record: take ownership, no second write, and keep the
      // previous value whoever recorded it (adopted, so it is never lost)
      if (!confPatch({ prevMaxRequests: prev === undefined ? PREV_DEFAULT_TOKEN : prev, mrOwner: "extension" }, null, "Human Away Mode ownership taken ")) return;
      state.mrNote = "\u2014 " + MR_KEY + " already at " + target + ": ownership taken, no second write (restore " + prevText + " on OFF)";
      return;
    }
    if (typeof cur === "number" && cur >= target) { // user value already high enough, stay out of it
      state.mrNote = "\u2014 " + MR_KEY + " already " + cur + " (>= " + target + "): left untouched";
      return;
    }
    const info = rootCfg.inspect(MR_KEY);
    const held = info ? firstDefined([info.workspaceFolderValue, info.workspaceValue, info.globalValue], null) : null;
    const record = held === null ? PREV_DEFAULT_TOKEN : String(held);
    if (!confPatch({ prevMaxRequests: record, mrOwner: "extension" }, null, "Human Away Mode stashed ")) return;
    state.mrNote = "\u2014 " + MR_KEY + " temporarily " + target + " for Human Away Mode (restore " + record + " on OFF)";
    Promise.resolve().then(() =>
      rootCfg.update(MR_KEY, target, vscode.ConfigurationTarget.Global)
    ).then(null, (e) => vscode.window.showErrorMessage(ERR_PREFIX + "could not raise " + MR_KEY + ": " + e.message));
    return;
  }
  state.mrNote = "";
  if (owner === "agent") return; // the agent's own rule restores its override when it returns
  if (owner !== "extension") return; // nothing of ours to restore
  if (cur !== target) {
    // no longer corresponds: another owner moved the setting, so we release OUR record instead
    // of restoring over their write
    state.mrNote = "\u2014 " + MR_KEY + " now " + (cur === undefined ? "default" : cur) + " (not our " + target + "): released, left as the other owner set it";
    confPatch(null, [CONF_KEYS.mrOwner], "Human Away Mode released ");
    return;
  }
  const held = Number(prev);
  const back = Number.isFinite(held) ? held : undefined; // "default"/absent/garbage -> VS Code default
  confPatch(null, [CONF_KEYS.mrOwner, CONF_KEYS.prevMaxRequests], "Human Away Mode restored ");
  Promise.resolve().then(() =>
    rootCfg.update(MR_KEY, back, vscode.ConfigurationTarget.Global)
  ).then(null, (e) => vscode.window.showErrorMessage(ERR_PREFIX + "could not restore " + MR_KEY + ": " + e.message));
}
function firstDefined(list, dflt) { for (const v of list) { if (v !== undefined) return v; } return dflt; }
function render() {
  const st0 = effectiveState();
  const st = st0 === "error" ? "error" : (st0 === "on" && pendingWindowActive() ? "pending" : st0);
  const show = true; // both modes render: "Human : Here" / "Human : Away" (user 2026-10-07)
  vscode.commands.executeCommand("setContext", P + ".present", show);
  const label = labelFor(st), color = colorFor(st), tip = tooltipFor(st);
  const cmd = st === "error" ? P + ".errorClicked" : P + ".toggle";
  const pos = cfg("position");
  const wantChat = pos === "chatInputBesideAutopilot";
  const chatActive = wantChat && chatItem && !state.fallbackUsed; // one active placement
  const barWanted = show && !(chatActive && wantChat);
  if (statusBarItem) {
    if (!barWanted) statusBarItem.hide();
    else { statusBarItem.text = label; statusBarItem.color = color; statusBarItem.tooltip = tip; statusBarItem.command = cmd; statusBarItem.show(); }
  }
  if (chatItem) {
    if (!chatActive || !show) chatItem.hide();
    else { chatItem.text = label; chatItem.color = color; chatItem.tooltip = tip; chatItem.command = cmd; chatItem.show(); }
  }
  if (tree) { tree.setState(st); tree.refresh(); }
  applyAwayMaxRequests(st0 === "on");
}
function readAndRender() { currentTruthState(); render(); }
function refreshGuard() {
  if (!state.configPath) return;
  try {
    if (!ctx._lastSig) ctx._lastSig = "";
    const s = fs.statSync(state.configPath);
    const sig = s.mtimeMs + ":" + s.size;
    if (sig !== ctx._lastSig) { ctx._lastSig = sig; readAndRender(); }
  } catch (e) { readAndRender(); }
}
function setupWatchers() {
  if (!state.configPath) return;
  try {
    const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(path.dirname(state.configPath), path.basename(state.configPath)));
    const fire = () => { if (debounced) clearTimeout(debounced); debounced = setTimeout(refreshGuard, WATCH_DEBOUNCE_MS); };
    w.onDidChange(fire); w.onDidCreate(fire); w.onDidDelete(fire);
    ctx.subscriptions.push(w);
  } catch (e) { /* poll guard still active */ }
}
async function createSurfaces() {
  statusBarItem = vscode.window.createStatusBarItem(
    P + ".bar", cfg("position") === "statusBarRight" ? vscode.StatusBarAlignment.Right : vscode.StatusBarAlignment.Left, cfg("statusBarPriority") || 10001);
  chatItem = null;
  try {
    if (cfg("preferNativeChatChip") && vscode.OptionsLocation && vscode.OptionsLocation.Chat) {
      chatItem = vscode.window.createStatusBarItem({ id: P + ".chat", location: vscode.OptionsLocation.Chat });
    } else if (cfg("position").startsWith("chat")) {
      state.fallbackUsed = true;
    }
  } catch (e) { state.fallbackUsed = true; }
  tree = new AwayTree();
  ctx.subscriptions.push(vscode.window.createTreeView("humanAway.status", { treeDataProvider: tree, showCollapseAll: false }));
  ctx.subscriptions.push(vscode.window.createTreeView("humanAway.statusFallback", { treeDataProvider: tree, showCollapseAll: false }));
  ctx.subscriptions.push(statusBarItem);
}
class AwayTree {
  constructor() { this._emitter = new vscode.EventEmitter(); this.onDidChangeTreeData = this._emitter.event; this._st = null; }
  setState(st) { this._st = st; }
  refresh() { this._emitter.fire(); }
  getTreeItem(el) {
    const t = new vscode.TreeItem(el.label);
    t.iconPath = el.icon; t.description = ""; t.command = { command: el.command, title: "" };
    try { t.tooltip = tooltipFor(this._st || "on").value; } catch (e) { /* plain */ }
    return t;
  }
  getChildren() {
    const st = this._st;
    if (!st) return [];
    const icon = new vscode.ThemeIcon(st === "error" ? ICONS.error : st === "pending" ? ICONS.pending : cfg("style") === "outlinedPill" ? ICONS.pill : ICONS.on, new vscode.ThemeColor(stripThemeColor(colorFor(st))));
    return [{ label: treeLabel(st), icon, command: st === "error" ? P + ".errorClicked" : P + ".toggle" }];
  }
}
function stripThemeColor(c) { return typeof c === "string" && !c.startsWith("#") ? c.replace(FOREGROUND_SUFFIX, "") : undefined; }
function treeLabel(st) {
  return humanAwayLabel(st === "pending" ? "switching" : st);
}
async function shiftPriority(delta) {
  const w = vscode.workspace.getConfiguration(P);
  const cur = w.get("statusBarPriority") || 10001;
  const next = Math.max(0, cur + delta);
  await w.update("statusBarPriority", next, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(ERR_PREFIX + "status-bar priority " + cur + " -> " + next + " (higher = further left).");
}
async function toggle() {
  const cur = effectiveState();
  if (cur === "error") return vscode.window.showErrorMessage(ERR_PREFIX + state.reason);
  const target = cur !== "on";
  if (cfg("scopeMode") === "window") { state.windowOverride = target; state.lastChangeAt = Date.now(); render(); return; }
  if (!state.configPath) return vscode.window.showErrorMessage(ERR_PREFIX + "no config file path");
  try {
    const text = fs.existsSync(state.configPath) ? fs.readFileSync(state.configPath, "utf8") : "";
    const r = toggleAwayMode(text);
    if (r.error) return vscode.window.showErrorMessage(ERR_PREFIX + "toggle: " + r.error);
    const tmp = state.configPath + ".humanaway.tmp";
    fs.writeFileSync(tmp, r.text); fs.renameSync(tmp, state.configPath);
    state.lastChangeAt = Date.now(); // pending window
    // watcher/poll confirms; render optimistic pending too:
    state.fileState = r.from === "on" ? "off" : "on"; state.reason = "toggled by click, confirming…";
    render();
    setTimeout(readAndRender, Math.min(CONFIRM_DELAY_CAP_MS, cfg("refreshSeconds") * 1000));
  } catch (e) { vscode.window.showErrorMessage(ERR_PREFIX + "toggle failed: " + e.message); }
}
async function errorClicked() {
  const pick = await vscode.window.showQuickPick([
    { label: "$(gear) Open " + P + ".configFile setting", id: "open" },
    { label: "$(sync) Retry now", id: "retry" },
    { label: "$(question) Show help", id: "help" },
  ], { placeHolder: "$(error) " + state.reason });
  if (!pick) return;
  if (pick.id === "open") vscode.commands.executeCommand("workbench.action.openSettings", P + ".configFile");
  if (pick.id === "retry") readAndRender();
  if (pick.id === "help") vscode.commands.executeCommand(P + ".showHelp");
}
function showStatus() {
  vscode.window.showInformationMessage("Human Away Mode: " + humanAwayLabel(effectiveState()) + " [" + effectiveState() + "] — config file " + (state.configPath || "MISSING") +
    " — last refreshed " + (state.lastReadMs ? new Date(state.lastReadMs).toLocaleTimeString() : "never") +
    ", refresh interval " + cfg("refreshSeconds") + "s" + (state.fallbackUsed ? " — chat chip API unavailable, fell back to statusBarLeft" : "") +
    " " + (state.mrNote || ""));
}
// ---- Auto-Approve observatory (PLAN_AUTOAPPROVE_TUNING step 1) ----------
// Public local signal only: chat.tools.terminal.autoApprove changes =
// persisted approvals/revocations. Nothing is read from Copilot internals,
// nothing leaves the machine (globalState ledger, local reports).
const LEDGER_KEY = P + ".autoApproveLedger";
const LEDGER_CAP = 5000; // FIFO bound on the session ledger (globalState)
let ledger = [];           // in-memory mirror of the persisted events
let lastAutoApprove = null; // last snapshot of the settings map

function currentAutoApprove() {
  const v = vscode.workspace.getConfiguration().get(COL.AUTO_APPROVE_KEY);
  return v && typeof v === "object" ? v : {};
}
function persistLedger() {
  if (ledger.length > LEDGER_CAP) ledger = ledger.slice(ledger.length - LEDGER_CAP);
  ctx.globalState.update(LEDGER_KEY, ledger).then(null, () => { /* best effort */ });
}
function pushLedger(events) {
  if (!events.length) return;
  ledger = ledger.concat(events);
  persistLedger();
}
function sampleAutoApprove() {
  if (!cfg("observeAutoApprove")) return;
  const snap = currentAutoApprove();
  const ts = Date.now();
  if (lastAutoApprove === null) {
    lastAutoApprove = snap;
    // first activation ever: seed the pre-existing matchers as baselines
    const saved = ctx.globalState.get(LEDGER_KEY);
    if (Array.isArray(saved)) { ledger = saved; return; } // already seeded
    const seeded = COL.buildLedgerEvent(ts, state.fileState, { added: [], removed: [], changed: [] }, Object.keys(snap));
    pushLedger(seeded.seeds);
    return;
  }
  const diff = COL.diffAutoApprove(lastAutoApprove, snap);
  lastAutoApprove = snap;
  pushLedger(COL.buildLedgerEvent(ts, state.fileState, diff, null).events);
}
function buildTieringText() {
  // fold in the live settings map so baselines never vanish on re-install
  const agg = COL.aggregateReport(ledger);
  const first = ledger.length ? new Date(ledger[0].ts).toISOString().slice(0, 10) : "-";
  const last = ledger.length ? new Date(ledger[ledger.length - 1].ts).toISOString().slice(0, 10) : "-";
  const lines = [COL.renderReport(agg, {
    events: agg.total.approves + agg.total.revokes,
    window: first + ".." + last,
    away: state.fileState === "on",
    target: cfg("observeTargetEvents"),
    windowDays: cfg("observeWindowDays"),
  })];
  if (!cfg("observeAutoApprove")) lines.push("NOTE: humanAway.observeAutoApprove is OFF - collection paused (ledger kept).");
  const live = Object.keys(currentAutoApprove()).sort();
  lines.push("");
  lines.push("live " + COL.AUTO_APPROVE_KEY + " now: " + (live.length ? live.join(", ") : "(empty map)"));
  lines.push("ledger events: " + ledger.length + " (persisted in globalState, cap " + LEDGER_CAP + ", local only)");
  return lines.join("\n");
}
async function showTieringReport() {
  sampleAutoApprove(); // fold in any change the watcher missed
  const panel = vscode.window.createWebviewPanel(P + ".tiering", "Human Away — Auto-Approve Tiering Report", vscode.ViewColumn.One, {});
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  panel.webview.html = "<html><head><meta charset='utf-8'></head><body style='font-family:var(--vscode-editor-font-family);padding:12px;max-width:70em'><pre style='white-space:pre-wrap;margin:0'>" + esc(buildTieringText()) + "</pre></body></html>";
}

async function showHelp() {
  const panel = vscode.window.createWebviewPanel(P + ".help", "Human Away — Help", vscode.ViewColumn.One, {});
  try {
    const md = fs.readFileSync(path.join(ctx.extensionPath, "HELP.md"), "utf8");
    panel.webview.html = "<html><head><meta charset='utf-8'></head><body style='font-family:var(--vscode-font-family);padding:12px;max-width:60em'>" +
      md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/```/g, "<pre>").replace(/\n/g, "<br>") + "</body></html>";
  } catch (e) { panel.webview.html = "<body>HELP.md missing: " + e.message + "</body>"; }
}
function activate(context) {
  ctx = context;
  ctx.subscriptions.push(
    vscode.commands.registerCommand(P + ".toggle", toggle),
    vscode.commands.registerCommand(P + ".errorClicked", errorClicked),
    vscode.commands.registerCommand(P + ".showStatus", showStatus),
    vscode.commands.registerCommand(P + ".showHelp", showHelp),
    vscode.commands.registerCommand(P + ".overrideOn", () => { state.windowOverride = true; render(); }),
    vscode.commands.registerCommand(P + ".shiftLeft", () => shiftPriority(BAR_SHIFT_STEP)),
    vscode.commands.registerCommand(P + ".shiftRight", () => shiftPriority(-BAR_SHIFT_STEP)),
    vscode.commands.registerCommand(P + ".overrideOff", () => { state.windowOverride = false; render(); }),
    vscode.commands.registerCommand(P + ".showTieringReport", showTieringReport),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(P)) { ctx._lastSig = ""; readAndRender(); }
      if (e.affectsConfiguration(COL.AUTO_APPROVE_KEY)) sampleAutoApprove();
    }),
  );
  readAndRender(); setupWatchers(); sampleAutoApprove(); // seed the ledger
  pollTimer = setInterval(refreshGuard, Math.max(MIN_POLL_MS, cfg("refreshSeconds") * 1000));
  ctx.subscriptions.push({ dispose: () => clearInterval(pollTimer) });
  createSurfaces().then(render).catch(() => render());
}
function deactivate() {
  // Restore the user's own chat.agent.maxRequests value from the conf record (the same
  // restore path is the first render() of activate() seeing OFF with a surviving record.
  try { applyAwayMaxRequests(false); } catch (e) { /* subscriptions dispose everything */ }
}
module.exports = { activate, deactivate };
