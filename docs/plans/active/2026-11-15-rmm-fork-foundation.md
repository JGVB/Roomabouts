# Roomabouts RMM Fork Foundation and Personal One-Room Proof

- Status: Phase 3 approved — implementation in progress
- Plan date: 2026-11-15
- Coordinator: Roomabouts coordinator
- Implementation branch/worktree: `codex/fork-foundation` at `/Users/jvanbev/Documents/Codebase/Roomabouts`
- Independent reviewers: RMM foundation architecture/test audits; Phase 3 toolchain, originality/accessibility, and fresh critical-plan reviews
- Upstream baseline: `Moe8383/radar_map_manager@e7caa9368dce3dc51f7ca03f6629b2c2fa6638b8`
- Target outcome: a safe, testable, original Roomabouts map running as a compatible Home Assistant custom integration, ready for one LD2450-class sensor when it arrives

## Decision summary

Roomabouts will extend the existing Radar Map Manager fork instead of building a separate greenfield application. The inherited editor, Home Assistant integration, map geometry, fusion engine, and renderer are valuable, but live installation is blocked until inherited movement persistence, exclusive network transports, credential exposure, and missing authorization boundaries are corrected and verified.

The work proceeds in this order:

1. preserve fork ancestry, licensing, governance, and upstream synchronization;
2. add deterministic characterization tests and a security/privacy floor;
3. introduce a source-neutral presentation adapter and synthetic replay path;
4. build the original Roomabouts Field Ledger survey view without changing the technical editor;
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
- An original Field Ledger survey view, anonymous aliases, configured-region geometry, and alternating abstract survey-step trails.
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
| F-10 Original visual layer | Add Roomabouts theme and truthful footprints | Procedural paper/survey field, measured cartography, distance-spaced left/right route marks | Read-only map matches approved original direction; no protected assets; stale states emit no new prints | Browser screenshots, fixture assertions, manual IP review |
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

- [x] Validate `RoomaboutsSnapshotV1` and derive `RoomaboutsTrack` at the browser boundary.
- [x] Reject invalid, duplicate, and out-of-order snapshots without reviving visual state.
- [x] Preserve and enforce backend-generated, generation-scoped anonymous aliases independently of radar slots.
- [x] Consume backend-emitted confirmed, coasting/held, fading/last-seen, offline, ambiguous, position-basis, and last-observed facts rather than inferring them in the browser.
- [x] Create deterministic play/pause/step/speed synthetic browser replay with an injected clock.
- [x] Keep the primary semantic replay in Phase 1 at the `RoomaboutsObservationV1`-through-fusion boundary; use the browser fixture only as a secondary, synthetic post-fusion presentation seam.
- [x] Build a fake Home Assistant connection that exercises the real custom card and its cleanup lifecycle.
- [x] Add adapter and browser cases for exit/re-entry, hibernation, inherited-ID reuse, reconnect, map change, explicit reset, and generation change; prove no alias or trail crosses the boundary.
- [x] Prove source-slot relabeling cannot create a named identity claim.
- [x] Keep identity/evidence fields absent in the first proof and require a later reviewed contract revision before adding a resolver.
- [x] Assign a distinct Roomabouts prototype manifest version before loading the real card so upstream `1.3.12` browser cache entries cannot be reused.
- [x] Run the named manual browser-fixture protocol at fixed viewports and record the evidence; no pinned Playwright or automated screenshot claim is made before Phase 3 toolchain approval.

Exit gate: Deno tests prove semantic adaptation for zero/one/many snapshots and generation cleanup; Phase 1 observation replay hashes remain passing; and the named manual browser fixture shows the real card loads and tears down without a page-origin console error. No live HA or sensor was used. Pinned screenshot and interaction automation remain deferred.

#### Phase 2 implementation evidence

