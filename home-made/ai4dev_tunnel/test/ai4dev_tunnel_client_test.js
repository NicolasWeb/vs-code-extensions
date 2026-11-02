"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { spawnSync } = require("node:child_process");
const { PassThrough } = require("node:stream");
const { operationForAction } = require("../src/actions");
const {
  SHELL_SCRIPT,
  buildInvocation,
  createTunnelClient,
  distroFromWorkspace,
  resolveDistro,
  runProcess,
} = require("../src/tunnelClient");

assert.equal(
  distroFromWorkspace([{ uri: { scheme: "file", fsPath: "\\\\wsl.localhost\\FedoraLinux-44\\home\\nicolas" } }]),
  "FedoraLinux-44"
);
assert.equal(
  distroFromWorkspace([{ uri: { scheme: "vscode-remote", authority: "wsl+Ubuntu", path: "/home/user" } }]),
  "Ubuntu"
);
assert.equal(
  distroFromWorkspace([{ uri: { authority: "wsl.localhost", path: "/FedoraLinux-44/home/user" } }]),
  "FedoraLinux-44"
);
assert.equal(resolveDistro("CustomDistro", []), "CustomDistro");
assert.equal(resolveDistro("", []), "");

const windowsInvocation = buildInvocation({
  platform: "win32",
  distro: "FedoraLinux-44",
  installPath: "~/agents/ai4dev/ai4dev_tunnel",
  action: "status",
});
assert.equal(windowsInvocation.command, "wsl.exe");
assert.deepEqual(windowsInvocation.args.slice(0, 4), ["-d", "FedoraLinux-44", "--exec", "bash"]);
assert.equal(windowsInvocation.args.at(-3), "status");
assert.equal(windowsInvocation.args.at(-4), "~/agents/ai4dev/ai4dev_tunnel");
assert.equal(windowsInvocation.args.at(-1), "true");

const linuxInvocation = buildInvocation({
  platform: "linux",
  installPath: "/home/user/agents/ai4dev/ai4dev_tunnel",
  action: "connect",
});
assert.equal(linuxInvocation.command, "/bin/bash");
assert.equal(linuxInvocation.args.at(-3), "connect");
assert.throws(
  () =>
    buildInvocation({
      platform: "linux",
      installPath: "C:\\tunnel",
      action: "status",
    }),
  /Invalid install path/
);
assert.equal(operationForAction("showLogs"), "logs");
assert.equal(operationForAction("connect"), "connect");
assert.equal(operationForAction("renewAuthentication"), null);
assert.throws(() => operationForAction("unknown"), /Unsupported/);
const logInvocation = buildInvocation({
  platform: "linux",
  installPath: "/home/user/agents/ai4dev/ai4dev_tunnel",
  action: "logs",
  logLines: 125,
});
assert.equal(logInvocation.args.at(-2), "125");
assert.equal(logInvocation.args.at(-1), "true");
const prefillInvocation = buildInvocation({
  platform: "linux",
  installPath: "/home/user/agents/ai4dev/ai4dev_tunnel",
  action: "prefill-set",
  authenticationPromptPrefill: false,
});
assert.equal(prefillInvocation.args.at(-3), "prefill-set");
assert.equal(prefillInvocation.args.at(-1), "false");
assert.throws(
  () =>
    buildInvocation({
      platform: "linux",
      installPath: "/home/user/agents/ai4dev/ai4dev_tunnel",
      action: "prefill-set",
      authenticationPromptPrefill: "false",
    }),
  /Invalid authenticationPromptPrefill setting/
);
assert.throws(
  () =>
    buildInvocation({
      platform: "linux",
      installPath: "/home/user/agents/ai4dev/ai4dev_tunnel",
      action: "logs",
      logLines: 0,
    }),
  /Invalid logLines setting/
);
assert.equal(spawnSync("bash", ["-n", "-c", SHELL_SCRIPT]).status, 0);
// Regression: the tilde home rewrite must use substring slicing. ${VAR#~/}
// applies tilde expansion to the pattern word and never strips "~/".
assert.match(SHELL_SCRIPT, /AI4DEV_HOME="\$HOME\/\$\{AI4DEV_HOME:2\}"/);
assert.doesNotMatch(SHELL_SCRIPT, /AI4DEV_HOME#~/);
const tildeRewrite = spawnSync(
  "bash",
  ["-c", 'v="$1"; printf "%s" "$HOME/${v:2}"', "probe", "~/agents/ai4dev/ai4dev_tunnel"],
  { encoding: "utf8" }
);
if (tildeRewrite.error || !process.env.HOME) {
  throw new Error("bash HOME-expansion regression check could not run.");
}
assert.equal(tildeRewrite.stdout, `${process.env.HOME}/agents/ai4dev/ai4dev_tunnel`);

function fakeSpawn(complete) {
  return () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => {
      complete(child, null);
      return true;
    };
    if (complete) {
      process.nextTick(() => complete(child, 0));
    }
    return child;
  };
}

const successSpawn = () =>
  fakeSpawn((child, code) => {
    if (code === 0) {
      child.stdout.end("result");
      child.stderr.end("");
      child.emit("close", 0);
    }
  });

async function run() {
  const success = await runProcess("fake", [], { spawnImpl: successSpawn() });
  assert.equal(success.stdout, "result");
  assert.match(SHELL_SCRIPT, /ai4dev_prefill on/);
  assert.match(SHELL_SCRIPT, /ai4dev_prefill off/);
  assert.throws(() => runProcess("fake", [], { timeoutMs: 0 }), /Invalid commandTimeoutSeconds setting/);
  const invalidTimeoutClient = createTunnelClient({
    installPath: "/home/user/agents/ai4dev/ai4dev_tunnel",
    timeoutSeconds: 0,
    spawnImpl: successSpawn(),
  });
  await assert.rejects(
    invalidTimeoutClient.execute("status"),
    (error) => error.kind === "configuration" && error.setting === "commandTimeoutSeconds"
  );

  await assert.rejects(
    runProcess("fake", [], {
      spawnImpl: () =>
        fakeSpawn((child, code) => {
          if (code === 0) {
            child.emit("close", 7);
          }
        })(),
    }),
    (error) => error.kind === "exit" && error.exitCode === 7
  );

  await assert.rejects(
    runProcess(
      "fake",
      [],
      {
        timeoutMs: 10,
        spawnImpl: () => {
          const child = new EventEmitter();
          child.stdout = new PassThrough();
          child.stderr = new PassThrough();
          child.kill = () => true;
          return child;
        },
      }
    ),
    (error) => error.kind === "timeout"
  );

  console.log("ai4dev_tunnel_client_test: PASS");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
