// Human Away Mode 0.4.0: chat.agent.maxRequests coordination unit suite.
// Mirrors extension.js ownership state machine against the shared conf records
// (mrOwner / prevMaxRequests) instead of a private globalState stash:
// - an existing owner (extension or agent) is never stepped on;
// - a foreign value while ON releases our record without overwriting it;
// - a previous value recorded by the other owner is ADOPTED (ARB-1, 2026-10-07).
const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const parser = require(path.join(__dirname, "..", "src", "parser.js"));

const KEY_OWNER = parser.CONF_KEYS.mrOwner;
const KEY_PREV = parser.CONF_KEYS.prevMaxRequests;
const TARGET = 100000;

// Minimal harness: conf text on a temp file + a settable settings "value".
function makeHarness(initialValue, confText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "haw-mr-"));
  const conf = path.join(dir, "human_away_mode");
  fs.writeFileSync(conf, confText === undefined ? "OFF\n" : confText);
  const h = { conf, value: initialValue, writes: [], notes: [] };
  h.get = () => (h.value === "__unset__" ? undefined : h.value);
  h.kv = () => parser.parseConf(fs.readFileSync(h.conf, "utf8")).kv;
  h.patch = (sets, drops, who) => {
    let text = fs.readFileSync(h.conf, "utf8");
    for (const k of Object.keys(sets || {})) {
      const r = parser.setConfValue(text, k, sets[k], who);
      assert.ok(!r.error, "setConfValue: " + r.error);
      text = r.text;
    }
    for (const k of drops || []) {
      const r = parser.dropConfValue(text, k, who);
      assert.ok(!r.error, "dropConfValue: " + r.error);
      if (r.text) text = r.text;
    }
    fs.writeFileSync(h.conf, text);
  };
  h.update = (v) => { h.value = v; h.writes.push(v === undefined ? "unset" : v); };
  h.close = () => fs.rmSync(dir, { recursive: true, force: true });
  return h;
}

// Mirror of applyAwayMaxRequests(wanted) with target = TARGET.
function apply(h, wanted) {
  const kv = h.kv();
  const owner = kv[KEY_OWNER];
  const prev = kv[KEY_PREV];
  const cur = h.get();
  if (wanted) {
    if (owner === "agent") { h.notes.push("agent-owns"); return; }
    if (owner === "extension") { h.notes.push("ours"); return; }
    if (cur === TARGET) {
      h.patch({ prevMaxRequests: prev === undefined ? parser.PREV_DEFAULT_TOKEN : prev, mrOwner: "extension" }, null, "test takeover ");
      h.notes.push("takeover");
      return;
    }
    if (typeof cur === "number" && cur >= TARGET) { h.notes.push("untouched"); return; }
    const held = cur === undefined ? parser.PREV_DEFAULT_TOKEN : String(cur);
    h.patch({ prevMaxRequests: held, mrOwner: "extension" }, null, "test stash ");
    h.update(TARGET);
    h.notes.push("raised");
    return;
  }
  if (owner === "agent") { h.notes.push("agent-restores-it"); return; }
  if (owner !== "extension") { h.notes.push("noop"); return; }
  if (cur !== TARGET) {
    h.patch(null, [KEY_OWNER], "test release ");
    h.notes.push("released");
    return;
  }
  const n = Number(prev);
  h.patch(null, [KEY_OWNER, KEY_PREV], "test restore ");
  h.update(Number.isFinite(n) ? n : undefined);
  h.notes.push("restored");
}

let n = 0;
function step(name, fn) { fn(); n++; return name; }

step("raise+stash", () => {
  const h = makeHarness(2000);
  apply(h, true);
  assert.strictEqual(h.value, TARGET);
  assert.strictEqual(h.kv()[KEY_PREV], "2000");
  assert.strictEqual(h.kv()[KEY_OWNER], "extension");
  apply(h, true); // idempotent: no second write, record untouched
  assert.deepStrictEqual(h.writes, [TARGET]);
  assert.strictEqual(h.kv()[KEY_PREV], "2000");
  apply(h, false);
  assert.strictEqual(h.value, 2000);
  assert.deepStrictEqual(h.writes, [TARGET, 2000]);
  assert.strictEqual(h.kv()[KEY_OWNER], undefined);
  assert.strictEqual(h.kv()[KEY_PREV], undefined);
  h.close();
});

