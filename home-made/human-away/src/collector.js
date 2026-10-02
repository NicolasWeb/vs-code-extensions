// Pure observatory logic, no vscode import -> unit-testable in plain node.
// Auto-Approve observatory (PLAN_AUTOAPPROVE_TUNING step 1): a settings
// watcher + session ledger + tiering report over the PUBLIC local signal
// only -- `chat.tools.terminal.autoApprove`. A command the user approves
// with an "always" choice is persisted into that map, so watching its
// change (and diffing snapshots) observes the stream of persisted
// approvals without touching Copilot internals, telemetry or network
// (FEATURES non-goals: no Copilot-internal reading, no network/deps).
"use strict";

// The AUTO_APPROVE_KEY, its tiers (§1 of PLAN_AUTOAPPROVE_TUNING) and the
// report are the three named spec components, kept as pure functions so
// the unit test exercises them without the extension host.
const AUTO_APPROVE_KEY = "chat.tools.terminal.autoApprove";

// Tier tables: ordered [tier, RegExp] -- first match wins. Kept as data so
// the tiering report and the classifier never drift from §1 of the plan.
// NEVER-listed tiers (T4/T5) are unconditional: presence/hour never unlock.
const TIER_RULES = [
  ["T5", /(^|\s)(rm\s+-[a-z]*r[a-z]*f|rm\s+-[a-z]*f[a-z]*r|git\s+reset\s+--hard|git\s+config\s+--global|git\s+push\b.*(--force|-f\b)|git\s+clean\s+-[a-z]*f|curl\b.*(-o|-O|--output)|:\(\)\s*\{.*\};\s*:|mkfs|dd\s+if=|chmod\s+777|shutdown|reboot)/i],
  ["T4", /(^|\s)(ssh|scp|sftp|robot|rpa|redfishcmd|_blade_executor_| ansible)\b|\bblade\b|bmc/i],
  ["T3", /(^|\s)(gh\b|git\s+push\b)/i],
  ["T2", /(^|\s)(commit_as_agent\.sh|git\s+commit\b)/i],
  ["T1", /(^|\s)(sed\s+(-\w*i\b|--in-place|-i\b)|pytest|py_compile|python3?\b|node\b|npm\b|npx\b|bash\b|source\b|uv\b|pip\b|\.venv|run_all|_smoke|smoke)/i],
  ["T0", /(^|\s)(ls|cat|sed|grep|rg|head|tail|wc|find|tree|du|df|echo|printf|git\s+(status|diff|log|show|blame|merge-base|rev-parse|ls-files|ls-tree)|code\s+--diff|jq|realpath|basename|dirname|file|stat|which|column|sort|uniq|cut|awk|tr)\b/i],
];

/** Classify one command pattern into a tier id (T0-T5) or UNTIERED. */
function classifyTier(pattern) {
  if (typeof pattern !== "string" || !pattern.trim()) return "UNTIERED";
  const p = pattern.trim();
  for (const [tier, re] of TIER_RULES) if (re.test(p)) return tier;
  return "UNTIERED";
}

/** Tier ids that must NEVER be auto-approved regardless of context. */
function isNeverTier(tier) { return tier === "T4" || tier === "T5"; }

/** The §1 proposal per tier: should this family be auto-approved, and when. */
const TIER_PROPOSAL = {
  T0: { approve: "always", note: "read-only local fs/git inspection" },
  T1: { approve: "away-or-present", note: "local repo execution (mocks/timeouts)" },
  T2: { approve: "away-or-present", note: "agent commits (MASTER gate is the real guard)" },
  T3: { approve: "agents-remote-only", note: "push/gh scoped to ~/agents" },
  T4: { approve: "never", note: "shared HPC hardware (Ask-first)" },
  T5: { approve: "never", note: "destructive / history / credentials" },
  UNTIERED: { approve: "ask", note: "unrecognised family - keep prompting" },
};

/** Snapshot diff between two chat.tools.terminal.autoApprove maps.
 *  A newly persisted=true matcher = a saved approval; removal = revoked. */
function diffAutoApprove(prev, next) {
  const a = prev && typeof prev === "object" ? prev : {};
  const b = next && typeof next === "object" ? next : {};
  const added = [], removed = [], changed = [];
  for (const k of Object.keys(b)) {
    if (!(k in a)) added.push(k);
    else if (!!a[k] !== !!b[k]) changed.push({ pattern: k, from: !!a[k], to: !!b[k] });
  }
  for (const k of Object.keys(a)) if (!(k in b)) removed.push(k);
  return { added, removed, changed };
}

/** Build one ledger event from a snapshot + diff. Pure, no clock/IO: the
 *  caller passes ts so the unit test stays deterministic. */
