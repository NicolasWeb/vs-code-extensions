"use strict";

const STATUS_PREFIX = "AI4DEV_TUNNEL_STATUS\t";
const SERVICE_WINDOW_FIELDS = 5;
// The credential states the shell library answers; "unsupported" means an older emitter.
const CREDENTIAL_STATES = ["valid", "renewable", "reauth_required", "unknown", "unsupported"];

function parseServiceWindow(fields) {
  if (fields.every((field) => field === "")) {
    return null;
  }
  if (fields.length !== SERVICE_WINDOW_FIELDS) {
    return { invalid: true };
  }

  const [rawStartDay, startTime, rawEndDay, endTime, timeZone] = fields;
  if (
    !/^[1-7]$/.test(rawStartDay) ||
    !/^[1-7]$/.test(rawEndDay) ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(endTime) ||
    !/^[A-Za-z0-9._+-]+(?:\/[A-Za-z0-9._+-]+)*$/.test(timeZone)
  ) {
    return { invalid: true };
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    return { invalid: true };
  }

  return {
    startDay: Number(rawStartDay),
    startTime,
    endDay: Number(rawEndDay),
    endTime,
    timeZone,
  };
}

function parseStatusOutput(output) {
  const line = String(output)
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(STATUS_PREFIX));

  if (!line) {
    throw new Error("Missing tunnel status record.");
  }

  const fields = line.slice(STATUS_PREFIX.length).split("\t");
  const legacyFieldCount = 4;
  const serviceWindowFieldCount = legacyFieldCount + SERVICE_WINDOW_FIELDS;
  const currentFieldCount = serviceWindowFieldCount + 1;
  const credentialFieldCount = currentFieldCount + 1;
  if (
    fields.length !== legacyFieldCount &&
    fields.length !== serviceWindowFieldCount &&
    fields.length !== currentFieldCount &&
    fields.length !== credentialFieldCount
  ) {
    throw new Error("Malformed tunnel status record.");
  }

  const [supervisor, serviceState, rawPort, rawListening] = fields;
  const port = Number(rawPort);
  if (
    !["systemd", "nohup"].includes(supervisor) ||
    !/^(active|inactive|activating|deactivating|failed|unknown)$/.test(serviceState) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !["0", "1"].includes(rawListening)
  ) {
    throw new Error("Invalid tunnel status values.");
  }

  const prefillState =
    fields.length >= currentFieldCount ? fields[serviceWindowFieldCount] : "unsupported";
  if (!["true", "false", "unsupported"].includes(prefillState)) {
    throw new Error("Invalid authentication prefill status.");
  }
  const credentialState =
    fields.length === credentialFieldCount ? fields[currentFieldCount] : "unsupported";
  if (!CREDENTIAL_STATES.includes(credentialState)) {
    throw new Error("Invalid credential authentication state.");
  }

  return {
    supervisor,
    serviceState,
    port,
    listening: rawListening === "1",
    state: classifyStatus(
      serviceState,
      rawListening === "1",
      credentialState === "unsupported" ? null : credentialState
    ),
    serviceWindow:
      fields.length === legacyFieldCount
        ? null
        : parseServiceWindow(fields.slice(legacyFieldCount, serviceWindowFieldCount)),
    authenticationPrefillEnabled:
      prefillState === "unsupported" ? null : prefillState === "true",
    authenticationState: credentialState === "unsupported" ? null : credentialState,
  };
}

function formatServiceWindow(serviceWindow, locale) {
  if (!serviceWindow || serviceWindow.invalid) {
    return "";
  }
  const weekdayFormatter = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    timeZone: "UTC",
  });
  const formatDay = (isoDay) => weekdayFormatter.format(new Date(Date.UTC(2024, 0, isoDay)));
  return `${formatDay(serviceWindow.startDay)} ${serviceWindow.startTime} – ${formatDay(serviceWindow.endDay)} ${serviceWindow.endTime} (${serviceWindow.timeZone})`;
}

function classifyStatus(serviceState, listening, authenticationState) {
  // A dead grant is a different request from a degraded link: a relaunch and
  // `ai4dev_auth_renew` cannot fix it, only a fresh sign-in can.
  if (authenticationState === "reauth_required") {
    return "auth_required";
  }
  if (serviceState === "activating") {
    return "connecting";
  }
  if (serviceState === "deactivating") {
    return "transitioning";
  }
  if (serviceState === "active" && listening) {
    return "connected";
  }
  if (serviceState === "inactive" && !listening) {
    return "stopped";
  }
  return "degraded";
}

// unavailableThreshold: one failed status probe means the CHECK failed (WSL
// hiccup, slow call), not that the tunnel is down. A sticky error toast is a
// strong claim, so "unavailable" must be confirmed by this many consecutive
// failed probes before it notifies; the status bar still reflects every poll.
const UNAVAILABLE_NOTIFY_THRESHOLD = 2;

function nextNotificationState(
  alreadyNotified,
  state,
  consecutiveUnavailable = 0,
  recoveryAnnounced = false,
  lastProblemState = undefined
) {
  if (state === "connected") {
    // An error toast already shown cannot be retracted through the API; on
    // recovery announce it once so the stale error no longer contradicts the
    // status bar and the real tunnel state.
    return {
      notified: false,
      notify: false,
      announceRecovery: alreadyNotified && !recoveryAnnounced,
    };
  }
  if (state === "connecting" || state === "transitioning") {
    return { notified: alreadyNotified, notify: false, announceRecovery: false };
  }
  if (state === "unavailable") {
    const confirmed = consecutiveUnavailable >= UNAVAILABLE_NOTIFY_THRESHOLD;
    return {
      notified: alreadyNotified || confirmed,
      notify: confirmed && !alreadyNotified,
      announceRecovery: false,
    };
  }
  // A standing problem is announced once. A *different* problem state is a new situation with a
  // different action offer, so it announces again; the caller keeps one signal at a time by
  // refreshing the same state in place instead of stacking it.
  const otherProblem = lastProblemState !== undefined && state !== lastProblemState;
  return { notified: true, notify: !alreadyNotified || otherProblem, announceRecovery: false };
}

module.exports = {
  CREDENTIAL_STATES,
  classifyStatus,
  formatServiceWindow,
  nextNotificationState,
  parseStatusOutput,
  UNAVAILABLE_NOTIFY_THRESHOLD,
};
