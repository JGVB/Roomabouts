# Storage and persistence verification protocol

Status: **written, not yet executed against a Home Assistant instance**

This protocol verifies the Roomabouts stored-data version 2 boundary. It is a
Phase 4 gate and must run on a disposable or fully backed-up Home Assistant test
instance before a personal live installation. Do not use household movement data
or a production Home Assistant instance for the seeded migration exercise.

## Contract under test

- The protected Home Assistant storage key remains `radar_map_manager`.
- The Home Assistant storage envelope migrates from major version 1 to 2 through
  `RoomaboutsStore._async_migrate_func`.
- The stored object has `data.version: 2` and contains configuration only.
- `maps.*.targets`, `radars.*.targets`, fused/source history, live-data caches,
  generations, sequences, and other runtime keys are absent.
- Legacy pairing/auth/capability state, credential keys, and direct network
  destinations are absent, including compact or camel-case aliases.
- Legacy `enable_udp`/`udpPort`, `stream_mode`, MQTT-prefixed fields,
  WebSocket/direct-radar fields, and radar-scoped generic `port` values are absent.
- Live per-source and fused targets exist only in
  `hass.data["radar_map_manager"]["runtime_state"]` and disappear on unload or
  Home Assistant restart.
- Saving configuration after synthetic tracking cannot add coordinates back to
  `.storage/radar_map_manager`.

The migration is intentionally fail-closed. An unsupported envelope version or a
load/migration failure must prevent integration setup without replacing the
existing file. The integration does not create its own backup because doing so
would duplicate sensitive legacy coordinates; the operator backup below is a
hard prerequisite.

## Evidence record

Create an evidence directory outside this repository with owner-only permissions.
Record these values before starting:

| Field | Required value |
| --- | --- |
| Home Assistant Core version | exact version/build |
| Installation type | HA OS, Container, Core, or Supervised |
| Roomabouts commit | full Git SHA |
| Test instance identifier | non-secret local label |
| Test start/cutoff time | timezone-qualified timestamp |
| Full backup artifact | name, creation time, size, checksum |
| Storage-file backup | path, size, checksum, mode/owner |
| Evidence owner/path | local, access-controlled, outside Git |

Evidence may contain key names, counts, checksums, and pass/fail results. It must
not contain PINs, tokens, addresses, raw/fused coordinates, unredacted storage
files, or screenshots showing them.

## Backup prerequisite

1. Stop synthetic processing and disable automatic integration reloads.
2. Create a full Home Assistant backup using the installation's supported backup
   mechanism. Include configuration and `.storage`.
3. Stop Home Assistant cleanly before copying an individual storage file.
4. Copy `<config>/.storage/radar_map_manager` to the protected evidence location.
   Preserve its mode and owner; restrict the evidence directory to its owner
   (`0700`) and the file to its owner (`0600`) where supported.
5. Compute and record a SHA-256 checksum for both backup artifacts.
6. Start Home Assistant again without installing the candidate component and
   confirm the original instance still loads. Stop it before seeding the test.

If either backup is missing, unreadable, or cannot be restored in a disposable
copy, stop. Do not run the migration.

## Seeded v1 test data

Use a copied/disposable instance. Seed a valid Home Assistant Store envelope with
major version 1 and synthetic configuration only. Include distinctive, obviously
synthetic canaries in all legacy paths:

- `maps.default.targets` and a second map's `targets`;
- `radars.synthetic-radar.targets`;
- root `live_data`, `track_history`, generation, sequence, and logical-time keys;
- `auth_passed`, `capabilities`, `device_pin`, `devicePin`, `radar_ip`,
  `radarIp`, `apiKey`, and `networkDestination`;
- coordinate canaries that do not resemble real measurements.

Keep a list of canary strings in the protected evidence record, not in Git. Do
not seed a real PIN, address, token, or capture.

## Migration procedure

1. With Home Assistant stopped, replace only the disposable instance's
   `.storage/radar_map_manager` with the seeded v1 envelope. Retain the wrapper's
   exact `key` value.
2. Install the candidate `custom_components/radar_map_manager` tree and record
   its commit SHA.
3. Start Home Assistant and load the integration once.
4. Record startup log lines that identify successful migration, excluding any
   payload values. There must be no credential, address, or coordinate canary in
   logs.
5. Stop Home Assistant cleanly so pending storage writes finish.
6. Inspect the JSON structurally. Record the envelope version, `data.version`,
   allowed top-level keys, and the count of removed-key matches. Do not copy the
   full JSON into evidence.

Expected result:

- envelope `version` is `2`;
- stored `data.version` is `2`;
- maps, zones, safe map config, radar map assignment, layout, pause state, and
  monitor-zone configuration remain;
- every seeded runtime/target/credential/network canary and key is absent;
- the integration loads and a second restart does not perform another migration.

## Post-tracking save check

1. Start the instance and feed the reviewed synthetic replay through
   `RoomaboutsObservationV1`; do not enable UDP, MQTT hardware topics, pairing,
   or direct radar WebSockets.
2. Confirm the authenticated in-memory snapshot contains a moving synthetic
   track and the coordinate-free master/count entities update.
3. Trigger each normal configuration save path used in the proof: radar layout,
   zone configuration, map configuration, and pause state.
4. Stop Home Assistant cleanly and inspect `.storage/radar_map_manager` again.
5. Search decoded keys and values for all synthetic coordinate/runtime/secret
   canaries. Record zero matches plus the resulting file checksum.
6. Restart once more. Confirm no previous track, alias, trail, generation, or
   source-health value is restored from storage.

Any coordinate/runtime canary in storage is a failure even if the UI works.

## Failure and rollback

Stop immediately if migration fails, a canary appears in logs/storage, the store
is rewritten empty, or safe configuration disappears.

1. Stop Home Assistant. Do not attempt repeated migration starts against the only
   copy of the failed store.
2. Preserve the failed test artifact in the protected evidence directory with a
   checksum; do not commit or share it.
3. Remove the candidate component.
4. Restore the individual storage-file backup with its original owner/mode, or
   restore the full Home Assistant backup if any other state changed.
5. Start Home Assistant and verify the pre-test integration/configuration state.
6. Record the failure point, observed result, rollback artifact/checksum, and
   restored result. Open a defect without attaching sensitive files.

Successful rollback is part of the gate. If rollback was not exercised on the
disposable instance, this protocol is incomplete.

## Completion record

The executor must append an external, timestamped result containing each step's
expected and observed outcome, exact Home Assistant/Roomabouts versions, backup
and final checksums, restart results, and an explicit PASS/FAIL. Until that record
exists, only the dependency-free migration unit tests are verified; real Home
Assistant persistence remains unverified.
