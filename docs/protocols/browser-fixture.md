# Roomabouts offline browser fixture protocol

Status: ready for manual execution after the Phase 2 card adapter is integrated

This protocol exercises the real `radar-map-card` custom element with a dependency-free fake Home Assistant connection and synthetic `RoomaboutsSnapshotV1` messages. It does not connect to Home Assistant, a sensor, a cloud service, or an external network destination.

## Scope and acceptance boundary

The fixture verifies the browser presentation seam only:

- the card subscribes through `connection.subscribeMessage(callback, {type: "rmm/stream"})`;
- only synthetic, allowlisted `RoomaboutsSnapshotV1` messages reach the card;
- play, pause, forward step, seek, speed, scenario change, disconnect, reconnect, and card teardown are deterministic;
- generation changes and replacement connections clear presentation state before lower or reused sequences are delivered;
- service mutations fail closed;
- diagnostics are bounded and never contain service payloads.

The fixture is not the primary semantic replay pipeline. Phase 1's observation replay continues to exercise `RoomaboutsObservationV1` through fusion and backend presentation. This fixture starts at the separately approved browser presentation boundary.

## Static verification

From the repository root:

```sh
deno check --no-config \
  tests/browser/fake-hass.js \
  tests/browser/fixture-controller.js \
  tests/browser/fixtures/synthetic-scenarios.js \
  tests/browser/fake-hass.test.js

deno test --no-config tests/browser/fake-hass.test.js
```

Expected result: type checking succeeds and six tests pass with zero failures.

## Serve the fixture

Bind a standard-library server to loopback only:

```sh
cd /Users/jvanbev/Documents/Codebase/Roomabouts
python3 -m http.server 8000 --bind 127.0.0.1
```

Open exactly:

```text
http://127.0.0.1:8000/tests/browser/fixture.html
```

Do not open the file directly with a `file:` URL. ES modules require an HTTP origin. Do not bind the server to `0.0.0.0` or expose it through a tunnel.

The page's content-security policy allows same-origin scripts and images, blocks `connect-src`, objects, and base-URL replacement, and permits no external origin. The fake Home Assistant object exposes an empty entity-state table and rejects every `callService` request.

## Fixed manual viewports

Run the complete checklist at each viewport using the browser's responsive-design controls:

| Viewport | Intended check |
| --- | --- |
| `390 × 844` | portrait phone; controls remain keyboard reachable and card does not overflow horizontally |
| `1024 × 768` | tablet/dashboard; card and diagnostics remain readable |
| `1440 × 900` | desktop; full card and replay controls remain visible |
| `1920 × 1080` | wall display; map remains bounded and does not stretch diagnostics over the card |

Browser zoom must remain at 100%. Record browser name and exact version in the evidence table below.

## Controls and deterministic behavior

- **Scenario** selects one of three synthetic-only sequences. Selection replaces the fake connection and starts at frame zero.
- **Frame** seeks to an exact frame. Seeking replaces the fake connection before the selected snapshot is emitted, so an earlier sequence cannot enter an existing adapter session.
- **Speed** accepts `0.25×`, `0.5×`, `1×`, `2×`, or `4×`. It changes scheduling only; snapshot logical times remain unchanged.
- **Play/Pause** schedules frames from their semantic logical-time deltas using the injected clock abstraction.
- **Step forward** advances one frame while paused. Reverse stepping is deliberately unavailable; arbitrary backward movement uses connection-resetting seek.
- **Disconnect** pauses playback, marks the fake connection unavailable, removes all subscribers, and immediately reassigns `card.hass` so the card clears presentation state without waiting for its heartbeat.
- **Reconnect** supplies the card with a new connection object; the card must clear stale presentation state and subscribe once.
- **Remount card** removes the real custom element, waits for `disconnectedCallback`, verifies zero old subscribers, and creates a new card.

