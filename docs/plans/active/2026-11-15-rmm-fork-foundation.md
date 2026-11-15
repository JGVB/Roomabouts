# Roomabouts RMM Fork Foundation and Personal One-Room Proof

- Status: Implementing — Phase 2
- Plan date: 2026-11-15
- Coordinator: Roomabouts coordinator
- Implementation branch/worktree: `codex/fork-foundation` at `/Users/jvanbev/Documents/Codebase/Roomabouts`
- Independent reviewers: RMM foundation architecture audit, RMM test/release audit, and fresh fork-plan critique
- Upstream baseline: `Moe8383/radar_map_manager@e7caa9368dce3dc51f7ca03f6629b2c2fa6638b8`
- Target outcome: a safe, testable, original Roomabouts map running as a compatible Home Assistant custom integration, ready for one LD2450-class sensor when it arrives

## Decision summary

Roomabouts will extend the existing Radar Map Manager fork instead of building a separate greenfield application. The inherited editor, Home Assistant integration, map geometry, fusion engine, and renderer are valuable, but live installation is blocked until inherited movement persistence, exclusive network transports, credential exposure, and missing authorization boundaries are corrected and verified.

The work proceeds in this order:

1. preserve fork ancestry, licensing, governance, and upstream synchronization;
2. add deterministic characterization tests and a security/privacy floor;
3. introduce a source-neutral presentation adapter and synthetic replay path;
4. build the original Roomabouts parchment/cartographic view without changing the technical editor;
5. smoke-test the integration in Home Assistant without a sensor;
6. qualify one real sensor after it arrives;
7. consider BLE, UWB, multiple sensors, and distribution only in later approved plans.

The displayed product and repository are Roomabouts. Internal Home Assistant identifiers remain RMM-compatible for the first proof.

## Why the previous plan was superseded

The 2026-11-14 plan assumed an empty repository and proposed a React/Vite/TypeScript workspace. The repository is now a 206-commit Home Assistant custom integration with Python backend code and plain JavaScript frontend modules. Adding a parallel application would duplicate the inherited editor, transport, fusion, and rendering paths while leaving the real integration untested.

The previous plan remains under `docs/plans/superseded/` as design history. This file is the only active implementation source.

## Verified current state

- GitHub recognizes `JGVB/Roomabouts` as a public MIT-licensed fork of `Moe8383/radar_map_manager`.
- `origin/main` and `rmm-upstream/main` currently point to the same commit, `e7caa93`.
- The original no-history local folder is preserved at `/Users/jvanbev/Documents/Codebase/Roomabouts-planning-backup-2026-11-15`.
- The six original Roomabouts governance files were copied byte-for-byte into the fork checkout; `.DS_Store` files were not copied.
- Product code is under `custom_components/radar_map_manager/`.
- The backend is approximately 2,600 lines of Python; the frontend is approximately 6,700 lines across five ES modules.
- There is no package manifest, Python project manifest, product test suite, lint configuration, or build step.
- Existing GitHub automation performs HACS validation and release zipping only. `hacs/action@main` is not pinned.
- Python compilation, JSON parsing, Deno checking of the frontend modules, `git diff --check`, and `git fsck --strict` pass at the upstream baseline.
- Python 3.14.3 and Deno 2.6.9 are available locally. Node, pytest, Ruff, and uv are not installed.

## Confirmed blockers before live installation

### 1. Movement coordinates can persist through two paths

`FusionEngine.update()` inserts live per-radar and fused `targets` into `coordinator.data`. `RadarCoordinator.async_save()` serializes that object into Home Assistant `.storage` whenever configuration is saved. Separately, `_update_master_sensor()` calls `hass.states.async_set()` every processing tick, normally every 0.1 seconds, with the fused target list in state attributes. Recorder may persist those events.

The correction is explicit: persistent coordinator data becomes configuration-only; targets move to ephemeral `hass.data[DOMAIN]`; a versioned migration strips legacy runtime keys; and the retained master entity exposes count plus coordinate-free metadata only. A storage inspection and a real Home Assistant Recorder check are mandatory before live acceptance.

### 2. Three unnecessary exclusive network transports are active

UDP is enabled by default and accepts unauthenticated JSON on `0.0.0.0:18888`. Startup also installs wildcard RMM-exclusive MQTT subscriptions that can accept unknown radar names, and a direct-radar proxy can open outbound WebSockets to persisted addresses.

The first Roomabouts proof supports Home Assistant entity state only. Exclusive UDP, MQTT, pairing/hardware publishing, and direct-radar WebSocket paths are unavailable and unregistered. Any authenticated exclusive-transport design is deferred to a later decision.

### 3. Credentials and mutations cross insufficient boundaries

The coordinator persists `device_pin` and `radar_ip`; the global stream shallow-copies coordinator data to subscribers; the frontend retains the snapshot; and the pairing path logs a captured PIN in plaintext. State-changing services and WebSocket commands are also registered without a consistent administrator check, while configuration import accepts a broad object.

Normal presentation output must use an explicit field allowlist. Every mutation requires a verified Home Assistant administrator and a bounded schema. Credentials and administrative network values never reach normal streams, logs, stored imports, tests, screenshots, or fixtures.

### 4. Presentation lifecycle facts are missing

