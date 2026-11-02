# ai4dev Tunnel

`ai4dev Tunnel` adds a compact VS Code status-bar monitor and controls for the existing Linux tunnel installation. It runs locally on Windows through WSL or directly in a Remote WSL extension host.

## Use

- The main status-bar item shows connection state, supervisor, local port, and last-check time in its tooltip. Click it to connect or disconnect.
- The adjacent ellipsis opens the localized action list. The same list is available through the `ai4dev Tunnel` Command Palette entry.
- When a tunnel failure is detected, VS Code shows one notification per failure episode with retry, authentication renewal, and log actions.
- Authentication renewal opens a visible terminal because the existing flow may require interactive sign-in.

## Configuration

- `ai4devTunnel.installPath`: Linux path to the existing `ai4dev_tunnel` installation; defaults to `~/agents/ai4dev/ai4dev_tunnel`.
- `ai4devTunnel.wslDistro`: optional WSL distribution name. When empty, the extension derives it from a WSL workspace or uses the default distribution.
- `ai4devTunnel.refreshIntervalSeconds`: status polling interval in seconds; defaults to `5` and cannot be less than `1`.
- `ai4devTunnel.commandTimeoutSeconds`: maximum duration of a tunnel command; defaults to `60` seconds.
- `ai4devTunnel.logLines`: number of recent log lines shown by the extension; defaults to `50`.

The extension reuses `bashrc/ai4dev.bashrc` and its tunnel commands. The status check verifies the configured supervisor and local listening port; it does not call the remote application.

## Language and display

The status bar uses monochrome Codicons. Status colors use VS Code theme tokens, so they adapt to light and dark themes. Runtime labels and notifications support `fr-FR`, `en-US`, and `es-ES`; VS Code's display language takes priority, followed by the operating-system locale, then `en-US`.

The status tooltip also shows the configured service window when enabled. Its days, times, and time zone come from `AI4DEV_SERVICE_WINDOW_*` in the tunnel configuration and are informational only; they never gate tunnel operations.

Diagnostics and explicitly requested tunnel logs are shown in the local `ai4dev Tunnel` Output channel. The extension does not collect telemetry or persist credentials.

## Distribution

The shared production, packaging, Marketplace, and installation process for both extensions is documented in [VS Code Extensions - Producing process Best practices](https://github.com/NicolasWeb/ai-agents-md/blob/main/vs-code-extensions/home-made/VS%20Code%20Extensions%20-%20Producing%20process%20Best%20practices.md).
