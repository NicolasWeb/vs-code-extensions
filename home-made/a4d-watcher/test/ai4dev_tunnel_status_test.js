"use strict";

const assert = require("node:assert/strict");
const {
  classifyStatus,
  formatServiceWindow,
  nextNotificationState,
  parseStatusOutput,
  UNAVAILABLE_NOTIFY_THRESHOLD,
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
    authenticationState: null,
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

assert.deepEqual(nextNotificationState(false, "stopped"), { notified: true, notify: true, announceRecovery: false });
assert.deepEqual(nextNotificationState(true, "degraded"), { notified: true, notify: false, announceRecovery: false });
assert.deepEqual(nextNotificationState(true, "connecting"), { notified: true, notify: false, announceRecovery: false });
assert.deepEqual(nextNotificationState(true, "connected"), { notified: false, notify: false, announceRecovery: true });
assert.deepEqual(nextNotificationState(true, "connected", 0, true), { notified: false, notify: false, announceRecovery: false });
assert.deepEqual(nextNotificationState(false, "connected"), { notified: false, notify: false, announceRecovery: false });
// "unavailable" must be confirmed by UNAVAILABLE_NOTIFY_THRESHOLD consecutive
// failed probes before the sticky failing toast is raised.
assert.deepEqual(nextNotificationState(false, "unavailable", 1), { notified: false, notify: false, announceRecovery: false });
assert.deepEqual(nextNotificationState(false, "unavailable", 2), { notified: true, notify: true, announceRecovery: false });
assert.deepEqual(nextNotificationState(true, "unavailable", 5), { notified: true, notify: false, announceRecovery: false });
// A standing problem is refreshed in place, a different problem must announce again.
assert.deepEqual(nextNotificationState(true, "auth_required", 0, false, "auth_required"), { notified: true, notify: false, announceRecovery: false });
assert.deepEqual(nextNotificationState(true, "auth_required", 0, false, "degraded"), { notified: true, notify: true, announceRecovery: false });
assert.deepEqual(nextNotificationState(true, "degraded", 0, false), { notified: true, notify: false, announceRecovery: false });
assert.equal(UNAVAILABLE_NOTIFY_THRESHOLD, 2);

console.log("ai4dev_tunnel_status_test: PASS");

// An eleventh field carries the credential state of the stored credential.
const credentialRecord =
  "AI4DEV_TUNNEL_STATUS\tsystemd\tactive\t8443\t1\t1\t00:00\t6\t00:00\tEurope/Paris\ttrue\trenewable";
assert.equal(parseStatusOutput(credentialRecord).authenticationState, "renewable");
assert.equal(parseStatusOutput(credentialRecord).state, "connected");
assert.equal(configuredStatus.authenticationState, null);
// A dead grant is not a link problem: the state changes even though the service is healthy.
assert.equal(
  parseStatusOutput(credentialRecord.replace("renewable", "reauth_required")).state,
  "auth_required"
);
assert.equal(
  classifyStatus("degraded", true, "reauth_required"),
  "auth_required"
);
// A healthy credential never creates the alert on its own.
assert.equal(classifyStatus("active", true, "valid"), "connected");
assert.equal(classifyStatus("inactive", false, "valid"), "stopped");
assert.throws(
  () => parseStatusOutput(credentialRecord.replace("renewable", "expired")),
  /credential authentication state/
);
