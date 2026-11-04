"use strict";

const { spawn } = require("child_process");

const SHELL_SCRIPT = [
  'AI4DEV_HOME="$1"',
  'case "$AI4DEV_HOME" in',
  '  "~") AI4DEV_HOME="$HOME" ;;',
  // ${AI4DEV_HOME:2} drops the literal "~/" prefix; ${AI4DEV_HOME#~/} cannot be
  // used here because bash applies tilde expansion to the # pattern word.
  '  "~/"*) AI4DEV_HOME="$HOME/${AI4DEV_HOME:2}" ;;',
  "esac",
  'case "$AI4DEV_HOME" in /*) ;; *) printf "%s\\n" "Install path must be a Linux absolute path or start with ~/." >&2; exit 64 ;; esac',
  'export AI4DEV_HOME',
  '. "$AI4DEV_HOME/bashrc/ai4dev.bashrc" || exit 65',
  "ai4dev_env || exit 65",
  "set -o pipefail",
  "stop_tunnel() {",
  "  ai4dev_disconnect || true",
  '  if ai4dev_systemd_available && systemctl --user is-active --quiet ai4dev-tunnel.service; then return 1; fi',
  '  if pgrep -f -- "$AI4DEV_HOME/(bin/ai4dev-tunnel|cmd/tunnel)" >/dev/null 2>&1; then return 1; fi',
  '  if ss -tlnH "sport = :$AI4DEV_PORT" 2>/dev/null | grep -q LISTEN; then return 1; fi',
  "  return 0",
  "}",
  'case "$2" in',
  "  status)",
  '    if ! declare -F ai4dev_status_record >/dev/null 2>&1; then printf "%s\\n" "Tunnel status record is not supported by this installation." >&2; exit 69; fi',
  '    ai4dev_status_record',
  "    ;;",
  "  connect) ai4dev_connect ;;",
  "  disconnect) stop_tunnel ;;",
  "  restart)",
  "    if ai4dev_systemd_available; then",
  "      systemctl --user restart ai4dev-tunnel.service || exit $?",
  "      ai4dev_wait_ready",
  "    else",
  "      stop_tunnel || exit $?",
  "      ai4dev_connect",
  "    fi",
  "    ;;",
  "  prefill-set)",
  '    if [ "$4" != "true" ] && [ "$4" != "false" ]; then printf "%s\\n" "Invalid authentication prompt prefill setting." >&2; exit 64; fi',
  '    if ! declare -F ai4dev_prefill >/dev/null 2>&1 || ! declare -F ai4dev_is_truthy >/dev/null 2>&1; then printf "%s\\n" "Authentication prompt prefill is not supported by this tunnel installation." >&2; exit 69; fi',
  '    if [ "$4" = "true" ]; then ai4dev_prefill on; else ai4dev_prefill off; fi',
  "    ;;",
  '  logs) ai4dev_logs "${3:-50}" ;;',
  "  renew) ai4dev_auth_renew ;;",
  '  *) printf "%s\\n" "Unsupported tunnel action." >&2; exit 64 ;;',
  "esac",
].join("\n");

function distroFromWorkspace(workspaceFolders) {
  for (const folder of workspaceFolders || []) {
    const uri = folder && folder.uri ? folder.uri : {};
    const authority = String(uri.authority || "");
    const remoteMatch = authority.match(/^wsl\+(.+)$/i);
    if (remoteMatch) {
      return remoteMatch[1];
    }

    if (/^wsl(?:\.localhost|\$)?$/i.test(authority)) {
      const pathMatch = String(uri.path || "").match(/^\/([^/]+)(?:\/|$)/);
      if (pathMatch) {
        return pathMatch[1];
      }
    }

    const candidates = [uri.fsPath, uri.path, uri.toString && uri.toString()];
    for (const candidate of candidates) {
      if (typeof candidate !== "string") {
        continue;
      }
      const uncMatch = candidate.match(/^\\\\wsl(?:\.localhost|\$)\\([^\\]+)(?:\\|$)/i);
      if (uncMatch) {
        return uncMatch[1];
      }
    }
  }
  return "";
}