function buildLedgerEvent(ts, awayState, diff, snapKeys) {
  const events = [];
  for (const p of diff.added) events.push({ ts, type: "approve", pattern: p, tier: classifyTier(p), away: awayState === "on" });
  for (const p of diff.removed) events.push({ ts, type: "revoke", pattern: p, tier: classifyTier(p), away: awayState === "on" });
  for (const c of diff.changed) events.push({ ts, type: c.to ? "approve" : "revoke", pattern: c.pattern, tier: c.tier || classifyTier(c.pattern), away: awayState === "on" });
  // seed observation of pre-existing matchers (baseline, first snapshot only)
  const seeds = [];
  if (snapKeys) for (const p of snapKeys) seeds.push({ ts, type: "baseline", pattern: p, tier: classifyTier(p), away: awayState === "on" });
  return { events, seeds };
}

/** Aggregate ledger events into approve-rate per tier vs the §1 proposal,
 *  plus a per-family breakdown. Returns a plain report object. */
function aggregateReport(events) {
  const byTier = {};
  for (const e of (events || [])) {
    const t = byTier[e.tier] || (byTier[e.tier] = { tier: e.tier, approves: 0, revokes: 0, baselines: 0, patterns: new Set(), awayApproves: 0 });
    if (e.type === "approve") { t.approves++; if (e.away) t.awayApproves++; }
    else if (e.type === "revoke") t.revokes++;
    else if (e.type === "baseline") t.baselines++;
    t.patterns.add(e.pattern);
  }
  const rows = Object.keys(byTier).sort().map((tier) => {
    const b = byTier[tier];
    const decisions = b.approves + b.revokes;
    return {
      tier, proposal: TIER_PROPOSAL[tier] || TIER_PROPOSAL.UNTIERED,
      approves: b.approves, revokes: b.revokes, baselines: b.baselines,
      awayApproves: b.awayApproves, distinct: b.patterns.size,
      approveRate: decisions ? +(b.approves / decisions * 100).toFixed(1) : null,
      patterns: [...b.patterns].sort(),
    };
  });
  const total = { approves: 0, revokes: 0 };
  for (const r of rows) { total.approves += r.approves; total.revokes += r.revokes; }
  // conflict: a NEVER-tier shows any approve -> flag loudly for the plan §3
  const violations = rows.filter((r) => isNeverTier(r.tier) && r.approves > 0);
  return { rows, total, violations };
}

/** Render the aggregate as a plain-text report for the tiering command
 *  (deterministic given events -> unit-testable; the UI wraps it). */
function renderReport(agg, meta) {
  const m = meta || {};
  const target = typeof m.target === "number" && m.target > 0 ? m.target : 50;
  const days = typeof m.windowDays === "number" && m.windowDays > 0 ? m.windowDays : 7;
  const lines = [];
  lines.push("Human Away - Auto-Approve observatory / tiering report");
  lines.push("events=" + ((m.events != null) ? m.events : (agg.total.approves + agg.total.revokes)) +
    "  approve=" + agg.total.approves + "  revoke=" + agg.total.revokes +
    (m.window ? "  window=" + m.window : "") + (m.away ? "  away-context=YES" : ""));
  lines.push("target: " + target + " events / ~" + days + " days (PLAN_AUTOAPPROVE_TUNING step 2)");
  lines.push("");
  const order = ["T0", "T1", "T2", "T3", "T4", "T5", "UNTIERED"];
  for (let i = 0; i < order.length; i++) {
    const tier = order[i];
    const row = agg.rows.filter((r) => r.tier === tier)[0];
    const prop = TIER_PROPOSAL[tier];
    lines.push("[" + tier + "] proposal=" + prop.approve + "  (" + prop.note + ")");
    if (!row) { lines.push("      observed: none"); continue; }
    lines.push("      observed: approves=" + row.approves + (row.approves ? " (away " + row.awayApproves + ")" : "") +
      "  revokes=" + row.revokes + "  baselines=" + row.baselines + "  distinct=" + row.distinct +
      (row.approveRate == null ? "" : "  approve-rate=" + row.approveRate + "%"));
    if (row.patterns.length) lines.push("      patterns: " + row.patterns.slice(0, 12).join(", ") + (row.patterns.length > 12 ? " (+" + (row.patterns.length - 12) + ")" : ""));
  }
  lines.push("");
  if (agg.violations.length) {
    lines.push("!! NEVER-TIER VIOLATIONS (approve seen on a shared-hw/destructive tier):");
    for (const v of agg.violations) {
      lines.push("   - [" + v.tier + "] approves=" + v.approves + " patterns: " + v.patterns.slice(0, 6).join(", "));
    }
    lines.push("   -> surface in PLAN_AUTOAPPROVE_TUNING step 3 before any settings diff.");
  } else {
    lines.push("NEVER-tiers: no observed approvals (T4/T5 clean).");
  }
  lines.push("");
  const reached = (agg.total.approves + agg.total.revokes) >= target;
  lines.push("VERDICT: " + (reached ? "COLLECT_TARGET_REACHED (>=" + target + " events) -> proceed to analysis" : "COLLECTING (<" + target + " decision events) -> keep observing"));
  return lines.join("\n");
}

module.exports = {
  AUTO_APPROVE_KEY, classifyTier, isNeverTier, TIER_PROPOSAL,
  diffAutoApprove, buildLedgerEvent, aggregateReport, renderReport,
};
