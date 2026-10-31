# Help

## Status-bar controls

- Select the main status item to connect a stopped tunnel or disconnect a connected tunnel.
- Select the ellipsis to open the action list.
- Search the Command Palette for `ai4dev Tunnel` to open the same action list.
- Hover over the main item for the current state, supervisor, local port, and last-check time.

## Failure notification

An unhealthy tunnel state triggers one VS Code notification per failure episode. The notification offers retry, authentication renewal, and log viewing. A healthy status check re-arms the next notification. Authentication renewal runs in a visible terminal so interactive sign-in remains available.

## Settings

- `ai4devTunnel.installPath` points to the Linux installation containing `bashrc/ai4dev.bashrc`.
- `ai4devTunnel.wslDistro` selects a WSL distribution. Leave it empty to derive the distribution from the current WSL workspace or use the WSL default.
- `ai4devTunnel.refreshIntervalSeconds` controls the polling interval.

## Language and themes

The display language is selected from VS Code first, then the operating-system locale. Supported languages are French (`fr-FR`), English (`en-US`), and Spanish (`es-ES`). If neither locale is supported, English is used. Status colors use standard VS Code theme tokens and monochrome Codicons.
