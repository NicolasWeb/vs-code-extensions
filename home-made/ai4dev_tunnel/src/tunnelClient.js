"use strict";

const { spawn } = require("child_process");

const SHELL_SCRIPT = [
  'AI4DEV_HOME="$1"',
  'case "$AI4DEV_HOME" in',
  '  "~") AI4DEV_HOME="$HOME" ;;',
  '  "~/"*) AI4DEV_HOME="$HOME/${AI4DEV_HOME#~/}" ;;',
  "esac",
  'case "$AI4DEV_HOME" in /*) ;; *) printf "%s\\n" "Install path must be a Linux absolute path or start with ~/." >&2; exit 64 ;; esac',
  'export AI4DEV_HOME',
  '. "$AI4DEV_HOME/bashrc/ai4dev.bashrc" || exit 65',
  "ai4dev_env || exit 65",
  "set -o pipefail",
  "stop_tunnel() {",
  "  ai4dev_disconnect || true",
  '  if ai4dev_systemd_available && systemctl --user is-active --quiet ai4dev-tunnel.service; then return 1; fi',
  '  if pgrep -f -- "$AI4DEV_HOME/bin/ai4dev-tunnel" >/dev/null 2>&1; then return 1; fi',
  '  if ss -tlnH "sport = :$AI4DEV_PORT" 2>/dev/null | grep -q LISTEN; then return 1; fi',
  "  return 0",
  "}",
  'case "$2" in',
  "  status)",
  "    if ai4dev_systemd_available; then",
  '      supervisor="systemd"',
  '      service_state="$(systemctl --user is-active ai4dev-tunnel.service 2>/dev/null || true)"',
  '      case "$service_state" in active|inactive|activating|deactivating|failed) ;; *) service_state="unknown" ;; esac',
  "    else",
  '      supervisor="nohup"',
  '      if pgrep -f -- "$AI4DEV_HOME/bin/ai4dev-tunnel" >/dev/null 2>&1; then service_state="active"; else service_state="inactive"; fi',
  "    fi",
  '    if ! [[ "$AI4DEV_PORT" =~ ^[0-9]{1,5}$ ]] || (( AI4DEV_PORT < 1 || AI4DEV_PORT > 65535 )); then printf "%s\\n" "Invalid tunnel port." >&2; exit 65; fi',
  '    if ss -tlnH "sport = :$AI4DEV_PORT" 2>/dev/null | grep -q LISTEN; then listening="1"; else listening="0"; fi',
  '    printf "AI4DEV_TUNNEL_STATUS\\t%s\\t%s\\t%s\\t%s\\n" "$supervisor" "$service_state" "$AI4DEV_PORT" "$listening"',
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

function buildInvocation(options) {
  const {
    platform = process.platform,
    remoteName,
    distro = "",
    installPath,
    action,
    logLines = 50,
  } = options;
  const allowedActions = ["status", "connect", "disconnect", "restart", "logs", "renew"];
  if (!allowedActions.includes(action)) {
    throw new Error("Unsupported tunnel action.");
  }

  const home = validateInstallPath(installPath);
  const args = ["-lc", SHELL_SCRIPT, "ai4dev-tunnel", home, action, String(logLines)];
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
  const timeoutMs = options.timeoutMs || 60000;

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
  };
  const timeoutMs = options.timeoutMs || 60000;
  const spawnImpl = options.spawnImpl || spawn;

  return {
    buildInvocation(action) {
      return buildInvocation({ ...invocationOptions, action });
    },
    async execute(action) {
      const invocation = buildInvocation({ ...invocationOptions, action });
      return runProcess(invocation.command, invocation.args, {
        spawnImpl,
        timeoutMs,
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
