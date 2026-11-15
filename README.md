# Roomabouts

Roomabouts is a local-first, enchanted-cartographic home map for Home Assistant. It turns X/Y-capable presence-radar entities into a live spatial view while keeping movement coordinates ephemeral.

> **Development status:** Roomabouts is a personal prototype under active implementation. Do not install this branch on a primary Home Assistant instance yet. The first supported installation will follow the documented storage, authorization, and Recorder checks on a backed-up test instance.

## First proof

The initial proof is intentionally narrow:

- one room, one floor, one X/Y-capable mmWave sensor, and one moving person;
- Home Assistant entity state as the only live input;
- synthetic replay for development before hardware arrives;
- an administrator-only in-memory coordinate stream;
- coordinate-free count and occupancy entities for normal Home Assistant state;
- original Roomabouts cartography and anonymous, session-scoped tracks.

The first proof does **not** support direct radar WebSockets, RMM hardware pairing, UDP listeners, hardware MQTT commands, BLE identity, UWB, named-person tracking, cloud accounts, telemetry, or remote access.

## Home Assistant compatibility

Roomabouts is built as a compatible fork of Radar Map Manager. To avoid a risky migration before the experience is proven, these internal identifiers remain unchanged:

- integration domain and storage key: `radar_map_manager`;
- component directory: `custom_components/radar_map_manager`;
- frontend resource path: `/radar_map_manager/`;
- custom element: `radar-map-card`;
- release archive: `radar_map_manager.zip`.

The displayed product, repository, documentation, and future visual treatment are Roomabouts.

## Privacy and security boundary

The implementation is being hardened before live installation:

- persistent storage contains configuration, never raw or fused targets;
- legacy runtime coordinates, credentials, and direct-network settings are removed by a versioned migration;
- state-changing actions and coordinate subscriptions require a verified Home Assistant administrator;
- live, replay, and synthetic inputs cross the same versioned observation contract;
- exclusive UDP, MQTT, pairing, hardware publishing, and direct-radar transports are unavailable in the first proof;
- real source-coordinate entities must be excluded from Recorder before sensor testing.

See [decision 0002](docs/decisions/0002-initial-security-and-privacy-floor.md) for the approved boundary. Passing unit tests does not replace the later Home Assistant storage and Recorder verification protocols.

## Development

The active implementation source is [the fork foundation plan](docs/plans/active/2026-11-15-rmm-fork-foundation.md). The project uses small owned workstreams, isolated Git worktrees, explicit decisions, independent review, and evidence-based gates; see [the engineering workflow](docs/engineering/workflow.md).

The dependency-free local quality gate uses Python 3.14.3 and Deno 2.6.9:

```sh
python3 -m compileall -q custom_components/radar_map_manager tests/python
python3 -m unittest discover -s tests/python -p 'test_*.py'
deno check --no-config custom_components/radar_map_manager/www/*.js tests/js/*.js
deno test --no-config tests/js
```

Home Assistant-dependent behavior is verified later in a named, backed-up test-instance protocol. Browser automation and its package toolchain are deliberately deferred to a separate approved decision.

## Upstream and license

Roomabouts preserves the Git history and MIT license of [Moe8383/radar_map_manager](https://github.com/Moe8383/radar_map_manager), the project that supplied the original Home Assistant integration, editor, fusion engine, and renderer. Fork-specific work must not be presented as if those foundations were authored from scratch.

Upstream synchronization is documented in [docs/engineering/upstream-sync.md](docs/engineering/upstream-sync.md). The `rmm-upstream` remote is fetch-only locally so Roomabouts changes cannot be pushed to the upstream repository by mistake.

Roomabouts remains licensed under the [MIT License](LICENSE).
