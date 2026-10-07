// Performance budget bench: parse cost. Run: node test/bench_parse.js [conf-file-path]
const { parseAwayMode } = require("../src/parser");
const fs = require("fs");
const arg = process.argv[2];
const src = fs.readFileSync(arg || require("path").join(require("os").homedir(), "agents", "human_away_mode"), "utf8");
const N = 1000;
const t0 = process.hrtime.bigint();
for (let i = 0; i < N; i++) parseAwayMode(src);
const t1 = process.hrtime.bigint();
const us = Number(t1 - t0) / 1000 / N;
console.log(us < 50 ? "PERF_PARSE_OK mean_us=" + us.toFixed(3) : "PERF_PARSE_FAIL mean_us=" + us.toFixed(3));
