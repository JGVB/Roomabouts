# 0001: Build Roomabouts as a compatible Radar Map Manager fork

Status: Accepted
Date: 2026-11-15
Owners: Roomabouts coordinator
Related plan: `docs/plans/active/2026-11-15-rmm-fork-foundation.md`

## Context

The user selected Radar Map Manager (RMM) as the closest working base, created the GitHub fork `JGVB/Roomabouts`, and chose personal use before considering distribution. The fork contains a functioning Home Assistant custom integration, editor, multi-radar fusion engine, and map card. Rebuilding those capabilities as a separate React or TypeScript application would discard useful implementation and delay the first real-room proof.

RMM's Home Assistant domain, storage key, services, WebSocket message types, static resource URL, component directory, and custom-element name are compatibility boundaries. Renaming them all at once would create a migration project before Roomabouts has proven its experience.

## Options considered

1. Continue with a greenfield application and use RMM only as a reference.
2. Copy selected RMM files into an unrelated repository without fork ancestry.
3. Keep the GitHub fork relationship, preserve internal identifiers initially, and add Roomabouts through tested seams.

## Decision

Roomabouts will use option 3.

- `origin` is `git@github.com:JGVB/Roomabouts.git`.
- `rmm-upstream` fetches `git@github.com:Moe8383/radar_map_manager.git` and is configured locally with a disabled push URL.
- The upstream base for the foundation is commit `e7caa9368dce3dc51f7ca03f6629b2c2fa6638b8`.
- The MIT license and Moe8383 copyright notice remain intact.
- The internal domain and storage key remain `radar_map_manager`.
- The component path remains `custom_components/radar_map_manager`.
- Existing services, WebSocket types, static URLs, `radar-map-card`, and the release archive name remain unchanged during the first proof.
- Roomabouts may be the repository name, displayed product name, original visual treatment, and documentation identity.
- No Harry Potter or Wizarding World names, copy, symbols, fonts, layouts, or extracted artwork will ship.
- Upstream changes are fetched and evaluated deliberately; they are not merged directly into an implementation worktree without tests and diff review.

## Consequences

The first implementation can concentrate on safety, testability, and the visual experience. Existing RMM installations and configuration shapes remain usable. Some technical RMM names will remain visible in developer-facing configuration until a separately planned compatibility migration is justified.

Roomabouts must maintain clear attribution and must not imply that upstream work was authored from scratch. Fork-specific changes need characterization tests because the upstream project currently has no product test suite.

## Verification

- `git merge-base --is-ancestor rmm-upstream/main main` succeeds at foundation creation.
- `git remote -v` shows the fork as `origin`, upstream as fetch-only, and no accidental upstream push route.
- `LICENSE` retains the upstream notice.
- Tests and release-contract checks fail if protected compatibility identifiers change without an approved migration decision.
