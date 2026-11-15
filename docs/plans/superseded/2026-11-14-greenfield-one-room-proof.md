# Roomabouts One-Room Proof

- Status: Superseded on 2026-11-15 by `../active/2026-11-15-rmm-fork-foundation.md`
- Plan date: 2026-11-14
- Coordinator: Roomabouts — Coordinator
- Implementation branch/worktree: Not created
- Independent reviewer: Roomabouts — Independent Plan Review
- Target outcome: A measured, deterministic, privacy-respecting one-room prototype driven by one supported LD2450 sensor

> This plan assumed an empty repository and a greenfield TypeScript application. Roomabouts subsequently adopted the Radar Map Manager fork, so this file is retained only as design history and must not be used as an implementation source.

## Decision summary

This is the only active implementation plan. It replaces the earlier long-range draft as the execution source of truth through the one-room proof.

The initial build should contain one browser application, three domain packages, one capture tool, and reviewed replay fixtures. It should not begin with a local tracking service, database, container packaging, licensing, commerce, identity, or multi-sensor fusion.

No implementation begins until the user approves:

1. the proposed toolchain and runtime dependencies;
2. the normalized sensor, coordinate, clock, replay, track, and presentation contracts;
3. Home Assistant authentication and Recorder changes;
4. recording location, retention, sanitization, and deletion behavior;
5. single-client blank, pause, anonymous, and fail-closed startup semantics.

## Why this plan is narrower

The repository currently contains no commits, source code, manifest, lockfile, test harness, accepted decision records, or release artifact. The previous draft assumed an entire production stack before sensor viability had been proven.

The first irreversible risk is not packaging or billing. It is whether one inexpensive sensor can produce a convincing and truthful anonymous trail in one real room. This plan therefore builds only the reusable seams required to answer that question:

- a vendor-neutral input contract;
- deterministic recording, replay, and simulation;
- calibrated coordinate transforms;
- a pure tracking reducer;
- a snapshot-driven accessible map renderer;
- explicit privacy and uncertainty states;
- measurable live and replay acceptance evidence.

## Sources

- Product roadmap: /Users/jvanbev/Downloads/Living_Home_Map_Sensor_First_Roadmap.md
- Long-range draft: /Users/jvanbev/Documents/Codex/2026-11-14/files-mentioned-by-the-user-living/outputs/Living_Home_Map_Implementation_Plan.md
- Repository rules: AGENTS.md
- Engineering workflow: docs/engineering/workflow.md

The source documents are reference material. This approved plan and accepted decision records govern implementation.

## Verified current state

- The local main branch is unborn and the SSH remote has no main ref.
- The repository contains exactly six untracked governance/plan files and no product implementation.
- No package manifest, lockfile, source tree, test harness, accepted decision record, or CI workflow exists.
- Node is not installed in the current shell. pnpm 11.25.0 is visible, but cannot execute the proposed workspace without Node.
- The toolchain, dependencies, Home Assistant behavior, sensor firmware behavior, authentication, retention, privacy semantics, and numeric sensor thresholds remain unverified until their gates run.

## Related decision records

No decision record is accepted yet. Wave 1A must create and obtain approval for decisions 0001–0007:

- 0001 — toolchain and dependency baseline;
- 0002 — sensor input, coordinates, logical time, and replay ordering;
- 0003 — Home Assistant authentication and credential handling;
- 0004 — Recorder exclusions, backup, rollback, and pre-existing history;
- 0005 — local household configuration and capture storage, limits, retention, sanitization, and deletion;
- 0006 — single-client privacy policy and fail-closed startup;
- 0007 — corpus allocation and measurement protocols.

Wave 3B creates decision 0008 for numeric proof thresholds after the designated tuning runs and obtains approval before any held-out run.

## Scope

### In scope

- One Everything Presence Lite LD2450 sensor, unless availability forces a separately approved substitute.
- Home Assistant as the live input source.
- A minimal strict-TypeScript workspace.
- One map application with live, replay, simulator, and diagnostic modes.
- Filtered Home Assistant subscriptions and coherent X/Y assembly.
- Explicit local capture, normalized JSONL fixtures, deterministic replay, and seeded simulation.
- File-based one-floor, one-room geometry and one sensor pose.
- Pure coordinate transforms, validation, association, lifecycle, smoothing, and uncertainty.
- Anonymous aliases, distance-spaced fading footprints, source health, and truthful stale/offline states.
- Single-client anonymous mode, blank mode, and pause semantics approved before UI implementation.
- Automated tests plus measured live-sensor and soak evidence.
- One simultaneously tracked moving person is the supported proof target. Two- and three-person hardware cases are diagnostic only; three simulated tracks are used for renderer headroom.

### Non-goals

- Visual map editor or self-service onboarding.
- Second sensor, adjacent-room handoff, overlap fusion, or multiple floors.
- SQLite, IndexedDB product storage, history, or authoritative local service.
- Household-wide or multi-display privacy authority and synchronization.
- Private-area privacy guarantees; geometry masks in this proof are calibration/range controls only.
- Home Assistant App, Docker, OCI image, or release signing.
- Licensing, checkout, merchant integration, paid editions, or telemetry.
- Identity, BLE attribution, UWB, cameras, cloud services, remote access, or native mobile clients.
- UI overlays for raw, normalized, or transformed observations; proof diagnostics are limited to PresentationFrame track and source-health state.
- Additional sensor families, installation services, or hardware resale.
- Guaranteed continuous display of a stationary, seated, reclining, or occluded person; these cases are characterized, but movement resumption must recover truthfully.

## Proposed technical decisions

These are recommendations, not accepted decisions until user approval.

| Area | Proposed choice | Reason | Deferred alternative |
| --- | --- | --- | --- |
| Language | Strict TypeScript | Shared contracts and deterministic logic | None for the first slice |
| Runtime | Node 26.13.1 LTS | Reproducible supported runtime for tooling and capture | Re-evaluate only if the lab-readiness spike finds incompatibility |
| Workspace | pnpm workspace | One lockfile and isolated packages | npm or Bun |
| UI | One React and Vite application | Fast browser iteration and simple modes | Framework-free UI |
| Rendering | Native Canvas 2D plus semantic DOM | Sufficient for the target load and debuggable | PixiJS only after profiling |
| Tests | Vitest | Unit, property-style, contract, and replay tests | None for core logic |
| Browser automation | Playwright, added only at Wave 5 after explicit approval | Real keyboard, zoom, orientation, Canvas/DOM, and browser-memory evidence | Named manual protocols if dependency is rejected |
| Boundary validation | Zod only for serialized and imported data | Runtime safety without infecting core types | Handwritten validators |
| Home Assistant | home-assistant-js-websocket; ws for the capture process | Reuse documented auth/reconnect behavior | Custom WebSocket client |
| Assignment | Exhaustive deterministic minimum-cost matching | Maximum of three initial targets | Hungarian algorithm after measured scale need |
| Units | Meters inside normalized domain contracts | One physical coordinate convention | Raw millimeters remain diagnostics only |
| Persistence | Coordinate-free client privacy policy only; no movement persistence | Fail-closed startup without creating history | Authoritative service and database after later approval |

