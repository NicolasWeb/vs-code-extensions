// Pure logic, no vscode import -> unit-testable in plain node.
"use strict";

const HEADING = "## Autonomous unattended work (Away mode)";

/**
 * Parse the truth file text.
 * @param {string} text full AGENTS.md content
 * @returns {{state:'on'|'off'|'unknown', line:string|null, reason:string}}
 */
function parseAwayToken(text) {
  if (typeof text !== "string") return { state: "unknown", line: null, reason: "no text" };
  const idx = text.indexOf(HEADING);
  if (idx === -1) return { state: "unknown", line: null, reason: "Away section heading not found" };
  // token lives on the heading line, within [STATUS: ...]
  const eol = text.indexOf("\n", idx);
  const line = text.slice(idx, eol === -1 ? undefined : eol);
  const m = line.match(/\[STATUS:\s*(ON|OFF)\b/i);
  if (!m) return { state: "unknown", line, reason: "no [STATUS: ON|OFF] token on the heading line" };
  return { state: m[1].toUpperCase() === "ON" ? "on" : "off", line, reason: m[1] === "OFF" ? "rule off" : "rule on" };
}

/**
 * Produce the toggled text: rewrites ONLY the ON/OFF word inside the
 * [STATUS: ] brackets of the Away heading line. Byte-exact elsewhere.
 * @returns {{text:string|null, from:string|null, error:string|null}}
 */
function toggleAwayToken(text) {
  const cur = parseAwayToken(text);
  if (cur.state === "unknown") return { text: null, from: null, to: null, error: cur.reason };
  const next = cur.state === "on" ? "OFF user toggle " + new Date().toISOString().slice(0, 16).replace("T", " ") + ", click" : "ON user click " + new Date().toISOString().slice(0, 16).replace("T", " ");
  let done = false;
  // escape regex metacharacters of the heading (it contains parens)
  const headingRe = new RegExp(HEADING.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^\\n]*");
  const out = text.replace(headingRe, (line) => {
    const nl = line.replace(/(\[STATUS:\s*)(ON|OFF)/i, (mm, p1) => { done = true; return p1 + next; });
    return nl;
  });
  if (!done) return { text: null, from: cur.state, to: null, error: "token regex miss on toggle" };
  return { text: out, from: cur.state, to: cur.state === "on" ? "off" : "on", error: null };
}

module.exports = { parseAwayToken, toggleAwayToken, HEADING };