Current snapshots do not carry a versioned generation, deterministic sequence/logical time, explicit lifecycle, position basis, or reset event. Inherited target IDs can hibernate for hours and be reused, so a browser cannot safely infer session-only aliases or whether a point is observed, held, or last-seen.

Phase 1 freezes a sanitized `RoomaboutsSnapshotV1` backend contract before the browser adapter is implemented. Generation changes explicitly end alias and trail lifetimes.

### 5. Nondeterministic tracking and transform drift

Backend fusion calls `time.time()` directly. Frontend filtering calls `performance.now()` or `Date.now()` directly. Python and JavaScript implement similar transforms independently, and JavaScript's `parseFloat(value) || default` incorrectly replaces a valid zero with the default in several places.

Both sides need injected clocks and shared golden fixtures before replay expectations or footprint behavior can be trusted.

### 6. Release-version and CI supply-chain drift

The integration manifest reports `1.3.12`, while frontend cache-busting query strings contain other versions. The same module can be imported under different URLs, producing multiple module instances. Existing workflows also use floating action references and implicit permissions. Phase 1 establishes one release-version source, pins every third-party action to a reviewed full commit SHA, and sets least-privilege workflow permissions without changing release packaging.

## Scope

### In scope

- Fork governance, attribution, upstream-sync procedure, and local safety configuration.
- Standard-library Python tests and Deno-native JavaScript checks/tests with no runtime dependency.
- Characterization of inherited transforms, fusion, target lifecycle, and stream payloads.
- A normalized observation contract plus Home Assistant entity adapter before the fusion boundary; live, synthetic, and replay input use the same contract.
- Home Assistant entity state as the only supported input; exclusive UDP, MQTT, pairing/hardware, and direct-radar transports unavailable.
- Credential redaction and administrator guards for every state-changing service and WebSocket operation.
- Configuration-only persistent storage, an explicit storage migration, coordinate-free Home Assistant entities, and in-memory coordinate streaming.
- Injected test clocks and privacy-safe synthetic replay fixtures.
- A small presentation adapter between inherited RMM targets and the renderer.
- Optional identity fields and source evidence in the presentation contract, with anonymous behavior as the default.
- An offline fake-Home-Assistant browser fixture for development without household data or a physical sensor.
- An original antique-cartographic/parchment Roomabouts view, anonymous aliases, and alternating footprint trails.
- Home Assistant installation and Recorder verification before connecting live household sensor data.
- Administrator-only coordinate snapshots for the first proof, with coordinate-free count/occupancy entities available through normal Home Assistant permissions.
- One sensor, one floor, one room, and one moving person as the supported physical proof.

### Non-goals

- Renaming the Home Assistant domain, storage key, services, static URL, component directory, custom element, or release archive.
- Replacing the inherited editor, fusion engine, or Home Assistant integration with a separate application.
- Public HACS submission, App Store distribution, paid plans, accounts, cloud services, telemetry, or remote access.
- Non-admin coordinate viewers, delegated kiosk access, or household-wide coordinate authorization policy.
- Production support for RMM-exclusive hardware, pairing, hardware MQTT, direct radar WebSockets, or UDP transport.
- BLE, ESPresense, Bermuda, UWB, AirTag/SmartTag, identity inference, or named-person tracking.
- Multiple sensors, room-to-room handoff, multiple floors, or object tracking.
- Actual household geometry, floor-plan images, device/entity identifiers, credentials, or unsanitized recordings in Git.
- Harry Potter or Wizarding World names, copy, fonts, symbols, artwork, or a replica of a protected map layout.

## Decisions requiring approval

Approval of this plan explicitly accepts:

1. the compatibility boundary in decision 0001;
2. the security and privacy floor proposed in decision 0002;
3. a normalized `RoomaboutsObservationV1` boundary before fusion and an administrator-only coordinate snapshot stream for the first proof;
4. pinned Python 3.14.3 and Deno 2.6.9 for dependency-free pure-module tests and static checks, with Home Assistant-dependent behavior verified later in a named HA runtime protocol;
5. deferring Playwright until a separate browser-toolchain decision selects Node, package manager, pinned versions, lockfile, and CI execution;
6. synthetic fixtures only until a real recording is separately reviewed and sanitized;
7. personal Home Assistant installation only after the security/Recorder gates pass;
8. an original enchanted-cartographic visual direction rather than copying a branded fictional map.

This approval did not by itself authorize a push, public release, live Home Assistant configuration change, Recorder deletion, real capture, sensor purchase, BLE/UWB work, or distribution. The user's subsequent direction to begin and complete the repository setup authorized local commits and pushes to `codex/fork-foundation`; it did not authorize a public release, live installation, real capture, hardware work, or distribution.

## Compatibility and presentation contracts

### Protected RMM compatibility boundary

The following remain stable during this plan:

- `radar_map_manager` domain and storage key;
- `custom_components/radar_map_manager` path;
- existing service names and WebSocket message types;
- `/radar_map_manager/` resource path;
- `radar-map-card` custom element;
- `radar_map_manager.zip` release archive.

The displayed title, repository documentation, theme, labels, and read-only map experience may say Roomabouts.

### RoomaboutsObservationV1 fusion input