## Initial repository shape

    apps/
      map-studio/
        src/
          display/
          diagnostics/
          privacy/
          replay/
          simulator/

    packages/
      contracts/
      ha-input/
      tracking-core/

    tools/
      capture/

    fixtures/
      recordings/
        v1/

    config/
      canonical/
        one-room/

    docs/
      decisions/
      evidence/
      plans/
        active/
      product/
      protocols/

The coordinator owns root manifests, the lockfile, shared contracts, CI configuration, and integration. Specialist chats must not independently edit those files.

## Contracts to freeze before parallel implementation

### SensorInputEventV1

Use a discriminated event union rather than attaching cached coordinates to every state:

- observation
  - schema version, sequence, sensor ID, opaque source slot, pose revision;
  - injected logical time in milliseconds;
  - optional receive/source epoch times for live diagnostics only;
  - finite local X/Y in meters and optional reported speed.
- target-inactive
  - sequence, logical time, sensor ID, and source slot;
  - no coordinates.
- source-status
  - sequence, logical time, sensor ID, online/degraded/offline, and reason;
  - no coordinates.
- pose-change
  - sequence, logical time, sensor ID, old and new pose revisions.

Rules:

- Source slots are diagnostic only and never become track or person IDs.
- Inactive, stale, unavailable, disconnected, or restarted sources never emit cached coordinates as observations.
- The injected logical clock alone drives timeouts and replay behavior.
- Epoch timestamps are excluded from canonical normalized fixtures and semantic hashes.
- Room assignment is absent. It is derived only after pose transformation and geometry validation.
- Unknown pose revisions, non-finite values, malformed units, and stale half-samples are rejected with diagnostics.
- Sensor loss does not prove that the room is empty.

### Deterministic time and ordering

Tracking exposes two pure operations:

- apply(event);
- advanceTo(logicalTimeMs).

Logical time is monotonic. Before processing time t:

1. deadlines earlier than t fire;
2. events at t apply in ascending sequence order;
3. deadlines exactly at t fire.

During source silence, live and replay schedulers advance explicitly to lifecycle deadlines or presentation ticks. Wall-clock time never controls semantic state. Same-process latency measurement uses a monotonic clock. Source-to-receive latency is reported only when the source timestamp is demonstrably trustworthy.

### SensorPoseV1 and MapConfigurationV1

- Sensor-local axes normalize to +X right and +Y forward.
- Floor-global coordinates use meters, +X right on the plan, +Y up.
- xAxisYawRad is the counter-clockwise angle from floor-global +X to sensor-local +X; global = origin + R(xAxisYawRad) × local.
- Screen Y inversion and pixels exist only in the renderer.
- The map contains one floor, one room polygon, optional exclusions, one pose, a schema version, and pose revisions.
- Outside or excluded observations are never clamped to walls. Transform validation and hardware evidence count and report them; this proof UI does not render observation overlays.
- This contract models exactly one floor and no portals. Multi-floor and portal fields are added only with a later approved plan.
- Exclusions are calibration/range masks, not private-area guarantees.

### RecordingEventV1

Canonical JSON Lines fields:

- schema and version;
- contiguous sequence;
- nondecreasing replay offset in milliseconds;
- kind;
- validated data.

Kinds:

- session-start and session-end;
- allowlisted source value;
- normalized sensor input;
- pose change;
- source status;
- annotation;
- scenario marker;
- capture gap.

Rules:

- A footer records event count, duration, and SHA-256.
- The SHA-256 covers the exact UTF-8 bytes of every preceding JSONL line, including line terminators; the footer itself is excluded.
- Missing footer, sequence gap, invalid value, or unsupported version disqualifies a file from the CI fixture corpus.
- Raw-through-adapter and normalized-input replay are explicit mutually exclusive modes.
- Backward seek resets and replays from the beginning or from a verified checkpoint.
- Playback speed affects scheduling only; virtual time and semantic output remain unchanged.
- Raw Home Assistant capture is opt-in, ignored by Git, bounded, purgeable, and never copied into fixtures unchanged.
- session-start declares replayMode as raw-through-adapter or normalized-input. Validation rejects normalized-input records in raw mode and source-value records in normalized mode.
- A capture gap means the recorder cannot prove a continuous source transcript because of buffer overflow, backpressure drop, write failure, process suspension, or another detected discontinuity. The writer emits the reason, first/last affected logical time, and known dropped count; any gap makes the session ineligible as a CI fixture.

### TrackSnapshotV1

- Session-scoped track ID.
- State: tentative, confirmed, coasting, fading, or removed.
- State-change, update, and last-reliable-observation times.
- Floor and optional room.
- Last reliable, predicted, and display positions with an explicit basis.
- Optional velocity.
- Structured uncertainty reasons such as dropout, source offline, boundary, or association ambiguity.
- Optional uncertainty radius only when justified by replay evidence.
- Contributing sensor IDs for diagnostics.

Rules:

- Tentative tracks are diagnostic-only.
- Coasting positions are explicitly predicted.
- Predicted movement never emits new solid footprints.
- Fading tracks cannot be resurrected; reacquisition during coasting may return to confirmed.
- Ambiguous association starts or preserves anonymous uncertainty rather than stealing another track.
- Identity and generic numeric confidence do not enter this contract.

### PresentationFrameV1

- Schema version, monotonically increasing revision, logical generation time, and map revision.
- Client-session privacy state.
- Source/coverage health.
- Renderable tracks with anonymous alias, lifecycle, freshness, display position, basis, and uncertainty reasons.
- A bounded recent accepted display path or equivalent trail seed so reconnect cannot draw through a gap or revive expired trails.
- Full snapshots only. Reconnect, sleep/wake, or a missed revision discards expired visual state and requests the newest full snapshot.

The renderer imports only contracts and map geometry. It never receives Home Assistant entities, vendor payloads, radar slots, raw observations, or identity evidence.

## Privacy decisions to approve

Recommended proof semantics:

- The proof supports exactly one active Map Studio client. It makes no household-wide or multi-display authority claim.
- Coordinate-free client policy state may be persisted. It must load before any plan, track, trail, diagnostic, hit target, or semantic content renders.
- Startup remains blank while policy state is unknown or invalid.
- Anonymous mode removes identity evidence but keeps temporary anonymous aliases.
- Blank clears plan, tracks, trails, labels, diagnostics, hit targets, and semantic output in the active client.
- Hide this display is presentation-only and clearly states that ingestion continues in the active client.
- Pause unsubscribes the client, starts a new event generation to fence late messages, clears partial X/Y samples, tracks, trails, aliases, diagnostics, and semantic output, and resumes as a fresh tracking session with new IDs.
- The capture tool is a separate explicit operator session. Map Studio does not claim to stop or control it.
- Geometry exclusions are calibration/range masks, not private-area privacy guarantees. Private-area controls are deferred to the authoritative local-service milestone.
- No raw coordinates or movement history persist by default.
- Actual household map geometry, mounted poses, and policy remain in an owner-only local data root outside the repository. The application refuses a repository-relative household configuration in proof mode. Git receives only synthetic or explicitly privacy-reviewed canonical configuration, and evidence records the private source configuration hash rather than its contents.
- Household-wide privacy synchronization, late-client behavior, and multi-display restart recovery are deferred until an authoritative service and coordinate-free policy store are separately approved.

## Home Assistant and capture decisions to approve

Recommended prototype policy:

- Map Studio uses the documented Home Assistant browser authorization flow through the approved client. Decision 0003 records allowed origins, token storage and lifetime, revocation, reconnect, and log-redaction behavior.
- The capture process receives credentials only through an approved environment/OS-secret mechanism, never a command-line argument. It uses a dedicated non-admin Home Assistant user if the required read access works; otherwise the broader privilege and mitigation are documented before use.
- Tokens, refresh credentials, URLs, headers, user contexts, and raw Home Assistant payloads never enter recordings, fixtures, logs, screenshots, or browser bundles.
- Before Recorder changes, export/back up the relevant configuration and database under the household's normal recovery policy. Decision 0004 lists exact entity exclusions, reload/restart steps, rollback, and post-soak database queries.
- Exclusions prevent new history. Pre-existing history, long-term statistics, Home Assistant backups, filesystem snapshots, and external backups are separately inventoried and never silently deleted.
- Decision 0005 must explicitly authorize any local retention of actual household geometry. Transmission or Git storage of that geometry remains prohibited unless a later privacy/retention decision explicitly approves it.
- Raw and unreviewed normalized session files are separate and follow identical default safeguards: outside the repository; owner-only permissions (0700 directory and 0600 files where POSIX modes apply); a two-hour or 512 MiB cap, whichever occurs first; stop-on-quota behavior; and seven-day best-effort expiry. An unreviewed normalized session is movement history and is not a fixture.
- Interrupted or quota-ended files retain an explicit incomplete footer. Secure deletion from SSD snapshots or backups is not guaranteed and is disclosed.
- Only derived, privacy-reviewed normalized exports may enter fixtures; exporting does not extend the source session's retention. Redaction tests seed canary tokens, URLs, headers, IDs, addresses, names, dates, and room labels and require all to be absent from files, logs, and browser bundles.

## Codex team and ownership

| Chat | Role | Exclusive implementation surface after approval |
| --- | --- | --- |
| Roomabouts — Coordinator | Requirements, contracts, decisions, privacy-reviewed canonical config, integration, evidence register | Root files, packages/contracts, docs/plans/active, docs/decisions, shared fixtures metadata |
| Roomabouts — Architecture & Contracts | Advisory architecture and contract review | No direct implementation unless reassigned by coordinator |
| Roomabouts — Sensor & Replay | Live source, mapping, assembly, capture, replay fixtures | packages/ha-input, tools/capture, sanitized fixture inputs |
| Roomabouts — Tracking Core | Pure reducer and replay expectations | packages/tracking-core and colocated tests |
| Roomabouts — Map & Setup UX | Renderer, semantic map, diagnostics, privacy presentation | apps/map-studio, excluding shared bootstrap owned by coordinator |
| Roomabouts — Quality, Release & Business | Acceptance, CI review, later release/commercial gates | Review role now; no packaging or commerce implementation in this plan |
| Roomabouts — Independent Plan Review | Adversarial plan and final diff review | Read-only review unless explicitly assigned remediation |

Path-level ownership:

