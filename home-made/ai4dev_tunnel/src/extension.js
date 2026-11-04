"use strict";

const vscode = require("vscode");
const { ACTIONS, operationForAction } = require("./actions");
const { detectLocale, operatingSystemLocales, translate } = require("./localization");
const { formatServiceWindow, nextNotificationState, parseStatusOutput } = require("./status");
const { createTunnelClient, resolveDistro } = require("./tunnelClient");

const NOTIFICATION_KEY = "ai4devTunnel.failureNotified";

function activate(context) {
  const output = vscode.window.createOutputChannel("ai4dev Tunnel");
  const locale = detectLocale(
    vscode.env.language,
    operatingSystemLocales(process.platform, process.env)
  );
  const text = (key, values) => translate(locale, key, values);
  let client;
  let currentStatus = {
    state: "unavailable",
    supervisor: "unknown",
    port: 0,
    authenticationPrefillEnabled: null,
  };
  let refreshPromise;
  let refreshTimer;
  let failureNotified = Boolean(context.globalState.get(NOTIFICATION_KEY, false));
  let consecutiveUnavailable = 0;
  let recoveryAnnounced = !failureNotified;

  const statusItem = vscode.window.createStatusBarItem(
    "ai4devTunnel.status",
    vscode.StatusBarAlignment.Right,
    90
  );
  statusItem.name = "ai4dev Tunnel";
  statusItem.command = "ai4devTunnel.toggle";

  const actionsItem = vscode.window.createStatusBarItem(
    "ai4devTunnel.actions",
    vscode.StatusBarAlignment.Right,
    89
  );
  actionsItem.name = "ai4dev Tunnel actions";
  actionsItem.text = "$(ellipsis)";
  actionsItem.tooltip = text("actions.openMenu");
  actionsItem.command = "ai4devTunnel.showActions";

  function makeClient() {
    const configuration = vscode.workspace.getConfiguration("ai4devTunnel");
    const distro = resolveDistro(
      configuration.get("wslDistro", ""),
      vscode.workspace.workspaceFolders
    );
    client = createTunnelClient({
      platform: process.platform,
      remoteName: vscode.env.remoteName,
      distro,
      installPath: configuration.get("installPath", "~/agents/ai4dev/ai4dev_tunnel"),
      authenticationPromptPrefill: configuration.get("authenticationPromptPrefill", true),
      timeoutSeconds: configuration.get("commandTimeoutSeconds", 60),
      logLines: configuration.get("logLines", 50),
    });
  }

  function errorText(error) {
    if (error && error.kind === "configuration") {
      if (!error.setting) {
        return text("errors.invalidInstallPath");
      }
      const messageKey =
        error.setting === "authenticationPromptPrefill"
          ? "errors.invalidBooleanSetting"
          : "errors.invalidSetting";
      return text(messageKey, { setting: error.setting });
    }
    if (!error || error.kind === "spawn") {
      return text("errors.couldNotStart");
    }
    if (error.kind === "timeout") {
      return text("errors.timedOut");
    }
    if (error.kind === "exit") {
      return text("errors.exitCode", { code: error.exitCode });
    }
    return text("errors.unexpected");
  }

  function renderStatus() {
    const state = currentStatus.state;
    const icon = {
      connected: "plug",
      connecting: "sync~spin",
      transitioning: "sync~spin",
      stopped: "debug-disconnect",
      degraded: "warning",
      unavailable: "error",
    }[state] || "question";
    const label = text(`states.${state}`);
    const statusLabel = text(`statusLabels.${state}`);
    const color = {
      connecting: "editorInfo.foreground",
      transitioning: "editorInfo.foreground",
      stopped: "editorWarning.foreground",
      degraded: "editorWarning.foreground",
      unavailable: "editorError.foreground",
    }[state];

    statusItem.text = `$(${icon}) ${statusLabel}`;
    statusItem.color = color ? new vscode.ThemeColor(color) : undefined;
    const supervisor = currentStatus.supervisor
      ? text(`supervisors.${currentStatus.supervisor}`)
      : text("values.unknown");
    const port = currentStatus.port || text("values.unknown");
    const checkedAt = currentStatus.checkedAt
      ? new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(
          new Date(currentStatus.checkedAt)
        )
      : text("values.notChecked");
    const serviceWindow = currentStatus.serviceWindow;
    const serviceWindowLine = serviceWindow
      ? serviceWindow.invalid
        ? text("tooltip.serviceWindowInvalid")
        : text("tooltip.serviceWindow", {
            value: formatServiceWindow(serviceWindow, locale),
          })
      : "";
    const authenticationPrefillLine =
      typeof currentStatus.authenticationPrefillEnabled === "boolean"
        ? text("tooltip.authenticationPrefill", {
            value: text(
              currentStatus.authenticationPrefillEnabled ? "values.enabled" : "values.disabled"
            ),
          })
        : "";
    statusItem.tooltip = [
      statusLabel,
      text("tooltip.supervisor", { value: supervisor }),
      text("tooltip.port", { value: port }),
      serviceWindowLine,
      authenticationPrefillLine,
      text("tooltip.lastCheck", { value: checkedAt }),
      text("tooltip.clickHint"),
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function persistFailureFlag(value) {
    failureNotified = value;
    try {
      await context.globalState.update(NOTIFICATION_KEY, value);
    } catch (error) {
      output.appendLine(text("output.stateSaveFailed", { reason: errorText(error) }));
    }
  }

  function showFailureNotification(state) {
    recoveryAnnounced = false;
    const choices = [
      text("notification.retry"),
      text("notification.renew"),
      text("notification.logs"),
    ];
    // "unavailable" means the check itself failed; only stopped/degraded
    // support asserting the tunnel "is not working".
    const messageKey =
      state === "unavailable" ? "notification.probeFailed" : "notification.notWorking";
    void vscode.window
      .showErrorMessage(text(messageKey, { state: text(`states.${state}`) }), ...choices)
      .then(async (choice) => {
        if (choice === choices[0]) {
          await performAction("connect");
        } else if (choice === choices[1]) {
          await performAction("renewAuthentication");
        } else if (choice === choices[2]) {
          await performAction("showLogs");
        }
      })
      .then(undefined, (error) => {
        output.appendLine(text("output.notificationFailed", { reason: errorText(error) }));
      });
  }

  function showRecoveryNotification() {
    recoveryAnnounced = true;
    void vscode.window
      .showInformationMessage(text("notification.recovered"))
      .then(undefined, (error) => {
        output.appendLine(text("output.recoveryAnnounceFailed", { reason: errorText(error) }));
      });
  }

  async function updateFailureNotification(state) {
    const next = nextNotificationState(
      failureNotified,
      state,
      consecutiveUnavailable,
      recoveryAnnounced
    );
    if (next.notified !== failureNotified) {
      await persistFailureFlag(next.notified);
    }
    if (next.notify) {
      showFailureNotification(state);
    }
    if (next.announceRecovery) {
      showRecoveryNotification();
    }
  }

  async function refreshStatus() {
    if (refreshPromise) {
      return refreshPromise;
    }
    refreshPromise = (async () => {
      try {
        const result = await client.execute("status");
        consecutiveUnavailable = 0;
        currentStatus = {
          ...parseStatusOutput(result.stdout),
          checkedAt: Date.now(),
        };
      } catch (error) {
        consecutiveUnavailable += 1;
        currentStatus = {
          state: "unavailable",
          supervisor: "unknown",
          port: 0,
          authenticationPrefillEnabled: null,
          checkedAt: Date.now(),
        };
        output.appendLine(
          text("output.statusFailed", { reason: errorText(error) })
        );
      }
      renderStatus();
      await updateFailureNotification(currentStatus.state);
      return currentStatus;
    })();

    try {
      return await refreshPromise;
    } finally {
      refreshPromise = undefined;
    }
  }

  async function applyAuthenticationPrefill() {
    try {
      await client.execute("prefill-set");
      await refreshStatus();
      return true;
    } catch (error) {
      const reason =
        error && error.exitCode === 69
          ? text("errors.prefillUnsupported")
          : errorText(error);
      output.appendLine(text("output.prefillSyncFailed", { reason }));
      await vscode.window.showErrorMessage(text("messages.prefillSyncFailed", { reason }));
      return false;
    }
  }

  async function showRenewalTerminal() {
    await applyAuthenticationPrefill();
    const invocation = client.buildInvocation("renew");
    const terminal = vscode.window.createTerminal({
      name: text("actions.renewAuthentication"),
      shellPath: invocation.command,
      shellArgs: invocation.args,
    });
    terminal.show(true);
  }

  async function performAction(action) {
    if (action === "openSettings") {
      await vscode.commands.executeCommand("workbench.action.openSettings", "ai4devTunnel");
      return;
    }
    if (action === "renewAuthentication") {
      await showRenewalTerminal();
      return;
    }
    if (action === "showStatus") {
      const status = await refreshStatus();
      await vscode.window.showInformationMessage(
        text("messages.status", {
          state: text(`states.${status.state}`),
          port: status.port || text("values.unknown"),
        })
      );
      return;
    }

    const operation = operationForAction(action);
    output.appendLine(text("output.actionStarted", { action: text(`actions.${action}`) }));
    try {
      const result = await client.execute(operation);
      if (action === "showLogs") {
        output.append(result.stdout || text("messages.noLogs"));
        output.show(true);
      } else {
        await vscode.window.showInformationMessage(
          text("messages.actionSucceeded", { action: text(`actions.${action}`) })
        );
      }
    } catch (error) {
      const reason = errorText(error);
      output.appendLine(text("output.actionFailed", { action: text(`actions.${action}`), reason }));
      await vscode.window.showErrorMessage(
        text("messages.actionFailed", { action: text(`actions.${action}`), reason })
      );
    } finally {
      await refreshStatus();
    }
  }

  async function toggleTunnel() {
    const status = await refreshStatus();
    if (status.state === "connecting" || status.state === "transitioning") {
      await vscode.window.showInformationMessage(text("messages.operationInProgress"));
      return;
    }
    if (status.state === "unavailable") {
      await vscode.window.showErrorMessage(text("messages.statusUnavailable"));
      return;
    }
    await performAction(status.state === "connected" ? "disconnect" : "connect");
  }

  async function showActions() {
    const items = ACTIONS.map((action) => ({
      label: text(`actions.${action}`),
      action,
    }));
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: text("actions.openMenu"),
      matchOnDescription: true,
    });
    if (selected) {
      await performAction(selected.action);
    }
  }

  makeClient();
  renderStatus();
  statusItem.show();
  actionsItem.show();

  context.subscriptions.push(
    output,
    statusItem,
    actionsItem,
    vscode.commands.registerCommand("ai4devTunnel.toggle", toggleTunnel),
    vscode.commands.registerCommand("ai4devTunnel.showActions", showActions),
    vscode.commands.registerCommand("ai4devTunnel.connect", () => performAction("connect")),
    vscode.commands.registerCommand("ai4devTunnel.disconnect", () => performAction("disconnect")),
    vscode.commands.registerCommand("ai4devTunnel.restart", () => performAction("restart")),
    vscode.commands.registerCommand("ai4devTunnel.showLogs", () => performAction("showLogs")),
    vscode.commands.registerCommand("ai4devTunnel.renewAuthentication", () =>
      performAction("renewAuthentication")
    ),
    vscode.commands.registerCommand("ai4devTunnel.showStatus", () => performAction("showStatus")),
    vscode.commands.registerCommand("ai4devTunnel.openSettings", () =>
      performAction("openSettings")
    ),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("ai4devTunnel")) {
        makeClient();
        if (event.affectsConfiguration("ai4devTunnel.refreshIntervalSeconds")) {
          scheduleRefresh();
        }
        if (event.affectsConfiguration("ai4devTunnel.authenticationPromptPrefill")) {
          await applyAuthenticationPrefill();
        } else {
          await refreshStatus();
        }
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      makeClient();
      void refreshStatus();
    }),
    {
      dispose() {
        clearInterval(refreshTimer);
      },
    }
  );

  function scheduleRefresh() {
    clearInterval(refreshTimer);
    const configuredInterval = Number(vscode.workspace
      .getConfiguration("ai4devTunnel")
      .get("refreshIntervalSeconds", 5));
    const intervalSeconds = Number.isFinite(configuredInterval)
      ? Math.max(1, configuredInterval)
      : 5;
    refreshTimer = setInterval(() => {
      void refreshStatus();
    }, intervalSeconds * 1000);
  }

  scheduleRefresh();
  void refreshStatus();
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
