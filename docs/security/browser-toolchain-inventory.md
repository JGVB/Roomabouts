# Browser toolchain inventory

Status: Verified; Wave 3A browser-toolchain gate closed
Recorded: 2026-11-15
Decision: `docs/decisions/0003-browser-test-toolchain.md`

Linux verification: [Quality run 43794923954](https://github.com/JGVB/Roomabouts/actions/runs/43794923954) at commit `62b069266fc64b6d19d17a683986d6978415a5e5`

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

## Verified Linux browser payload

The first accepted `ubuntu-24.04` browser job ran on image `ubuntu24 20261111.370.1`, reported Ubuntu `24.04.5 LTS (Noble Numbat)`, and passed the exact package, registry, payload-boundary, advisory, signature, loopback-browser, and release-contract checks. Revision numbers identify Playwright registry entries; the hashes below identify the installed Linux files from that run.

| Item | Required identity | License evidence required | Required runtime evidence | Status |
| --- | --- | --- | --- | --- |
| Chromium headless shell | `159.0.8154.6`, revision `1255` | `chromium_headless_shell-1255/chrome-headless-shell-linux64/LICENSE.headless_shell`, SHA-256 `fe9fd59e07a27efa69c816d4726b68564df93cd4b666eb81ac75df9dd61e2f92` | Executable SHA-256 `24eb0a14de64ab0c9c2e283a5512ca817db64af8fd853cdb4d818f19a8e23b9b`; exact payload scan retained only the shell and FFmpeg directories | Verified in run `43794923954` |
| Playwright FFmpeg | revision `1013`; `n7.0.1-playwright-build-1013` | `ffmpeg-1013/COPYING.LGPLv2.1`, SHA-256 `b634ab5640e258563c536e658cad87080553df6f34f62269a21d554844e58bfe`; `-L` reported LGPL 2.1-or-later | Executable SHA-256 `e829f7f8c497178109f4a388247b778a86637bf075d7bba5834c797a9d61a269`; `--enable-gpl` absent; `--enable-nonfree` absent | Verified in run `43794923954` |
| Ubuntu browser dependencies | Nine font packages added by Playwright on this runner image | Mixed distribution licenses under the recorded `/usr/share/doc/<package>` roots | Complete before/after `dpkg-query` inventory retained in the run; exact added set recorded below | Verified in run `43794923954` |
| Linux font/render stack | `ubuntu24 20261111.370.1`; Ubuntu `24.04.5 LTS` | Mixed distribution licenses; CI-only | Exact fontconfig, FreeType, HarfBuzz, DejaVu, and Liberation versions recorded below; future golden hashes remain tied to this inventory | Verified for browser-lane bootstrap; golden review remains Wave 3E |

Packages newly added by `playwright install --with-deps --only-shell chromium` were:

| Package | Version | Notice root |
| --- | --- | --- |
| `fonts-freefont-ttf` | `20211204+svn4273-2` | `/usr/share/doc/fonts-freefont-ttf` |
| `fonts-ipafont-gothic` | `00303-21ubuntu1` | `/usr/share/doc/fonts-ipafont-gothic` |
| `fonts-tlwg-loma-otf` | `1:0.7.3-1` | `/usr/share/doc/fonts-tlwg-loma-otf` |
| `fonts-unifont` | `1:15.1.01-1build1` | `/usr/share/doc/fonts-unifont` |
| `fonts-wqy-zenhei` | `0.9.45-8` | `/usr/share/doc/fonts-wqy-zenhei` |
| `xfonts-cyrillic` | `1:1.0.5+nmu1` | `/usr/share/doc/xfonts-cyrillic` |
| `xfonts-encodings` | `1:1.0.5-0ubuntu2` | `/usr/share/doc/xfonts-encodings` |
| `xfonts-scalable` | `1:1.0.3-1.3` | `/usr/share/doc/xfonts-scalable` |
| `xfonts-utils` | `1:7.7+6build3` | `/usr/share/doc/xfonts-utils` |

The accepted font/render inventory is `fontconfig` and `fontconfig-config` `2.15.0-1.1ubuntu2`; `fonts-dejavu`, `fonts-dejavu-core`, `fonts-dejavu-extra`, and `fonts-dejavu-mono` `2.37-8`; `fonts-liberation` `1:2.1.5-3`; `libfontconfig1` `2.15.0-1.1ubuntu2`; `libfreetype6` `2.13.2+dfsg-1ubuntu0.2`; and `libharfbuzz0b` `8.3.0-2build2`.

The browser job uses `video: "off"` and `trace: "off"`; FFmpeg is still installed because it is part of Playwright's approved Chromium-shell payload. `PLAYWRIGHT_DOWNLOAD_HOST` and per-browser host overrides are forbidden. Microsoft CDN payloads and floating Ubuntu repositories remain trusted first-download surfaces; post-install hashes support comparison but do not create a cryptographic trust anchor.

## Release and rollback checks

- `.node-version`, `package.json`, `package-lock.json`, the Playwright browser registry, and CI must retain the accepted versions and identities.
- `node_modules`, npm caches, Playwright browser payloads, browser reports/results, binaries, screenshots, and this inventory's runtime evidence are not packaged into `custom_components/radar_map_manager`.
- Rollback removes repository-local `node_modules` and only the recorded task-specific Node-unpack/npm-cache/browser-payload directories. GitHub's setup-node toolcache belongs to the ephemeral runner.
- An accepted decision remains historical. A replacement decision supersedes it rather than deleting it.