Every live, synthetic, or replay source terminates at a versioned discriminated observation contract before transform, fusion, tracking, or presentation code:

```text
common
  schemaVersion           exactly 1
  generationId            source-session generation
  sequence                monotonically increasing within the generation
  logicalTimeMs            injected monotonic semantic time
  sensorId                 stable configured sensor key, not a person ID
  sourceSlot               optional diagnostic hardware slot, never identity
  poseRevision             configured transform revision

target-observation
  positionMeters           finite sensor-local x/y and optional z in meters
  reportedVelocity         optional finite source-reported value

target-inactive
  no cached position

source-status
  online | degraded | offline plus allowlisted reason

generation-reset
  explicit reset/restart reason and no position
```

The Home Assistant adapter owns entity discovery/naming, X/Y assembly, units, availability, freshness, restart handling, and source-specific quirks. Fusion consumes `RoomaboutsObservationV1` only and does not read Home Assistant entities or vendor payloads for target coordinates. Inactivity, unavailable state, restart, or a stale half-sample never emits cached coordinates.

The contract freezes in Phase 1. The coherent X/Y pairing policy remains configurable and conservative until Phase 5 measures the real sensor's update order and skew; decision 0005 freezes the evidence-backed policy before held-out runs.

### RoomaboutsSnapshotV1 backend stream

Phase 1 freezes a versioned, sanitized snapshot before browser adapter work begins:

```text
schemaVersion           exactly 1
generationId            changes on integration load, explicit reset, map replacement, or source restart
sequence                 monotonically increasing within one generation
logicalTimeMs            injected monotonic semantic time, not an identity-bearing wall-clock date
resetReason              present on the first snapshot of a new generation
map                      allowlisted target-free map configuration needed for presentation
tracks                   normalized track snapshots
sourceHealth             allowlisted entity-source state; no credentials or network destinations
```

Every track includes its generation-scoped key, position and coordinate space, lifecycle, position basis, last-observed age/time, source references, and uncertainty reasons. The backend emits the lifecycle facts; the browser does not infer them from hibernation strings or elapsed wall time.

The coordinate-bearing snapshot subscription requires a verified Home Assistant administrator. Authorization succeeds before any dispatcher listener is installed or any map, source, or track data is returned. Non-admin kiosk/viewer policy is deferred.

Canonical semantic serialization uses UTF-8 JSON with recursively lexicographically sorted object keys, array order preserved, finite numbers only, no insignificant whitespace, and a trailing newline. Replay hashes exclude diagnostics not present in the contract.

### RoomaboutsTrack browser model

The renderer consumes the normalized track object rather than inherited target dictionaries directly:

```text
trackId                 generation-scoped display key, never a person ID
position                x/y plus an explicit map coordinate space
positionBasis           observed | interpolated | held | last-seen
lifecycle               tentative | confirmed | coasting | fading
anonymousAlias          deterministic only within the current generation
sourceRefs              diagnostic source references, never identity
observedAt              injected logical time for replay and expiry
uncertainty             structured reasons, optional
identity                absent in the first proof
identityConfidence      absent in the first proof
```

Rules:

- A radar slot or inherited `target_N` is never treated as a durable person identity.
- The renderer shows an anonymous alias whenever identity is absent or ambiguous.
- Predicted, held, hibernating, stale, or last-seen positions do not emit new footprints.
- A generation change, disconnect, map change, source restart, explicit reset, or privacy clear removes aliases and visual history.
- A hibernating track cannot regain its old alias or trail after a generation boundary.
- Out-of-order or duplicate snapshot sequences are ignored and recorded as bounded diagnostics.
- Later BLE/UWB adapters may contribute separate identity evidence to a resolver without changing the renderer contract.

## Requirements and acceptance criteria