- The reviewed Phase 2 stack runs from `7c55165` through `53d95f3` on `codex/fork-foundation`. It adds the strict browser adapter, real-card integration, bounded measurement-only trails, deterministic fake-HA fixture, lifecycle cleanup, and the fixture-owned responsive map stage.
- The final dependency-free gate passes 119 Python tests and 32 Deno tests, all Deno checks, `git diff --check`, and `git fsck --strict`. Independent adapter, fixture, security, quality, integrated, and final sizing reviews returned `APPROVE` after requested corrections were integrated.
- The complete semantic/lifecycle browser checklist passed at `13a4072`: `0.25x`/`4x` scheduling preserved snapshot order and logical time; generation reset assigned a new alias to a reused opaque ID; backward seek replaced the connection; disconnect/reconnect and ten remount/scenario cycles never exceeded one subscriber; diagnostics remained bounded; and final-empty cleanup left no dots or trails.
- Commit `53d95f3` corrected the fixture's percentage-height containing block. A post-fix Chrome 157.0.8103.78 run on macOS 26.5 (25F71) visibly rendered targets without horizontal overflow at `390x844`, `1024x768`, `1440x900`, and `1920x1080`. Final-empty and disconnect cleanup left zero dots/trails, remount returned to one subscriber with `teardown-ok`, three anonymous tracks rendered, and page-origin warning/error count was zero. Unrelated extension-origin messages were excluded.
- The card is intentionally read-only in Phase 2. The adapter does not retain a full Home Assistant object or bind inherited editor mutation handlers; a config-only resolver and real add/edit/calibration compatibility belong to the Phase 4 Home Assistant work. This phase does not claim the Phase 3 Roomabouts theme, live Home Assistant behavior, Recorder/storage behavior, or sensor hardware.

### Phase 3 — Original Roomabouts map view

Classification: Architectural
Owner: Map UI, coordinated by the Roomabouts coordinator
Dependencies: Phase 2 exit plus explicit user acceptance of proposed decision `0003-browser-test-toolchain.md` and `docs/engineering/phase3-field-ledger-visual-spec.md`
Visual contract: `docs/engineering/phase3-field-ledger-visual-spec.md`

#### Approval boundary

Phase 3 planning and review may proceed while decision 0003 and the Field Ledger specification are Proposed. Before the user accepts both documents—including the exact Node/npm/Playwright/Chromium/FFmpeg versions and identifiers, literal Node checksum, npm integrities/advisory disclosure, required artifact action/storage, license review, network/bootstrap surface, and complete visual/behavioral contract—do not create a Node manifest or lockfile, install a package or browser, change CI, generate goldens, or edit product modules. The current computer has Deno and standalone pnpm but no `node` or `npm`; that fact must not be hidden by an ambient tool assumption.

After acceptance, change both documents to Accepted with the approval date before the first dependency or product-code commit. If a toolchain or visual/behavioral contract changes, return to approval rather than silently updating the record.

#### Scope

- Make the read-only Roomabouts card a useful original Field Ledger map using sanitized `RoomaboutsSnapshotV1` configured-zone geometry without claiming zones are walls or rooms.
- Add a separate non-interactive read-only map renderer. Preserve the existing `drawZones()` early return and every editor guard.
- Add one pure, deterministic distance-sampled footprint model shared by DOM and Canvas rendering.
- Render the six valid lifecycle/position-basis combinations truthfully; render online/degraded/offline/missing source health on separate anonymous station markers; keep uncertainty and posture orthogonal.
- Add exact browser integration, accessibility, responsive, and reviewed screenshot checks after the toolchain decision is accepted.
- Keep all texture procedural and all test data synthetic.

#### Non-goals

- No live Home Assistant instance, sensor input, household geometry, Recorder/storage proof, identity resolver, Bluetooth/chip support, distribution work, or cloud service.
- No editor re-enablement, config-only resolver, calibration compatibility claim, or persisted theme setting. Those remain Phase 4 concerns.
- No external/downloaded font, raster paper texture, remote image, audio, protected reference asset, realistic shoeprint, or fantasy-map reveal animation.
- No rewrite of the inherited editor, renderer, coordinate system, snapshot schema, or Python/Deno gate.
- No automated Firefox/WebKit matrix or Dockerized browser lane unless Chromium/hosted-runner evidence demonstrates a concrete gap. A named manual Firefox text-only-zoom check is still required.

