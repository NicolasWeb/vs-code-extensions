"use strict";

const assert = require("node:assert/strict");
const {
  classifyStatus,
  nextNotificationState,
  parseStatusOutput,
} = require("../src/status");

assert.deepEqual(
  parseStatusOutput("diagnostic\nAI4DEV_TUNNEL_STATUS\tsystemd\tactive\t8443\t1\n"),
  {
    supervisor: "systemd",
    serviceState: "active",
    port: 8443,
    listening: true,
    state: "connected",
  }
);
assert.equal(classifyStatus("activating", false), "connecting");
assert.equal(classifyStatus("deactivating", false), "transitioning");
assert.equal(classifyStatus("inactive", false), "stopped");
assert.equal(classifyStatus("active", false), "degraded");
assert.equal(classifyStatus("inactive", true), "degraded");
assert.throws(() => parseStatusOutput("no status"), /Missing/);
assert.throws(
  () => parseStatusOutput("AI4DEV_TUNNEL_STATUS\tsystemd\tactive\t99999\t1"),
  /Invalid/
);

assert.deepEqual(nextNotificationState(false, "stopped"), { notified: true, notify: true });
assert.deepEqual(nextNotificationState(true, "degraded"), { notified: true, notify: false });
assert.deepEqual(nextNotificationState(true, "connecting"), { notified: true, notify: false });
assert.deepEqual(nextNotificationState(true, "connected"), { notified: false, notify: false });
assert.deepEqual(nextNotificationState(false, "unavailable"), { notified: true, notify: true });

console.log("ai4dev_tunnel_status_test: PASS");
