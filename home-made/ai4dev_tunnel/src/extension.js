"use strict";

const vscode = require("vscode");
const { ACTIONS, operationForAction } = require("./actions");
const { detectLocale, operatingSystemLocales, translate } = require("./localization");
const {
  formatServiceWindow,
  nextNotificationState,
  parseStatusOutput,
} = require("./status");
const { createTunnelClient, resolveDistro } = require("./tunnelClient");

const NOTIFICATION_KEY = "ai4devTunnel.failureNotified";

// The states whose meaning the failure wording covers (first announcement and in-place refresh).
const PROBLEM_STATES = ["stopped", "degraded", "down", "unavailable", "auth_required"];

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
      auth_required: "log-in",
      unavailable: "error",
    }[state] || "question";
    const label = text(`states.${state}`);
    const statusLabel = text(`statusLabels.${state}`);
    const color = {
      connecting: "editorInfo.foreground",
      transitioning: "editorInfo.foreground",
      stopped: "editorWarning.foreground",
      degraded: "editorWarning.foreground",
      auth_required: "editorError.foreground",
      unavailable: "editorError.foreground",
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
    const authenticationStateLine =
      currentStatus.authenticationState === "reauth_required"
        ? text("tooltip.authenticationReauthRequired")
        : "";

    statusItem.tooltip = [
      statusLabel,
      text("tooltip.supervisor", { value: supervisor }),
      text("tooltip.port", { value: port }),
      serviceWindowLine,
      authenticationPrefillLine,
      authenticationStateLine,
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

  // First attempt, and the only one that can carry real buttons: the updatable Notification class.
  // It is probed, never assumed -- the installed 1.142 host does not define it (measured: zero
  // `NotificationButton` in its bundle) and @types/vscode declares none through 1.144.
  let statusNotification;

  function showUpdatableNotification(message, buttonsFactory) {
    if (typeof vscode.Notification !== "function" || typeof vscode.NotificationButton !== "function") {
      return false;
    }
    try {
      // The buttons are built here, inside the guard: constructing them outside would throw on a
      // host without the API before the fallback could run.
      const buttons = typeof buttonsFactory === "function" ? buttonsFactory() : [];
      if (statusNotification) {
        statusNotification.update({ message, buttons });
      } else {
        statusNotification = new vscode.Notification(message, { title: "ai4dev", buttons });
        statusNotification.onDidDismiss(() => {
          statusNotification = undefined;
        });
      }
      return true;
    } catch (error) {
      output.appendLine(text("output.notificationFailed", { reason: errorText(error) }));
      return false;
    }
  }

  // Second surface, and the one the installed 1.142 host provides: a progress notification.
  // `report()` replaces the text of the notification already shown, so the evolution of a standing
  // problem refreshes one row instead of stacking a new notification per poll, and resolving the
  // task closes it. It carries no buttons, which is why the FIRST announcement still goes through
  // the buttoned message call: buttons are asked for, in-place refresh applies to what follows.
  let statusProgress;
  // The state the user is currently looking at, so that an evolution of the same problem refreshes in
  // place while a *different* problem still gets its own buttoned message.
  let announcedFailureState;

  function reportStatusChannel(message) {
    // The enumerator is checked with the function: an incomplete host surface must fall through to
    // the message call, not throw out of the extension.
    const location = vscode.ProgressLocation && vscode.ProgressLocation.Notification;
    if (typeof vscode.window.withProgress !== "function" || location === undefined) {
      return false;
    }
    if (statusProgress) {
      statusProgress.reporter.report({ message });
      return true;
    }
    let reporter;
    let settle;
    const task = new Promise((resolve) => {
      settle = resolve;
    });
    const running = vscode.window.withProgress(
      {
        location: location,
        title: "ai4dev",
        cancellable: true,
      },
      (progress, token) => {
        reporter = progress;
        token.onCancellationRequested(() => {
          // The user closed it: forget the channel so the next change may open a new one.
          statusProgress = undefined;
          settle();
        });
        return task;
      }
    );
    if (!reporter) {
      // A host that defers the task must not lose the message; the caller falls back.
      settle();
      void running;
      return false;
    }
    reporter.report({ message });
    statusProgress = { reporter, settle };
    void running.then(() => undefined, () => undefined);
    return true;
  }

  function closeStatusChannel() {
    if (!statusProgress) {
      return;
    }
    const { settle } = statusProgress;
    statusProgress = undefined;
    settle();
  }

  function notificationButton(label, action) {
    return new vscode.NotificationButton(label, {
      callback: () => {
        void performAction(action).catch(() => undefined);
      },
    });
  }

  // The wording of a failing status is needed twice: by the first announcement (buttoned message)
  // and by the in-place refresh of a standing failure. It is composed once here.
  function failureMessage(state) {
    // "unavailable" means the check itself failed; only stopped/degraded support asserting the
    // tunnel "is not working".
    const messageKey =
      state === "unavailable" ? "notification.probeFailed" : "notification.notWorking";
    return text(messageKey, { state: text(`states.${state}`) });
  }

  // One offer per problem state, composed once for every surface. A dead grant cannot be fixed by a
  // renewal, so `auth_required` gets no renewal action anywhere.
  function failureActions(state) {
    const actions = [{ label: text("notification.retry"), action: "connect" }];
    if (state !== "auth_required") {
      actions.push({ label: text("notification.renew"), action: "renewAuthentication" });
    }
    actions.push({ label: text("notification.logs"), action: "showLogs" });
    return actions;
  }

  // Built inside the class guard by its caller: constructing a NotificationButton on a host
  // without the API would throw before any fallback could run.
  function failureButtons(state) {
    return failureActions(state).map((offered) => notificationButton(offered.label, offered.action));
  }

  function showFailureNotification(state) {
    recoveryAnnounced = false;
    announcedFailureState = state;
    const offered = failureActions(state);
    const message = failureMessage(state);
    if (statusProgress) {
      // A different problem replaces the standing row's text rather than leaving it behind: one row
      // on screen, and the buttons below carry this problem's actions.
      reportStatusChannel(message);
    }
    if (showUpdatableNotification(message, () => failureButtons(state))) {
      return;
    }
    void vscode.window
      .showErrorMessage(message, ...offered.map((choice) => choice.label))
      .then(async (choice) => {
        const picked = offered.find((candidate) => candidate.label === choice);
        if (picked) {
          await performAction(picked.action);
        }
      })
      .then(undefined, (error) => {
        output.appendLine(text("output.notificationFailed", { reason: errorText(error) }));
      });
  }

  function showRecoveryNotification() {
    recoveryAnnounced = true;
    announcedFailureState = undefined;
    // The channel carried the failure sequence; recovery ends it rather than adding another row.
    closeStatusChannel();
    if (showUpdatableNotification(text("notification.recovered"), [])) {
      return;
    }
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
      recoveryAnnounced,
      announcedFailureState
    );
    if (next.notified !== failureNotified) {
      await persistFailureFlag(next.notified);
    }
    if (next.notify) {
      showFailureNotification(state);
      return;
    }
    if (state === announcedFailureState && PROBLEM_STATES.includes(state)) {
      // The same problem evolved after its first announcement: what is on screen is refreshed rather
      // than repeated. A live updatable row wins (it updates in place and keeps its buttons); the
      // progress channel is the surface the 1.142 host has. Without either the only sign of the
      // evolution would be the status bar.
      const message = failureMessage(state);
      if (!showUpdatableNotification(message, () => failureButtons(state))) {
        reportStatusChannel(message);
      }
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
          // The parser classifies: a dead grant outranks the record's service state.
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
