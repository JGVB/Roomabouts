# 0003: Pin a minimal Playwright browser-test lane

Status: Accepted
Date: 2026-11-15
Owners: Roomabouts coordinator and Quality
Related plan: `docs/plans/active/2026-11-15-rmm-fork-foundation.md`

Approval: Accepted by the user on 2026-11-15 before any Node manifest, lockfile, browser binary, package, browser-test workflow, or Phase 3 product-code change was added.

## Context

Phase 2 established a dependency-free fake Home Assistant fixture and manually verified the real custom card in Chrome. Phase 3 adds an original visual system, a read-only cartographic renderer, and footprint trails. Those changes need repeatable real-browser interaction and screenshot checks; Deno alone cannot validate layout, computed styles, media queries, accessibility-tree output, or rendered pixels.

The repository currently has no `package.json`, Node version file, package lock, Playwright configuration, or browser-test dependency. The current Apple silicon Mac has Deno and a standalone pnpm, but no Node or npm. The Python and Deno Quality gate is fast, deterministic, and already required. This decision adds the smallest separate browser lane without making Node a production runtime or weakening that gate.

Verified upstream facts on 2026-11-15:

- Node.js `24.22.3` is a supported LTS security release and bundles npm `11.19.1`.
- `@playwright/test` `1.65.1` supports Node 20 or newer, is Apache-2.0 licensed, and pins `playwright`/`playwright-core` to the same version.
- Playwright `1.65.1` pins Chromium and Chromium headless shell `159.0.8154.6`, browser revision `1255`, plus FFmpeg revision `1013`.
- Playwright downloads browsers explicitly; package installation does not need to download a browser.
- Playwright recommends one CI worker for stability and warns that screenshot rendering varies by operating system and environment.

## Options considered

1. Continue with manual Chrome checks only.
2. Add exact npm and Playwright pins while retaining Python/Deno as the primary contract gate.
3. Import Playwright through Deno's npm compatibility layer.
4. Use Selenium with the runner's installed Chrome.
5. Use an unpinned branded Chrome channel.
6. Make a Playwright Docker image the normal test runtime.

## Decision

Use option 2 with the following frozen boundary.

### Toolchain and lock boundary

- Node.js: exactly `24.22.3`, recorded in `.node-version` and `package.json`.
- Package manager: the bundled npm `11.19.1`; do not add pnpm, Corepack bootstrap, Yarn, or a global npm replacement.
- Direct package dependency: `@playwright/test` exactly `1.65.1`, with no range operator.
- Browser payload: Playwright-pinned Chromium headless shell `159.0.8154.6`, revision `1255`, and FFmpeg revision `1013`; install only that shell payload plus its required FFmpeg payload. Full Chromium, Firefox, WebKit, winldd, and Android payloads are denied.
- Lock: commit lockfile-version-3 `package-lock.json`. Its only four package keys are the root, `node_modules/@playwright/test`, `node_modules/playwright`, and `node_modules/playwright-core`; all three packages are exactly `1.65.1`. Any additional or optional package blocks acceptance pending review.
- Locked registry artifacts are frozen to the following HTTPS npm-registry URLs and SHA-512 values:

| Package | Resolved URL | Integrity |
| --- | --- | --- |
| `@playwright/test@1.65.1` | `https://registry.npmjs.org/@playwright/test/-/test-1.65.1.tgz` | `sha512-y+NCIRm2LvY4slUVWvGh1nujJ8RF/hEisIsq2mtUPgdQC4L701bq5hZGMhrpeXjACvwvO9tj5dJqhvM6TP9lbw==` |
| `playwright@1.65.1` | `https://registry.npmjs.org/playwright/-/playwright-1.65.1.tgz` | `sha512-vJ1FuoOrNwOKHUIVEvSt3jT1L+wjjDpwhwIstKtfvTh8XIG4FG4bIFuvNdMxi81LGfAhUgUZleVFaOLY4RIUUw==` |
| `playwright-core@1.65.1` | `https://registry.npmjs.org/playwright-core/-/playwright-core-1.65.1.tgz` | `sha512-hqPpz7blSMPxWVdoeE1yiBSzXsKiVOd2k+kjCvmUywD2GPO2Dd9HfcWnq9NN0GHbNZDFgZ9JfBFr+X5/BLo0qw==` |