| Owner | Exclusive paths/artifacts |
| --- | --- |
| Coordinator | package.json, pnpm-workspace.yaml, pnpm-lock.yaml, tsconfig.base.json, .gitignore, .github/workflows/**, every package manifest, packages/contracts/**, config/canonical/one-room/**, fixtures/recordings/v1/manifest.json, apps/map-studio/src/app/**, apps/map-studio/src/presentation-adapter.ts, apps/map-studio/test/fixtures/presentation/**, docs/plans/active/**, docs/decisions/**, docs/protocols/proof-runtime.md, docs/evidence/index.md |
| Sensor & Replay | packages/ha-input/** except its manifest, tools/capture/** except its manifest, fixtures/recordings/v1/inputs/**, docs/product/sensor-validation.md, docs/evidence/sensor/** |
| Tracking Core | packages/tracking-core/** except its manifest, packages/tracking-core/fixtures/expected/**, docs/evidence/tracking/** |
| Map & Setup UX | apps/map-studio/src/display/**, apps/map-studio/src/diagnostics/**, apps/map-studio/src/privacy/**, apps/map-studio/src/replay/**, apps/map-studio/src/simulator/**, apps/map-studio/src/accessibility/**, apps/map-studio/test/display/**, apps/map-studio/test/accessibility/**, apps/map-studio/test/e2e/**, docs/evidence/ui/** |
| Quality | docs/protocols/** except docs/protocols/proof-runtime.md, docs/evidence/acceptance/**, docs/evidence/reviews/**; CI changes are proposed to and applied by the coordinator |

The coordinator creates every approved package manifest and lockfile entry before specialist worktrees begin. A specialist needing a new dependency returns the request to the coordinator. Source selection, presentation adaptation, privacy-reviewed canonical configuration, fixture metadata, and final integration remain coordinator-owned. Actual household configuration is local operator data outside Git, not a specialist-owned repository path.

Each implementation chat gets one branch/worktree only after the Wave 1 scaffold/contracts commit and explicit user authorization. Two chats never edit the same file. Contract changes return to the coordinator.

## Execution waves

### Wave 0 — Plan approval and durable governance baseline

Owner: Coordinator
Parallel work: None

Tasks:

- [ ] Add the roadmap as a repository reference and preserve this plan as the active source of truth.
- [ ] Record the independent review outcome and the user's approval or requested changes.
- [ ] Commit the governance baseline locally.
- [ ] Push only after explicit user direction.
- [ ] Attempt to register /Users/jvanbev/Documents/Codebase/Roomabouts as a Codex Git project; treat app registration as non-blocking operational setup.

Exit gate:

- User approval is recorded.
- This approval covers the plan and read-only Wave 0.5 spike only; it does not pre-approve decisions that depend on spike evidence.
- The repository has a baseline commit containing AGENTS.md, workflow guidance, this plan, the review outcome, and the pull-request template.
- Every future implementation chat can read the same committed rules and plan.

### Wave 0.5 — Lab-readiness spike before contract freeze

Owner: Coordinator with Sensor & Replay

Dependencies: Wave 0 and explicit approval for read-only Home Assistant/sensor inspection

Tasks:

- [ ] Record the exact EPL model, firmware, Home Assistant version, installation type, host architecture, browser, proposed room, rigid mount, and target display.
- [ ] Inventory the entity/device registry fields, entity IDs, units, availability, per-slot active behavior, and restart behavior without saving credentials or arbitrary HA payloads.
- [ ] Observe X/Y update ordering, unchanged-axis behavior, typical and p95 skew, duplicates, inactivity, zero values, disconnect, reboot, and rapid re-entry using a short sanitized manual protocol.
- [ ] Confirm whether filtered subscriptions are available and document the intended Home Assistant authentication path.
- [ ] Run node --version and pnpm --version. Node must be 26.13.1 and pnpm must be 11.25.0 before Wave 1; otherwise stop and request installation approval.
- [ ] Confirm separate capture and actual-household-configuration directories can be placed outside the repository with owner-only permissions and are not reachable through Git or build globs.

Evidence:

- docs/evidence/sensor/lab-readiness.md
- docs/evidence/sensor/entity-inventory.redacted.json
- docs/evidence/sensor/xy-ordering-summary.md

Exit gate:

- The actual event stream supports a defensible bounded-skew or alternate coherent-sample rule.
- Inactive, unavailable, restart, and unchanged-axis behavior are known.
- Toolchain versions are executable.
- If coherent pairing cannot be demonstrated, stop and request approval for a different ingestion boundary before freezing contracts.

### Wave 1A — Decision approval

Owner: Coordinator
Dependencies: Successful Wave 0.5 exit

Expected files:

- docs/decisions/0001-toolchain.md
- docs/decisions/0002-input-time-replay.md
- docs/decisions/0003-home-assistant-auth.md
- docs/decisions/0004-recorder-exclusions.md
- docs/decisions/0005-local-data-and-capture-retention.md
- docs/decisions/0006-single-client-privacy.md
- docs/decisions/0007-corpus-and-measurement-protocol.md

Tasks:

- [ ] Draft decisions 0001–0006 from Wave 0.5 evidence.
- [ ] Allocate immutable tuning and held-out corpora and freeze measurement procedures in decision 0007 without choosing post-tuning numeric thresholds.
- [ ] Obtain explicit user approval of decisions 0001–0007.
- [ ] Make no manifest, lockfile, dependency, CI, source, or contract implementation change during this wave.

Exit gate:

- Decisions 0001–0007 are accepted by the user.
- Unresolved Home Assistant, credential, Recorder, capture, privacy, or toolchain risk blocks Wave 1B.

### Wave 1B — Minimal scaffold and frozen contracts

Owner: Coordinator

Dependencies: Accepted decisions 0001–0007

Expected files:

- package.json
- pnpm-workspace.yaml
- pnpm-lock.yaml
- tsconfig.base.json
- .gitignore
- .github/workflows/ci.yml
- packages/contracts/package.json
- packages/ha-input/package.json
- packages/tracking-core/package.json
- apps/map-studio/package.json
- tools/capture/package.json
- packages/contracts/src/index.ts
- packages/contracts/src/sensor-input.ts
- packages/contracts/src/map.ts
- packages/contracts/src/recording.ts
- packages/contracts/src/tracking.ts
- packages/contracts/src/presentation.ts
- packages/contracts/test/

Tasks:

- [ ] Pin Node 26.13.1 and pnpm 11.25.0.
- [ ] Add strict TypeScript configuration and root scripts.
- [ ] Create only the approved workspace directories.
- [ ] Implement runtime validation at serialized boundaries.
- [ ] Add valid and invalid contract fixtures with useful record/line errors.
- [ ] Add boundary tests preventing UI or tracking from importing vendor/HA types.
- [ ] Establish deterministic test clock, ID seed, and canonical JSON hashing utilities.
- [ ] Define apply(event), advanceTo(logicalTimeMs), same-time ordering, silence advancement, and fixture timestamp omission.
- [ ] Create every approved package manifest and lockfile entry before specialist worktrees are created.
- [ ] Add CI for frozen install, type-check, tests, fixture validation, production build, secret scanning, and dependency-license reporting.

Required commands created by this wave:

    pnpm install --frozen-lockfile
    pnpm typecheck
    pnpm test
    pnpm test:replay
    pnpm fixtures:validate
    pnpm build
    pnpm check

Exit gate:

- A clean checkout installs and all required commands exit successfully.
- Invalid serialized data fails with a clear path, line, sequence, and reason.
- Identical canonical inputs hash identically.
- Dependency and license changes are visible in review.

### Wave 2 — Sensor input, scripted protocol harness, and capture

Owner: Sensor & Replay
Dependencies: Wave 1B frozen SensorInputEventV1, pose, and recording contracts

Expected files:

- packages/ha-input/src/client.ts
- packages/ha-input/src/epl-profile.ts
- packages/ha-input/src/entity-discovery.ts
- packages/ha-input/src/xy-assembler.ts
- packages/ha-input/src/protocol-harness.ts
- packages/ha-input/test/
- tools/capture/src/
- fixtures/recordings/v1/

Tasks:

- [ ] Build a scripted protocol harness limited to the Home Assistant messages exercised by the approved authentication, subscription, rename, reconnect, restart, and unavailable scenarios.
- [ ] Discover EPL entities from registries, semantic role, target slot, and unit rather than friendly names.
- [ ] Implement the Wave 0.5 evidence-backed coherent X/Y rule; never infer inactivity from (0,0) or target count.
- [ ] Clear partial buffers on inactive, unavailable, disconnect, restart, or reconnect generation.
- [ ] On every pose revision, clear X/Y partials and advance the source generation before accepting new observations.
- [ ] Add finite-value, freshness, duplicate, ordering, unit, and pose-revision checks.
- [ ] Use filtered entity subscriptions, heartbeat, bounded reconnect, resubscription, and fresh-state reconciliation.
- [ ] Implement browser and capture authentication exactly as approved: no token in URLs, arguments, logs, recordings, fixtures, or client bundles; document storage lifetime, revocation, origin, and redaction behavior.
- [ ] Back up Recorder configuration, apply exact entity exclusions, follow the approved reload/restart path, verify the database after the soak, and treat removal of pre-existing history/statistics/backups as a separate explicit decision.
- [ ] Write separate raw and normalized files. Raw and unreviewed normalized sessions remain outside the repository with owner-only permissions (0700 directory and 0600 files where POSIX modes apply), a two-hour or 512 MiB cap (whichever occurs first), stop-on-quota behavior, seven-day best-effort expiry, and an explicit incomplete footer on interruption.
- [ ] Stream allowlisted events without retaining the whole session in memory.
- [ ] Reject or mark capture gaps and incomplete sessions.
- [ ] Add replay mode, apply/advanceTo virtual time, silent-period advancement, same-time ordering, backward-seek behavior, and seeded simulator primitives.

Automated verification:

- X-before-Y, Y-before-X, unchanged axis, stale half, duplicate, out-of-order, unavailable, restart, reconnect generation, rename, and malformed-value cases.
- Live, replay, and simulator sources pass one conformance suite.
- A 1,000,000-event synthetic session completes with no more than 32 MiB RSS growth between the first and last 10 percent of processing on the recorded test host.
- Replaying at different host speeds and after seek produces the same semantic output hash.
- Seeded simulation is byte reproducible.

Hardware qualification:

- One-hour maximum-rate bench soak.
- Sensor power loss, Wi-Fi interruption, and Home Assistant restart.
- No stale observation after recovery.
- Zero unexplained capture gaps.
- High-rate coordinate entities accumulate no new Home Assistant Recorder history after exclusions are applied; existing history, statistics, and backups are reported separately and never silently deleted.

Exit gate:

- The selected physical sensor produces validated normalized events for all supported target slots.
- Automatic recovery completes within 30 seconds after Home Assistant becomes available.
- A privacy-reviewed sensor-local export is reproducible, binds the exact sensor-profile and recording-contract revisions, and contains no token, URL, entity/device ID, IP/MAC address, person name, absolute date, room label, or floor-plan asset.

### Wave 3A — Coordinate transform foundation

Owner: Tracking Core

Dependencies: Frozen SensorPoseV1 and MapConfigurationV1

Expected files:

- packages/tracking-core/src/transform.ts
- packages/tracking-core/src/validate.ts
- packages/tracking-core/test/transform.test.ts
- packages/tracking-core/test/fixtures/golden-map.json
- packages/tracking-core/test/fixtures/golden-pose.json

Tasks:

- [ ] Define xAxisYawRad as the counter-clockwise angle from global +X to sensor-local +X.
- [ ] Implement global = origin + R(xAxisYawRad) × local using meters.
- [ ] Validate finite values, pose/map hashes, room polygons, and calibration/range exclusions.
- [ ] Add golden tests at 0, 90, 180, and an arbitrary angle, plus inverse/round-trip and invalid-pose cases.

Exit gate:

- Golden transforms and validation pass with an explicitly recorded numeric tolerance.
- No screen-pixel or viewport convention enters tracking.
- Synthetic golden configurations prove the transform independently of household calibration; no household pose is created in this wave.

### Wave 3B — Physical calibration and sensor characterization

Owners: Coordinator for map contract; Sensor & Replay for measurements
Dependencies: Waves 2 and 3A

Expected files:

- config/canonical/one-room/map.json
- config/canonical/one-room/pose-revisions/
- config/canonical/one-room/policy.json
- fixtures/recordings/v1/inputs/calibration/
- fixtures/recordings/v1/inputs/one-person/
- fixtures/recordings/v1/inputs/empty-room/
- docs/decisions/0008-numeric-proof-thresholds.md
- docs/product/sensor-validation.md

Private local artifacts, never repository files:

- the actual household map, mounted-pose registry, and policy in the decision-0005 local data root;
- the allocated held-out recordings in a sealed Quality-controlled corpus directory until the Wave 4 tracking freeze.

Tasks:

- [ ] Rigidly mount the sensor; the coordinator creates the provisional actual map, mounted pose, and policy only in the owner-only local data root outside the repository.
- [ ] Give every calibration change a new immutable pose revision and hash in the private coordinator-owned registry. Evidence records the hash, not the household geometry.
- [ ] Measure a marked grid and record median error, jitter, dropout, and outside-polygon rate.
- [ ] Run three designated tuning repetitions of each walking path: centerline, perimeter, both diagonals, lateral cross, toward/away, stop/resume, and exit/re-entry.
- [ ] Run two-person parallel, crossing, close-proximity, and independent-exit cases as diagnostic evidence.
- [ ] Characterize stationary standing, sitting, reclining, furniture occlusion, and resume behavior; these are not proof-blocking unless ordinary movement fails after resumption.
- [ ] Run a 30-minute empty-room and adjoining-wall leakage test with normal HVAC, fans, doors, and curtains.
- [ ] Use only designated tuning recordings to select numeric coordinate-error, jitter, dropout, false-observation-duration, and outside-polygon thresholds.
- [ ] Create decision 0008 with those numeric thresholds and obtain user approval before running separate held-out repetitions.
- [ ] Run two held-out repetitions of every walking path and the held-out empty-room protocol without changing thresholds.
- [ ] Derive only synthetic or explicitly privacy-reviewed canonical map, pose, and policy artifacts for Git. Remove labels, addresses, absolute location, asset references, and other household identifiers; record the review and source hash without copying the private source configuration.
- [ ] Commit only sanitized tuning exports. Bind them to the privacy-reviewed canonical map, pose, policy, sensor-profile, and recording-contract hashes. A tuning fixture containing a pose change is eligible only when every referenced canonical immutable revision is present and mapped to its exact artifact/hash.
- [ ] Keep held-out recording contents outside Git and unavailable to Tracking Core until its algorithm and complete configuration are frozen and independently reviewed. The repository manifest records only opaque allocation IDs and hashes before that freeze.
- [ ] Issue a written pass, conditional pass, or fail with evidence.

Exit gate:

- Left/right and toward/away orientation are correct.
- Known marks, jitter, dropout, false-observation duration, receive intervals, and outside-polygon rate satisfy the pre-registered held-out thresholds.
- No stale or cached coordinate is emitted after inactivity, restart, or recovery.
- Empty-room and adjoining-wall observations satisfy the pre-registered sensor threshold; track and rendering behavior are not evaluated in this wave.
- Git contains no actual household geometry or held-out recording content; only privacy-reviewed canonical configuration, sanitized tuning exports, and opaque held-out hashes are present.
- If the gate fails, test one materially different placement before changing sensor model or buying additional sensors.

### Wave 4 — Deterministic tracking core

Owner: Tracking Core
Dependencies: Frozen contracts, Wave 3A transforms, approved Wave 3B tuning fixtures, and sealed held-out allocation hashes

Expected files:

- packages/tracking-core/src/clock.ts
- packages/tracking-core/src/associate.ts
- packages/tracking-core/src/lifecycle.ts
- packages/tracking-core/src/smooth.ts
- packages/tracking-core/src/reducer.ts
- packages/tracking-core/config/one-room-proof.json
- packages/tracking-core/test/
- packages/tracking-core/fixtures/expected/

Tasks:

- [ ] Implement a pure event-time reducer with injected clock and deterministic IDs.
- [ ] Consume the Wave 3A transform/validation boundary and reject impossible-speed observations without mutating tracks.
- [ ] Add bounded constant-velocity prediction.
- [ ] Add exhaustive deterministic one-to-one minimum-cost assignment for up to three observations.
- [ ] Use position, velocity, direction, boundary, and lifecycle costs; do not use source slot identity.
- [ ] Implement tentative, confirmed, coasting, fading, and removed states.
- [ ] On a pose-revision change, clear all tracks and begin a fresh deterministic track-ID generation.
- [ ] Add time-based exponential display smoothing.
- [ ] Surface uncertainty reasons and association ambiguity.
- [ ] Prevent predicted-only movement from emitting accepted trail distance.
- [ ] Tune every threshold from named comparisons against only the designated tuning corpus; no hidden constants and no inspection of held-out recording contents.
- [ ] Freeze the complete tracking configuration as canonical JSON, its SHA-256, and the exact source revision, then obtain an independent review before any held-out tracking run.
- [ ] Coordinator and Quality run the sealed held-out corpus against that exact frozen revision and configuration. Any algorithm, expected-output, or threshold change after a held-out run invalidates its result and requires a previously unused held-out subset or newly captured held-out evidence.

Required replay invariants:

- Identical replay and configuration produce identical canonical output.
- Silent-period advanceTo calls produce deterministic coast, fade, and removal transitions.
- Same-time events and deadlines follow the frozen ordering rule.
- Relabeling source slots produces no semantic change.
- One observation updates at most one track.
- Invalid observations never mutate tracks.
- Every numeric output remains finite.
- Uncertainty cannot shrink and evidence quality cannot rise during evidence-free coasting.
- One-person fixtures create one confirmed track without churn during continuous coverage.
- Crossing fixtures create no impossible-speed jump or extra persistent track.
- The one-room build cannot change rooms or floors.

Exit gate:

- All invariants pass across the designated tuning corpus before freeze and the sealed held-out corpus afterward.
- Expected-output changes include a reviewed metric diff and are never silently regenerated.
- The evidence records the frozen source revision and canonical tracking-configuration hash.
- Tuning decisions, independent review, held-out execution, invalidated runs, and remaining failure cases are recorded.

### Wave 4.5 — Presentation seam and proof runtime

Owner: Coordinator

Dependencies: Wave 4 track contract and accepted decisions 0001/0003/0005/0006

Expected files:

- apps/map-studio/src/app/source-selection.ts
- apps/map-studio/src/presentation-adapter.ts
- apps/map-studio/test/fixtures/presentation/
- docs/protocols/proof-runtime.md

Tasks:

- [ ] Map TrackSnapshotV1 into full PresentationFrameV1 snapshots with deterministic aliases and bounded accepted display paths.
- [ ] Supply contract-valid deterministic presentation fixtures before Map implementation begins.
- [ ] Implement the app bootstrap/source-selection boundary without implementing Map-owned display code.
- [ ] Make the proof runtime load validated actual map/pose/policy from the approved owner-only local data root, refuse a path inside the repository, and serve it only through the approved local origin without copying it into source, fixtures, build assets, logs, or evidence.
- [ ] Decisions 0001 and 0003 define the built-asset serving command, stable local origin, network exposure, restart behavior, and HTTP/HTTPS/WebSocket compatibility.
- [ ] Add pnpm start:proof (or the accepted equivalent) and a built-app browser/authentication smoke test. Kiosk and final acceptance never use the Vite development server.
- [ ] If Playwright was approved, the coordinator adds the dependency, lockfile change, pnpm test:browser script, and CI gate.

Exit gate:

- Sensor, replay, and simulator sources can be selected through one coordinator-owned interface.
- Deterministic PresentationFrame fixtures validate against contracts and are available to the Map worktree.
- The built application serves from the approved stable local origin, loads external local configuration without bundling it, and completes an authentication/browser smoke test.

### Wave 5 — Map, trails, uncertainty, privacy, and accessibility

Owner: Map & Setup UX
Dependencies: Wave 4.5, frozen PresentationFrameV1, and coordinator-supplied deterministic presentation fixtures

Expected files:

- apps/map-studio/src/display/
- apps/map-studio/src/diagnostics/
- apps/map-studio/src/privacy/
- apps/map-studio/src/replay/
- apps/map-studio/src/simulator/
- apps/map-studio/src/accessibility/
- apps/map-studio/test/display/
- apps/map-studio/test/accessibility/
- apps/map-studio/test/e2e/

Tasks:

- [ ] Build a responsive floor-meter-to-viewport transform with letterboxing, safe areas, capped device-pixel ratio, and inverse hit testing.
- [ ] Render explicit background, room/geometry, source health, trails, tracks, labels, status, and opt-in track/source-health diagnostic layers carried by PresentationFrameV1.
- [ ] Consume snapshots only; never import Home Assistant, vendor, slot, or raw-observation types.
- [ ] Interpolate display positions without extending lifecycle or predicting room changes.
- [ ] Emit alternating footprints by physical distance over accepted observed path; suppress stationary jitter and predicted coasting.
- [ ] Bound trail memory and visible lifetime.
- [ ] Start a new trail after a long gap or ambiguous reacquisition.
- [ ] Display confirmed, coasting, fading/last-seen, ambiguous, and offline states without relying on color alone.
- [ ] Implement the approved single-client anonymous, blank, hide-display, pause, and calibration/range-exclusion semantics.
- [ ] Pair aria-hidden Canvas with a semantic DOM view and meaningful, rate-limited announcements.
- [ ] Respect keyboard operation, visible focus, 200 percent zoom, high contrast, and reduced motion.
- [ ] On sleep/wake or missed revisions, discard expired visual state and request a full snapshot.
- [ ] Implement replay file selection, play/pause, seek, single-step, and speed controls.
- [ ] Implement seeded simulator scenario selection.
- [ ] Implement only opt-in track-level and source-health diagnostics already present in PresentationFrameV1. Normalized and transformed observation overlays are deferred.
- [ ] Keep pointer-authored scenarios and fixture export outside this plan.

Automated verification:

- World/view round trips, aspect fit, resize, orientation, DPR, and hit-testing tolerances.
- Footprint spacing, alternation, tangent orientation, stationary suppression, clipping, and fixed-clock fading.
- Full-snapshot replacement, sleep/wake, reconnect, blank, pause, anonymous, ambiguous, and offline fixtures.
- Import-boundary tests proving no sensor/vendor dependency reaches UI code.
- Deterministic visual fixtures with fixed time, fonts, aliases, DPR, and motion settings.
- Playwright checks for semantic DOM, keyboard, zoom, high-contrast settings, reduced motion, orientation, and fail-closed startup.
- Named manual protocols for VoiceOver/Safari, one additional supported screen reader, grayscale/color-deficiency review, and kiosk process memory.

Exit gate:

- At defined map anchors, background/track alignment changes by no more than one CSS pixel across portrait, landscape, 1080p/4K kiosk, and DPR 1/2/3 target cases.
- p95 render frame time is at most 33 ms on the selected minimum display with three simulated tracks; the supported live proof remains one person.
- Blank and pause never flash old visual or semantic content after reload/reconnect; startup remains blank until coordinate-free policy state loads.
- During a 24-hour kiosk run, trail object count never exceeds the TTL-derived bound, retained memory is no more than 32 MiB above the post-warm-up baseline, and the final 12-hour memory trend is no more than 1 MiB/hour on the recorded target/browser.

### Wave 6 — Integration and one-room acceptance

Owner: Coordinator

Contributors: Sensor & Replay, Tracking Core, Map & Setup UX, Quality
Dependencies: Waves 2–5

Tasks:

- [ ] Connect live, replay, and simulator sources through the same input interface.
- [ ] Map tracking output through one presentation adapter.
- [ ] Run the complete replay corpus before every live session.
- [ ] Exercise page reload, browser sleep/wake, HA restart, sensor restart, Wi-Fi loss, unavailable values, rapid exit/re-entry, and privacy changes.
- [ ] Capture named metrics and retain the evidence with build, configuration, fixture, hardware, and reviewer identifiers.
- [ ] Run an independent production-readiness audit against this plan and the raw diff.

Acceptance scenarios:

| Scenario | Duration/repetitions | Required result |
| --- | --- | --- |
| Continuous one-person walk | 15 minutes | Zero alias changes after confirmation while there is no source dropout longer than the approved expiry; no off-map prints; no impossible-speed jump; clean exit fade |
| Empty room | 30 minutes | No confirmed ghost beyond the configured expiry interval |
| Recovery | Sensor, Wi-Fi, and HA disruptions | Live resubscription within 30 seconds after HA availability; no reload; no persistent duplicate |
| Determinism | Every approved fixture, twice and at multiple speeds | Identical semantic output hash |
| Latency | Representative walk on target hardware | p95 observation-receive-to-render at most one second; source-to-render reported separately |
| Renderer | Three simulated tracks | p95 frame time at most 33 ms; this does not expand the one-person live proof |
| Privacy | History disabled and recording off | Zero persisted raw-coordinate records; bounded coordinate-free logs |
| Kiosk | 24 hours | Trail count within TTL bound; retained memory at most 32 MiB above warm baseline; final 12-hour trend at most 1 MiB/hour |

Exit gate:

- All proof-blocking acceptance scenarios pass or the plan receives an explicit user-approved exception.
- There is no actual household geometry in Git, household-data egress outside the approved local HA/client paths, hidden movement persistence, secret leakage, confident identity claim, or unsafe stale certainty.
- The independent audit has no unresolved critical or major finding.
- The one-room result receives an explicit pass, conditional pass, or fail.

## Requirement traceability

Tuning recordings and held-out acceptance recordings are distinct. Decision 0007 freezes corpus allocation and measurement procedures before capture. After the designated sensor-tuning runs, decision 0008 freezes proof thresholds before the Wave 3B held-out sensor protocols. Tracking Core may inspect only tuning content until its source revision and complete configuration hash are frozen and independently reviewed; Quality then runs the sealed held-out corpus. Failed held-out evidence cannot be reclassified as tuning evidence, and a post-run algorithm or threshold change invalidates that run.

| ID | Owner | Files/artifacts | Dependency | Numeric acceptance | Verification | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| R-01 Reproducible toolchain | Coordinator | Root manifests, lockfile, CI | Wave 0.5 | Node 26.13.1 and pnpm 11.25.0; all required commands exit 0 | pnpm check from a clean checkout | docs/evidence/acceptance/toolchain.md |
| R-02 Coherent sensor input | Sensor & Replay | packages/ha-input, Wave 0.5 summaries | Actual EPL stream | Zero emitted observations with stale/mixed half-samples in the conformance corpus | pnpm --filter @roomabouts/ha-input test | docs/evidence/sensor/input-conformance.md |
| R-03A Authentication and secret redaction | Coordinator plus Sensor & Replay | decisions 0003/0005, packages/ha-input, tools/capture | Wave 0.5 auth evidence | Zero credential in URLs, arguments, recordings, fixtures, logs, screenshots, or browser bundles; revocation test passes | Auth/revocation protocol plus seeded token/header/URL/ID canary scan of files, logs, and built assets | docs/evidence/sensor/auth-redaction.md |
| R-03B Recorder safety | Coordinator plus Sensor & Replay | decision 0004, Recorder change/rollback protocol | Verified backup and exact entity inventory | Backup recorded before change; zero new coordinate history after soak; rollback and post-rollback query pass; pre-existing history/backups inventoried separately | docs/protocols/recorder-change.md with before/after database queries | docs/evidence/sensor/recorder.md |
| R-03C Recording integrity and retention | Sensor & Replay | tools/capture, fixtures manifest, decision 0005 | Recording contract | Raw and unreviewed normalized sessions use owner-only storage, stop at two hours or 512 MiB, expire best-effort at seven days, retain valid/incomplete footer state, have zero unexplained gaps, and process 1,000,000 events within the memory-growth budget | pnpm fixtures:validate, capture permission/quota/expiry tests, canary sanitization test, and Wave 2 load-test command | docs/evidence/sensor/capture.md |
| R-04 Coordinate transform | Tracking Core plus Coordinator | transform/validation, synthetic goldens, privacy-reviewed canonical config, private source-config hash | Accepted pose convention and decision 0005 | Golden and round-trip cases within the recorded floating-point tolerance; zero unknown-pose mutations; zero actual household geometry tracked by Git | Transform tests plus canonical-config privacy review and git ls-files/config scan | docs/evidence/tracking/transform.md |
| R-05 Deterministic tracking | Tracking Core plus Quality | reducer, canonical tracking config, tuning expectations, sealed held-out corpus | Frozen source revision/config hash and independent review | Tuning invariants pass before freeze; two held-out runs at multiple host speeds yield identical semantic hash; zero double-use, non-finite output, or slot-label semantic change; any post-held-out change invalidates the run | pnpm test:replay on tuning corpus, then Quality-controlled held-out command against the recorded frozen hashes | docs/evidence/tracking/replay.md |
| R-06 Continuous movement | Coordinator | Integrated app and held-out walk | Waves 2–5 | Fifteen minutes; zero alias changes during continuous coverage; zero off-map prints and impossible-speed jumps | docs/protocols/one-person-walk.md | docs/evidence/acceptance/one-person-walk.md |
| R-07 Empty room | Coordinator | Integrated app and held-out empty fixture | Frozen expiry policy | Thirty minutes; zero confirmed ghost persisting beyond approved expiry | docs/protocols/empty-room.md | docs/evidence/acceptance/empty-room.md |
| R-08 Recovery | Sensor & Replay | Client, assembler, app integration | Approved auth/reconnect | Live data within 30 seconds of HA availability; zero stale post-recovery observation and persistent duplicate | docs/protocols/recovery.md | docs/evidence/acceptance/recovery.md |
| R-09 Privacy and persistence | Map UX plus Coordinator | privacy module, local-data/config policy, browser storage | Accepted decisions 0005/0006 | Startup remains blank until policy load; zero persisted raw-coordinate records; zero actual household geometry in Git; zero old-content flash in named cases | pnpm test:browser, git tracked-file/config scan, and docs/protocols/privacy.md | docs/evidence/acceptance/privacy.md |
| R-10 Render latency/performance | Map UX | Canvas renderer and target display | Integrated PresentationFrame | p95 receive-to-render at most 1 second; p95 frame at most 33 ms with three simulated tracks | docs/protocols/performance.md | docs/evidence/ui/performance.json |
| R-11 Kiosk memory | Map UX | Built app on minimum display | Stable integrated build | Trail count within TTL bound; retained memory at most 32 MiB above warm baseline; final 12-hour trend at most 1 MiB/hour | docs/protocols/kiosk-24h.md | docs/evidence/ui/kiosk-24h.md |
| R-12 Accessibility | Map UX | Canvas plus semantic DOM | Playwright approval | Keyboard path complete; 200 percent zoom without lost controls; all states distinguishable without color; manual screen-reader protocols pass | pnpm test:browser and docs/protocols/accessibility.md | docs/evidence/ui/accessibility.md |
| R-13 Built proof runtime | Coordinator | proof-runtime protocol, root scripts, built Map Studio assets | Accepted decisions 0001/0003/0005 and Wave 4.5 | pnpm start:proof serves the production build from the approved stable local origin; external owner-only household config loads without entering Git/build/logs; restart and built-app authentication smoke tests pass; acceptance never uses the Vite development server | pnpm build, bundle/config scan, pnpm start:proof, and docs/protocols/proof-runtime.md | docs/evidence/acceptance/proof-runtime.md |
| R-14 Source-mode controls | Coordinator plus Map UX | source-selection boundary, replay/simulator/diagnostic controls | Wave 4.5 fixtures and source conformance suite | Live, replay, and seeded simulator select through one interface; replay select/play/pause/seek/step/speed and opt-in PresentationFrame track/source-health diagnostics pass; source changes clear stale presentation state | pnpm test:browser plus source conformance and docs/protocols/source-modes.md | docs/evidence/acceptance/source-modes.md |

## Failure handling and recovery

- Contract incompatibility: stop downstream work, revise the decision and fixtures, then rebase dependent workstreams.
- Sensor failure: retain recordings and diagnostics, test one new placement, and do not buy more sensors until the gate is re-run.
- Replay nondeterminism: block integration; identify wall-clock, ordering, randomness, or serialization leakage before proceeding.
- UI performance failure: profile native Canvas first; do not add PixiJS without evidence and a dependency decision.
- Privacy failure: stop the affected milestone, purge test artifacts, document the path, add a regression test, and require independent review.
- Corrupt or incomplete capture: preserve diagnostic metadata, mark it ineligible as a fixture, and never silently repair it.
- Failed verification: form one new hypothesis, make one minimal correction, and rerun the affected and full relevant suites.

## Evidence register

Each milestone handoff records:

- source revision and dependency lock hash;
- configuration, fixture, pose, and policy revisions;
- commands, exit status, and material output;
- hardware/firmware/HA/browser details for manual checks;
- expected and observed results;
- metric files and semantic hashes;
- known limitations and residual risks;
- reviewer and next integration action.

## Risks and mitigations

| Risk | Mitigation | Stop condition |
| --- | --- | --- |
| Sensor geometry cannot support the experience | Full measured matrix and second placement | Persistent ghosts, missing paths, or latency after both placements |
| Separate HA X/Y updates produce mixed samples | Measured skew policy, freshness generations, explicit invalidation | Stale or crossed coordinates reach tracking |
| Synthetic data hides reality | Real fixtures gate every algorithm change | Replay improves while live gate regresses |
| Tuning overfits one recording | Multiple scenarios, held-out repetitions, metric comparison | Threshold only passes the training fixture |
| Slot swaps become false identity | Slots excluded from association identity | Slot relabel changes semantic output |
| Canvas excludes assistive technology | Parallel semantic DOM from first renderer | Core state unavailable without vision/color |
| Cosmetic privacy controls leak state | Authoritative privacy contract and multi-state tests | Old visual or semantic content flashes after privacy change |
| Capture or actual geometry leaks household data | Owner-only external local data, caps/expiry, canonicalization, privacy review, fixture sanitization | Token, identifier, actual room geometry, plan asset, name, or location metadata enters Git |
| Parallel chats collide | Frozen contracts, exclusive paths, coordinator-owned root | Two chats need the same file or redefine a contract |
| Scope expands before sensor proof | Non-goals and gate-driven backlog | Service, database, packaging, licensing, identity, or second sensor enters this plan |

## Later gated backlog

These are not approved by accepting this plan:

1. A2 self-service map editor and calibration onboarding.
2. A seven-day one-room household usefulness, comfort, and automatic-recovery pilot.
3. M1 second-sensor adjacent-room handoff.
4. M2a authoritative local service, coordinate-free household privacy policy, persistence, and one-room Home Assistant/Docker packaging.
5. R1 free private alpha in five to ten unrelated homes.
6. M2b multi-sensor fusion and representative multi-room pilot.
7. C2 paid founding beta after security, packaging, support, and multi-room gates.
8. Public beta and paid version 1.

Identity, cloud services, subscription features, native clients, community themes, new sensor families, installation services, and hardware manufacturing/resale remain outside the version 1 critical path unless separately approved.

## Independent plan review

First verdict: Changes requested.

Confirmed corrections incorporated:

- limited privacy authority to one fail-closed client and deferred private-area/multi-display guarantees;
- added apply/advanceTo time semantics, same-time ordering, silence advancement, and exact footer hashing;
- inserted a lab-readiness spike before contract freeze;
- moved coordinate transform implementation before physical calibration and removed tracking/UI gates from sensor characterization;
- specified authentication, Recorder backup/rollback, capture limits, expiry, redaction, and pre-existing-history handling;
- replaced broad workstream ownership with an exclusive path matrix and coordinator-owned dependencies;
- added requirement-to-file-to-command-to-evidence traceability;
- added a real browser automation decision and explicit manual accessibility protocols;
- narrowed the proof to full snapshots, a scripted HA protocol harness, one supported moving person, and no seven-day household pilot;
- kept actual household geometry and sealed held-out recordings outside Git while allowing only privacy-reviewed canonical artifacts and sanitized tuning exports;
- froze the tracking source revision and canonical configuration before Quality-controlled held-out evaluation; and
- limited UI diagnostics to the frozen PresentationFrameV1 track/source-health contract.

Final re-review: APPROVE on 2026-11-14. No unresolved critical or major findings.

## User approval record

Pending. Approval of this plan must explicitly cover the proposed dependencies, contracts, Home Assistant changes, recording/retention policy, and privacy semantics before implementation begins.
