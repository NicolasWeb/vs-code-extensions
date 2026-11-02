"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const Module = require("node:module");
const childProcess = require("node:child_process");
const { PassThrough } = require("node:stream");

const originalLoad = Module._load;
const originalSpawn = childProcess.spawn;
const registeredCommands = new Map();
const statusItems = [];
const notifications = [];
const outputChannels = [];
const terminals = [];
const processInvocations = [];
let selectedAction;
const settings = {
  installPath: "~/agents/ai4dev/ai4dev_tunnel",
  wslDistro: "",
  refreshIntervalSeconds: 30,
  commandTimeoutSeconds: 60,
  logLines: 25,
};

const fakeVscode = {
  env: { language: "fr-FR", remoteName: "wsl" },
  StatusBarAlignment: { Right: 1 },
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
      outputChannels.push(channel);
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
      statusItems.push(item);
      return item;
    },
    async showErrorMessage(message, ...actions) {
      notifications.push({ message, actions });
      return undefined;
    },
    async showInformationMessage(message) {
      return message;
    },
    async showQuickPick(items) {
      return items.find((item) => item.action === selectedAction);
    },
    createTerminal(options) {
      const terminal = { options, shown: false, show() { this.shown = true; } };
      terminals.push(terminal);
      return terminal;
    },
  },
  workspace: {
    workspaceFolders: [],
    getConfiguration() {
      return { get: (key, fallback) => settings[key] ?? fallback };
    },
    onDidChangeConfiguration() {
      return { dispose() {} };
    },
    onDidChangeWorkspaceFolders() {
      return { dispose() {} };
    },
  },
  commands: {
    registerCommand(id, callback) {
      registeredCommands.set(id, callback);
      return { dispose() {} };
    },
    async executeCommand() {},
  },
};

Module._load = function load(request, parent, isMain) {
  if (request === "vscode") {
    return fakeVscode;
  }
  return originalLoad.call(this, request, parent, isMain);
};

childProcess.spawn = (command, args) => {
  processInvocations.push({ command, args });
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => true;
  const action = args.at(-2);
  process.nextTick(() => {
    if (action === "status") {
      child.stdout.end("AI4DEV_TUNNEL_STATUS\tsystemd\tinactive\t7000\t0\t1\t00:00\t6\t00:00\tEurope/Paris\n");
    } else if (action === "logs") {
      child.stdout.end("sample tunnel log\n");
    } else {
      child.stdout.end(`${command} ${action}\n`);
    }
    child.stderr.end("");
    setImmediate(() => child.emit("close", 0));
  });
  return child;
};

async function run() {
  const { activate } = require("../src/extension");
  const context = {
    subscriptions: [],
    globalState: {
      values: new Map(),
      get(key, fallback) {
        return this.values.has(key) ? this.values.get(key) : fallback;
      },
      async update(key, value) {
        this.values.set(key, value);
      },
    },
  };

  try {
    activate(context);
    await registeredCommands.get("ai4devTunnel.showStatus")();

    assert.equal(statusItems.length, 2);
    assert.match(statusItems[0].text, /ai4dev : arrêté/, outputChannels[0].content);
    assert.equal(statusItems[0].color.id, "editorWarning.foreground");
    assert.match(statusItems[0].tooltip, /Horaires documentés du service.*lundi 00:00/);
    assert.equal(notifications.length, 1);
    assert.match(notifications[0].message, /ne fonctionne pas/);
    assert.equal(notifications[0].actions.length, 3);

    await registeredCommands.get("ai4devTunnel.toggle")();
    assert.equal(notifications.length, 1);

    selectedAction = "showLogs";
    await registeredCommands.get("ai4devTunnel.showActions")();
    assert.equal(outputChannels[0].visible, true);
    assert.match(outputChannels[0].content, /sample tunnel log/);
    const logsInvocation = processInvocations.find(({ args }) => args.at(-2) === "logs");
    assert.equal(logsInvocation.args.at(-1), "25");

    selectedAction = "renewAuthentication";
    await registeredCommands.get("ai4devTunnel.showActions")();
    assert.equal(terminals.length, 1);
    assert.equal(terminals[0].shown, true);
    assert.match(terminals[0].options.name, /Renouveler/);

    console.log("ai4dev_tunnel_extension_test: PASS");
  } finally {
    for (const subscription of context.subscriptions) {
      subscription.dispose();
    }
    Module._load = originalLoad;
    childProcess.spawn = originalSpawn;
    delete require.cache[require.resolve("../src/extension")];
    delete require.cache[require.resolve("../src/tunnelClient")];
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