- Git, file, alternate-host, missing-integrity, `hasInstallScript`, and non-allowlisted optional dependencies are denied. Every installed package manifest must have an absent or empty `scripts` object; installation still uses `--ignore-scripts`.
- `npm ci` creates repository-local `node_modules`, and npm scripts resolve Playwright from its `.bin` directory. `node_modules` must be ignored, release-excluded, never committed, and removed during rollback. Production code must not import it.
- GitHub setup action: `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1` (`v7.1.0`).
- Required candidate/failure artifact action: `actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f` (`v7.0.0`). It uses `retention-days: 7`, `include-hidden-files: false`, `if-no-files-found: error`, and `overwrite: false`. It accepts only PNG candidates/diffs plus a JSON hash manifest from one dedicated synthetic-only directory; traces, video, HTML reports, console logs, source, Home Assistant data/configuration, and household geometry are denied. Record its `artifact-digest` output. These files leave the runner for GitHub's runtime artifact service; no repository `actions: write` permission is granted.

The exact root-script allowlist is:

| Script | Exact command |
| --- | --- |
| `browser:install` | `playwright install --only-shell chromium` |
| `browser:install:ci` | `playwright install --with-deps --only-shell chromium` |
| `test:browser` | `playwright test` |
| `test:browser:update` | `playwright test --update-snapshots` |

npm resolves those commands to the package-local binary. Unqualified `npx` is forbidden because it may fetch a missing package. Normal CI never runs `test:browser:update` or updates committed goldens.

### Verified local bootstrap

The current Apple silicon Mac must not receive a global or system Node installation. The approved bootstrap is:

1. Download the official `node-v24.22.3-darwin-arm64.tar.gz` archive from `https://nodejs.org/dist/v24.22.3/`, failing on HTTP errors and rejecting any redirect whose effective host is not `nodejs.org` or whose protocol is not HTTPS.
2. Treat the literal digest committed in this accepted decision—not a checksum fetched alongside the archive—as the trust anchor. Verify with the built-in macOS command:

   ```sh
   printf '%s  %s\n' \
     'ff6e17d4874b76d272212b908cc020d6e815fba5a6c7eaaa06add725840307fd' \
     'node-v24.22.3-darwin-arm64.tar.gz' |
     /usr/bin/shasum -a 256 -c -
   ```

   The published `SHASUMS256.txt` is supporting evidence, not the runtime trust anchor.
3. Unpack it into a task-specific temporary directory outside the repository, prepend that unpacked `bin` directory only to the commands that need Node/npm, and record `node --version` plus `npm --version`.
4. Do not write to `/usr/local`, `/opt/homebrew`, the user's global npm prefix, or shell startup files. Remove the temporary unpack after the implementation/review session.

A checksum mismatch stops the bootstrap. The current Mac has no `gpg`/`gpgv`; do not add GPG, Homebrew, a release key, or another bootstrap dependency silently. Signed-manifest verification requires a separate pinned proposal. Another platform requires its official archive and literal checksum to be added to this accepted decision before use.

### Install, advisory, and CI boundary

- Keep the existing Python/Deno job unchanged and required.
- Add a separate `ubuntu-24.04` browser job with `permissions: contents: read`.
- Disable setup-node's package-manager cache and do not cache browsers initially. Locally, create one recorded task-specific root with `mktemp -d`; keep the downloaded Node archive/unpack, `npm_config_cache`, and `PLAYWRIGHT_BROWSERS_PATH` payload beneath that root. In CI, setup-node may place Node/npm in GitHub's managed toolcache, while npm cache and Playwright browser payload use task-specific children under `RUNNER_TEMP`. Do not use ambient/shared npm or Playwright caches.
- The Playwright CLI is expected at repository-local `./node_modules/.bin/playwright`; it is not a temporary-root payload. Release and rollback checks distinguish that CLI/package tree from the temp-root browser binaries.
- Use an isolated, token-free npm configuration forced to `https://registry.npmjs.org/`; fail if registry, proxy, or auth settings differ. Install the locked tree with `npm ci --ignore-scripts --no-audit --no-fund`. `--no-audit` suppresses npm's automatic advisory submission during install.
- Run the separate reviewed advisory query `npm audit --package-lock-only --audit-level=high`; do not use `npm audit fix` or any automatic mutation. The Bulk Advisory endpoint receives package names and version lists. If npm falls back to Quick Audit, it sends the full lock tree plus npm/Node versions, platform, architecture, and `node_env`; npm 7+ does not scrub scoped/private names. This repository's approved tree is public-only, but the disclosure remains explicit.
- Review registry signatures with `npm audit signatures`; it separately requests package metadata, public keys, and provenance attestations. Signature verification does not replace the advisory check. If npm `11.19.1` cannot verify the registry's current attestation format, stop and amend this decision rather than silently upgrading npm.
- Download the browser explicitly with `./node_modules/.bin/playwright install --with-deps --only-shell chromium`. It downloads headless-shell revision `1255` and FFmpeg revision `1013`; `--with-deps` runs `apt-get update`/`apt-get install` with elevated privileges on the ephemeral Ubuntu runner.
- Forbid `PLAYWRIGHT_DOWNLOAD_HOST`, per-browser download-host variables, and related CDN override variables. Before execution, verify the installed inventory with `./node_modules/.bin/playwright install --list` plus a filesystem scan that rejects denied browser payloads.
- Verify the exact Node, npm, Playwright, Chromium, and FFmpeg revisions; hash the browser/FFmpeg executables and notice files; and record the `apt` package/version inventory. Set Playwright `video: "off"` and `trace: "off"`; FFmpeg is still part of the fixed Playwright install payload.
- Run with one worker, finite per-test/global/web-server timeouts, no retries locally, and at most one retry in CI.
- Serve the existing fixture on loopback only. Browser contexts block non-loopback requests and use a fixed locale, timezone, color scheme, reduced-motion setting where applicable, device scale factor `1`, and explicit viewports.
- Commit only reviewed, synthetic Linux/Chromium baselines. Candidate baseline generation may run only through an explicit maintainer command or manually dispatched job; it must never commit or approve snapshots automatically.