step("unset-prev-restores-default", () => {
  const h = makeHarness("__unset__");
  apply(h, true);
  assert.strictEqual(h.kv()[KEY_PREV], parser.PREV_DEFAULT_TOKEN);
  apply(h, false);
  assert.strictEqual(h.value, undefined);
  assert.ok(h.writes.includes("unset"), "unset written");
  h.close();
});

step("already-high-left-alone", () => {
  const h = makeHarness(200000);
  apply(h, true);
  assert.deepStrictEqual(h.writes, []);
  assert.strictEqual(h.kv()[KEY_OWNER], undefined);
  assert.ok(h.notes.includes("untouched"));
  apply(h, false);
  assert.deepStrictEqual(h.writes, []);
  h.close();
});

step("agent-owns-never-stepped", () => {
  // The agent raised the setting under MASTER AGENTS and recorded itself.
  const h = makeHarness(TARGET, "ON\n" + KEY_PREV + " 2000\n" + KEY_OWNER + " agent\n");
  apply(h, true);
  assert.ok(h.notes.includes("agent-owns"));
  assert.deepStrictEqual(h.writes, []);
  assert.strictEqual(h.kv()[KEY_OWNER], "agent"); // record kept for the agent
  apply(h, false);
  assert.strictEqual(h.kv()[KEY_OWNER], "agent");
  assert.strictEqual(h.value, TARGET); // the agent restores its own override
  assert.deepStrictEqual(h.writes, []);
  h.close();
});

step("takeover-adopts-agents-previous-value", () => {
  // ARB-1 win: prevMaxRequests recorded by the agent, no owner, value already at target
  // -> ownership is taken and the PREVIOUS value survives (not lost to "default").
  const h = makeHarness(TARGET, "OFF\n" + KEY_PREV + " 2000\n");
  apply(h, true);
  assert.ok(h.notes.includes("takeover"));
  assert.deepStrictEqual(h.writes, []); // never a second write
  assert.strictEqual(h.kv()[KEY_OWNER], "extension");
  assert.strictEqual(h.kv()[KEY_PREV], "2000"); // adopted, not overwritten
  apply(h, false);
  assert.strictEqual(h.value, 2000);
  assert.deepStrictEqual(h.writes, [2000]);
  h.close();
});

step("foreign-move-releases", () => {
  const g = makeHarness(2000);
  apply(g, true); // ours: value = TARGET, prev = 2000
  g.value = 5000; // the other owner moved the setting
  apply(g, false);
  assert.ok(g.notes.includes("released"));
  assert.strictEqual(g.value, 5000); // never written over
  assert.strictEqual(g.kv()[KEY_OWNER], undefined);
  assert.strictEqual(g.kv()[KEY_PREV], "2000"); // the other owner's value is kept for them
  assert.deepStrictEqual(g.writes, [TARGET]);
  g.close();
});

step("prev-garbage-restores-default", () => {
  const h = makeHarness(TARGET, "ON\n" + KEY_PREV + " not-a-number\n" + KEY_OWNER + " extension\n");
  apply(h, false);
  assert.strictEqual(h.value, undefined);
  assert.ok(h.writes.includes("unset"));
  h.close();
});

step("records-survive-a-toggle", () => {
  const text0 = "OFF\n" + KEY_PREV + " 2000\n";
  const r = parser.toggleAwayMode(text0);
  assert.strictEqual(r.to, "on");
  assert.ok(r.text.startsWith("ON\n"), "state line first");
  assert.ok(r.text.includes(KEY_PREV + " 2000"), "record preserved by the toggle");
  const back = parser.toggleAwayMode(r.text);
  assert.strictEqual(parser.stateOf(back.text), "off");
  assert.strictEqual(parser.getConfValue(back.text, KEY_PREV), "2000");
});

console.log("MAXREQ_UNIT_OK cases=" + n);