#### Verified constraints

- `RadarRenderer.drawZones()` currently returns whenever `state.editing` is false. Removing that guard would expose editor-oriented SVG behavior in the read-only card; Phase 3 requires a distinct read-only path.
- DOM targets use inline visual styles, so theme CSS alone cannot safely override lifecycle rendering.
- DOM trails are update-cadence dependent while Canvas consumes `TargetFilter.history`; reshaping either existing circle trail into a footprint would leave the two modes semantically inconsistent.
- The inherited read-only DOM accepts arbitrary inline visual configuration and the current `#click-layer` intercepts input with `touch-action: none`; Field Ledger must use an isolated subtree and explicitly restore dashboard scrolling.
- Canvas mode hides the existing dots layer, so a dedicated renderer-independent semantic list is required for equivalent accessible output.
- Sanitized include/exclude/entrance/stationary zones are configured regions, not a floor plan. Radar layouts may omit finite origins, and source-health records may be missing or unmatched; the read-only path must never invent geometry or a center station.
- Phase 2 already guarantees that only confirmed, observed backend measurements may set `emitFootprint`, and clears renderer state on disconnect, map/generation change, explicit reset, remount, and final-empty state.
- The fixture's synthetic map already contains a named include-zone rectangle and sanitized radar layout suitable for the first configured-field view.

#### Shared contracts frozen before implementation

1. **Theme activation and isolation:** Field Ledger is enabled only when `config.read_only === true && state.editing !== true`. `setConfig()` builds a typed read-only allowlist before assigning live config or calling the first inherited render/style/image sink; unsafe keys are never rendered and cannot request an asset. The dedicated subtree ignores `config.style`, `config.bg_image`, `fused_color`, inherited target/radar/zone colors, headings, fall/status/editor layers, and old trails. Snapshot/config copy uses `textContent`/safe DOM-SVG construction, never data-bearing HTML insertion. No new stored setting or theme-initiated request is added; the authorized Home Assistant snapshot stream remains the only data path.
2. **Geometry and source safety:** read-only zones/stations are clipped to `0 0 100 100`, use no editor handles/listeners, and have no pointer input. Fewer-than-three-point/nonfinite polygons are skipped; fully outside geometry gets no label, and partially clipped geometry gets a label only adjacent to a valid visible intersection. A station exists only for explicit finite `origin_x`/`origin_y` inside closed `[0,100]`; missing, off-field, and unmatched sources share one bounded anonymous summary. Health joins internally by exact `sensorId`, while visible station numbering follows sanitized radar order and never exposes a source ID.
3. **Valid state grammar:** each fixture frame passes `validateRoomaboutsSnapshot()`. Track pairs are tentative/observed, confirmed/observed, confirmed/interpolated, coasting/held, coasting/interpolated, or fading/last-seen. Ambiguity is tentative plus `source-unverified`; offline is source health only; posture/uncertainty never replace lifecycle facts.
4. **Sampling boundary:** the store observes each track exactly once per accepted adapter result before the DOM/Canvas branch, deduplicated by generation, sequence, internal track, `observedAt`, and coordinates. Render loops, resize, redraw, screenshots, and mode switches call read-only `visible(now)` and never advance history. Backward replay seek explicitly resets/replaces the store before rendering an older logical frame.
5. **Frozen footprint arithmetic and projection:** Euclidean `map-layout` spacing `4`, discontinuity `>25`, observation gap `>2000 ms`, epsilon `0.000001`, first side left, four-CSS-pixel lateral offset, 7×13-CSS-pixel glyph, at most 8 emissions per observation, 16 records per owner, 96 total, and exact `6000 ms` expiry use an injected monotonic presentation clock. `observedAt` is for order/gap/dedupe only. With the inherited nonuniform stage, one pure helper projects the map tangent by actual CSS width/height, derives screen rotation and left/right normal, and never resamples on resize. A regressing `visible()` fails closed without mutation/revival; `observe()` rejects and resets. The accepted visual specification freezes the complete arithmetic/projection/clock behavior.
6. **Cleanup:** an ineligible accepted state clears that owner's anchor; owner removal clears its records immediately; every Phase 2 reset boundary clears all anchors and records. Records become logically invisible exactly at `6000 ms`. One store-owned timer requests earliest cleanup; physical deletion occurs at the first callback, accepted snapshot, visibility/resume hook, reset, or destroy at/after expiry. Re-observation seeds a new anchor and cannot bridge stale movement.
7. **Accessibility and input:** an explicit `role="region"` named `Roomabouts field view` contains one bounded visually hidden `role="list"`, with an item per accepted track, placed station, and valid configured region plus one combined source summary in both render modes. Region entries expose type, optional literal name, and inside/partially-clipped/outside status without points or IDs. The exact bound is `128 + 64 + (4 × 128) + 1 = 705`; off-field tracks retain bounded `Outside field` semantics while visuals clip. Visual layers are `aria-hidden`. Field Ledger sets visual/click layers to `pointer-events: none` and `touch-action: auto`, installs no interception/capture, and permits page scrolling from a gesture that begins over the card.
8. **Renderer parity:** DOM and Canvas consume the same immutable footprint records and state classification. CSS mode owns eight reviewed pixel goldens; Canvas owns semantic/cleanup assertions and one bounded smoke image, not a pixel-parity claim.
9. **Browser evidence:** the committed manifest contains exactly nine goldens, fixed locale/timezone/DPR/region/readiness rules and zero pixel tolerance on the recorded Linux/font environment. Automated root-font/320-CSS-pixel checks are approximations; named manual Firefox text-only and Chrome native-zoom evidence is required.
10. **Originality:** Field Ledger follows the visual-spec red lines. Technical survey language, mineral colors, system fonts, configured-region geometry, and abstract route marks dominate the composition.

