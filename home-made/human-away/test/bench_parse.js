// Performance budget bench: parse cost. Run: node test/bench_parse.js
const { parseAwayToken } = require("../src/parser");
const fs = require("fs");
const arg = process.argv[2];
const src = fs.readFileSync(arg || require("path").join(require("os").homedir(), "agents", "AGENTS.md"), "utf8");
const N = 1000;
const t0 = process.hrtime.bigint();
for (let i = 0; i < N; i++) parseAwayToken(src);
const t1 = process.hrtime.bigint();
const us = Number(t1 - t0) / 1000 / N;
console.log(us < 1000 ? "PERF_PARSE_OK mean_us=" + us.toFixed(2) : "PERF_PARSE_FAIL mean_us=" + us.toFixed(2));
