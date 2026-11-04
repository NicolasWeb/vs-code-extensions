# VS Code Extensions - Producing Process Best Practices

*Shared distribution process for `Human Away` and `ai4dev Tunnel`; reference state checked 2026-10-31.*

## 1. Purpose and reference state

This guide consolidates the packaging, Marketplace-readiness, and local-installation practices established across `Human Away` and `ai4dev Tunnel`. It describes a repeatable process and does not authorize a Marketplace publication or release.

| Extension | Manifest ID | Version at reference check | Minimum VS Code | License declaration |
|---|---|---|---|---|
| `Human Away` | `nitronicolasoft.human-away` | `0.4.0` | `^1.95.0` | `MIT`, with a root `LICENSE` file |
| `ai4dev Tunnel` | `nitronicolasoft.a4d-watcher` | `0.1.2` | `^1.95.0` | `SEE LICENSE IN LICENSE` |

- Manifests are marked `preview`. The values above were rechecked on `2026-11-04` for `ai4dev Tunnel`, whose published id is renamed `nicolas-web-local.ai4dev-tunnel` → `nitronicolasoft.a4d-watcher` and whose folder is `vs-code-extensions/home-made/a4d-watcher/`; a renamed id is a different extension, so migrating means uninstalling the old id, as recorded in that extension's `README.md`. `Human Away` publishes the same lower-cased publisher `nitronicolasoft` with the values measured on 2026-10-31.
- Publisher ownership and Marketplace publication access were not verified during distribution preparation; no Marketplace publication or release workflow was performed.
- This guide lives beside the extension projects and is not included in either VSIX. Packaged READMEs should link to its canonical GitHub URL so the link remains valid outside the repository checkout.

## 2. Shared manifest and source-tree practices

- Preserve the established `publisher` and `name` pair; changing either alters the extension identity and must be treated as a migration, not a cosmetic edit.
- Keep `version`, `CHANGELOG.md`, README instructions, and the packaged behavior synchronized for each release candidate.
- Declare the supported VS Code engine and actual repository subdirectory, issue tracker, homepage, categories, and useful search keywords in `package.json`.
- Keep `preview` enabled until a release is deliberately declared ready; declare icons, gallery metadata, and workspace capabilities only when the corresponding asset or behavior exists and has been verified.
- Make the manifest's `license` declaration agree with the license text shipped in the package; retain the root `LICENSE` in the VSIX.
- Keep the README useful from the Marketplace listing: describe user-visible behavior, requirements, settings, and relevant privacy or credential handling; maintain a `CHANGELOG.md` for release changes.
- Keep runtime source, localization catalogs, and required assets in the package; exclude development-only files such as editor settings, tests, dependencies, temporary baselines, build output, `SESSION.md`, and existing `.vsix` archives through `.vscodeignore`.
- Keep the shared production guide outside an extension's package. If a packaged README points to it, use a stable repository URL rather than a relative link to a file outside the VSIX.

## 3. Repeatable build and package verification

1. Review the selected extension's manifest, README, changelog, license, and `.vscodeignore`; confirm the package identity and exact version before building.
2. Run the complete extension-specific Node test suites and syntax checks before packaging. `Human Away` keeps its unit suites and benchmark scripts under `test/`; `ai4dev Tunnel` has four Node suites covering status, client, localization, and extension behavior.
3. Prefer `@vscode/vsce` for routine packaging when a working toolchain is available; record the exact command and package path used.
4. If `vsce` is unavailable, use a controlled manual ZIP fallback only: stage files from an explicit package allowlist, use the known VSIX metadata structure, and create the archive with `zip -r -X`.
5. Inspect the produced VSIX instead of trusting the packaging command's exit code: run `unzip -t`, read `extension/package.json` from inside the archive, verify publisher/name/version, verify the `"preview"` flag value in that embedded manifest (the source manifest value can be lost by a hand-written `extension/package.json` in a manual fallback build), and compare included and excluded files with `.vscodeignore`.
6. Confirm that tests, install scripts, temporary files, local session notes, previous VSIX files, and other development-only content are absent from the package.
7. Treat the VSIX as the release candidate only after all automated checks and package-content checks pass; retain its identity and checksum with the release evidence.

The [VS Code Marketplace publishing documentation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) is the reference for current `vsce` behavior and publisher requirements.

## 4. Marketplace publication safeguards