| ID | Requirement | Implementation task | Acceptance criterion | Verification |
| --- | --- | --- | --- | --- |
| F-01 Fork integrity | Preserve history, license, and upstream boundary | Record remotes/base, protect identifiers, add upstream procedure | Fork ancestry succeeds; license unchanged; upstream push disabled locally | Git ancestry/remotes/license checks |
| F-02 Reproducible baseline | Add dependency-free product checks | Pin Python 3.14.3 and Deno 2.6.9; Python compile/JSON/release tests; Deno check/test | Clean checkout and pinned CI run the documented gate with zero failures | Local gate plus GitHub quality job |
| F-03 Secret/read isolation | Sanitize outputs and authorize coordinate reads | Add pure backend presenter, canary tests, and admin-only snapshot subscription | Zero seeded PIN/token/IP canary in outputs; non-admin/missing user receives no coordinate/map/source data and installs no listener | Python presenter/auth tests plus Phase 4 subscription protocol |
| F-04 Network safety | Remove unsupported exclusive transports from startup and mutation paths | Register only HA-entity input; disable UDP, exclusive MQTT, pairing/hardware publishing, and direct-radar proxy | Default and migrated setups expose none of those paths; spoofed input cannot mutate state | Pure registration tests plus Phase 4 HA socket/subscription protocol |
| F-05 Admin boundary | Guard coordinate reads and every mutation; bound imports | Require verified HA admin for snapshot subscription and every mutating service/command; schema/size/numeric allowlist | Admin succeeds; non-admin/missing user installs no coordinate listener and has zero storage, MQTT, runtime, or network side effect; malformed imports fail boundedly | Table-driven pure authorization tests plus Phase 4 HA protocol |
| F-06A Ephemeral runtime | Separate runtime targets from persisted configuration | Add runtime container and version-2 migration stripping dynamic keys | Saving after tracking leaves `.storage` free of target/coordinate canaries; legacy store migrates and rolls back | `docs/protocols/storage-persistence.md` and migration tests |
| F-06B Coordinate-free HA state | Remove coordinate-bearing master attributes | Keep approved count/metadata only; stream coordinates in memory | Roomabouts-created states and Recorder rows contain no coordinates after a timed no-sensor/synthetic soak | `docs/protocols/recorder-roomabouts.md` with pre/post evidence |
| F-07A Normalized source boundary | Freeze `RoomaboutsObservationV1` and HA entity adapter | Discover/assemble X/Y, validate units/freshness/availability, and remove HA reads from fusion | Fusion imports no HA/entity naming logic; live/synthetic/replay conform to one contract; stale halves and inactive states emit no cached point | Adapter conformance/import-boundary tests |
| F-07B Deterministic snapshot/replay | Inject clocks and freeze `RoomaboutsSnapshotV1` | Clock interfaces, generation/sequence/reset semantics, canonical JSON | Same observation fixture/config produces the same canonical hash twice; no alias/trail crosses reset/reconnect/ID-reuse cases | Python and Deno replay tests |
| F-08 Transform parity | Share finite/null-aware golden cases | Exercise Python and JS transforms from one fixture corpus | Both implementations match each golden tolerance, including zero origins | Python/Deno fixture tests |
| F-09 Presentation seam | Consume versioned sanitized snapshots before rendering | Add `roomabouts-presentation.js`; reject invalid/out-of-order snapshots | Zero/one/many snapshots adapt semantically; slot relabeling does not imply identity; generation resets aliases/trails | Deno adapter tests plus named manual browser-fixture protocol |
| F-10 Original visual layer | Add Roomabouts theme and truthful footprints | Procedural parchment, ink cartography, distance-spaced left/right prints | Read-only map matches approved original direction; no protected assets; stale states emit no new prints | Browser screenshots, fixture assertions, manual IP review |
| F-11 Editor compatibility | Preserve inherited setup/calibration UI | Limit theme wiring to read-only presentation where possible | Add/edit/save/reload flows behave as at baseline | Browser interaction tests plus HA smoke |
| F-12 Lifecycle cleanup | Bound animation and trail state | Clear on disconnect/map/session/removal; cap count and lifetime | No retained orphan tracks/trails after fixture teardown; idle loop sleeps | Fake-HA tests and browser memory check |
| F-13 Personal HA proof | Install manually only after security gates | Copy `custom_components` into a backed-up HA test instance and run no-sensor smoke | Integration loads, card registers, exclusive transports stay absent, admin checks and coordinate-free persistence pass | `docs/protocols/ha-no-sensor-smoke.md` |
| F-14 Source Recorder policy | Exclude live source-coordinate entities before extended testing | Inventory exact source entities and apply reviewed exclusions | Pre/post-cutoff query shows no new source-coordinate history; rollback succeeds | `docs/protocols/recorder-source-entities.md` |
| F-15 One-sensor proof | Qualify real input against frozen post-tuning thresholds | Calibrate; tune; approve numeric thresholds; run held-out walk/empty/recovery | Held-out result meets approved thresholds with clean fade and no coordinate history | Hardware protocols and reviewed evidence |
| F-16 CI supply chain | Pin third-party automation and least privilege | Full commit SHA for every `uses:`; explicit workflow permissions; release packaging unchanged | Policy test rejects floating refs/implicit permissions; quality and dormant release definitions validate | Release-contract test and workflow review |

## Ownership and Codex workstreams

| Workstream | Owns | Must not edit concurrently |
| --- | --- | --- |
| Coordinator | Root governance, plans, decisions, upstream sync, compatibility contract, integration order | Product hot spots owned by an active specialist |
| Backend/hardening | `__init__.py`, `processor.py`, `coordinator.py`, `fusion_engine.py`, new backend presentation module, Python tests | Frontend visual modules |
| Presentation/replay | `roomabouts-presentation.js`, shared synthetic fixtures, adapter tests, fake-HA stream | Backend transports and editor UI |
| Map UI | `roomabouts-theme.js`, `roomabouts-trails.js`, narrow wiring in card/renderer, browser tests | Backend ingestion and security |
| Quality reviewer | Read-only audits, protocols, evidence, dependency/release review | Silent remediation in another workstream |

`__init__.py` is a 1,284-line shared hot spot and has exactly one implementation owner at a time. `radar-ui.js` and `radar-editor.js` are avoided during the visual phase unless a verified requirement cannot be met elsewhere.

## Implementation sequence

### Phase 0 — Fork handoff and governance baseline

Owner: Coordinator