#### Expected files after approval

Toolchain and browser lane:

- `.node-version`
- `package.json`
- `package-lock.json`
- `playwright.config.js`
- narrow updates to `.github/workflows/quality.yml`, `.gitignore`, and `README.md`
- `tests/browser/phase3-visual.spec.js`
- `tests/browser/visual/manifest.js` with exactly nine reviewed Chromium/Linux goldens
- `docs/security/browser-toolchain-inventory.md`

Product and dependency-free tests:

- `custom_components/radar_map_manager/www/roomabouts-theme.js`
- `custom_components/radar_map_manager/www/roomabouts-trails.js`
- narrow changes to `radar-map-card.js` and `radar-renderer.js`
- manifest/import version bump from `1.4.0` to `1.5.0`
- `tests/js/roomabouts-theme.test.js`
- `tests/js/roomabouts-trails.test.js`
- focused additions to `tests/js/radar-renderer.test.js`
- focused fixture/scenario additions under `tests/browser/`
- release-contract updates for eight frontend modules and the pinned browser toolchain
- `docs/protocols/phase3-visual-acceptance.md`
- `docs/protocols/phase3-native-zoom.md`

`radar-ui.js` is not an expected implementation file. Use the existing `#map-container` and theme module; any newly discovered need to edit the large editor stylesheet returns to coordinator review.

#### Worktree and file ownership

Each implementation lane receives a worktree only after decision 0003 and the Field Ledger specification are both Accepted. The coordinator owns shared contracts, integration order, the active plan, decisions, manifest/version convergence, and final acceptance.

| Lane | Exclusive ownership | Must not edit |
| --- | --- | --- |
| Coordinator/contracts | active plan/decisions, manifest/import convergence, `tests/python/test_release_contract.py` | lane-owned implementation/tests except final narrow integration |
| Theme/trails | `roomabouts-theme.js`, `roomabouts-trails.js`, their two Deno test files | card, renderer, workflow, release-contract and package files |
| Renderer integration | `radar-renderer.js`, `radar-map-card.js`, focused renderer/card tests | theme/trail internals, release-contract test, package/workflow, fixture controller |
| Browser/fixture | Node/package/Playwright files, Quality browser job, `docs/security/browser-toolchain-inventory.md`, fixture/scenarios, browser spec/goldens, visual/zoom protocols | production renderer/theme modules and `test_release_contract.py` |
| Reviewers | findings only | all implementation files unless assigned a targeted remediation |

