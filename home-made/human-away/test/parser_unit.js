// Unit tests for src/parser.js — run: node test/parser_unit.js (needs node)
const assert = require("assert");
const { parseAwayToken, toggleAwayToken } = require("../src/parser");
const H = "## Autonomous unattended work (Away mode) [STATUS: ON user order 2026-10-01] (user 2026-10-01, rev A)";
const pre = "# Master\n\nintro text\n\n";
const post = "\n\n## Next Rule\nbody\n";
const onText = pre + H + post;
assert.strictEqual(parseAwayToken(onText).state, "on", "ON parsed");
const offText = pre + H.replace("[STATUS: ON", "[STATUS: OFF") + post;
assert.strictEqual(parseAwayToken(offText).state, "off", "OFF parsed");
assert.strictEqual(parseAwayToken("# master\nno heading here").state, "unknown", "missing heading");
assert.strictEqual(parseAwayToken(pre + H.replace("[STATUS: ON", "[STATUS: MAYBE") + post).state, "unknown", "malformed token");
const t1 = toggleAwayToken(onText);
assert.strictEqual(t1.from, "on"); assert.strictEqual(t1.to, "off");
assert.ok(t1.text.includes("[STATUS: OFF"), "toggle wrote OFF");
assert.strictEqual(t1.text.split("\n").length, onText.split("\n").length, "line count preserved");
assert.ok(t1.text.startsWith(pre), "prefix byte-exact"); assert.ok(t1.text.endsWith(post), "suffix byte-exact");
const t2 = toggleAwayToken(offText);
assert.strictEqual(t2.from, "off"); assert.ok(t2.text.includes("[STATUS: ON"), "toggle wrote ON");
assert.ok(toggleAwayToken("# nope").error, "missing heading error");
// #1 variabilisation: custom heading anchor
const ALT = "## Focus Mode";
const altDoc = pre + ALT + " [STATUS: ON order]" + post;
assert.strictEqual(parseAwayToken(altDoc, ALT).state, "on", "custom heading parsed");
assert.strictEqual(parseAwayToken(altDoc).state, "unknown", "default heading ignores renamed rule");
const t3 = toggleAwayToken(altDoc, ALT);
assert.strictEqual(t3.from, "on");
assert.ok(t3.text.includes("[STATUS: OFF"), "custom heading toggles");
// A2: audit stamp format = minute-precision
const { auditStamp, HEADING } = require("../src/parser");
assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(auditStamp()), "stamp format");
void HEADING;
console.log("PARSE_UNIT_OK all=" + 14);
