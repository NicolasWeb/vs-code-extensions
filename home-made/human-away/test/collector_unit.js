// Unit test of the observatory collector (mirrors src/collector.js):
// tier classification vs PLAN_AUTOAPPROVE_TUNING §1, snapshot diff,
// ledger aggregation, report tokens. Run: node test/collector_unit.js
const assert = require("assert");
const COL = require("../src/collector");

// 1 — tiering of the §1 evidence base (observed command families)
assert.strictEqual(COL.classifyTier("git status"), "T0");
assert.strictEqual(COL.classifyTier("git diff HEAD"), "T0");
assert.strictEqual(COL.classifyTier("grep -rn pat ."), "T0");
assert.strictEqual(COL.classifyTier("head -25 file.txt"), "T0");
assert.strictEqual(COL.classifyTier("code --diff a b"), "T0");
assert.strictEqual(COL.classifyTier("python3 -m py_compile x"), "T1");
assert.strictEqual(COL.classifyTier("bash suite_run_all.sh"), "T1");
assert.strictEqual(COL.classifyTier("sed -i s/a/b/ f.py"), "T1");
assert.strictEqual(COL.classifyTier("commit_as_agent.sh -m x"), "T2");
assert.strictEqual(COL.classifyTier("git commit -m x"), "T2");
assert.strictEqual(COL.classifyTier("git push origin main"), "T3");
assert.strictEqual(COL.classifyTier("gh pr create"), "T3");
assert.strictEqual(COL.classifyTier("ssh blade-01 uptime"), "T4");
assert.strictEqual(COL.classifyTier("rm -rf /tmp/x"), "T5");
assert.strictEqual(COL.classifyTier("git reset --hard HEAD"), "T5");
assert.strictEqual(COL.classifyTier("git push --force origin"), "T5");
assert.strictEqual(COL.classifyTier("docker run x"), "UNTIERED");
assert.strictEqual(COL.classifyTier(""), "UNTIERED");

// 2 — NEVER-lists unconditional (§1)
assert.ok(COL.isNeverTier("T4") && COL.isNeverTier("T5"));
assert.ok(!COL.isNeverTier("T3"));

// 3 — snapshot diff: persisted=true key appearing = one saved approval
let d = COL.diffAutoApprove({ "code --diff": true }, { "code --diff": true, "git status": true });
assert.deepStrictEqual(d.added, ["git status"]);
assert.deepStrictEqual(d.removed, []);
d = COL.diffAutoApprove({ "git status": true }, { "git status": false });
assert.strictEqual(d.changed.length, 1);
assert.strictEqual(d.changed[0].to, false);

// 4 — ledger event build carries tier + away context
const built = COL.buildLedgerEvent(111, "on", { added: ["git status"], removed: ["rm -rf /x"], changed: [] }, null);
assert.strictEqual(built.events.length, 2);
assert.strictEqual(built.events[0].tier, "T0");
assert.strictEqual(built.events[0].away, true);
assert.strictEqual(built.events[1].type, "revoke");

// 5 — aggregation + rate + NEVER-violation flag
const agg = COL.aggregateReport([
  { ts: 1, type: "approve", pattern: "git status --porcelain", tier: "T0", away: true },
  { ts: 2, type: "approve", pattern: "git status --porcelain", tier: "T0", away: false },
  { ts: 3, type: "approve", pattern: "ssh blade", tier: "T4", away: true },
]);
const t0 = agg.rows.find((r) => r.tier === "T0");
assert.strictEqual(t0.approveRate, 100);
assert.strictEqual(t0.awayApproves, 1);
assert.strictEqual(agg.violations.length, 1);
assert.strictEqual(agg.violations[0].tier, "T4");

// 6 — report render: deterministic tokens both below and above the 50 target
const many = [];
for (let i = 0; i < 50; i++) many.push({ ts: i, type: "approve", pattern: "git log", tier: "T0", away: false });
assert.ok(COL.renderReport(COL.aggregateReport(many), { events: 52 }).includes("COLLECT_TARGET_REACHED"));
assert.ok(COL.renderReport(COL.aggregateReport([{ ts: 1, type: "approve", pattern: "git log", tier: "T0", away: false }]), { events: 1 }).includes("COLLECTING"));

console.log("TIER_UNIT_OK assertions=21");
