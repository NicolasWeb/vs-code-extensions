# Changelog

## Unreleased

- Add distribution guidance and a verified local installer for Windows and Remote WSL extension hosts.

## 0.1.2

- Keep failure notifications coherent with the status bar: a single failed status probe (state `unavailable`) no longer raises the sticky error toast; two consecutive failed probes are required before announcing, and the announcement says the status check failed instead of asserting the tunnel is not working.
- Announce recovery once with an information notification when a healthy check follows an announced failure, since an error toast cannot be retracted.

## 0.1.1

- Add the `ai4devTunnel.authenticationPromptPrefill` setting, live-synced to the tunnel installation.
- Fix tilde expansion of the install path so the default `~/agents/ai4dev/ai4dev_tunnel` resolves (bash applies tilde expansion to `${VAR#~/}` patterns, leaving a broken path).
- Correct and translate the invalid-configuration error for boolean settings.

## 0.1.0

- Add a theme-aware tunnel status bar with click-based controls and a localized action list.
- Add failure notifications with retry, authentication renewal, and log actions.
- Support Windows/WSL and Remote WSL with French, English, and Spanish runtime localization.
