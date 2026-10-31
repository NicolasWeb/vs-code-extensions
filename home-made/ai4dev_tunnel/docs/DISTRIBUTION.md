# ai4dev Tunnel distribution guide

*Packaging, local installation, and Marketplace readiness; status checked 2026-10-31.*

## 1. Scope and current readiness

- The extension identity remains `nicolas-web-local.ai4dev-tunnel`, version `0.1.0`; the package remains marked `preview` until publisher access and release readiness are confirmed.
- No Marketplace publication or release workflow was performed. Public publisher and extension pages returned `404`, and the publisher management route required authentication during the review; publisher ownership and availability remain unverified.
- This guide records the release practices retained from `Human Away` and the verified differences needed for `ai4dev Tunnel`; it does not authorize publication.

## 2. Practices retained from Human Away

- Keep the Marketplace identity, version, minimum VS Code engine, README, changelog, license, repository, issue tracker, homepage, and relevant search keywords in the extension manifest.
- Preserve `preview` until a release is deliberately declared ready; add optional icon, gallery, or workspace capability metadata only when the corresponding asset or behavior exists and has been verified.
- Treat the VSIX as a deliverable that must be inspected: validate its archive, embedded `extension/package.json`, publisher/name/version, and included-file list rather than trusting the packaging command's exit code alone.
- Keep local installation separate from tunnel operation: install into the Windows user profile and the selected Remote WSL extension store, verify both registries, and leave open windows for an explicit reload.
- Prefer `@vscode/vsce` for routine packaging and publication; use the manual ZIP path only when the host lacks a working `vsce` toolchain, and verify the resulting VSIX against the same manifest and file allowlist.
- The existing `Human Away` manifest uses `MIT` while shipping a root `LICENSE`; `ai4dev Tunnel` instead follows the Marketplace manifest guidance and uses `SEE LICENSE IN LICENSE`.

## 3. Manifest and package contents

- `package.json` retains the existing publisher/name pair and declares `preview`, a verified repository subdirectory, issue tracker, homepage, and search keywords; no icon or workspace capability is declared because neither is present in the extension.
- The package license points to the shipped `LICENSE`; the minimum VS Code engine remains `^1.95.0`.
- `.vscodeignore` excludes editor configuration, development scripts, dependencies, tests, build output, and VSIX files; the distribution guide remains included so the README's relative link resolves in the package.
- The package includes runtime source, localization catalogs, `README.md`, `CHANGELOG.md`, `FEATURES.md`, `HELP.md`, `LICENSE`, and `docs/DISTRIBUTION.md`.
- The [VS Code Marketplace publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) remains the reference for current `vsce` packaging and publisher requirements.

## 4. Packaging and publication

- Run the extension's existing four Node test suites and syntax checks before packaging; do not install or publish a package that fails validation.
- When available, use `@vscode/vsce` to package the extension and inspect the produced VSIX against `.vscodeignore`.
- When `vsce` is unavailable, the local fallback stages only allowed files, reuses the known VSIX metadata templates, and creates the archive with `zip -r -X`; then verify `unzip -t`, the embedded manifest, package identity/version, and included/excluded paths.
- A GitHub release workflow must run tests and package inspection before publication, and must publish only from a protected, explicitly authorized release path.
- Prefer Marketplace Trusted Publishing with GitHub Actions OIDC where supported; keep `id-token: write` scoped to the publishing job and avoid storing a PAT. If OIDC is unavailable, any secret-based publisher token requires explicit authorization and protected secret storage.
- The public publisher identity is not verified; no publish workflow, credential, or Marketplace release is created until that prerequisite is resolved.

## 5. Local Windows and Remote WSL installation

- Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1 -WhatIf` from the extension directory to inspect the Windows and Remote WSL targets without copying or installing the VSIX.
- Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install.ps1` to install the versioned VSIX into the shared Windows extension profile and the selected WSL distribution's `~/.vscode-server/extensions` store.
- The process-scoped `-ExecutionPolicy Bypass` is required for this UNC-hosted unsigned script under the current host policy; it does not persistently change the user or machine execution policy.
- When more than one WSL distribution is installed, provide `-WslDistro <name>`; the installer does not guess which remote host should receive the extension.
- The installer checks the package identity/version, copies the VSIX to Windows `%TEMP%` before invoking `code.cmd`, verifies the copied hash, then verifies each host's CLI listing and `extensions.json` registration.
- The installer does not connect to, disconnect, or otherwise operate the tunnel; it does not reload running VS Code windows. Reload a window or open a new one to activate the installed extension.

## 6. References

- [VS Code Marketplace publishing documentation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).
- [GitHub Actions OpenID Connect documentation](https://docs.github.com/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-cloud-providers).
