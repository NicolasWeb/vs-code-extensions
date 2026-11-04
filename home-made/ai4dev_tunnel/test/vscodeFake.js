"use strict";

// Shared `vscode` fake for the extension suites, so a host surface exists in exactly one place.
// `installNotificationApi()` turns on the updatable Notification API (public since VS Code 1.104);
// while it is off the fake behaves like an older host, which is how the fallback path is proven.

const { EventEmitter } = require("node:events");

function createVscodeFake() {
  const state = {
    registeredCommands: new Map(),
    statusItems: [],
    notifications: [],
    infoMessages: [],
    outputChannels: [],
    progressChannels: [],
    terminals: [],
    // Updatable-notification records: one entry per Notification object created.
    created: [],
    dismissed: [],
    settings: {
      installPath: "~/agents/ai4dev/ai4dev_tunnel",
      authenticationPromptPrefill: true,
      wslDistro: "",
      refreshIntervalSeconds: 30,
      commandTimeoutSeconds: 60,
      logLines: 25,
    },
    notificationApi: false,
    selectedAction: undefined,
    configurationChangeHandler: undefined,
  };

  class NotificationButton {
    constructor(label, options = {}) {
      this.label = label;
      this.options = options;
    }
    async click() {
      if (typeof this.options.callback === "function") {
        await this.options.callback();
      }
    }
  }

  class Notification {
    constructor(message, options = {}) {
      this.message = message;
      this.options = options;
      this.updates = [];
      this.dismissHandlers = [];
      state.created.push(this);
    }
    severityOf() {
      return this.severity;
    }
    update(patch = {}) {
      // A real host replaces the properties present in the patch and keeps the rest.
      this.updates.push(patch);
      if ("message" in patch) {
        this.message = patch.message;
      }
      if ("buttons" in patch) {
        this.options.buttons = patch.buttons;
      }
      if ("severity" in patch) {
        this.severity = patch.severity;
      }
    }
    onDidDismiss(handler) {
      this.dismissHandlers.push(handler);
      return { dispose() {} };
    }
    dismiss() {
      state.dismissed.push(this);
      for (const handler of this.dismissHandlers) {
        handler();
      }
    }
  }

  const vscode = {
    env: { language: "fr-FR", remoteName: "wsl" },
    StatusBarAlignment: { Right: 1 },
    ProgressLocation: { Window: 10, Notification: 15, SourceControl: 1 },
    ThemeColor: class ThemeColor {
      constructor(id) {
        this.id = id;
      }
    },
    window: {
      createOutputChannel(name) {
        const channel = {
          name,
          content: "",
          visible: false,
          append(value) {
            this.content += value;
          },
          appendLine(value) {
            this.content += `${value}\n`;
          },
          show() {
            this.visible = true;
          },
          dispose() {},
        };
        state.outputChannels.push(channel);
        return channel;
      },
      createStatusBarItem(id, alignment, priority) {
        const item = {
          id,
          alignment,
          priority,
          show() {
            this.visible = true;
          },
          dispose() {},
        };
        state.statusItems.push(item);
        return item;
      },
      withProgress(options, task) {
        // The host surface this suite needs: the task runs synchronously, every report() is
        // recorded on the one channel, and the channel closes when the task resolves or cancels.
        const channel = { options, reports: [], cancelHandlers: [], running: true };
        const reporter = {
          report(entry) {
            channel.reports.push(entry);
          },
        };
        const token = {
          isCancellationRequested: false,
          onCancellationRequested(handler) {
            channel.cancelHandlers.push(handler);
            return { dispose() {} };
          },
        };
        channel.cancel = () => {
          token.isCancellationRequested = true;
          for (const handler of channel.cancelHandlers) {
            handler();
          }
        };
        const done = Promise.resolve(task(reporter, token)).then(() => {
          channel.running = false;
        });
        channel.settled = done;
        state.progressChannels.push(channel);
        return done;
      },
      async showErrorMessage(message, ...actions) {
        state.notifications.push({ message, actions });
        return undefined;
      },
      async showInformationMessage(message) {
        state.infoMessages.push(message);
        return message;
      },
      async showQuickPick(items) {
        return items.find((item) => item.action === state.selectedAction);
      },
      createTerminal(options) {
        const terminal = { options, shown: false, show() { this.shown = true; } };
        state.terminals.push(terminal);
        return terminal;
      },
    },
    workspace: {
      workspaceFolders: [],
      getConfiguration() {
        return { get: (key, fallback) => state.settings[key] ?? fallback };
      },
      onDidChangeConfiguration(handler) {
        state.configurationChangeHandler = handler;
        return { dispose() {} };
      },
      onDidChangeWorkspaceFolders() {
        return { dispose() {} };
      },
    },
    commands: {
      registerCommand(id, callback) {
        state.registeredCommands.set(id, callback);
        return { dispose() {} };
      },
      async executeCommand() {},
    },
  };

  // The API is exposed only when switched on, so `typeof vscode.Notification` discriminates the host
  // exactly as it does in VS Code.
  function installNotificationApi(on = true) {
    state.notificationApi = on;
    if (on) {
      vscode.Notification = Notification;
      vscode.NotificationButton = NotificationButton;
    } else {
      delete vscode.Notification;
      delete vscode.NotificationButton;
    }
  }

  return { vscode, state, installNotificationApi, EventEmitter };
}

module.exports = { createVscodeFake };
