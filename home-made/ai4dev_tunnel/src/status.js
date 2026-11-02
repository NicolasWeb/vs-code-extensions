"use strict";

const STATUS_PREFIX = "AI4DEV_TUNNEL_STATUS\t";
const SERVICE_WINDOW_FIELDS = 5;

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
  if (
    fields.length !== legacyFieldCount &&
    fields.length !== serviceWindowFieldCount &&
    fields.length !== currentFieldCount
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
    fields.length === currentFieldCount ? fields[serviceWindowFieldCount] : "unsupported";
  if (!["true", "false", "unsupported"].includes(prefillState)) {
    throw new Error("Invalid authentication prefill status.");
  }

  return {
    supervisor,
    serviceState,
    port,
    listening: rawListening === "1",
    state: classifyStatus(serviceState, rawListening === "1"),
    serviceWindow:
      fields.length === legacyFieldCount
        ? null
        : parseServiceWindow(fields.slice(legacyFieldCount, serviceWindowFieldCount)),
    authenticationPrefillEnabled:
      prefillState === "unsupported" ? null : prefillState === "true",
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
  formatServiceWindow,
  nextNotificationState,
  parseStatusOutput,
};