- [x] Verify GitHub fork health and upstream/base SHA.
- [x] Preserve the old no-history local folder as a recoverable backup.
- [x] Clone the fork at `/Users/jvanbev/Documents/Codebase/Roomabouts`.
- [x] Restore governance files without overwriting upstream content.
- [x] Configure `origin`, fetch-only `rmm-upstream`, and default push remote.
- [x] Preserve the MIT license and upstream history.
- [x] Supersede the greenfield plan and draft the fork compatibility/security decisions.
- [x] Obtain user approval of this plan and decision 0002.
- [x] Commit the governance baseline locally as `6427528`.
- [x] Push the governance baseline only after explicit user direction.

Historical exit gate: commit `6427528` contained the reviewed governance baseline, retained upstream ancestry and source, and was pushed only after the user approved the first code phase.

### Phase 1 — Characterization tests and security/privacy floor

Owner: Backend/hardening
Dependencies: approved plan and decision 0002

Expected new files:

- `.github/workflows/quality.yml`
- `custom_components/radar_map_manager/authorization.py`
- `custom_components/radar_map_manager/configuration.py`
- `custom_components/radar_map_manager/observation.py`
- `custom_components/radar_map_manager/ha_entity_adapter.py`
- `custom_components/radar_map_manager/presentation.py`
- `custom_components/radar_map_manager/runtime_state.py`
- `tests/fixtures/coordinate-cases.json`
- `tests/fixtures/replays/one-person-synthetic.json`
- `tests/python/test_fusion_engine.py`
- `tests/python/test_ha_entity_adapter.py`
- `tests/python/test_observation_contract.py`
- `tests/python/test_storage_migration.py`
- `tests/python/test_presentation.py`
- `tests/python/test_authorization.py`
- `tests/python/test_configuration_import.py`
- `tests/python/test_frontend_safety.py`
- `tests/python/test_branding.py`
- `tests/python/test_network_registration.py`
- `tests/python/test_release_contract.py`
- `tests/js/radar-math.test.js`
- `tests/js/radar-ui-url.test.js`
- `docs/protocols/storage-persistence.md`

Tasks:

- [x] Record baseline behavior before changing runtime code. Pure tests load extracted/pure modules directly and do not import the integration package initializer; Home Assistant-dependent behavior is reserved for Phase 4.
- [x] Freeze `RoomaboutsObservationV1` and a source conformance suite shared by synthetic/replay input and the Home Assistant entity adapter.
- [x] Move entity naming/discovery, X/Y-half assembly, unit conversion, freshness, availability, and source-generation handling into the adapter. Make fusion accept normalized observations and forbid imports or coordinate reads from Home Assistant/vendor state.
- [x] Add X-before-Y, Y-before-X, unchanged-axis, stale-half, unavailable, restart/generation, unit-conversion, malformed/non-finite, duplicate/out-of-order, and source-slot-relabel cases. Use a conservative configurable pairing policy until Phase 5 evidence freezes it.
- [x] Add injected clocks to backend fusion and frontend filtering while keeping production defaults.
- [x] Add shared transform goldens for 0, 90, 180, arbitrary rotation, mirror, zero origin, unit conversion, and round trip.
- [x] Add deterministic synthetic fusion/replay cases for empty, one target, source-slot relabel, cross-radar cluster, entrance, exclusion, stationary hold, stale, hibernating, and impossible jump.
- [x] Freeze `RoomaboutsSnapshotV1`, its generation/reset rules, canonical JSON serialization, and a pure sanitized stream/config view with explicit field allowlists.
- [x] Split persistent configuration from ephemeral runtime target state. Add a backed-up version-1-to-version-2 migration that strips `maps.*.targets`, `radars.*.targets`, and any other runtime-only field.
- [x] Remove PIN values from logs and ordinary browser payloads; seed credential canaries in tests.
- [x] Require a verified Home Assistant administrator before coordinate snapshot subscription installs a dispatcher listener. Reject non-admin and missing-user calls without returning map, source, target, or configuration data.
- [x] Add fail-closed Home Assistant administrator checks to every mutating service and WebSocket command. Unit-test a pure authorization boundary for admin, non-admin, and missing-user contexts; exercise real HA authorization in Phase 4.
- [x] Replace broad configuration import with a bounded allowlisted schema; reject credentials, network destinations, runtime keys, excessive nesting/size, non-finite numbers, and out-of-range values.
- [x] Make RMM-exclusive UDP, MQTT subscriptions/publishing, pairing/hardware commands, and direct-radar proxy unavailable and unregistered for the first proof. No config option or migrated value may activate them.
- [x] Retain a coordinate-free master entity containing count and approved metadata only; keep coordinates on `rmm/stream` only.
- [x] Establish a single frontend/cache release-version source and a test that all imports follow it.
- [x] Pin Python 3.14.3 and Deno 2.6.9 in CI. Pin every third-party GitHub Action to a reviewed full commit SHA and add explicit read-only workflow permissions, with narrowly scoped release write permission only where required.
- [x] Add the local/CI quality gate without React, Vite, pnpm, npm runtime dependencies, or broad formatting churn. Preserve release archive behavior.

Exit gate:

- Pure registration tests show no first-proof path can register exclusive MQTT, UDP, pairing/hardware, or direct-radar transport; Phase 4 confirms this in Home Assistant.
- Fusion consumes normalized observations and contains no Home Assistant entity naming or target-coordinate lookup; live/synthetic/replay adapters pass the same conformance suite.
- Global stream/browser/log output contains no seeded secret or administrative network value.
- Pure authorization tests show non-admin and missing-user snapshot requests install no listener or receive data; Phase 4 confirms the real Home Assistant behavior.
- Version-1 migration removes runtime coordinates, configuration saves remain canary-free, and the master entity contract is coordinate-free.
- Deterministic and transform tests pass twice.
- The documented dependency-free commands run in the pinned CI job. Editor/card and real Home Assistant behavior remain explicitly unverified until Phases 2–4.

#### Phase 1 implementation evidence

- Implementation commits run from `601425d` through `166fe7f` on `codex/fork-foundation`; the fork-governance baseline is `6427528`.
- The final local gate passes Python compilation, 111 Python tests, Deno checking, 10 Deno tests, JSON/YAML parsing, `git diff --check`, and `git fsck --strict`. The deterministic Python and Deno suites pass twice on the final code tree.
- Independent core, security/import, and frontend-safety reviews returned `APPROVE` after their requested corrections were integrated. A fresh integrated production-readiness review also returned `APPROVE` at `ed2eb81`.
- The first pushed Quality run exposed that `ubuntu-latest` had moved to Ubuntu 26.04, for which the exact Python 3.14.3 toolcache build was unavailable. Commit `166fe7f` pins Ubuntu 24.04 and current Node 24-based action revisions; the resulting [Quality run 43764853168](https://github.com/JGVB/Roomabouts/actions/runs/43764853168) passed.
- The separate inherited HACS validation workflow still fails only because GitHub Issues are disabled and the fork has no repository topics. Public HACS submission is outside this plan; those public repository settings must be corrected before any distribution work claims a green HACS gate.
- Backend presentation tests own Phase 1 snapshot sanitization. Browser semantic adaptation is deliberately Phase 2; `tests/js/stream-adapter.test.js` was therefore not created in Phase 1.
- The inherited browser Backup/Restore UI is temporarily unavailable because the live `RoomaboutsSnapshotV1` stream is not a configuration document. Phase 2 must provide a config-only adapter before that UI can safely return.
- Static checks and pure tests do not claim real Home Assistant behavior. Setup/unload, actual administrator authorization, `.storage`, Recorder, source-entity history, and socket/subscription behavior remain Phase 4/5 protocol work.
- The real card still lacks the `RoomaboutsSnapshotV1` browser adapter and lifecycle cleanup required by Phase 2. No live browser/card, Home Assistant instance, or sensor-hardware acceptance claim is made by Phase 1.

### Phase 2 — Presentation adapter and offline replay

Owners: Presentation/replay, then coordinator integration
Dependencies: Phase 1 observation contract, sanitized stream, and clocks

Expected files:

- `custom_components/radar_map_manager/www/roomabouts-presentation.js`
- `tests/js/roomabouts-presentation.test.js`
- `tests/browser/fixture.html`
- `tests/browser/fake-hass.js`
- `docs/protocols/browser-fixture.md`
- privacy-safe synthetic snapshot fixtures

Tasks:

- [ ] Validate `RoomaboutsSnapshotV1` and derive `RoomaboutsTrack` at the browser boundary.
- [ ] Reject invalid, duplicate, and out-of-order snapshots without reviving visual state.
- [ ] Generate generation-only anonymous aliases independently of radar slots.
- [ ] Consume backend-emitted confirmed, coasting/held, fading/last-seen, offline, ambiguous, position-basis, and last-observed facts rather than inferring them in the browser.
- [ ] Create deterministic play/pause/step/speed synthetic replay with an injected clock.
- [ ] Feed replay through `RoomaboutsObservationV1` and the same fusion/presentation pipeline as live input; do not inject post-fusion targets as the primary semantic replay.
- [ ] Build a fake Home Assistant connection that exercises the real custom card and its cleanup lifecycle.
- [ ] Add fixtures for exit/re-entry, hibernation, inherited-ID reuse, reconnect, map change, explicit reset, and generation change; prove no alias or trail crosses the boundary.
- [ ] Prove source-slot relabeling cannot create a named identity claim.
- [ ] Keep identity/evidence fields absent but structurally optional for a later resolver.
- [ ] Assign a distinct Roomabouts prototype manifest version before loading the real card so upstream `1.3.12` browser cache entries cannot be reused.
- [ ] Run the named manual browser-fixture protocol at fixed viewports and record console output; no automated browser claim is made before Phase 3 toolchain approval.

Exit gate: Deno tests prove semantic adaptation for zero/one/many snapshots and generation cleanup; the named manual browser fixture shows the real card loads and tears down without a console error; replay hashes match; no live HA or sensor is needed. Screenshot and interaction automation remain deferred.

### Phase 3 — Original Roomabouts map view

Owner: Map UI
Dependencies: Phase 2 exit plus an accepted `0003-browser-test-toolchain.md` decision selecting and pinning Node, package manager, Playwright, lockfile, and CI execution

Expected files:

- `custom_components/radar_map_manager/www/roomabouts-theme.js`
- `custom_components/radar_map_manager/www/roomabouts-trails.js`
- narrow changes in `radar-map-card.js` and `radar-renderer.js`
- `docs/decisions/0003-browser-test-toolchain.md`
- Playwright browser tests, lockfile, and screenshot goldens after decision 0003 is accepted

Tasks:

- [ ] Establish original parchment, ink, room-line, label, radar, state, and focus tokens.
- [ ] Create decision 0003, review its dependency/license/supply-chain impact, and obtain explicit user approval before adding Playwright or a Node/package-manager manifest.
- [ ] Prefer procedural CSS/Canvas texture; any raster asset must be newly created and licensed for the repository.
- [ ] Keep the technical editor recognizable and functional; apply Roomabouts primarily to the read-only map.
- [ ] Replace dot trails in Roomabouts mode with alternating left/right footprint glyphs sampled by map distance, not frame count.
- [ ] Bound footprint count and lifetime and clear them across lifecycle boundaries.
- [ ] Render uncertainty, held/last-seen, offline, and fading states without implying current precise presence.
- [ ] Respect reduced motion, high contrast, keyboard focus, zoom, and small/large dashboards.
- [ ] Check fixed portrait, landscape, tablet, and wall-display viewports.
- [ ] Perform an explicit originality review against protected franchise names, typography, symbols, copy, and artwork.

Exit gate: reviewed screenshots show the approved Roomabouts character; no protected asset is present; stale movement does not create footprints; editor and teardown checks pass.

### Phase 4 — Home Assistant no-sensor smoke

Owners: Coordinator and Quality
Dependencies: Phases 1–3

- [ ] Write `docs/protocols/ha-no-sensor-smoke.md`, `docs/protocols/storage-persistence.md`, and `docs/protocols/recorder-roomabouts.md` with the exact Home Assistant instance/version, backup artifacts, cutoff timestamps, `.storage` inspection, Recorder queries, expected results, evidence paths, rollback, and cleanup.
- [ ] Back up the target Home Assistant configuration before installation.
- [ ] Install by manually copying `custom_components/radar_map_manager` only. HACS custom-repository installation remains deferred to the distribution plan.
- [ ] Add the integration and confirm no exclusive UDP listener, RMM MQTT wildcard subscription/publishing, pairing/hardware registration, or direct-radar outbound proxy exists.
- [ ] Verify config flow, reload/unload, static resource registration, card lifecycle, service registration, and every admin guard using admin, non-admin, and missing-user cases.
- [ ] Verify coordinate subscription authorization before listener installation: administrator succeeds; non-admin and missing-user calls receive no map geometry, target, source, configuration, or credential data. Confirm count/occupancy entities retain their normal coordinate-free availability.
- [ ] Fuzz bounded configuration import with malformed, oversized, credential-bearing, network-bearing, and runtime-target payloads and confirm zero side effect.
- [ ] Exercise synthetic/fake input through the approved test boundary only.
- [ ] Seed a legacy version-1 store, run migration, save after synthetic tracking, and inspect the actual `.storage` object for absence of runtime/coordinate canaries.
- [ ] Inspect Recorder/database behavior for Roomabouts-created entities only and prove the coordinate-free master/count/occupancy contract across the recorded cutoff window. Source-coordinate history is not claimed until Phase 5.
- [ ] Record browser/HA versions, commands, expected results, observed results, and rollback steps.

Exit gate: manual install/remove and rollback succeed; the card loads; exclusive transports remain absent; authorization/import cases pass; persisted Roomabouts storage/state/Recorder evidence is coordinate-free; and the security audit has no unresolved critical or major finding.

### Phase 5 — One-sensor qualification after hardware arrives

Owners: Coordinator, Backend/hardening, and Quality
Dependencies: Phase 4 and physical sensor availability

- [ ] Before any real capture, create and obtain approval for `0004-real-capture-retention.md`. It must name an external non-repository location, owner-only directory/file permissions (`0700`/`0600` where supported), duration and size caps, stop-on-quota/incomplete-file behavior, expiry, sanitization, deletion limits on SSDs/backups, and rollback.
- [ ] Inventory exact entity IDs, units, availability, target slots, update order, firmware, and power arrangement.
- [ ] Measure X/Y update ordering, unchanged-axis behavior, typical and p95 skew, inactivity, unavailable values, and restart generation before freezing the coherent-pairing rule.
- [ ] Write `docs/protocols/recorder-source-entities.md` with exact entity IDs, database/Recorder inspection queries, pre/post cutoff timestamps, backup, exclusion change, restart/reload, rollback, and evidence path.
- [ ] Exclude raw high-rate source-coordinate entities from Recorder before extended testing; preserve backups, inventory pre-existing history/statistics/backups separately, and verify rather than assuming.
- [ ] Rigidly mount and calibrate with the inherited editor.
- [ ] Allocate tuning and held-out paths before capture. Record privacy-safe tuning evidence for coordinate orientation, grid accuracy, jitter, dropout, wall leakage, stationary behavior, exit/re-entry, restart, and Wi-Fi/HA recovery.
- [ ] After tuning, create and obtain approval for `0005-one-sensor-acceptance-thresholds.md` with the evidence-backed coherent X/Y pairing rule plus numeric error, jitter, dropout, ghost-expiry, latency, recovery, and footprint thresholds before opening held-out evidence.
- [ ] Run held-out 15-minute one-person walks and 30-minute empty-room protocols against the frozen source revision, configuration hash, and thresholds.
- [ ] Keep raw/unreviewed recordings and actual household geometry outside Git under decision 0004. Only sanitized, reviewed synthetic/derived fixtures may enter the repository.
- [ ] Issue pass, conditional pass, or fail before buying additional sensors.

Exit gate: held-out metrics meet the approved numeric thresholds; one moving person is shown truthfully with a clean fade; no empty-room ghost outlives the approved expiry; post-cutoff source and Roomabouts coordinate rows are absent; capture retention tests pass; and limitations are written down.

## Local and CI verification gate

The dependency-free initial gate is:

```bash
python3 --version
deno --version

env PYTHONPYCACHEPREFIX=/tmp/roomabouts-pycache \
  python3 -m compileall -q custom_components/radar_map_manager

python3 -m unittest discover -s tests/python -p 'test_*.py'
deno check custom_components/radar_map_manager/www/*.js
deno test tests/js
git diff --check
git fsck --strict
```

JSON validity, action-SHA/permission policy, and release-contract checks are part of the Python suite. Pure tests import pure modules directly; they do not claim Home Assistant integration coverage. The CI job pins Python 3.14.3 and Deno 2.6.9. HACS validation remains in GitHub Actions with its action pinned to a reviewed full SHA. Browser tests become mandatory only after decision 0003 approves the complete Playwright toolchain. Home Assistant-dependent checks run through the named Phase 4 runtime protocols.

## Failure handling and rollback

- A failed inherited-behavior characterization blocks refactoring until the actual behavior is understood.
- A secret canary in any log, payload, screenshot, or fixture stops the phase and triggers artifact cleanup plus a regression test.
- Coordinate evidence in `.storage`, Roomabouts-created Recorder rows, or post-cutoff source rows stops live testing. Restore the backed-up configuration/storage, remove the component if necessary, and determine the exact persistence path before resuming.
- A security correction that breaks the card is fixed at the sanitized stream adapter; credentials or coordinate state attributes are not restored as a shortcut.
- Transform disagreement blocks visual calibration; Python and JavaScript do not receive separate unexplained tolerances.
- Upstream sync conflicts are resolved in a dedicated branch. The last verified Roomabouts revision remains the rollback point.
- A visual regression in the inherited editor rolls back the narrow theme wiring, not the security foundation.
- Sensor evidence that fails after one materially different placement produces a fail/conditional result rather than hidden threshold relaxation.

## Risks, assumptions, and limitations

| Risk | Mitigation | Stop condition |
| --- | --- | --- |
| Upstream code is monolithic and untested | Characterize before extraction; one owner per hot spot | A change cannot be isolated or replayed deterministically |
| Sanitizing coordinator data breaks undocumented frontend behavior | Field allowlist plus legacy snapshot fixtures | Card requires a credential or administrative field for normal viewing |
| Storage or Recorder still retains coordinates | Versioned migration, runtime/config split, inventory/exclusions, and timestamped query evidence | Any runtime key or coordinate row appears after the approved cutoff |
| Theme work corrupts the editor | Theme read-only mode first; avoid `radar-ui.js` | Add/edit/save/reload no longer matches baseline |
| Footprints imply movement during loss | Observed-only distance sampling and lifecycle tests | Held, predicted, stale, or offline state emits a new print |
| RMM IDs are mistaken for people | Generation-only anonymous contract and labels | Slot or `target_N` is exposed as identity or survives a generation reset |
| Synthetic replay hides hardware behavior | Sensor gate before acceptance | Real input fails orientation, dropout, ghost, or recovery protocols |
| Visual similarity creates IP risk | Original tokens/assets and explicit review | Protected name, copy, font, symbol, artwork, or replicated layout appears |
| Fork diverges from upstream | Fetch-only remote and deliberate sync protocol | An upstream merge bypasses the security/compatibility gate |

## Independent plan review

The pre-plan architecture and test audits agreed that RMM is a viable base and that security/privacy plus deterministic tests must precede styling.

The first exact-plan review returned changes required. Its critical and major findings are now addressed: hidden `.storage` persistence; exclusive MQTT and direct-WS surfaces; complete admin/mutation coverage; precise first-proof transport/master-entity choices; a versioned generation-aware snapshot; separation of pure, browser, and HA-runtime tests; pinned CI actions/permissions; traceable Recorder/storage/capture protocols; numeric held-out thresholds; and manual-only first installation.

Final re-review verdict on 2026-11-15: **APPROVE.** No critical or major finding remains. A suggested duplicate fixture-list cleanup was checked against the current file and no duplicate exists; the map-contract wording was clarified to distinguish target-free geometry from coordinate-free state.

## User approval record

Approved on 2026-11-15. The user authorized implementation, team delegation, local commits, and pushing the reviewed governance baseline. Approval covers decision 0002; `RoomaboutsObservationV1` before fusion; administrator-only coordinate snapshots for the first proof; pinned dependency-free Deno/unittest pure-module testing; manual-only first installation; deferring Playwright to decision 0003; deferring real capture to decision 0004; the evidence-backed pairing rule and thresholds in decision 0005; synthetic-only fixtures before sensor review; and the original non-franchise visual direction.