No lane commits a shared-contract change. A required contract change stops downstream work and returns to the coordinator.

#### Implementation waves

##### Wave 3A — Accept and bootstrap the toolchain

- [x] Obtain explicit user approval for both decision 0003 and the complete Field Ledger visual specification.
- [x] Mark both documents Accepted with the approval date. Wave 3B and every product edit remained blocked until both records were accepted.
- [x] Temporarily bootstrap Node from the official Apple silicon `24.22.3` archive using the accepted literal SHA-256, no global/system install, and no ambient pnpm/Corepack substitution.
- [x] Add the exact Node `24.22.3`, npm `11.19.1`, `@playwright/test` `1.65.1`, Chromium headless shell `159.0.8154.6`/revision `1255`, FFmpeg revision `1013`, and both pinned-action contracts.
- [x] Generate and review lockfile-version-3 `package-lock.json`; allow exactly the root plus three Playwright packages with frozen registry URLs/integrities, no additional/optional package, lifecycle script, alternate host, or unqualified `npx` fetch.
- [x] Install with scripts disabled, automatic audit/fund submission disabled, and explicit task-specific cache/browser paths. Local Node archive/unpack, npm cache, and browser payload stay under the recorded temporary root; CI Node/npm may use setup-node's toolcache; the CLI lives only in ignored/release-excluded repository `node_modules/.bin`. Download only the explicit Playwright Chromium shell/FFmpeg payload. Separately run the disclosed high-severity advisory query and signature check with a token-free pinned-registry configuration; never auto-fix.
- [x] Record Node/npm/action/package/Chromium/FFmpeg/Ubuntu license and notice evidence, installed browser/FFmpeg and apt inventory/hashes, and residual CDN/floating-apt risk in `docs/security/browser-toolchain-inventory.md`.
- [x] The coordinator alone updates `tests/python/test_release_contract.py` so version/range/integrity drift, unpinned actions, unexpected packages/scripts, forbidden browser payloads, or toolchain/browser artifacts fail the release contract.
- [x] Constrain the required artifact action to a dedicated synthetic PNG/JSON directory, seven-day retention, no hidden/overwrite/missing files, and recorded artifact digest; never upload traces, video, reports, logs, source, Home Assistant data, or household geometry.
- [x] Prove the unchanged Python/Deno gate still passes when Node is absent.

Exit: the lock tree and supply-chain diff are reviewed, the separate browser job can launch the loopback fixture, and no product module has changed.

Wave 3A exit evidence: fork-only Quality run `43794923954` passed both the unchanged Python/Deno job and the pinned Chromium job at commit `62b069266fc64b6d19d17a683986d6978415a5e5`; Linux hashes, license output, exact added packages, complete apt inventory, and font/render versions are recorded in `docs/security/browser-toolchain-inventory.md`.

##### Wave 3B — Pure theme and footprint TDD

- [x] Add failing Deno tests for theme activation, frozen token/contrast schema, deterministic procedural CSS, isolated read-only classes, and prohibited inherited styles, external URL/font/raster behavior, glow/pulse/emoji/alarm copy.
- [x] Implement the smallest frozen theme/token module that satisfies those tests.
- [x] Add failing footprint tests for the complete accepted algorithm: first anchor; four-unit cadence-invariant Euclidean spacing; residual/corner interpolation; map heading; portrait/landscape/resize screen projection; strict side alternation; epsilon/zero-length; exact dedupe and out-of-order rejection; 2000-ms gap and 25-unit discontinuity reset; eight/16/96 caps; fail-closed `visible()` and reset-on-`observe()` clock regression; exact logical expiry at 5999/6000/6001 ms; on-time/delayed-callback/next-observation/resume/reset/destroy physical cleanup; timer-count/handle cancellation; and no stale bridge.
- [x] Implement the pure footprint store with injected clock and scheduler, at most one owned expiry timer, and no DOM, Canvas, Home Assistant, network, or persistence dependency.

