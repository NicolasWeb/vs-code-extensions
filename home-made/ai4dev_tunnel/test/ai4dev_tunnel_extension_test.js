"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const Module = require("node:module");
const childProcess = require("node:child_process");
const { PassThrough } = require("node:stream");

// The shared `vscode` fake lives in `vscodeFake.js` so both the fallback suite here and the
// updatable-notification suite drive one host surface. This file proves the older host: without
// `vscode.Notification` the extension must still show its message through window.showErrorMessage.
const { createVscodeFake } = require("./vscodeFake");
const { vscode: fakeVscode, state: fake, installNotificationApi } = createVscodeFake();
const { registeredCommands, statusItems, notifications, outputChannels, infoMessages, terminals } = fake;
const originalLoad = Module._load;
const originalSpawn = childProcess.spawn;
const processInvocations = [];
let authenticationPrefillEnabled = true;
let serviceState = "inactive";
let failStatusProbe = false;
let statusCause = "auth";
// authFieldState mirrors the eleventh tab field of the ai4dev status line, the access state the
// CLI reports for the gcloud authorization; the product parses that field in src/status.js.
let authFieldState = "unsupported";
let statusDetail = "";
const settings = fake.settings;

// This suite proves the OLD host: `vscode.Notification` stays undefined here, so every message
// still goes through `window.showErrorMessage`. The updatable path has its own suite.
installNotificationApi(false);

