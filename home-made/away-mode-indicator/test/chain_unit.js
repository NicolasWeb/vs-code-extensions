// Algorithm-level check of the WSL UNC/POSIX candidate derivation (mirrors resolveChain).
const assert = require("assert");
function derive(pathStr, authority, platform) {
  const candidates = [];
  const seg = pathStr.split("/");
  const hi = seg.lastIndexOf("home");
  if (hi >= 0 && seg.length > hi + 1) {
    const pair = seg.slice(hi, hi + 2);
    candidates.push("/" + pair.join("/") + "/agents/AGENTS.md");
    if (platform === "win32") {
      const root = seg.slice(0, hi).filter(Boolean).join("\\");
      candidates.push("\\\\" + authority + "\\" + root + "\\" + pair.join("\\") + "\\agents\\AGENTS.md");
    }
  }
  return candidates;
}
// Case 1: workspace opened via UNC from Windows (this user's real case)
let c = derive("/FedoraLinux-44/home/nicolas/repositories/local/kevina", "wsl.localhost", "win32");
assert.strictEqual(c[0], "/home/nicolas/agents/AGENTS.md");
assert.strictEqual(c[1], "\\\\wsl.localhost\\FedoraLinux-44\\home\\nicolas\\agents\\AGENTS.md");
// Case 2: Remote-WSL extension host (POSIX)
c = derive("/home/nicolas/repositories/local/kevina", "", "linux");
assert.strictEqual(c[0], "/home/nicolas/agents/AGENTS.md");
assert.strictEqual(c.length, 1);
// Case 3: no home segment -> no derived candidates
c = derive("/mnt/c/work", "", "linux");
assert.strictEqual(c.length, 0);
console.log("CHAIN_UNIT_OK cases=3");