function resolveDistro(configuredDistro, workspaceFolders) {
  const configured = String(configuredDistro || "").trim();
  return configured || distroFromWorkspace(workspaceFolders);
}

function validateInstallPath(installPath) {
  const value = String(installPath || "").trim();
  if (!value || !(value.startsWith("/") || value === "~" || value.startsWith("~/"))) {
    const error = new Error("Invalid install path.");
    error.kind = "configuration";
    throw error;
  }
  return value;
}

function positiveInteger(value, settingName) {
  const numericValue = Number(value);
  if (!Number.isSafeInteger(numericValue) || numericValue < 1) {
    const error = new Error(`Invalid ${settingName} setting.`);
    error.kind = "configuration";
    error.setting = settingName;
    throw error;
  }
  return numericValue;
}

function buildInvocation(options) {
  const {
    platform = process.platform,
    remoteName,
    distro = "",
    installPath,
    action,
    logLines = 50,
    authenticationPromptPrefill = true,
  } = options;
  const allowedActions = ["status", "connect", "disconnect", "restart", "logs", "renew", "prefill-set"];
  if (!allowedActions.includes(action)) {
    throw new Error("Unsupported tunnel action.");
  }

  const home = validateInstallPath(installPath);
  const requestedLogLines = action === "logs" ? positiveInteger(logLines, "logLines") : 50;
  let prefillSetting = authenticationPromptPrefill;
  if (action === "prefill-set") {
    if (typeof prefillSetting !== "boolean") {
      const error = new Error("Invalid authenticationPromptPrefill setting.");
      error.kind = "configuration";
      error.setting = "authenticationPromptPrefill";
      throw error;
    }
    prefillSetting = String(prefillSetting);
  }
  const args = [
    "-lc",
    SHELL_SCRIPT,
    "ai4dev-tunnel",
    home,
    action,
    String(requestedLogLines),
    String(prefillSetting),
  ];
  if (platform === "win32" && remoteName !== "wsl") {
    const wslArgs = [];
    if (distro) {
      wslArgs.push("-d", distro);
    }
    wslArgs.push("--exec", "bash", ...args);
    return { command: "wsl.exe", args: wslArgs };
  }

  return { command: "/bin/bash", args };
}

function processError(kind, exitCode) {
  const error = new Error(kind);
  error.kind = kind;
  if (exitCode !== undefined && exitCode !== null) {
    error.exitCode = exitCode;
  }
  return error;
}

function runProcess(command, args, options = {}) {
  const spawnImpl = options.spawnImpl || spawn;
  const timeoutMs = positiveInteger(options.timeoutMs ?? 60000, "commandTimeoutSeconds");

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(command, args, { windowsHide: true });
    } catch {
      reject(processError("spawn"));
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      let killFailed = false;
      if (typeof child.kill === "function") {
        try {
          child.kill();
        } catch {
          killFailed = true;
        }
      }
      const error = processError("timeout");
      error.killFailed = killFailed;
      finish(reject, error);
    }, timeoutMs);

    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }
    child.on("error", () => finish(reject, processError("spawn")));
    child.on("close", (code) => {
      if (code === 0) {
        finish(resolve, { stdout, stderr });
      } else {
        finish(reject, processError("exit", code));
      }
    });
  });
}

function createTunnelClient(options) {
  const invocationOptions = {
    platform: options.platform,
    remoteName: options.remoteName,
    distro: options.distro,
    installPath: options.installPath,
    logLines: options.logLines ?? 50,
    authenticationPromptPrefill: options.authenticationPromptPrefill ?? true,
  };
  const timeoutSeconds = options.timeoutSeconds ?? 60;
  const spawnImpl = options.spawnImpl || spawn;

  return {
    buildInvocation(action) {
      return buildInvocation({ ...invocationOptions, action });
    },
    async execute(action) {
      const invocation = buildInvocation({ ...invocationOptions, action });
      return runProcess(invocation.command, invocation.args, {
        spawnImpl,
        timeoutMs: positiveInteger(timeoutSeconds, "commandTimeoutSeconds") * 1000,
      });
    },
  };
}

module.exports = {
  SHELL_SCRIPT,
  buildInvocation,
  createTunnelClient,
  distroFromWorkspace,
  resolveDistro,
  runProcess,
};
