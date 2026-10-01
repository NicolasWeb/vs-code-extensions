// Algorithm-level check of the away-mode temporary override of
// chat.agent.maxRequests (mirrors applyAwayMaxRequests in src/extension.js):
// stash-apply-restore semantics, idempotence, unset-default restore,
// already-high user values left untouched.
const assert = require("assert");

function firstDefined(list, dflt) { for (const v of list) { if (v !== undefined) return v; } return dflt; }

function makeApi(initialValue, target) {
  // global value, globalState stash, applied writes counted
  const api = { value: initialValue, stash: undefined, writes: [] };
  api.get = () => (api.value === "__unset__" ? undefined : api.value);
  api.inspect = () => ({ globalValue: api.get(), workspaceValue: undefined, workspaceFolderValue: undefined });
  api.update = (v) => { api.value = v; api.writes.push(v); };
  return api;
}

function applyAway(api, wanted, target) {
  if (wanted) {
    if (api.stash) return; // already applied
    const cur = api.get();
    if (typeof cur === "number" && cur >= target) return; // stay out of a high user value
    const held = firstDefined([api.inspect().workspaceFolderValue, api.inspect().workspaceValue, api.inspect().globalValue], null);
    api.stash = { held: held, at: Date.now() };
    api.update(target);
    return;
  }
  if (!api.stash) return; // never applied at our scope
  const held = api.stash.held;
  api.stash = undefined;
  api.update(typeof held === "number" ? held : undefined);
}

// 1 — user value set (2000): apply stashes it, override active
let a = makeApi(2000);
applyAway(a, true, 100000);
assert.deepStrictEqual(a.stash, { held: 2000, at: a.stash.at });
assert.strictEqual(a.value, 100000);

// 2 — idempotence: applying again while ON never re-stashes the override
applyAway(a, true, 100000);
assert.strictEqual(a.stash.held, 2000);

// 3 — OFF restores the user value exactly, stash cleared
applyAway(a, false, 100000);
assert.strictEqual(a.value, 2000);
assert.strictEqual(a.stash, undefined);

// 4 — re-apply after a full OFF cycle works again
applyAway(a, true, 100000);
assert.strictEqual(a.value, 100000);
applyAway(a, false, 100000);
assert.strictEqual(a.value, 2000);

// 5 — unset user value: restore goes back to "undefined" (= VS Code default)
let b = makeApi("__unset__");
applyAway(b, true, 100000);
assert.strictEqual(b.stash.held, null);
assert.strictEqual(b.value, 100000);
applyAway(b, false, 100000);
assert.strictEqual(b.value, undefined);
assert.strictEqual(b.stash, undefined);

// 6 — user value already >= temporary: never touched, never stashed;
//     the later OFF is a no-op (nothing was applied at our scope)
let c = makeApi(200000);
applyAway(c, true, 100000);
assert.strictEqual(c.stash, undefined);
assert.strictEqual(c.value, 200000);
assert.deepStrictEqual(c.writes, []);
applyAway(c, false, 100000);
assert.strictEqual(c.value, 200000);
assert.deepStrictEqual(c.writes, []);

// 7 — user raises awayMaxRequests so their own value becomes high enough
//     (150000 user < 200000 temporary): stashed, then restored
let d = makeApi(150000);
applyAway(d, true, 200000);
assert.strictEqual(d.value, 200000);
applyAway(d, false, 200000);
assert.strictEqual(d.value, 150000);

// 8 — crash-recovery shape: a surviving stash (window reload killed before
//     deactivate) still restores the held value when OFF is applied
let e = makeApi(99999);
e.stash = { held: 2000, at: 1 }; // survived in globalState
applyAway(e, false, 100000);
assert.strictEqual(e.value, 2000);
assert.strictEqual(e.stash, undefined);

console.log("MAXREQ_UNIT_OK cases=8");
