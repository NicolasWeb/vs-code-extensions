// Idle-cost guard design check: the extension re-polls metadata only.
// This script emulates 60s of the guard loop (statSync only, as refreshGuard does).
const fs = require("fs");
const target = process.argv[2] || require("path").join(require("os").homedir(), "agents", "AGENTS.md");
const sec = Number(process.argv[3] || 5);
let last = "", calls = 0, parses = 0;
const t0 = process.hrtime.bigint();
for (let i = 0; i < sec * 2; i++) {
  const s = fs.statSync(target); calls++;
  const sig = s.mtimeMs + ":" + s.size;
  if (sig !== last) { last = sig; fs.readFileSync(target, "utf8"); parses++; }
}
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
const pctIdle = (ms / (sec * 1000)) * 100;
console.log(pctIdle < 0.1 ? "PERF_IDLE_OK guardPctIdle=" + pctIdle.toFixed(4) + " stats=" + calls + " parses=" + parses : "PERF_IDLE_WARN guardPctIdle=" + pctIdle.toFixed(4));
