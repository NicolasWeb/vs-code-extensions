// Unit tests for src/parser.js — run: node test/parser_unit.js
const assert = require("assert");
const { parseAwayMode, stateOf, toggleAwayMode, humanAwayLabel, auditStamp, CONF_NAME, LABELS } = require("../src/parser");

// conf-file grammar: one state word; comments and blanks ignored
assert.strictEqual(parseAwayMode("ON\n").state, "on", "ON parsed");
assert.strictEqual(parseAwayMode("OFF\n").state, "off", "OFF parsed");
assert.strictEqual(parseAwayMode("  on  \n").state, "on", "case and spaces tolerated");
assert.strictEqual(parseAwayMode("# note\n\nOFF\n").state, "off", "first state line wins");
assert.strictEqual(parseAwayMode("MAYBE\n").state, "unknown", "malformed state line");
assert.strictEqual(parseAwayMode("# only a comment\n").state, "unknown", "no state line");
assert.strictEqual(parseAwayMode("").state, "unknown", "empty text carries no state");
assert.strictEqual(stateOf("OFF"), "off", "stateOf helper");

// toggle writes exactly one state line + one audit comment
const SHAPE = /^(ON|OFF)\n# Human Away Mode (OFF|ON) user (click|toggle) \d{4}-\d{2}-\d{2} \d{2}:\d{2}\n$/;
const t1 = toggleAwayMode("ON\n# Human Away Mode ON user click 2026-10-06 18:00\n");
assert.strictEqual(t1.from, "on"); assert.strictEqual(t1.to, "off");
assert.ok(t1.text.startsWith("OFF\n"), "toggle wrote OFF");
assert.ok(SHAPE.test(t1.text), "shape is state + audit comment: " + JSON.stringify(t1.text));
const t2 = toggleAwayMode("OFF\n");
assert.strictEqual(t2.from, "off"); assert.ok(t2.text.startsWith("ON\n"), "toggle wrote ON");
const t3 = toggleAwayMode(""); // fresh install: an absent file is an uncreated OFF
assert.strictEqual(t3.from, "off"); assert.ok(t3.text.startsWith("ON\n"), "absent file toggles to ON");
assert.ok(toggleAwayMode("???").error, "unparsable content refuses to toggle");
assert.ok(toggleAwayMode("# just a note\n").error, "missing state line refuses to toggle");

// labels: mode ON reads "Human : Here", mode OFF reads "Human : Away" (user 2026-10-07)
assert.strictEqual(humanAwayLabel("on"), "Human : Here", "ON label");
assert.strictEqual(humanAwayLabel("off"), "Human : Away", "OFF label");
assert.strictEqual(humanAwayLabel("switching"), LABELS.switching, "switching label");
assert.strictEqual(humanAwayLabel("nonsense"), LABELS.error, "unknown falls back to error");
assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(auditStamp()), "audit stamp format");
assert.strictEqual(CONF_NAME, "human_away_mode", "conf file name");
// shared conf records (`key value` lines) are the one recording surface of both owners
const { parseConf, setConfValue, dropConfValue, getConfValue, renderConf, CONF_KEYS, PREV_DEFAULT_TOKEN } = require("../src/parser");
const REC = parseConf("OFF\n" + CONF_KEYS.prevMaxRequests + " 2000\n# note\n");
assert.strictEqual(REC.state, "off", "records do not hide the state");
assert.strictEqual(REC.kv[CONF_KEYS.prevMaxRequests], "2000", "record parsed");
assert.strictEqual(REC.extra.length, 0, "a `key value` line is not an extra line");
assert.strictEqual(parseConf(CONF_KEYS.mrOwner + " extension\nON\n").state, "on", "state found after records");
assert.strictEqual(parseConf("k 1\nk 2\nON\n").kv.k, "1", "first record wins");
assert.strictEqual(parseConf("ON\nfree-form text here\n").extra.length, 1, "unparsable line kept verbatim");
const S1 = setConfValue("OFF\n" + CONF_KEYS.prevMaxRequests + " 2000\n", CONF_KEYS.mrOwner, "agent", "test ");
assert.ok(S1.text.startsWith("OFF\n"), "state line first");
assert.ok(S1.text.includes(CONF_KEYS.prevMaxRequests + " 2000"), "existing record kept");
assert.ok(S1.text.includes(CONF_KEYS.mrOwner + " agent"), "new record written");
assert.strictEqual((S1.text.match(/#/g) || []).length, 1, "one audit comment per write");
assert.ok(setConfValue("???\n", "k", "1", "test ").error, "unparsable conf refuses a record write");
assert.strictEqual(dropConfValue(S1.text, CONF_KEYS.mrOwner, "test ").text.includes(CONF_KEYS.prevMaxRequests + " 2000"), true, "drop keeps the sibling record");
assert.ok(!dropConfValue(S1.text, CONF_KEYS.mrOwner, "test ").text.includes(CONF_KEYS.mrOwner + " agent"), "dropped record gone");
assert.strictEqual(dropConfValue("ON\n", "absent", "test ").text, null, "dropping an absent record writes nothing");
assert.strictEqual(getConfValue(S1.text, CONF_KEYS.mrOwner), "agent", "getConfValue reads a record");
assert.strictEqual(getConfValue("ON\n", "nope"), undefined, "absent record is undefined");
assert.strictEqual(renderConf("on", {}, [], "x").trim(), "ON\n# x", "renderConf minimal form");
assert.ok(PREV_DEFAULT_TOKEN === "default", "unset value is recorded as the default token");
const fs = require("fs");
const total = (fs.readFileSync(__filename, "utf8").match(/assert\./g) || []).length;
console.log("PARSE_UNIT_OK all=" + total);