Approved bootstrap/install network surfaces are limited to the official Node distribution, npm registry/advisory endpoint, Microsoft Playwright CDN, floating Ubuntu package repositories, and the pinned GitHub Actions. After installation, browser tests may contact loopback only. Chromium/FFmpeg revision numbers are identifiers, not content digests; the Microsoft CDN and mutable Ubuntu repositories remain explicitly trusted residual bootstrap risks, mitigated by post-install inventory/hashes and release exclusion rather than claimed cryptographic reproducibility.

### License and notice boundary

Before the browser lane is accepted, create `docs/security/browser-toolchain-inventory.md` with version, source, installed hash where available, license identifier, bundled notice location, and redistribution disposition for:

- Node `24.22.3` — MIT plus bundled third-party notices;
- npm `11.19.1` — Artistic-2.0 plus bundled dependency licenses;
- `@playwright/test`, `playwright`, and `playwright-core` `1.65.1` — Apache-2.0 with reviewed/preserved notices;
- `actions/setup-node` and `actions/upload-artifact` — MIT plus their bundled action-dependency notices;
- Chromium headless shell — Chromium BSD-style license plus `LICENSE.headless_shell` and bundled third-party notices;
- Ubuntu browser dependencies — mixed licenses under `/usr/share/doc`, CI-only and never redistributed; and
- Playwright FFmpeg revision `1013` — license is not assumed. Record `ffmpeg-linux -version`, `-buildconf`, `-L`, its notice file, and whether `--enable-gpl` or `--enable-nonfree` appears before acceptance.

The inventory is review evidence, not part of the Home Assistant archive. Browser/FFmpeg/apt payloads, Node, npm, `node_modules`, and their reports remain excluded from that archive. Any missing/incompatible license or notice blocks the browser lane.

### Test ownership boundary

Python and Deno remain the source of truth for schemas, privacy contracts, transforms, footprint arithmetic, lifecycle cleanup, and renderer logic. Playwright is used only for:

- real custom-element integration;
- read-only-map rendering;
- responsive and zoom/reflow behavior;
- keyboard/focus and accessible-name checks;
- reduced-motion and forced-colors behavior; and
- reviewed screenshot comparisons.

Node, npm, Playwright, Chromium, and FFmpeg are development/CI dependencies only. They are not bundled in the Home Assistant integration or required at runtime.

## Consequences

### Positive

- Browser behavior and screenshots become bounded and reviewable against exact package versions, browser identifiers, recorded installed hashes, and a captured runner/font inventory.
- npm is bundled with the selected Node release, avoiding a second package-manager bootstrap.
- The existing fast gate stays dependency-free and catches semantic failures without a browser download.
- Chromium-only coverage is sufficient for the first personal proof and keeps the download surface bounded.

### Costs and risks

- Bootstrap traffic is added to the official Node distribution, npm registry/advisory endpoint, Microsoft Playwright CDN, Ubuntu package repositories, and pinned GitHub Actions.
- The locked npm tree contains three Playwright packages. Package integrity, provenance, lifecycle scripts, advisories, and licenses require review.
- Browser and OS updates require an explicit dependency-review change; visual baselines may need reviewed regeneration.
- Linux screenshot baselines are not expected to match macOS pixel-for-pixel. macOS remains useful for manual design review but is not the golden platform.
- Artifact upload is a required, bounded supply-chain surface because the approved golden-review flow depends on it.
- Microsoft CDN payloads and floating Ubuntu repositories are not content-addressed by this record; post-install hashes detect later comparisons but do not eliminate first-download trust.

### Rejected alternatives