The status line reports scenario, frame, generation, sequence, logical time, speed, connection generation, and subscriber count. Bounded diagnostics retain at most 64 harness entries plus 16 local browser entries and never retain service payloads or snapshot bodies.

## Manual acceptance checklist

Open the browser console before starting and preserve a text copy of console output with the evidence. Do not add screenshots containing any non-synthetic dashboard, entity, or household data.

1. Initial load
   - The Roomabouts card registers once.
   - Status becomes `connected=true` and `subscribers=1`.
   - Diagnostics contain one `subscribed` and one `snapshot-emitted` event.
   - No `browser-error`, `unhandled-rejection`, credential, address, or external request appears.
   - Read-only mode exposes no editing toggle.

2. `Walk, hold, and fade`
   - Step from the empty reset frame to the first confirmed/observed track.
   - Step through the source-slot change; the anonymous alias remains unchanged.
   - The coasting/held and fading/last-seen frames preserve their backend lifecycle labels and do not qualify as observed trail samples.
   - The final frame contains no track and leaves no orphan presentation item.
   - Play the same sequence at `0.25×` and `4×`; semantic order and logical timestamps remain identical.

3. `Generation reset and ID reuse`
   - The first two frames retain one alias within generation A.
   - Generation B deliberately reuses the exact same opaque track ID. The reset clears all generation-A aliases and trail samples before displaying that reused ID with a different alias.
   - No inherited target or source slot is displayed as a person identity.

4. `Three anonymous tracks`
   - Exactly three anonymous tracks render without a console error.
   - All labels are the allowlisted synthetic aliases; none is presented as a named person.

5. Lifecycle and teardown
   - Seek backward with the frame control. The connection generation increments, subscriber count returns to one, and the selected frame is accepted as a fresh session.
   - Click **Disconnect**. Subscriber count reaches zero and the card clears adapted tracks/aliases/trails.
   - Click **Reconnect**. Subscriber count returns to one; it never exceeds one.
   - Click **Remount card**. Diagnostics show `teardown-ok`, followed by exactly one new subscription.
   - Repeat scenario changes and remounting ten times. Diagnostics remain bounded and no orphan subscriber remains.

6. Mutation failure
   - Read-only controls should make mutation UI unreachable.
   - If a service call is manually invoked from the fixture handle, it rejects with `Offline Roomabouts fixture is read-only` and records only the bounded domain/service names, never the payload.

## Evidence record

Copy this table into the implementation evidence or attach an equivalent text artifact. Do not mark a row passed without executing it.

| Field | Observed value |
| --- | --- |
| Git revision | _not run_ |
| Browser/version | _not run_ |
| Operating system | _not run_ |
| `390 × 844` | _not run_ |
| `1024 × 768` | _not run_ |
| `1440 × 900` | _not run_ |
| `1920 × 1080` | _not run_ |
| Console errors | _not run_ |
| Maximum subscriber count | _not run_ |
| Disconnect/remount cleanup | _not run_ |
| Notes/evidence path | _not run_ |

## Teardown

1. Pause playback.
2. Click **Disconnect** and verify `subscribers=0`.
3. Close the fixture tab.
4. Stop the loopback server with `Ctrl-C`.

The fixture itself writes no replay, snapshot, diagnostic, or credential data to local storage. The inherited card may read its existing `rmm_panel_lang` UI preference; do not treat that preference as replay evidence.

## Current limitations

- No manual browser execution is claimed by this document. The evidence table is intentionally unfilled.
- The inherited card cannot consume `RoomaboutsSnapshotV1` until the Phase 2 adapter is wired into `radar-map-card.js`; before that integration, the fixture can validate subscriptions and controls but not correct track rendering.
- Browser automation and screenshot assertions remain deferred until decision 0003 approves a complete pinned browser toolchain.
- This fixture does not verify Home Assistant administrator authorization, real WebSocket framing, Store/Recorder behavior, source entities, or sensor hardware.
- The original Roomabouts cartographic theme and footprint renderer belong to Phase 3.
