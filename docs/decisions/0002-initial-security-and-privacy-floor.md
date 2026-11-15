# 0002: Establish the initial security and privacy floor before Home Assistant installation

Status: Accepted
Date: 2026-11-15
Owners: Roomabouts coordinator and backend/hardening workstream
Related plan: `docs/plans/active/2026-11-15-rmm-fork-foundation.md`

Approval: User authorized the reviewed plan and Phase 1 implementation on 2026-11-15.

## Context

The inherited integration has several behaviors that conflict with Roomabouts' local-first, ephemeral-coordinate, and least-privilege requirements:

- unauthenticated UDP input binds to every interface by default;
- wildcard RMM-exclusive MQTT subscriptions accept unknown radar names;
- a direct-radar proxy can open outbound WebSockets to a persisted radar address;
- fused and per-radar target coordinates are mixed into persistent coordinator configuration;
- a coordinate-bearing master entity is updated every processing tick and may enter Recorder;
- full coordinator configuration, including pairing fields, is sent to normal frontend subscribers;
- a captured pairing PIN is written to logs; and
- state-changing services and WebSocket commands do not consistently require a Home Assistant administrator.

The initial personal setup needs only ordinary Home Assistant entity state supplied by ESPHome or another separately configured Home Assistant integration. It does not need RMM-exclusive UDP, MQTT, pairing, hardware-zone publishing, or direct-radar WebSockets.

## Options considered

1. Install upstream unchanged and rely on LAN trust plus manual Recorder exclusions.
2. Keep every inherited transport available behind warnings or user toggles.
3. Support Home Assistant entity state only, make exclusive transports unavailable for the first proof, separate runtime state from stored configuration, sanitize every output, and admin-gate every mutation.

## Decision

Adopt option 3 for the initial proof.

### Input and network boundary

- Home Assistant entity state is the only supported live input.
- RMM-exclusive UDP, MQTT subscriptions/publishing, automatic pairing, hardware-zone transport, and direct-radar WebSocket proxy are not registered and cannot be enabled by a default or migrated first-proof configuration.
- Designing authenticated exclusive transports is deferred to a later decision. Dormant source may remain temporarily for upstream compatibility, but no startup, service, config-flow, or WebSocket path may activate it.
- No non-admin user can cause Home Assistant to open an outbound radar connection or publish a hardware command.

### Runtime and persistence boundary

- Persistent coordinator data contains configuration only.
- Live per-radar and fused targets live under an explicitly ephemeral runtime container in `hass.data[DOMAIN]` and are never inserted into coordinator configuration.
- The authenticated stream presenter combines an allowlisted configuration view with ephemeral runtime targets without mutating either source.
- Stored-data version 2 strips legacy `maps.*.targets`, `radars.*.targets`, and other runtime-only fields during migration. Migration requires a backup, evidence, and rollback procedure.
- `sensor.rmm_<map>_master` is retained for compatibility but contains only an active count and approved coordinate-free metadata. Target lists are delivered only over the authenticated in-memory stream.
- Zone count and occupancy entities remain coordinate-free.
- Roomabouts retains no raw or fused movement history. Source coordinate entities are inventoried and explicitly excluded from Recorder before live sensor testing.

### Read boundary

- Coordinate-bearing `RoomaboutsSnapshotV1` subscriptions are available only to a verified Home Assistant administrator in the first proof.
- The authorization check completes before a dispatcher listener is installed or any map, target, source, or configuration data is returned.
- Coordinate-free count and occupancy entities remain available under normal Home Assistant entity permissions.
- Delegated viewer and non-admin kiosk access require a later privacy/authorization decision; the first proof does not silently trust every authenticated Home Assistant user.

### Secret and authorization boundary

- Pairing PINs, tokens, radar addresses, and equivalent administrative values never enter normal logs, presentation streams, browser state, recordings, screenshots, or fixtures.
- Every state-changing service and WebSocket operation requires a verified Home Assistant administrator and fails closed for missing or unauthorized user context.
- Imported configuration uses an explicit schema and allowlist with bounded sizes and numbers. Runtime-only keys, credentials, and network destinations are rejected rather than persisted.

## Consequences

Normal ESPHome/Home Assistant sensor input remains available. Inherited RMM-exclusive hardware features are deliberately unavailable in the first Roomabouts proof. Reintroducing them requires a separate threat model, protocol decision, authentication design, and test plan.

Moving target state out of coordinator configuration requires a storage migration and a stream adapter. Undocumented consumers of coordinate-bearing master attributes will no longer work; the supported card uses the authenticated stream instead. This is an intentional privacy boundary, not a temporary Recorder workaround.

## Verification

- Default and migrated configurations register no RMM-exclusive MQTT wildcard subscription, UDP socket, pairing/hardware command, or direct-radar proxy.
- Unknown or spoofed MQTT/UDP input cannot mutate runtime state because those inputs are unavailable.
- A non-admin or missing-user request for every mutating service/command fails with no storage, MQTT, runtime, or network side effect.
- An administrator can subscribe to coordinate snapshots; a non-admin or missing-user subscriber is rejected before listener installation and receives no map geometry, target, source, configuration, or credential data.
- Seeded PIN/token/address canaries are absent from logs, stored configuration, presentation snapshots, browser state, fixtures, and screenshots.
- A seeded version-1 store migrates to version 2 without any `targets` or other runtime-only field; rollback from the backup is exercised.
- Running tracking and then saving configuration leaves the stored JSON free of coordinate canaries.
- The master entity exposes only the approved count and coordinate-free metadata.
- The authenticated stream still delivers live targets, and zone count/occupancy entities continue to work.
- Phase 4 storage/Recorder evidence proves Roomabouts-created state and storage are coordinate-free; Phase 5 separately proves source-coordinate Recorder exclusions with a live sensor.
