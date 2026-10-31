"use strict";

const ACTIONS = Object.freeze([
  "connect",
  "disconnect",
  "restart",
  "showLogs",
  "renewAuthentication",
  "showStatus",
  "openSettings",
]);

const OPERATIONS = Object.freeze({
  connect: "connect",
  disconnect: "disconnect",
  restart: "restart",
  showLogs: "logs",
});

function operationForAction(action) {
  if (!ACTIONS.includes(action)) {
    throw new Error("Unsupported tunnel action.");
  }
  return OPERATIONS[action] || null;
}

module.exports = {
  ACTIONS,
  operationForAction,
};