Exit: pure modules pass in Deno, invalid/nonfinite input fails closed, and an independent reviewer approves the arithmetic and lifecycle rules.

Wave 3B exit evidence: 12 theme tests and 18 footprint tests pass inside the 62-test dependency-free Deno gate; all 123 Python contract tests pass; focused and full Deno checks pass; prohibited network/style/originality scans are clean in production modules; and two independent reviews approve the final arithmetic, timer, lifecycle, projection, sanitizer, and theme-isolation behavior after stale-timer, strict-side, ordinal, and bounded-owner defects found during review were corrected.

##### Wave 3C — Read-only map and DOM integration

- [x] Import the modules and bump manifest/frontend query versions together.
- [x] Before the first inherited render/sink, make `setConfig()` construct and assign a typed Field Ledger read-only allowlist; then activate the isolated subtree only for that view and remove it cleanly on teardown/mode changes.
- [x] Add `drawRoomaboutsMap()` as a separate non-interactive clipped SVG path for configured include/exclude/entrance/stationary regions, bounded labels, and anonymous survey stations; skip degenerate/nonfinite/fully outside display, label only valid visible intersections, treat outside origins as unplaced, and never invent/clamp a position or architectural meaning.
- [x] In renderer-owned tests and code, join station health internally, assign frame-local station numbers, combine missing/unmatched/paused/unplaced/off-field cases conservatively, and keep source identifiers out of UI and semantics.
- [x] Add explicit Roomabouts DOM target branches for all six validator-compatible lifecycle/position pairs with typed state classes/data and neutral posture/uncertainty copy.
- [x] Build every snapshot/config-derived label with `textContent` and safe DOM/SVG primitives; prohibit data-bearing HTML insertion and prove hostile zone-name markup/event/URL strings remain literal with zero node injection or request attempt.
- [x] Render abstract DOM survey steps from the shared footprint store; do not convert the inherited trail circles.
- [x] Extend fixtures with validated all-sources-offline and composite cases using all six valid lifecycle/position track pairs plus a separate offline station; every frame must pass the production snapshot validator before rendering.

Exit: the real card visibly shows configured regions, placed/anonymous station state, truthful track markers, and deterministic footprints; no invented floor plan, editor affordance, or source ID appears.

Wave 3C exit evidence: all 137 Python contract tests, all 76 dependency-free Deno tests, and all six pinned-Chromium functional/toolchain tests pass; `git diff --check` is clean. Three independent final reviews approve card lifecycle/privacy, renderer geometry/semantics/cleanup, and browser security/originality behavior. Review-found defects—SVG label scaling, detached/unconfigured subscriptions, mixed-frame trail rendering, delayed final-empty cleanup, inherited station origins, sparse polygon failure, small-region treatment loss, stale SVG cleanup, and asymmetric Canvas footprint parity—were corrected and now have focused regression coverage.

##### Wave 3D — Canvas parity and accessibility behavior

- [ ] Make Canvas consume the same footprint records and shared non-square projection helper to draw the same forefoot/heel primitives; prove portrait/landscape/live-resize DOM parity without resampling.
- [ ] Add the named `role="region"` and renderer-independent visually hidden semantic `role="list"`, with one item per accepted track, placed station, and valid configured region plus one combined source summary, capped at 705 in both modes; visual layers remain `aria-hidden` and expose no internal ID or coordinate.
- [ ] Apply lifecycle shape/wording parity where Canvas text is shown and prove semantic-list parity across CSS↔Canvas switches.
- [ ] Disable nonessential interpolation/pulse/fade behavior under reduced motion.
- [ ] Add forced-colors/system-color rules without `forced-color-adjust: none`.
- [ ] Scope read-only click/SVG/Canvas/dot/visual layers to `pointer-events: none` and `touch-action: auto`; prove no prevent-default/capture/editor/wheel interception and that a phone drag starting over the map scrolls the page.
- [ ] Verify focus, 200% root-font and 320-CSS-pixel automated approximations, and no surrounding-page horizontal overflow.

