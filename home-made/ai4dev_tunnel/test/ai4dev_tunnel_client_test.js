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
  installPath: "~/agents/ai4dev_tunnel",
  action: "status",
});
assert.equal(windowsInvocation.command, "wsl.exe");
assert.deepEqual(windowsInvocation.args.slice(0, 4), ["-d", "FedoraLinux-44", "--exec", "bash"]);
assert.equal(windowsInvocation.args.at(-2), "status");
assert.equal(windowsInvocation.args.at(-3), "~/agents/ai4dev_tunnel");

const linuxInvocation = buildInvocation({
  platform: "linux",
  installPath: "/home/user/agents/ai4dev_tunnel",
  action: "connect",
});
assert.equal(linuxInvocation.command, "/bin/bash");
assert.equal(linuxInvocation.args.at(-2), "connect");
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
  installPath: "/home/user/agents/ai4dev_tunnel",
  action: "logs",
  logLines: 125,
});
assert.equal(logInvocation.args.at(-1), "125");
assert.throws(
  () =>
    buildInvocation({
      platform: "linux",
      installPath: "/home/user/agents/ai4dev_tunnel",
      action: "logs",
      logLines: 0,
    }),
  /Invalid logLines setting/
);
assert.equal(spawnSync("bash", ["-n", "-c", SHELL_SCRIPT]).status, 0);

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
  assert.throws(() => runProcess("fake", [], { timeoutMs: 0 }), /Invalid commandTimeoutSeconds setting/);
  const invalidTimeoutClient = createTunnelClient({
    installPath: "/home/user/agents/ai4dev_tunnel",
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
