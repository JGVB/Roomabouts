# Browser toolchain inventory

Status: Partial local verification; Linux browser payload verification remains a Wave 3A exit gate
Recorded: 2026-11-15
Decision: `docs/decisions/0003-browser-test-toolchain.md`

This inventory covers development and CI tooling only. None of these files, packages, binaries, screenshots, reports, or notices may enter the Home Assistant release archive.

Authoritative source locations are the accepted Node distribution directory, the exact `resolved` npm-registry URLs in `package-lock.json`, the Playwright `1.65.1` browser registry, and the two immutable GitHub Action commit trees:

- `https://nodejs.org/dist/v24.22.3/`
- `https://registry.npmjs.org/@playwright/test/-/test-1.65.1.tgz`
- `https://registry.npmjs.org/playwright/-/playwright-1.65.1.tgz`
- `https://registry.npmjs.org/playwright-core/-/playwright-core-1.65.1.tgz`
- `https://raw.githubusercontent.com/microsoft/playwright/v1.65.1/packages/playwright-core/browsers.json`
- `https://github.com/actions/setup-node/tree/949feb2413d6458794dcd2491c4babbbce0c15c1`
- `https://github.com/actions/upload-artifact/tree/bbbca2ddaa5d8feaa63e36b76fdaad77386f024f`

## Verified local bootstrap

| Item | Version / identity | License and notices | Verification | Redistribution |
| --- | --- | --- | --- | --- |
| Node.js archive | `node-v24.22.3-darwin-arm64.tar.gz` | MIT plus third-party notices in bundled `LICENSE` | Accepted archive SHA-256 `ff6e17d4874b76d272212b908cc020d6e815fba5a6c7eaaa06add725840307fd`; HTTPS effective URL remained on `nodejs.org` | Temporary local development only; excluded from release |
| Node.js executable | `v24.22.3` | Bundled `LICENSE`, SHA-256 `5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace` | Executable SHA-256 `ba7073582822078d8c90bca3facacc46690bc5366fab4b815aeef9148cd6e854` | Temporary local development only; excluded from release |
| npm | `11.19.1`, bundled with Node | Artistic-2.0 plus bundled dependency terms in `lib/node_modules/npm/LICENSE`; license SHA-256 `7610d223851f421d315df5e77974f1c68a04b97e02060e5bbbcf13d95e3ca257` | `npm --version` returned `11.19.1`; isolated token-free config used `https://registry.npmjs.org/` | Temporary local development only; excluded from release |

The Node archive, unpack, npm cache, and future Playwright browser payload use the recorded task-specific temporary root. No system/global Node, npm prefix, shell profile, Homebrew directory, or ambient package cache was changed.

## Locked npm packages

The lock is version 3 and contains exactly the root plus these three packages. All installed manifests have an absent/empty `scripts` object.

| Package | Registry integrity | License / notice evidence | Registry verification | Redistribution |
| --- | --- | --- | --- | --- |
| `@playwright/test@1.65.1` | `sha512-y+NCIRm2LvY4slUVWvGh1nujJ8RF/hEisIsq2mtUPgdQC4L701bq5hZGMhrpeXjACvwvO9tj5dJqhvM6TP9lbw==` | Apache-2.0 `LICENSE` SHA-256 `45873d00a0dd243596deb4aa23b2493b3d1f0671921bf2538ea431d7380220eb`; `NOTICE` SHA-256 `6d602191187b35b9b01d2cffa01c8469c2c8d9de8a96f1bf868e0f264f51c81d` | Signature and provenance attestation verified by npm `11.19.1` | Development/CI only; `node_modules` ignored and release-excluded |
| `playwright@1.65.1` | `sha512-vJ1FuoOrNwOKHUIVEvSt3jT1L+wjjDpwhwIstKtfvTh8XIG4FG4bIFuvNdMxi81LGfAhUgUZleVFaOLY4RIUUw==` | Apache-2.0 `LICENSE` SHA-256 `45873d00a0dd243596deb4aa23b2493b3d1f0671921bf2538ea431d7380220eb`; `NOTICE` SHA-256 `6d602191187b35b9b01d2cffa01c8469c2c8d9de8a96f1bf868e0f264f51c81d` | Signature and provenance attestation verified by npm `11.19.1` | Development/CI only; `node_modules` ignored and release-excluded |
| `playwright-core@1.65.1` | `sha512-hqPpz7blSMPxWVdoeE1yiBSzXsKiVOd2k+kjCvmUywD2GPO2Dd9HfcWnq9NN0GHbNZDFgZ9JfBFr+X5/BLo0qw==` | Apache-2.0 `LICENSE` SHA-256 `45873d00a0dd243596deb4aa23b2493b3d1f0671921bf2538ea431d7380220eb`; `NOTICE` SHA-256 `6d602191187b35b9b01d2cffa01c8469c2c8d9de8a96f1bf868e0f264f51c81d` | Signature and provenance attestation verified by npm `11.19.1` | Development/CI only; `node_modules` ignored and release-excluded |