Exit: DOM/Canvas semantic and cleanup tests pass; reduced motion and forced colors remain truthful without color-only distinctions.

##### Wave 3E — Deterministic browser and screenshot evidence

- [ ] Configure one-worker Chromium tests with exact `en-US`/UTC/light/DPR-1 environment, finite timeouts, loopback-only server, blocked external requests, video/trace off, font/fixture/subscriber/two-frame readiness, and no arbitrary sleeps.
- [ ] Add functional tests for initial configured-field render, all six track pairings, observed walk, held/no-new-print, last-seen, generation/backward-seek reset, three tracks, exact/off/far-outside geometry and stations, named/unnamed/clipped/omitted configured regions, offline/missing/unplaced/paused sources, pre-render hostile config/zone names, 705-item semantic bound, delayed/resume expiry and clock regression, teardown/remount, redraw/resize/screenshot/mode-switch sampler invariance, semantic/projection parity, scrolling, and page-origin console/network failures.
- [ ] Commit the exact nine-entry manifest: observed scene at five viewports, tablet six-track/offline-station composite, tablet forced-colors composite, tablet reduced-motion walk, and tablet Canvas smoke. Capture `#card-host` with CSS scale, animations disabled, caret hidden, and exact zero-pixel tolerance.
- [ ] Generate Linux candidate goldens only through an explicit manual dispatch/update command. Upload synthetic candidates with the pinned artifact action, review them, then commit them manually; normal CI remains compare-only.
- [ ] Record runner/OS, browser/FFmpeg/Node/npm/Playwright and font/render-library versions, commands, expected/observed results, and golden SHA-256 values in the visual-acceptance protocol.
- [ ] Execute the named native-zoom protocol: Firefox 200% text-only and Chrome/Chromium 400% native zoom at measured `320 ± 1` CSS-pixel inner width. Treat it as manual evidence, not a Playwright emulation claim.

Exit: two clean CI runs compare the same reviewed goldens successfully, with zero page-origin console error, external request, orphan subscriber, or orphan print.

##### Wave 3F — Independent acceptance

- [ ] Run a fresh originality/accessibility review against the visual red-line list and screenshots.
- [ ] Run a fresh security/privacy/lifecycle review against the raw diff and package lock.
- [ ] Run the production-readiness diff audit: status, staged/unstaged/untracked files, release archive, full tests, and critical failure paths.
- [ ] Fix confirmed findings surgically; return any architecture/contract change to approval.

Exit: reviewers return `APPROVE`, all evidence is recorded, the branch is clean, and no unsupported Home Assistant/editor/hardware claim is made.

#### Requirement-to-evidence trace

| Requirement | Automated evidence | Manual/review evidence |
| --- | --- | --- |
| Original visual system | token/CSS/prohibited-pattern tests; goldens | originality review |
| Useful read-only map | configured-zone/station SVG structure, clipping/degenerate cases, and no-pointer tests; screenshots | fixed-viewport review |
| Accessible configured regions | type/name/clipping semantic items, 705-item bound, CSS/Canvas parity, cleanup | screen-reader/accessibility review |
| Truthful uncertainty | lifecycle class/ARIA tests; state-composite screenshot | accessibility review |
| Distance-based footprints | cadence-invariance and boundary Deno tests | observed/held screenshot sequence |
| Bounded cleanup | owner/reset/disconnect/remount tests in Deno and browser | diagnostics/subscriber record |
| Motion/contrast/reflow | media emulation, focus, zoom, overflow browser assertions | forced-color/reduced-motion review |
| No privacy/security regression | external-request block, source-ID absence, release-contract tests | package-lock and diff audit |
| Editor compatibility boundary | theme activation/no-handle tests; no editor-file diff | Phase 4 retains functional editor verification |

#### Failure handling and rollback