- Keep `"preview": true` in `package.json` while an extension is experimental. This is the flag that makes the Marketplace list the extension under its Preview status (rendered `Preview` or `Expérimental` depending on the display language); the Marketplace badge is derived from the manifest, so it cannot be set later on the listing alone, and removing it is a deliberate release decision that belongs in `CHANGELOG.md`.
- Verify the badge in the same evidence pass as the identity: read `"preview"` from the source `package.json` and from `extension/package.json` inside the VSIX, and record both values with the package checksum. An extension published without the flag cannot be marked preview afterwards without republishing a corrected release.
- Verify publisher ownership, extension identity, Marketplace availability, package metadata, and release version before enabling publication.
- Keep publication separate from packaging and local installation; a valid VSIX does not prove that the publisher account is ready or that a public release was authorized.
- When using GitHub Actions, publish only from an explicitly protected and authorized release path, after tests and VSIX inspection succeed.
- Prefer Marketplace Trusted Publishing with GitHub Actions OIDC where supported; scope `id-token: write` to the publishing job and avoid storing a long-lived publisher token.
- If OIDC is unavailable, require explicit authorization before using a secret-based publisher token and keep it in protected secret storage; never place credentials in the repository or VSIX.
- Do not create or run a publish workflow while publisher ownership, credentials, or release approval remain unresolved.

See the [GitHub Actions OpenID Connect documentation](https://docs.github.com/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-cloud-providers) for the identity-token setup.

## 5. Local installation and host verification

- Install the verified VSIX through the VS Code CLI for each target extension host; do not copy files directly into an extensions directory.
- Treat the Windows desktop and each Remote WSL server as separate extension hosts. Determine the actual user-data and extension directories before claiming coverage of all windows or distributions.
- Provide a dry-run such as `-WhatIf` before an installer performs changes; require an explicit WSL distribution when more than one candidate exists rather than guessing.
- If a Windows CLI cannot consume a workspace-hosted path, copy the VSIX to a local temporary directory, verify the copied file's SHA-256 against the source, and install that verified copy.
- After installation, verify both the VS Code CLI listing with versions and the host's `extensions.json` registration for every target; do not treat a successful CLI exit alone as proof.
- Do not reload or restart running windows automatically; tell the user that an already-open window may require a reload or reopen to activate the extension.
- Keep installation separate from extension operation. Installing `ai4dev Tunnel` does not connect, disconnect, or start the tunnel; it does not change model settings or credentials.

For `ai4dev Tunnel`, `scripts/install.ps1` implements `-WhatIf`, explicit WSL distribution selection, temporary-copy hash verification, and per-host CLI and registry checks.

## 6. Practices demonstrated by the two extensions

- `Human Away` provides the initial package precedent: a stable manifest identity, `preview`, repository and issue metadata, a root license, and `.vscodeignore` exclusions for tests, editor files, local baselines, and preview artwork.
- `Human Away` keeps unit and benchmark code under `test/`; tests and design previews are development material, not runtime package content.
- `ai4dev Tunnel` carries the same publisher and engine baseline while documenting its distinct license declaration and its four test suites.
- `ai4dev Tunnel` extends the package precedent with a verified Windows and Remote WSL installer. On 2026-10-31 its `0.1.0` VSIX was installed and checked in the shared Windows profile and one Remote WSL server; no tunnel operation or automatic window reload was performed.
- The manual ZIP fallback was used for `ai4dev Tunnel` because a working `vsce` toolchain was unavailable on the build host; the resulting archive passed integrity, manifest, identity, version, and content checks.
- Keep extension-specific decisions explicit: the two extensions have different license declarations and runtime requirements even though they share a publisher and minimum VS Code engine.

## 7. Release readiness record

- At the 2026-10-31 reference check, both manifests still declared `preview`; the shared publisher's Marketplace ownership and publication access remained unverified, so no publication was attempted.
- Reconfirmed on 2026-11-02: `"preview": true` is present in both source manifests (`ai4dev_tunnel/package.json:56`, `human-away/package.json:215`). A first non-recursive search reported no `.vsix` archive under `vs-code-extensions/home-made/`; that was a false negative. A recursive walk found 7 archives under the `out/` sub-folders, and every one of them carries `preview: true` in `extension/package.json` inside the package, including `ai4dev-tunnel-0.1.0.vsix` and `nicolas-web-local.human-away-0.4.0.vsix`. The embedded-manifest half of the badge check is therefore satisfied for the existing builds and stays a per-build duty.
- Recheck Marketplace status, publisher access, dependency availability, package contents, and installation targets at release time; this dated record is evidence of the prior check, not a substitute for a fresh verification.
