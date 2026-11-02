"use strict";

const assert = require("node:assert/strict");
const {
  classifyStatus,
  formatServiceWindow,
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
    serviceWindow: null,
    authenticationPrefillEnabled: null,
  }
);
const configuredStatus = parseStatusOutput(
  "AI4DEV_TUNNEL_STATUS\tsystemd\tactive\t8443\t1\t1\t00:00\t6\t00:00\tEurope/Paris"
);
assert.deepEqual(configuredStatus.serviceWindow, {
  startDay: 1,
  startTime: "00:00",
  endDay: 6,
  endTime: "00:00",
  timeZone: "Europe/Paris",
});
assert.equal(configuredStatus.authenticationPrefillEnabled, null);
assert.equal(
  formatServiceWindow(configuredStatus.serviceWindow, "fr-FR"),
  "lundi 00:00 – samedi 00:00 (Europe/Paris)"
);
assert.equal(
  parseStatusOutput(
    "AI4DEV_TUNNEL_STATUS\tsystemd\tactive\t8443\t1\t1\t00:00\t6\t00:00\tEurope/Paris\ttrue"
  ).authenticationPrefillEnabled,
  true
);
assert.equal(
  parseStatusOutput(
    "AI4DEV_TUNNEL_STATUS\tsystemd\tactive\t8443\t1\t1\t00:00\t6\t00:00\tEurope/Paris\tfalse"
  ).authenticationPrefillEnabled,
  false
);
assert.equal(
  parseStatusOutput(
    "AI4DEV_TUNNEL_STATUS\tsystemd\tactive\t8443\t1\t1\t00:00\t6\t00:00\tEurope/Paris\tunsupported"
  ).authenticationPrefillEnabled,
  null
);
assert.throws(
  () =>
    parseStatusOutput(
      "AI4DEV_TUNNEL_STATUS\tsystemd\tactive\t8443\t1\t1\t00:00\t6\t00:00\tEurope/Paris\tunknown"
    ),
  /prefill status/
);
assert.deepEqual(
  parseStatusOutput("AI4DEV_TUNNEL_STATUS\tsystemd\tactive\t8443\t1\t1\t25:00\t6\t00:00\tEurope/Paris")
    .serviceWindow,
  { invalid: true }
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