- Manual checks alone do not provide lasting regression coverage.
- pnpm adds a bootstrap/tooling surface without a workspace or material benefit for one direct dependency.
- Deno npm compatibility still needs the same npm packages and browser binaries while making standard Playwright guidance harder to follow.
- Selenium or installed Chrome introduces more dependency and browser-version drift.
- A branded Chrome channel is not a reproducible golden target.
- A Docker image adds a large image/digest/update surface before hosted-runner stability has failed; reconsider it only with evidence.

### Rollback

Remove the browser job, Node/package files, Playwright tests, browser baselines, and browser-test protocol artifacts. Remove the repository-local `node_modules` directory and delete only the recorded task-specific Node-unpack/npm-cache/browser-payload directories after verifying the exact paths. CI cleanup may leave GitHub's managed setup-node toolcache to the ephemeral runner. Preserve an accepted decision 0003 as history; if the choice is abandoned or replaced, mark it Superseded through a new decision rather than deleting or rewriting it. The Python/Deno gate and production component remain runnable because no runtime code depends on Node or Playwright.

## Verification

- Release-contract tests enforce identical versions across `.node-version`, `package.json`, lockfile-version-3 `package-lock.json`, Playwright's reported browser registry, and CI.
- The lock contains exactly the four allowed keys, three frozen registry URLs/integrities, no alternate/git/file/optional dependency, no `hasInstallScript`, and no package/root script outside the accepted allowlists; installed package `scripts` are absent/empty.
- `npm ci --ignore-scripts --no-audit --no-fund` succeeds from a clean checkout and does not mutate the lockfile.
- Local Node archive/unpack, npm cache, and Playwright browser payload resolve under the recorded task-specific root; CI Node/npm may resolve from setup-node's toolcache; the Playwright CLI resolves from repository `node_modules/.bin`. Ignore/release/rollback checks enforce those distinct locations without touching ambient caches.
- The explicit high-severity advisory query and signature review are recorded; no auto-fix runs.
- The local Node archive matches the literal accepted digest. Node/npm versions, browser/FFmpeg registry identifiers, installed payload/notice hashes, `apt` inventory, action SHAs/settings, artifact digest, and all required license/notice evidence match this decision.
- `playwright install --list` and a filesystem scan show only the approved headless shell and FFmpeg payload; video and trace are disabled.
- A network-observation check confirms tests contact only the loopback fixture after installation.
- Two clean CI runs produce identical accepted screenshots on the recorded `ubuntu-24.04` environment; any runner/font inventory change invalidates comparison pending review.
- Existing Python/Deno commands remain green without Node installed.
- A production archive inspection confirms no Node modules, Playwright files, browser/FFmpeg binary, screenshot, report, or test artifact enters the Home Assistant release.

## Primary sources

- [Node.js 24.22.3 LTS security release](https://nodejs.org/en/blog/release/v24.22.3/)
- [Node.js release status](https://nodejs.org/en/about/previous-releases)
- [Node.js 24.22.3 downloads and SHASUMS256](https://nodejs.org/dist/v24.22.3/)
- [npm 11.19.1 bundled by Node 24.22.3](https://raw.githubusercontent.com/nodejs/node/v24.22.3/deps/npm/package.json)
- [Playwright 1.65.1 release and browser versions](https://github.com/microsoft/playwright/releases/tag/v1.65.1)
- [Playwright 1.65.1 package manifest](https://raw.githubusercontent.com/microsoft/playwright/v1.65.1/packages/playwright-test/package.json)
- [Playwright 1.65.1 browser registry](https://raw.githubusercontent.com/microsoft/playwright/v1.65.1/packages/playwright-core/browsers.json)
- [Playwright browser installation guidance](https://playwright.dev/docs/browsers)
- [Playwright CI guidance](https://playwright.dev/docs/ci)
- [Playwright screenshot-comparison guidance](https://playwright.dev/docs/test-snapshots)
- [npm clean-install behavior](https://docs.npmjs.com/cli/npm-ci/)
- [npm audit and registry-signature behavior](https://docs.npmjs.com/cli/audit/)
- [Node.js release-key process](https://github.com/nodejs/release-keys)
- [FFmpeg licensing guidance](https://github.com/FFmpeg/FFmpeg/blob/master/LICENSE.md)
- [setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0)
- [upload-artifact v7.0.0](https://github.com/actions/upload-artifact/releases/tag/v7.0.0)

## Approval record

Approved by the user on 2026-11-15. Approval covers the exact versions and integrities, temporary verified local bootstrap, disclosed network/advisory and artifact-storage surfaces, Chromium-only first-proof coverage, required pinned artifact action, license review, and committed Linux screenshot-baseline process.
