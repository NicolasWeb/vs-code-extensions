"use strict";
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { parseAwayToken, toggleAwayToken } = require("./parser");

const P = "awayModeIndicator";
let ctx;
const state = {
  fileState: "unknown", reason: "not read yet", triedPaths: [], resolutionChain: [],
  lastChangeAt: 0, windowOverride: null, lastReadMs: 0, fallbackUsed: false,
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
const MR_STASH_KEY = P + ".copilotMaxRequests.stash"; // globalState key holding the user's own value while Away is ON
const AWAY_MR_FALLBACK = 100000; // used if awayMaxRequests is set to a non-numeric value
function cfg(key) { return vscode.workspace.getConfiguration(P).get(key); }
const ICONS = { on: "circle-filled", pill: "record", pending: "sync~spin", error: "error" };
const ERR_PREFIX = "Away indicator: "; // single grep-able signature for error notifications
// ThemeIcon color ids have no ".foreground" suffix (unlike text/StatusBar
// colors); the strip below keeps them valid - do not "simplify" it away.
const FOREGROUND_SUFFIX = ".foreground";
function colorFor(st) {
  return st === "on" ? cfg("onColor") : st === "pending" ? cfg("pendingColor") : st === "error" ? cfg("errorColor") : undefined;
}
function labelFor(st) {
  const compact = cfg("compactLabel");
  if (st === "error") return "$(" + ICONS.error + ")" + (compact ? "" : " Mode Away");
  if (st === "pending") return "$(" + ICONS.pending + ")" + (compact ? "" : " Away switching…");
  // on (off never renders)
  if (cfg("style") === "outlinedPill") return "$(" + ICONS.pill + ")" + (compact ? "" : " Away");
  return "$(" + ICONS.on + ")" + (compact ? "" : " Away");
}
function resolveChain() {
  const tried = [];
  const chain = [];
  const raw = (cfg("agentsFile") || "~/agents/AGENTS.md").trim();
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
        candidates.push("/" + pair.join("/") + "/agents/AGENTS.md");
        // UNC form: host runs on Windows, workspace opened via \\wsl.localhost\...
        if (process.platform === "win32") {
          const root = seg.slice(0, hi).filter(Boolean).join("\\");
          candidates.push("\\\\" + auth + "\\" + root + "\\" + pair.join("\\") + "\\agents\\AGENTS.md");
        }
      }
    }
  }
  chain.push("$HOME fallback");
  candidates.push(path.join(os.homedir(), "agents", "AGENTS.md"));
  for (const c of candidates) {
    if (!c) continue;
    tried.push(c);
    try { if (fs.statSync(c).isFile()) return { file: c, chain, tried }; } catch (e) { /* keep looking */ }
  }
  return { file: null, chain, tried };
}
function currentTruthState() {
  const r = resolveChain();
  state.resolutionChain = r.chain; state.triedPaths = r.tried;
  if (!r.file) { state.fileState = "error"; state.reason = "file not found; tried " + r.tried.join(", "); return; }
  try {
    const text = fs.readFileSync(r.file, "utf8");
    state.lastReadMs = Date.now();
    const p = parseAwayToken(text, cfg("heading"));
    if (p.state === "unknown") { state.fileState = "error"; state.reason = p.reason + " in " + r.file; return; }
    state.fileState = p.state; state.reason = p.reason; state.agentsPath = r.file;
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
    ? new vscode.MarkdownString("$(error) **Away mode configuration error**\n\n" + state.reason + "\n\nResolution chain:\n" + state.resolutionChain.map((c) => "- " + c).join("\n") + "\n\nFix setting: `" + P + ".agentsFile`", true)
    : new vscode.MarkdownString("**Away mode " + (st === "on" ? "ON" : st) + "**\n\n- source: `" + (state.agentsPath || "?") + "`\n- token: " + state.reason + "\n- last refreshed: " + new Date(state.lastReadMs).toLocaleTimeString() + ", refresh interval " + cfg("refreshSeconds") + "s\n- position: " + cfg("position") + (state.fallbackUsed ? " (fell back to statusBarLeft)" : "") + (st === "on" || st === "pending" ? "\n\nClick to toggle OFF." : ""), true);
  const extra = sessionScopeText();
  if (extra) head.appendMarkdown("\n\n---\n" + extra.split("\n").join("  \n"));
  if (st === "error") head.isTrusted = true;
  return head;
}
// While Away is ON, GitHub Copilot Chat is raised over its stop-and-confirm
// threshold ("Copilot has been working on this problem for a while… Continue
// to iterate?", fires at chat.agent.maxRequests): the user's own value is
// stashed in globalState and the temporary awayMaxRequests value is applied;
// when Away goes OFF (window reload/quit included, via the state-change
// event) the stashed value is restored EXACTLY — a stashed "never set" (null)
// restores VS Code's own default. A user value already >= the temporary one
// is left untouched. Scope note: the override is written at Global scope; a
// workspace/folder value of chat.agent.maxRequests still wins over it, so
// keep this extension's own settings at user scope.
function applyAwayMaxRequests(wanted) {
  const rootCfg = vscode.workspace.getConfiguration();
  let entry;
  try { entry = ctx.globalState.get(MR_STASH_KEY); } catch (e) { entry = undefined; }
  if (wanted) {
    if (entry) { state.mrNote = "\u2014 " + MR_KEY + " held at " + cfg("awayMaxRequests") + " for Away (restore " + (typeof entry.held === "number" ? entry.held : "default") + " on OFF)"; return; } // already applied — never re-stash our own override
    const cur = rootCfg.get(MR_KEY);
    const target = Number(cfg("awayMaxRequests")) || AWAY_MR_FALLBACK;
    if (typeof cur === "number" && cur >= target) { // user value already high enough, stay out of it
      return;
    }
    const info = rootCfg.inspect(MR_KEY);
    const held = info ? firstDefined([info.workspaceFolderValue, info.workspaceValue, info.globalValue], null) : null;
    state.mrNote = "\u2014 " + MR_KEY + " temporarily " + target + " for Away (restore " + (held === null ? "default" : held) + " on OFF)";
    const p1 = ctx.globalState.update(MR_STASH_KEY, { held: held, at: Date.now() });
    Promise.resolve(p1).then(() =>
      rootCfg.update(MR_KEY, target, vscode.ConfigurationTarget.Global)
    ).then(null, (e) => vscode.window.showErrorMessage(ERR_PREFIX + "could not raise " + MR_KEY + ": " + e.message));
    return;
  }
  state.mrNote = "";
  if (!entry) return; // nothing was ever applied at user scope
  Promise.resolve(ctx.globalState.update(MR_STASH_KEY, undefined)).then(() =>
    rootCfg.update(MR_KEY, typeof entry.held === "number" ? entry.held : undefined, vscode.ConfigurationTarget.Global)
  ).then(null, (e) => vscode.window.showErrorMessage(ERR_PREFIX + "could not restore " + MR_KEY + ": " + e.message));
}
function firstDefined(list, dflt) { for (const v of list) { if (v !== undefined) return v; } return dflt; }
function render() {
  const st0 = effectiveState();
  const st = st0 === "error" ? "error" : (st0 === "on" && pendingWindowActive() ? "pending" : st0);
  const show = st !== "off";
  vscode.commands.executeCommand("setContext", P + ".present", show);
  const label = labelFor(st), color = colorFor(st), tip = tooltipFor(st);
  const cmd = st === "error" ? P + ".errorClicked" : P + ".toggle";
  const pos = cfg("position");
  const wantChat = pos === "chatInputBesideAutopilot" || pos === "inputTop";
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
  if (tree) { tree.setState(show ? st : null); if (show) tree.refresh(); }
  applyAwayMaxRequests(st0 === "on");
}
function readAndRender() { currentTruthState(); render(); }
function refreshGuard() {
  if (!state.agentsPath) return;
  try {
    if (!ctx._lastSig) ctx._lastSig = "";
    const s = fs.statSync(state.agentsPath);
    const sig = s.mtimeMs + ":" + s.size;
    if (sig !== ctx._lastSig) { ctx._lastSig = sig; readAndRender(); }
  } catch (e) { readAndRender(); }
}
function setupWatchers() {
  if (!state.agentsPath) return;
  try {
    const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(path.dirname(state.agentsPath), path.basename(state.agentsPath)));
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
    } else if (cfg("position").startsWith("chat") || cfg("position") === "inputTop") {
      state.fallbackUsed = true;
    }
  } catch (e) { state.fallbackUsed = true; }
  tree = new AwayTree();
  ctx.subscriptions.push(vscode.window.createTreeView("awayModeIndicator.status", { treeDataProvider: tree, showCollapseAll: false }));
  ctx.subscriptions.push(vscode.window.createTreeView("awayModeIndicator.statusFallback", { treeDataProvider: tree, showCollapseAll: false }));
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
  if (cfg("compactLabel")) return st === "error" ? "Mode Away" : "Away";
  if (st === "error") return "Mode Away";
  if (st === "pending") return "Away switching…";
  return "Away";
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
  if (!state.agentsPath) return vscode.window.showErrorMessage("Away indicator: no file");
  try {
    const text = fs.readFileSync(state.agentsPath, "utf8");
    const r = toggleAwayToken(text, cfg("heading"));
    if (r.error) return vscode.window.showErrorMessage(ERR_PREFIX + "toggle: " + r.error);
    const tmp = state.agentsPath + ".awayind.tmp";
    fs.writeFileSync(tmp, r.text); fs.renameSync(tmp, state.agentsPath);
    state.lastChangeAt = Date.now(); // pending window
    // watcher/poll confirms; render optimistic pending too:
    state.fileState = r.from === "on" ? "off" : "on"; state.reason = "toggled by click, confirming…";
    render();
    setTimeout(readAndRender, Math.min(CONFIRM_DELAY_CAP_MS, cfg("refreshSeconds") * 1000));
  } catch (e) { vscode.window.showErrorMessage(ERR_PREFIX + "toggle failed: " + e.message); }
}
async function errorClicked() {
  const pick = await vscode.window.showQuickPick([
    { label: "$(gear) Open " + P + ".agentsFile setting", id: "open" },
    { label: "$(sync) Retry now", id: "retry" },
    { label: "$(question) Show help", id: "help" },
  ], { placeHolder: "$(error) " + state.reason });
  if (!pick) return;
  if (pick.id === "open") vscode.commands.executeCommand("workbench.action.openSettings", P + ".agentsFile");
  if (pick.id === "retry") readAndRender();
  if (pick.id === "help") vscode.commands.executeCommand(P + ".showHelp");
}
function showStatus() {
  vscode.window.showInformationMessage("Away mode: " + effectiveState() + " — source " + (state.agentsPath || "MISSING") +
    " — last refreshed " + (state.lastReadMs ? new Date(state.lastReadMs).toLocaleTimeString() : "never") +
    ", refresh interval " + cfg("refreshSeconds") + "s" + (state.fallbackUsed ? " — chat chip API unavailable, fell back to statusBarLeft" : "") +
    " " + (state.mrNote || ""));
}
async function showHelp() {
  const panel = vscode.window.createWebviewPanel(P + ".help", "Away Mode Indicator — Help", vscode.ViewColumn.One, {});
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
    vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration(P)) { ctx._lastSig = ""; readAndRender(); } }),
  );
  readAndRender(); setupWatchers();
  pollTimer = setInterval(refreshGuard, Math.max(MIN_POLL_MS, cfg("refreshSeconds") * 1000));
  ctx.subscriptions.push({ dispose: () => clearInterval(pollTimer) });
  createSurfaces().then(render).catch(() => render());
}
function deactivate() {
  // Restore the user's own chat.agent.maxRequests value (the same restore
  // also runs through onDidChangeWorkspaceState while the host restarts).
  try { applyAwayMaxRequests(false); } catch (e) { /* subscriptions dispose everything */ }
}
module.exports = { activate, deactivate };
