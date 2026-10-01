// Pure logic, no vscode import -> unit-testable in plain node.
"use strict";

const HEADING = "## Autonomous unattended work (Away mode)";

function auditStamp() {
  // audit format decided: minute-precision ISO stamp (seconds stripped);
  // single source of truth for every toggled [STATUS:] reason.
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}
/**
 * Parse the truth file text.
 * @param {string} text full AGENTS.md content
 * @param {string} [heading] anchor heading (defaults to HEADING)
 * @returns {{state:'on'|'off'|'unknown', line:string|null, reason:string}}
 */
function parseAwayToken(text, heading) {
  const H = typeof heading === "string" && heading.trim() ? heading.trim() : HEADING;
  if (typeof text !== "string") return { state: "unknown", line: null, reason: "no text" };
  const idx = text.indexOf(H);
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
function toggleAwayToken(text, heading) {
  const H = typeof heading === "string" && heading.trim() ? heading.trim() : HEADING;
  const cur = parseAwayToken(text, H);
  if (cur.state === "unknown") return { text: null, from: null, to: null, error: cur.reason };
  const next = cur.state === "on" ? "OFF user toggle " + auditStamp() + ", click" : "ON user click " + auditStamp();
  let done = false;
  // escape regex metacharacters of the heading (it contains parens)
  const headingRe = new RegExp(H.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[^\\n]*");
  const out = text.replace(headingRe, (line) => {
    const nl = line.replace(/(\[STATUS:\s*)(ON|OFF)/i, (mm, p1) => { done = true; return p1 + next; });
    return nl;
  });
  if (!done) return { text: null, from: cur.state, to: null, error: "token regex miss on toggle" };
  return { text: out, from: cur.state, to: cur.state === "on" ? "off" : "on", error: null };
}

module.exports = { parseAwayToken, toggleAwayToken, auditStamp, HEADING };