`npm audit --package-lock-only --audit-level=high` reported zero vulnerabilities on 2026-11-15. `npm audit signatures` verified registry signatures and provenance attestations for all three packages. No auto-fix or package mutation ran.

## Local macOS browser-payload evidence

The approved local install downloaded exactly `chromium_headless_shell-1255` and `ffmpeg-1013` beneath the task-specific browser directory. `playwright install --list` reported no other browser payload.

The pinned headless shell launched the real synthetic fixture on `127.0.0.1`, loaded only loopback/data resources, established exactly one fake-Home-Assistant subscriber, and passed the toolchain smoke test on 2026-11-15.

| Item | SHA-256 / license result |
| --- | --- |
| Chromium headless-shell executable | `605805a90bbf1ed37d35929c086a829a7b4e67d4324032e813853de61d0b7170` |
| `LICENSE.headless_shell` | `59cde70a5aa243f853cb971782b72121b8656b5ed9705c230ce07253fb8038ce` |
| FFmpeg executable | `e71dd6610cbc984022ff51b07a95f8d2526aba120406d8cdd0686f6421c464ac` |
| `COPYING.LGPLv2.1` | `b634ab5640e258563c536e658cad87080553df6f34f62269a21d554844e58bfe` |

The local FFmpeg identified itself as `n7.0.1-playwright-build-1013`, reported LGPL 2.1-or-later, and contained neither `--enable-gpl` nor `--enable-nonfree` in `-buildconf`. Its intentionally restricted build enables pipe/file input, MJPEG/PNG/VP9 and the minimal image/video filters/muxers used by Playwright. Linux payload hashes and license output remain separately required because platform artifacts can differ.

## Pinned GitHub Actions

| Action | Immutable identity | License / notice source | Use boundary |
| --- | --- | --- | --- |
| `actions/setup-node` | `949feb2413d6458794dcd2491c4babbbce0c15c1` (`v7.1.0`) | MIT `LICENSE` and bundled action dependencies in the pinned commit tree | Node setup only; package-manager cache disabled |
| `actions/upload-artifact` | `bbbca2ddaa5d8feaa63e36b76fdaad77386f024f` (`v7.0.0`) | MIT `LICENSE` and bundled action dependencies in the pinned commit tree | Failure/candidate PNGs plus JSON hash manifest only; seven-day retention; artifact digest recorded |

The workflow has repository permission `contents: read`. Artifact data leaves the runner for GitHub's runtime artifact service, but no repository `actions: write` permission is granted.

## Linux browser payload gate

The following evidence must be captured from the first pinned `ubuntu-24.04` browser job before Wave 3A is complete. Revision numbers identify Playwright registry entries; they are not content hashes.

| Item | Required identity | License evidence required | Required runtime evidence | Status |
| --- | --- | --- | --- | --- |
| Chromium headless shell | `159.0.8154.6`, revision `1255` | Chromium BSD-style license, `LICENSE.headless_shell`, and bundled third-party notices | Executable and notice-file SHA-256; `playwright install --list`; filesystem scan proving full Chromium/Firefox/WebKit/winldd/Android absent | Pending first Linux job |
| Playwright FFmpeg | revision `1013` | Notice file plus complete output of `ffmpeg-linux -L`; do not assume license | Executable/notice SHA-256; `-version`, `-buildconf`, and explicit result for `--enable-gpl` / `--enable-nonfree` | Pending first Linux job |
| Ubuntu browser dependencies | exact packages installed by Playwright on `ubuntu-24.04` | Mixed licenses under `/usr/share/doc` | `dpkg-query` package/version inventory and relevant notice paths | Pending first Linux job |
| Linux font/render stack | hosted runner image plus fontconfig, FreeType, HarfBuzz, DejaVu, Liberation, and resolved system-font packages | Mixed distribution licenses; CI-only | Runner image, `/etc/os-release`, package versions, and accepted-golden hashes | Pending golden review |

The browser job uses `video: "off"` and `trace: "off"`; FFmpeg is still installed because it is part of Playwright's approved Chromium-shell payload. `PLAYWRIGHT_DOWNLOAD_HOST` and per-browser host overrides are forbidden. Microsoft CDN payloads and floating Ubuntu repositories remain trusted first-download surfaces; post-install hashes support comparison but do not create a cryptographic trust anchor.

## Release and rollback checks

- `.node-version`, `package.json`, `package-lock.json`, the Playwright browser registry, and CI must retain the accepted versions and identities.
- `node_modules`, npm caches, Playwright browser payloads, browser reports/results, binaries, screenshots, and this inventory's runtime evidence are not packaged into `custom_components/radar_map_manager`.
- Rollback removes repository-local `node_modules` and only the recorded task-specific Node-unpack/npm-cache/browser-payload directories. GitHub's setup-node toolcache belongs to the ephemeral runner.
- An accepted decision remains historical. A replacement decision supersedes it rather than deleting it.
