// Algorithm-level check of the WSL UNC/POSIX candidate derivation (mirrors resolveChain
// in src/extension.js): the Human Away Mode conf file, not AGENTS.md.
const assert = require("assert");
const CONF_NAME = "human_away_mode";

function derive(pathStr, authority, platform) {
  const candidates = [];
  const seg = pathStr.split("/");
  const hi = seg.lastIndexOf("home");
  if (hi >= 0 && seg.length > hi + 1) {
    const pair = seg.slice(hi, hi + 2);
    candidates.push("/" + pair.join("/") + "/agents/" + CONF_NAME);
    if (platform === "win32") {
      const root = seg.slice(0, hi).filter(Boolean).join("\\");
      candidates.push("\\\\" + authority + "\\" + root + "\\" + pair.join("\\") + "\\agents\\" + CONF_NAME);
    }
  }
  return candidates;
}
// Case 1: workspace opened via UNC from Windows (this user's real case)
let c = derive("/FedoraLinux-44/home/nicolas/repositories/bull/validation/buru", "wsl.localhost", "win32");
assert.strictEqual(c.length, 2, "POSIX + UNC candidates");
assert.strictEqual(c[0], "/home/nicolas/agents/human_away_mode");
assert.strictEqual(c[1], "\\\\wsl.localhost\\FedoraLinux-44\\home\\nicolas\\agents\\human_away_mode");
// Case 2: inside WSL (Linux extension host) -> POSIX path only
c = derive("/home/nicolas/agents", "", "linux");
assert.deepStrictEqual(c, ["/home/nicolas/agents/human_away_mode"]);
// Case 3: path without a home segment -> no derived candidate, $HOME fallback only
c = derive("/mnt/c/work", "", "linux");
assert.deepStrictEqual(c, []);
console.log("CHAIN_UNIT_OK cases=3 conf=" + CONF_NAME);
