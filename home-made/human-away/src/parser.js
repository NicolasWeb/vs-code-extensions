// Pure logic, no vscode import -> unit-testable in plain node.
"use strict";

// Human Away Mode truth surface: the one-line conf file <home>/agents/human_away_mode,
// written directly on disk and never versioned. Label mapping is the user's choice
// (2026-10-07): mode ON reads "Human : Here", mode OFF reads "Human : Away".
const CONF_NAME = "human_away_mode";
const LABELS = {
  on: "Human : Here",
  off: "Human : Away",
  switching: "Human : switching\u2026",
  error: "Human : error",
};

function auditStamp() {
  // audit format decided: minute-precision ISO stamp (seconds stripped);
  // single source of truth for every toggled state-file comment.
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}
// Shared config records: `key value` lines in the same conf file, written and read by BOTH
// owners of the mode (the Human Away Ext. and the agent acting under MASTER AGENTS). The conf
// file is the one recording surface, so the value each owner saved before overriding
// chat.agent.maxRequests is recoverable whichever hand wrote it.
const KV_RE = /^([A-Za-z][A-Za-z0-9]*)[ \t]+(\S.*)$/;
const CONF_KEYS = {
  awayMaxRequests: "awayMaxRequests", // the target both owners agree on
  prevMaxRequests: "prevMaxRequests", // value held before the override; "default" = was unset
  mrOwner: "mrOwner", // owner of the live override: "extension" | "agent"
};
const PREV_DEFAULT_TOKEN = "default"; // prevMaxRequests value meaning "setting was not set"

/** Parse the conf text: one ON/OFF state line, `key value` records, verbatim extras.
 * @param {string} text conf file content
 * @returns {{state:'on'|'off'|'unknown', reason:string, kv:Object, extra:string[]}}
 */
function parseConf(text) {
  const out = { state: "unknown", reason: "no text", kv: {}, extra: [] };
  if (typeof text !== "string") return out;
  const others = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (/^(ON|OFF)\b/i.test(line)) {
      if (out.state === "unknown") { out.state = /^ON\b/i.test(line) ? "on" : "off"; out.reason = line; }
      continue; // a second state line is redundant, not an error
    }
    const m = KV_RE.exec(line);
    if (m && !(m[1] in out.kv)) { out.kv[m[1]] = m[2].trim(); continue; } // first wins
    others.push(line);
  }
  if (out.state === "unknown") out.reason = others.length || Object.keys(out.kv).length
    ? "no ON/OFF state line in the config file" : "empty config file";
  out.extra = others;
  return out;
}
/** Parse the conf-file text down to the state. */
function parseAwayMode(text) {
  const c = parseConf(text);
  return { state: c.state, reason: c.reason };
}
/** Convenience: the state only ('on' | 'off' | 'unknown'). */
function stateOf(text) { return parseConf(text).state; }
/** Render conf text: state line, then records, then kept-as-is lines, then one audit comment. */
function renderConf(st, kv, extra, audit) {
  const lines = [st === "on" ? "ON" : "OFF"];
  for (const k of Object.keys(kv || {})) lines.push(k + " " + kv[k]);
  for (const l of extra || []) lines.push(l);
  if (audit) lines.push("# " + audit);
  return lines.join("\n") + "\n";
}
/** Produce the toggled conf text; `key value` records survive the toggle. An absent or empty
 * file is an uncreated OFF, so the first click writes ON; unparsable content stays an error.
 * @returns {{text:string|null, from:string|null, to:string|null, error:string|null}}
 */
function toggleAwayMode(text) {
  if (typeof text !== "string") return { text: null, from: null, to: null, error: "no text" };
  if (text.trim() === "") {
    return { text: renderConf("on", {}, [], "Human Away Mode ON user click " + auditStamp()), from: "off", to: "on", error: null };
  }
  const c = parseConf(text);
  if (c.state === "unknown") return { text: null, from: null, to: null, error: c.reason };
  const next = c.state === "on" ? "off" : "on";
  const who = c.state === "on" ? "Human Away Mode OFF user toggle " : "Human Away Mode ON user click ";
  return { text: renderConf(next, c.kv, c.extra, who + auditStamp()), from: c.state, to: next, error: null };
}
/** Rewrite the conf text with one record set (state line and other records kept). */
function setConfValue(text, key, value, who) {
  const c = parseConf(text);
  if (c.state === "unknown") return { text: null, error: c.reason };
  const kv = Object.assign({}, c.kv); kv[key] = String(value);
  return { text: renderConf(c.state, kv, c.extra, (who || "Human Away Mode record ") + auditStamp()), error: null };
}
/** Rewrite the conf text with one record removed. */
function dropConfValue(text, key, who) {
  const c = parseConf(text);
  if (c.state === "unknown") return { text: null, error: c.reason };
  if (!(key in c.kv)) return { text: null, error: null, noop: true }; // absent record: nothing to write
  const kv = Object.assign({}, c.kv); delete kv[key];
  return { text: renderConf(c.state, kv, c.extra, (who || "Human Away Mode record ") + auditStamp()), error: null };
}
/** Read one shared record from the conf text (undefined when absent). */
function getConfValue(text, key) { return parseConf(text).kv[key]; }
/** Text for a state ('on' | 'off' | 'switching' | 'error'); unknown falls back to error. */
function humanAwayLabel(st) { return LABELS[st] || LABELS.error; }

module.exports = {
  parseConf, parseAwayMode, stateOf, renderConf, toggleAwayMode,
  getConfValue, setConfValue, dropConfValue, humanAwayLabel, auditStamp,
  CONF_NAME, CONF_KEYS, PREV_DEFAULT_TOKEN, LABELS,
};