- Any protected-similarity finding blocks acceptance; remove the offending visual/copy rather than rationalizing it.
- Any footprint emitted from a non-observed state, stale bridge, owner leak, or reset boundary blocks the phase and rolls back renderer wiring to the last Phase 2 revision.
- Any editor handle/listener in read-only mode blocks the phase. Do not weaken the editor guard to obtain configured geometry.
- Any external browser request or source ID in UI/accessibility/screenshots stops the browser lane and triggers a fixture/report review.
- A package-lock or browser revision mismatch blocks CI. Do not use a floating version to restore green.
- If screenshot stability fails twice on the pinned hosted runner, collect evidence and return with a Docker/digest proposal; do not mask broad pixel differences with a large tolerance.
- Rollback removes Phase 3 modules, Node/browser files/job, fixture additions, version bump, repository-local `node_modules`, and only the recorded task-specific Node-unpack/npm-cache/browser-payload directories. Accepted decisions/specifications remain historical records; a replacement supersedes rather than deletes them. Phase 2 remains the known-good presentation baseline.

#### Unresolved assumptions and residual risks

- Six-second expiry and eight/16/96 emission/retention caps are frozen for Phase 3. Any change requires a revised accepted visual specification and golden manifest before implementation.
- Sanitized zone polygons are displayed only as configured regions. They do not establish walls, rooms, doors, or a floor plan; true architectural geometry requires a later explicit contract.
- System-font rendering is stable only within the pinned Linux/Chromium golden environment; macOS screenshots are manual review evidence, not CI baselines.
- Forced-colors screenshot fidelity depends on Chromium emulation; keyboard/focus and semantic assertions remain the primary evidence.
- Browser suspension/throttling can delay physical deletion of at most 96 expired in-memory footprint records beyond the exact six-second logical visibility cutoff. The first callback, accepted snapshot, visibility/resume event, reset, or destroy must purge them; they are never rendered, exposed, logged, or persisted while delayed.
- Phase 3 preserves but does not execute the disabled editor. Actual add/edit/calibration compatibility remains unverified until Phase 4 supplies a config-only resolver and real Home Assistant test instance.

Exit gate: the approved Field Ledger view renders sanitized configured-region geometry, anonymous stations, and anonymous tracks at all fixed viewports; observed-only survey steps are cadence-invariant and bounded; stale movement creates no print; reset/teardown leaves no state; accessibility, scrolling, manual zoom, and originality reviews approve the evidence; the pinned browser and dependency-free gates pass twice; no protected asset or runtime/browser privacy regression is present; and Phase 4 limitations remain explicit.

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
deno check --no-config \
  custom_components/radar_map_manager/www/*.js \
  tests/js/*.js \
  tests/browser/fake-hass.js \
  tests/browser/fixture-controller.js \
  tests/browser/fixtures/synthetic-scenarios.js \
  tests/browser/fake-hass.test.js
deno test --no-config tests/js tests/browser/fake-hass.test.js
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

Phase 3 planning received three independent final verdicts on 2026-11-15: browser-toolchain/supply-chain **APPROVE**, originality/accessibility **APPROVE**, and fresh critical-plan re-review **APPROVE**. All review findings are incorporated. The user accepted decision 0003 and the Field Ledger specification on 2026-11-15, opening Wave 3A implementation.

## User approval record

Approved on 2026-11-15. The user authorized implementation, team delegation, local commits, and pushing the reviewed governance baseline. Approval covers decision 0002; `RoomaboutsObservationV1` before fusion; administrator-only coordinate snapshots for the first proof; pinned dependency-free Deno/unittest pure-module testing; manual-only first installation; deferring Playwright to decision 0003; deferring real capture to decision 0004; the evidence-backed pairing rule and thresholds in decision 0005; synthetic-only fixtures before sensor review; and the original non-franchise visual direction.

Phase 3 approval on 2026-11-15 covers accepted decision 0003 and the complete Field Ledger visual/behavioral specification. The user also explicitly prohibited opening pull requests or other contributions to the original upstream owner; all implementation remains local or in `JGVB/Roomabouts` unless the user later changes that instruction.