Module._load = function load(request, parent, isMain) {
  if (request === "vscode") {
    return fakeVscode;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const ACTIONS = ['status', 'connect', 'disconnect', 'restart', 'logs', 'renew', 'prefill-set'];

// A notification button runs its action without being awaited by the product, so a phase that
// clicks one must give the host its turns back. Bounded: a missing effect is a failure, not a hang.
async function waitFor(predicate, claim, attempts = 50) {
  for (let turn = 0; turn < attempts; turn += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(predicate(), claim + " (not observed in " + attempts + " host turns)");
}

childProcess.spawn = (command, args) => {
  processInvocations.push({ command, args });
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => true;
// src/tunnelClient.js puts the action third from the end of the argv it builds; the
  // token itself is the stable locator, a negative index is not.
  const action = ACTIONS.find((name) => args.includes(name));
  process.nextTick(() => {
    if (action === "status") {
      if (failStatusProbe) {
        child.stderr.end("simulated transport failure\n");
        setImmediate(() => child.emit("close", 65));
        return child;
      }
      const listening = serviceState === "active" ? "1" : "0";
      const prefillState = authenticationPrefillEnabled ? "true" : "false";
      child.stdout.end(
        [
          "AI4DEV_TUNNEL_STATUS", "systemd", serviceState, "7000", listening,
          "1", "00:00", "5", "06:00", "Europe/Paris", prefillState, authFieldState,
        ].join("\t") + "\n"
      );
    } else if (action === "prefill-set") {
      authenticationPrefillEnabled = args.at(-1) === "true";
      child.stdout.end("Authentication prompt prefill updated.\n");
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

// --- dedicated phase: a host with the updatable Notification API (VS Code >= 1.104) ------------
async function runUpdatable(hostContext) {
  installNotificationApi(true);
  // Two states are exercised: a dead grant (`auth_required`, no renewal button) and a
  // stopped service (the full set). The labels come from the localized strings, never
  // retyped here, so a bundle wording change cannot silently split test and product.
  serviceState = "inactive";
  statusCause = "auth";
  authFieldState = "reauth_required";
  statusDetail = "token invalide";
  failStatusProbe = false;
  fake.created.length = 0;
  fake.dismissed.length = 0;
  const errorBefore = notifications.length;
  const infoBefore = infoMessages.length;

  await registeredCommands.get("ai4devTunnel.showStatus")();
  assert.equal(notifications.length, errorBefore, "no showErrorMessage call once the API exists");
  assert.equal(fake.created.length, 1, "the failure opens exactly one notification");
  const authNotice = fake.created[0];
  const authLabels = authNotice.options.buttons.map((button) => button.label);
  // auth_required cannot be fixed by a renewal: the renewal button must be absent, and the
  // remaining two actions are retry then logs, in the product's own order.
  assert.equal(authLabels.length, 2, "auth_required offers retry and logs only: " + authLabels);
  assert.equal(new Set(authLabels).size, 2, "the two action labels differ");
  // A button must act, not only read. `isDefault` is not asserted: this host provides neither the
  // class nor its option set (measured), so the product's promise is that a click runs the action.
  const beforeButtonClick = processInvocations.length;
  await authNotice.options.buttons[0].click();
  assert.ok(
    processInvocations.length > beforeButtonClick,
    "the first button runs a tunnel action through the client"
  );

  // The same failure read again refreshes that notification instead of stacking a second one.
  await registeredCommands.get("ai4devTunnel.showStatus")();
  assert.equal(fake.created.length, 1, "the same reading must not open a second notification");
  assert.equal(authNotice.updates.length >= 1, true, "the live row was updated, not replaced");

  // A refreshed row still acts: `update` installs the buttons the product rebuilt, and the first
  // one for auth_required is still "retry", which runs a tunnel action through the client.
  const beforeRefreshedClick = processInvocations.length;
  await authNotice.options.buttons[0].click();
  assert.ok(
    processInvocations.length > beforeRefreshedClick,
    "an updated row's button still runs a tunnel action"
  );

  // A standing problem is announced once: `nextNotificationState` returns `notify: !alreadyNotified`
  // for every problem state (src/status.js:170), so a *different* problem state that follows does not
  // open a second row. That is the no-stacking behaviour the design chose, and the renewal button's
  // terminal is asserted in the pre-existing phase, where no notification is outstanding.
  authNotice.dismiss();
  assert.equal(fake.dismissed.length, 1);
  serviceState = "inactive";
  statusCause = "none";
  authFieldState = "valid";
  statusDetail = "";
  fake.created.length = 0;
  await registeredCommands.get("ai4devTunnel.showStatus")();
  assert.ok(
    fake.created.length <= 1,
    "one standing problem, at most one row (got " + fake.created.length + ")"
  );
  // The installed 1.142 host has no Notification class but does have `withProgress` (measured:
  // zero `NotificationButton` in its bundle). There the first announcement keeps the buttoned
  // message, and the evolution of that standing problem refreshes one channel in place.
  installNotificationApi(false);
  // The product instance was activated by `run` and is not re-activated here, so the persisted
  // "already notified" flag must be cleared for this phase to measure a first announcement.
  await hostContext.globalState.update("ai4devTunnel.failureNotified", false);
  fake.progressChannels.length = 0;
  delete require.cache[require.resolve("../src/extension")];
  delete require.cache[require.resolve("../src/tunnelClient")];
  // The policy is read once at activation, so the phase has to activate its own instance.
  require("../src/extension").activate(hostContext);
  serviceState = "inactive";
  statusCause = "none";
  authFieldState = "valid";
  statusDetail = "";

  const announced = notifications.length;
  await registeredCommands.get("ai4devTunnel.showStatus")();
  assert.equal(
    notifications.length,
    announced + 1,
    "the first announcement is still the buttoned message"
  );
  assert.equal(
    notifications.at(-1).actions.length,
    3,
    "and it carries its action buttons: " + notifications.at(-1).actions.join(" | ")
  );
  assert.equal(fake.progressChannels.length, 0, "the first announcement is not the channel");

  await registeredCommands.get("ai4devTunnel.showStatus")();
  assert.equal(
    fake.progressChannels.length,
    1,
    "the evolution of a standing failure opens one channel"
  );
  const channel = fake.progressChannels[0];
  assert.ok(channel.running, "the channel stays open while the failure stands");

  // A *different* problem is a different offer of action: `auth_required` needs its own buttoned
  // message (a progress channel has no buttons), so it announces rather than refreshing.
  statusCause = "auth";
  authFieldState = "reauth_required";
  await registeredCommands.get("ai4devTunnel.showStatus")();
  assert.equal(
    notifications.length,
    announced + 2,
    "a different problem state announces its own message"
  );
  assert.equal(
    notifications.at(-1).actions.length,
    2,
    "and that message carries its buttons: " + notifications.at(-1).actions.join(" | ")
  );
  assert.equal(fake.progressChannels.length, 1, "and the open channel is not duplicated");
  assert.ok(
    channel.reports.length >= 2,
    "the open channel's message is replaced: " + channel.reports.length
  );

  serviceState = "active";
  statusCause = "none";
  await registeredCommands.get("ai4devTunnel.showStatus")();
  assert.equal(fake.progressChannels.length, 1, "an identical status opens no second channel");
  assert.ok(
    fake.progressChannels[0].reports.length >= 2,
    "the standing failure is replaced in place: " + fake.progressChannels[0].reports.length
  );

  serviceState = "active";
  statusCause = "none";
  authFieldState = "valid";
  statusDetail = "tunnel en place";
  await registeredCommands.get("ai4devTunnel.showStatus")();
  await channel.settled;
  assert.equal(channel.running, false, "recovery closes the status channel");
  assert.equal(fake.progressChannels.length, 1, "recovery must not open another one");

  // Back to the fallback host so the phases below measure the older surface again.
  installNotificationApi(false);
  serviceState = "inactive";
  failStatusProbe = false;
  statusCause = "none";
  authFieldState = "unknown";
  statusDetail = "";
}

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
    assert.match(statusItems[0].tooltip, /Préremplissage de la commande d’authentification : Activé/);
    assert.equal(notifications.length, 1);
    assert.match(notifications[0].message, /ne fonctionne pas/);
    assert.equal(notifications[0].actions.length, 3);

    await registeredCommands.get("ai4devTunnel.toggle")();
    assert.equal(notifications.length, 1);

    fake.selectedAction = "showLogs";
    await registeredCommands.get("ai4devTunnel.showActions")();
    assert.equal(outputChannels[0].visible, true);
    assert.match(outputChannels[0].content, /sample tunnel log/);
    const logsInvocation = processInvocations.find(({ args }) => args.at(-3) === "logs");
    assert.equal(logsInvocation.args.at(-2), "25");

    settings.authenticationPromptPrefill = "invalid";
    await fake.configurationChangeHandler({
      affectsConfiguration: (section) =>
        section === "ai4devTunnel" ||
        section === "ai4devTunnel.authenticationPromptPrefill",
    });
    assert.match(notifications.at(-1).message, /doit être une valeur booléenne/);
    assert.doesNotMatch(notifications.at(-1).message, /entier positif/);

    settings.authenticationPromptPrefill = false;
    await fake.configurationChangeHandler({
      affectsConfiguration: (section) =>
        section === "ai4devTunnel" ||
        section === "ai4devTunnel.authenticationPromptPrefill",
    });
    const prefillInvocation = processInvocations.findLast(
      ({ args }) => args.at(-3) === "prefill-set"
    );
    assert.equal(prefillInvocation.args.at(-1), "false");
    assert.match(statusItems[0].tooltip, /Préremplissage de la commande d’authentification : Désactivé/);

    fake.selectedAction = "renewAuthentication";
    await registeredCommands.get("ai4devTunnel.showActions")();
    assert.equal(terminals.length, 1);
    assert.equal(terminals[0].shown, true);
    assert.match(terminals[0].options.name, /Renouveler/);
    assert.equal(terminals[0].options.shellArgs.at(-3), "renew");
    assert.equal(terminals[0].options.shellArgs.at(-1), "false");
    assert.equal(
      processInvocations.findLast(({ args }) => args.at(-3) === "prefill-set").args.at(-1),
      "false"
    );

    // Coherence: the tunnel first recovers, which clears the failure flag.
    serviceState = "active";
    await registeredCommands.get("ai4devTunnel.showStatus")();
    const errorCountBeforeUnreachable = notifications.length;
    const infoCountBeforeUnreachable = infoMessages.length;

    // One failed status probe (transient WSL hiccup) must not raise the
    // sticky error toast; two consecutive failures do, with wording that
    // the check itself failed, and the recovery is then announced once.
    failStatusProbe = true;
    await registeredCommands.get("ai4devTunnel.showStatus")();
    assert.equal(notifications.length, errorCountBeforeUnreachable);
    assert.match(statusItems[0].text, /ai4dev : indisponible/);
    await registeredCommands.get("ai4devTunnel.showStatus")();
    assert.equal(notifications.length, errorCountBeforeUnreachable + 1);
    assert.match(notifications.at(-1).message, /Impossible de vérifier/);

    failStatusProbe = false;
    await registeredCommands.get("ai4devTunnel.showStatus")();
    assert.match(statusItems[0].text, /ai4dev : connecté/);
    const recoveryToasts = () =>
      infoMessages
        .slice(infoCountBeforeUnreachable)
        .filter((message) => /de nouveau connecté/.test(message)).length;
    assert.equal(recoveryToasts(), 1);
    await registeredCommands.get("ai4devTunnel.showStatus")();
    assert.equal(recoveryToasts(), 1);

    await runUpdatable(context);
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