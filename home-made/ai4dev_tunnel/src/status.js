"use strict";

const STATUS_PREFIX = "AI4DEV_TUNNEL_STATUS\t";

function parseStatusOutput(output) {
  const line = String(output)
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(STATUS_PREFIX));

  if (!line) {
    throw new Error("Missing tunnel status record.");
  }

  const fields = line.slice(STATUS_PREFIX.length).split("\t");
  if (fields.length !== 4) {
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

  return {
    supervisor,
    serviceState,
    port,
    listening: rawListening === "1",
    state: classifyStatus(serviceState, rawListening === "1"),
  };
}

function classifyStatus(serviceState, listening) {
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

function nextNotificationState(alreadyNotified, state) {
  if (state === "connected") {
    return { notified: false, notify: false };
  }
  if (state === "connecting" || state === "transitioning") {
    return { notified: alreadyNotified, notify: false };
  }
  return { notified: true, notify: !alreadyNotified };
}

module.exports = {
  classifyStatus,
  nextNotificationState,
  parseStatusOutput,
};
