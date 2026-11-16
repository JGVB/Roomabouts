# Phase 3 visual specification: Field Ledger

Status: Accepted
Date: 2026-11-15
Applies to: Roomabouts read-only map presentation only
Related decision: `docs/decisions/0003-browser-test-toolchain.md`

Approval: Accepted by the user on 2026-11-15 together with decision 0003. Any architectural change returns to an explicit approval boundary.

## Direction and boundary

Field Ledger is a warm, practical survey notebook: measured drafting lines, muted mineral colors, explicit tracking states, and abstract route marks. It is not a fantasy prop. The inherited technical editor keeps its existing visual language; Phase 3 changes only the read-only Roomabouts map.

The defining composition is:

1. a bounded paper field with a quiet drafting grid;
2. simple configured-zone polygons and labels drawn from the sanitized map snapshot without pretending they are walls or rooms;
3. restrained survey-station markers with source health shown without sensor IDs;
4. anonymous track markers whose shape and wording expose uncertainty; and
5. short-lived abstract survey steps emitted only by confirmed observations.

The visual/theme layer initiates no network request. It uses no external font, raster background, remote image, random texture, or URL-bearing style. The already-authorized Home Assistant snapshot stream is the data source and remains outside that prohibition; Field Ledger does not add, redirect, or widen it.

## Semantic tokens and measured contrast

`roomabouts-theme.js` exports one frozen token object and mirrors it to `--roomabouts-*` custom properties on the read-only root.

| Token | Value | Purpose | Required contrast |
| --- | --- | --- | ---: |
| `surfacePaper` | `#E7DDC5` | map field | — |
| `surfacePaperDeep` | `#D6C7A4` | subtle field edge/depth | 1.24:1 vs paper; decorative only |
| `ink` | `#242621` | primary outline and text | 11.31:1 vs paper |
| `inkMuted` | `#555448` | secondary text | 5.66:1 vs paper |
| `lineRegion` | `#766A56` | configured-region boundary | 3.92:1 vs paper |
| `lineGrid` | `#9E8D6E` | decorative drafting grid | 2.40:1 vs paper; decorative only |
| `stateObserved` | `#0B625D` | confirmed observed fix | 5.33:1 vs paper |
| `stateHeld` | `#745B17` | coasting or held position | 4.78:1 vs paper |
| `stateLastSeen` | `#665D4E` | fading or last-seen position | 4.80:1 vs paper |
| `stateOffline` | `#4F5960` | offline source station only | 5.31:1 vs paper |
| `stateAttention` | `#922F2B` | neutral posture event | 5.84:1 vs paper |
| `focus` | `#005EA8` | keyboard focus | 4.91:1 vs paper |
| `labelBackground` | `#242621` | anonymous alias chip | — |
| `labelText` | `#FFF8E8` | alias text | 14.44:1 vs label background |

Normal text meets WCAG 2.2 AA contrast of at least 4.5:1 against its intended background. Essential non-text state outlines, configured-region boundaries, and focus indicators meet at least 3:1. Decorative grid/fiber lines may be lower contrast because they encode no information.

Essential tokens remain at 100% opacity directly over `surfacePaper`; no fiber, gradient, transparency, or inherited background may sit between a measured pair. `surfacePaperDeep` is restricted to decorative border/shadow areas that cannot sit behind essential content. The paper-colored focus separation halo makes `focus` directly adjacent to its measured `surfacePaper` background.

## Typography and copy

- Map/region labels: `ui-serif, Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif`.
- Controls and state copy: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Diagnostics only: `ui-monospace, "SFMono-Regular", Consolas, monospace`.
- Alias labels use `clamp(0.75rem, 0.55rem + 0.35vw, 1rem)` and remain legible at 200% text enlargement.
- Use sentence case and moderate weights. Do not use all-caps display headings, downloaded fonts, handwriting, blackletter, faux calligraphy, or distressed type.
- Neutral map copy includes `Roomabouts`, `Field view`, `Survey station`, `Observed`, `Held`, `Last seen`, `Unconfirmed`, `Online`, `Degraded`, `Offline`, `Paused`, and `Health unknown`.

## Procedural surface and inherited-style isolation

- Use a solid paper base plus deterministic, low-opacity `repeating-linear-gradient` drafting lines.
- An optional fiber suggestion may use two fixed crossing gradients, each no more than 6% opacity.
- Configured-region boundaries are 1.5–2 CSS px solid survey lines with simple corner/tick details.
- Field Ledger read-only mode ignores and clears inherited `config.style`, `config.bg_image`, `fused_color`, per-zone colors, target colors, radar colors, and any other arbitrary visual override. It never parses or evaluates `url()` from configuration.
- For a read-only config, `radar-map-card.setConfig()` constructs a typed allowlisted copy before assigning `this.config`, calling `RadarUI.render()`, or reaching any inherited style/image sink. Unsafe visual keys never enter the live Field Ledger config; clearing after render is not an acceptable control. Non-Field-Ledger editor behavior remains outside this Phase 3 path.
- Field Ledger uses a dedicated read-only subtree with `.roomabouts-track`, `.roomabouts-step`, `.roomabouts-station`, and `.roomabouts-zone` plus typed `data-lifecycle` and `data-position-basis` attributes. It does not reuse inherited `.dot`, `.trail-dot`, fall badge/banner, heading arrow, WebSocket-status, editor-panel, or old trail visuals.
- Both DOM and Canvas consume the frozen theme tokens directly. The read-only mode hides inherited status/editor visual layers without broad `!important` rules and without changing the inherited editor stylesheet.
- Every snapshot/config-derived label—including zone names—uses `textContent` and safe `createElement`/`createElementNS` construction. Data-bearing `innerHTML`, `outerHTML`, and `insertAdjacentHTML` are prohibited; SVG attributes receive only validated numeric/enumerated values.
- Existing inherited visual behavior remains unchanged outside Field Ledger mode.
- Hostile configuration tests install the request observer before `setConfig()` and cover inline CSS, encoded and mixed-case `url()`, same-origin and remote image URLs, neon token overrides, headings/trails enabled, a posture event, both render modes, and zone/target/radar colors. Hostile zone names include markup, event handlers, SVG/image elements, and URL-bearing attributes. Tests require literal text, zero injected nodes/event handlers/request attempts, no altered token or inherited class, and no glow, pulse, emoji, alarm copy, heading, fall banner, or old trail.

## Configured geometry and source stations

The sanitized snapshot's zone arrays are configured regions, not a floor plan. `include_zones` use a solid configured-region outline, exclude zones a sparse technical hatch, entrance zones a dashed region outline, and stationary zones a restrained stipple. Phase 3 never infers walls, rooms, doors, household structure, or architectural meaning from a zone type or name. True wall/room geometry requires a future contract revision and approval. Every informational distinction is paired with a label or accessible description.

Geometry rules are fail-closed:

- A polygon renders only when it has at least three finite points.
- The stage is a clipped `0 0 100 100` field. Polygon coordinates are not clamped, normalized, completed, or fabricated. A deterministic Sutherland–Hodgman intersection may be computed solely to decide visible area and label placement; the source geometry remains unchanged.
- A fully out-of-field polygon has no in-field label. A partially clipped polygon receives a label only when a finite centroid of its nondegenerate clipped intersection is also inside that intersection; otherwise the label is omitted rather than moved misleadingly.
- A source station renders on the map only when both `layout.origin_x` and `layout.origin_y` are explicitly present, finite, and inside the closed `[0,100]` field. The read-only renderer never substitutes `(50,50)`, clamps an origin, or invents another position.
- A source with a missing, partial, nonfinite, or out-of-field origin appears only in the single anonymous summary such as `2 unplaced/off-field sources`; it receives no marker.
- Read-only geometry/stations have `pointer-events: none`, no editor handle class/data, no mutation listener, and no opaque source ID in visible or accessible text.

Station health uses an internal exact `sensorId` join between sanitized map radars and sanitized `sourceHealth`; the key is never rendered. Duplicate source records are already rejected by the production validator. For display, the conservative health precedence is `offline` over `degraded` over `online`; no matching health record derives `Health unknown`. Stations receive `Station 1`, `Station 2`, and so on from sanitized `map.radars` order; that stable frame-local label reveals no source key. `paused` is an independent map flag, not a health value: a paused station says `Paused — <health>` and uses a pause mark while retaining the joined health shape/wording.

A `sourceHealth` record without an exact radar match is classified only as unmatched; it receives no station number or marker. Missing/partial/nonfinite/off-field radar origins are classified as unplaced/off-field. At most one semantic summary item combines nonzero categories using the exact clauses `Unplaced or off-field stations: N` and `Unmatched source health: N`, separated by a semicolon when both occur; zero clauses are omitted. A placed radar with no health match remains a station and says `Health unknown`.

Station grammar is separate from track grammar:

| Source state | Marker | Required wording |
| --- | --- | --- |
| online | continuous circular station ring | `Survey station — Online` |
| degraded | dashed station ring | `Survey station — Degraded` |
| offline | square station with diagonal slash | `Survey station — Offline` |
| missing health | dotted square station | `Survey station — Health unknown` |
| paused qualifier | two short pause bars added to its health marker | `Paused — <health>` |

Tests cover missing/partial origins, exact-boundary/just-outside/far-outside origins, missing and unmatched health, paused stations in every health class, short polygons, nonfinite points, and partially/fully out-of-field polygons and labels.

## Track-state grammar

Every fixture frame passes `validateRoomaboutsSnapshot()` before adapter ingestion and rendering. No visual-only lifecycle enum is permitted.

| Valid track facts | Marker | Required wording | Footprints |
| --- | --- | --- | --- |
| `confirmed` + `observed` | solid center fix in a continuous ring | anonymous alias; `Observed` | eligible only when `emitFootprint` is also true |
| `tentative` + `observed` | dotted double ring | `Unconfirmed` | none; reset anchor |
| `confirmed` + `interpolated` | hollow dotted ring | `Estimated — not directly observed` | none; reset anchor |
| `coasting` + `held` | hollow dashed ring | `Held — not currently observed` | none; reset anchor |
| `coasting` + `interpolated` | hollow dash-dot ring | `Estimated — not currently observed` | none; reset anchor |
| `fading` + `last-seen` | segmented ring with one clock-like tick | `Last seen — not current` | none; reset anchor |

An ambiguous synthetic case is encoded as lifecycle `tentative` with uncertainty `source-unverified`; `ambiguous` is not a lifecycle. `offline` is never a track lifecycle or track marker. Source loss can make a track tentative/coasting/fading according to the validated snapshot, while the separate source station carries offline health.

Uncertainty reasons augment bounded accessible wording but never invent or replace a lifecycle. Posture is an orthogonal adjunct: use a sober rust badge with `Posture event` or `Suspected posture`. It cannot alter lifecycle, position basis, source health, or footprint eligibility. Do not use alarm copy, life-safety claims, emoji, glow, or pulsing.

## Accessible representation and read-only input behavior

A dedicated bounded `#roomabouts-semantic-layer` with `role="list"` is the single accessibility representation for configured regions, tracks, and stations in both DOM and Canvas modes. Its containing element has explicit `role="region"` and `aria-label="Roomabouts field view"`.

- It contains exactly one `role="listitem"` per accepted track, one per placed station, and one per valid configured region from the four map-zone arrays, plus at most one summary that combines every missing-origin, off-field, and unmatched source. Its frozen maximum is `maxTracks + maxRadars + (4 × maxZonesPerKind) + 1 = 128 + 64 + 512 + 1 = 705`. It is synchronized only on accepted adapter results and semantic changes, not through a high-frequency `aria-live` region.
- Track entries contain only the anonymous alias, exact lifecycle wording, position basis, posture, and bounded uncertainty wording. Station entries contain only the frame-local station label, health, and paused qualifier. Neither contains `trackId`, `sensorId`, `sourceRefs`, coordinates, or raw diagnostics.
- Region entries contain the exact type wording `Included region`, `Excluded region`, `Entrance region`, or `Stationary region`, followed by the optional literal name and one of `Inside field`, `Partially clipped`, or `Outside field — not shown`. They contain no points, coordinates, array indices, colors, delays, or internal IDs. A region with fewer than three finite points or a degenerate zero-area polygon is omitted visually and semantically; every other validated configured region receives one item, including a fully outside region whose visual/label is omitted.
- It uses a standard visually-hidden clipping pattern (`position: absolute`, one-pixel box, overflow clipped, and `clip-path: inset(50%)`), not `display:none`, `visibility:hidden`, `aria-hidden`, or off-screen kilometer positioning.
- Visual DOM markers, Canvas, SVG geometry, drafting grid, and footprints are `aria-hidden="true"` so the semantic layer is not duplicated.
- An accepted track outside the field remains one semantic item with bounded `Outside field` wording while its visual is clipped, consistently in CSS and Canvas. Empty/reset/removal/teardown removes stale entries immediately.

Within `.roomabouts-readonly`, `#click-layer`, `#svg-canvas`, `#rmm-canvas`, `#dots-layer`, and `.roomabouts-visual-layer` have `pointer-events: none` and `touch-action: auto`; the map root also restores `touch-action: auto`. Read-only mode installs no `preventDefault`, pointer capture, drag cursor, editor listener, or wheel interception. Map content is noninteractive, and normal page panning/scrolling must work across the card. Outside `.roomabouts-readonly`, inherited editor input behavior is unchanged. Tests assert computed pointer/touch styles, the `region` landmark, the exact 705-item maximum, identical CSS/Canvas semantic-list items, named/unnamed/inside/partially clipped/outside/degenerate region behavior, out-of-field track wording, cleanup, zero exposed source IDs, wheel scrolling, and a phone-sized vertical drag beginning over the map that scrolls the surrounding fixture page.

## Original survey-step glyph

The footprint is an abstract technical route mark, not a realistic shoeprint:

- a 7×13 CSS-pixel glyph at device scale factor 1, made from one rounded forefoot lozenge and one short offset heel block;
- one shallow inward notch, mirrored to distinguish left and right;
- no toes, tread, laces, paw pads, or borrowed silhouette;
- mineral teal/ink treatment rather than black calligraphic ink;
- rotated to the sampled path tangent; the renderer offsets it four CSS pixels left/right from the projected centerline.

### Frozen footprint constants

| Constant | Value |
| --- | ---: |
| centerline spacing | `4` map-layout units |
| discontinuity threshold | `25` map-layout units, strictly greater than |
| maximum observation gap | `2000 ms`, strictly greater than |
| coordinate epsilon | `0.000001` map-layout units |
| lateral screen offset | `4` CSS px |
| glyph size | `7 × 13` CSS px |
| first emitted side | left |
| per-observation emission cap | `8` records |
| per-owner cap | `16` records |
| global cap | `96` records |
| expiry | exactly `6000 ms` |

Changing any constant requires updating and re-accepting this specification and the golden manifest before implementation continues.

### Deterministic sampling algorithm

Sampling uses Euclidean distance in `map-layout` coordinates. Unequal viewport aspect ratios affect projection and the four-pixel visual lateral offset only; they never change centerline sampling records.

For each internal owner within one generation, keep the last eligible coordinate, residual distance since the last emitted centerline step, next side, and last accepted observation key. The first eligible observation seeds the anchor with residual `0` and emits nothing.

For an eligible segment from `A` to `B`:

1. Let `L = hypot(B.x - A.x, B.y - A.y)`.
2. An exact duplicate observation is a no-op. A later observation with `L <= 0.000001` updates ordering metadata but preserves the anchor, residual, and next side; it emits nothing and has no heading.
3. If the observation-time gap is greater than `2000 ms` or `L > 25`, reseed at `B`, set residual to `0`, and emit nothing.
4. Otherwise set `needed = 4 - residual`. While the remaining segment length plus the fixed epsilon is at least `needed`, emit a centerline record at that interpolated point with the normalized segment tangent and current side; alternate the side, continue from that point, reset residual to `0`, and set the next `needed` to `4`.
5. Add the final unconsumed segment length to residual and set the anchor to `B`. If a segment could exceed eight emissions, reject it and reseed at `B` without allocation; the frozen distance/discontinuity constants normally make that guard unreachable.

The observation dedupe/order key contains `generationId`, snapshot `sequence`, internal `trackId`, `observedAt`, and exact finite coordinates. `observedAt` is used only for ordering, gap detection, and deduplication, never for expiry. Within a generation, an out-of-order or equal-time non-duplicate sequence/observation, nonfinite value, invalid coordinate space, or invalid lifecycle combination is rejected, clears that owner's anchor to prevent a stale bridge, and emits nothing. An `observe()` call that detects a regressing presentation clock rejects the current observation and resets the complete store; only the next eligible observation may seed a new anchor.

Each emitted immutable record is exactly `{ ownerId, x, y, rotationDeg, side, createdAtMs, expiresAtMs, ordinal }`. `ownerId` is a private generation-scoped store key derived from the accepted internal track key and never leaves the module's render path. `x`/`y` are centerline map-layout coordinates; `side` is `left` or `right`; the renderer applies the four-CSS-pixel normal offset. With the glyph's forward axis pointing up, `rotationDeg = atan2(dy, dx) × 180 / π + 90`. The injected monotonic presentation clock supplies `createdAtMs`, `expiresAtMs` is `createdAtMs + 6000`, and `ordinal` is a generation-local monotonic tie-breaker.

### Non-square projection policy

The inherited stage keeps its nonuniform `0 0 100 100` projection (`preserveAspectRatio="none"`). A stored map-space angle must never be applied directly to a screen glyph. Both DOM and Canvas use one pure projection helper:

1. For a rendered CSS content box of finite positive width `W` and height `H`, project the centerline to `screenX = x × W / 100`, `screenY = y × H / 100`.
2. Recover map tangent angle `a = (rotationDeg - 90) × π / 180`, then map tangent `(mx,my) = (cos(a), sin(a))`.
3. Apply the nonuniform projection: `(px,py) = (mx × W / 100, my × H / 100)`; normalize to screen tangent `(tx,ty)`. A zero/nonfinite box or norm renders no glyph.
4. Display rotation is `atan2(ty,tx) × 180 / π + 90`.
5. In screen coordinates where positive Y points down, the left normal is `(ty,-tx)` and the right normal is `(-ty,tx)`. Multiply the chosen normal by exactly four CSS pixels and add it to the projected centerline. Canvas applies its backing-store scale only after this CSS-pixel calculation.

Resize recomputes only the projected position/orientation/offset from immutable records. It never resamples or changes record order. Portrait, landscape, and live-resize tests compare DOM and Canvas helper output for center, rotation, side, and four-pixel offset.

The injected presentation clock is required to be monotonic and is independent of replay `logicalTimeMs`. The store records the latest clock value accepted by `observe()`, `reset()`, or its expiry callback. `visible(now)` returns an immutable `{ ok: true, records }` with records where `now < expiresAtMs`. If `now` is less than the last accepted clock value, it returns immutable `{ ok: false, reason: "clock-regression", records: [] }`; it never mutates or permits an old record to revive. The coordinator must call explicit `reset()` before any subsequent rendering/observation. Backward replay seek therefore resets/replaces the connection and footprint store before rendering the older logical frame.

`visible(now)` never advances, alternates, reseeds, expires, or otherwise mutates the sampler. A regression detected by `observe()` rejects that observation and performs the documented store reset; the following eligible observation is the new seed. Clearing/reseeding happens only in `observe()` or explicit `reset()`, never in a render call. Per-observation, owner, and global bounds are checked before allocation. Owner and global caps evict the oldest record deterministically by `createdAtMs`, then `ordinal`.

The store also receives injected `setTimeout`/`clearTimeout` scheduler functions and owns at most one cleanup timer for its earliest record. Emission, eviction, or removal cancels/rearms that timer when the earliest deadline changes. Logical visibility still ends exactly at `6000 ms` through `visible(now)`, even if a browser suspends/throttles callbacks.

Physical deletion is best-effort at the deadline: the timer requests cleanup, and the store deletes all expired records on the first timer callback, accepted-snapshot `observe()`, explicit visibility/resume hook, `reset()`, or `destroy()` at or after that deadline. The coordinator calls the explicit store cleanup hook on `visibilitychange` to visible and `pageshow`; render, resize, and screenshot paths do not. Cap eviction, owner removal, replacement, reset, clock-regression reset from `observe()`, and `destroy()` cancel obsolete handles. A suspended process may therefore retain at most the already-bounded 96 private coordinate records in memory beyond six wall-clock seconds until the first allowed cleanup trigger; they remain logically invisible and are never persisted, logged, exposed semantically, or rendered.

### Sampling integration boundary

The footprint store observes each track exactly once per accepted `RoomaboutsPresentationAdapter` result, before the DOM/Canvas renderer branch. Rejected adapter results never reach it. Repeated ingestion of the same dedupe key is a no-op.

DOM and Canvas render only immutable `records` from a successful `visible(now)` result. A fail-closed result renders no footprints and requests coordinator reset; it never revives history. Animation frames, redraws, resize observers, mode switches, screenshot capture, and repeated render calls never call `observe()` and never create history. Tests explicitly cover repeated render, resize, screenshot preparation, and CSS→Canvas→CSS switching with identical record IDs/order.

Eligibility and cleanup rules:

- Only `emitFootprint === true`, lifecycle `confirmed`, and position basis `observed` advance an anchor.
- Any ineligible accepted state clears that owner's anchor and emits nothing; re-observation seeds a fresh anchor.
- Removal clears the owner's anchor and prints immediately.
- Disconnect, adapter rejection requiring reset, map/generation change, explicit reset, remount, final-empty state, or destroy clears every anchor and print and cancels the pending expiry timer.
- No footprint enters persistence, logs, diagnostics, Home Assistant entities, accessible text, or screenshot metadata.

Tests prove identical centerline/rotation/side records for equivalent polylines delivered at different cadences, corner interpolation, exact four-unit residual behavior, left/right order, later identical coordinates, repeated/out-of-order timestamps, huge jumps, observation gaps, no stale bridge after every ineligible/reset boundary, and deterministic cap eviction. Portrait, landscape, and resize cases prove the same records yield correct screen-space DOM/Canvas orientation and offset without resampling. Clock-regression cases prove `visible()` fails closed without mutation/revival, `observe()` resets/rejects, and backward seek explicitly resets before an older logical frame. At `5999`, `6000`, and `6001` ms expiry cases assert exact logical visibility and the zero-or-one timer bound. On-time, delayed/throttled-callback, next-observation, visibility/resume, reset, and destroy cases assert eventual physical deletion and handle cancellation without any render/resize/screenshot-driven mutation.

## Motion, contrast, focus, and reflow

- `prefers-reduced-motion: reduce` disables nonessential target interpolation, pulses, footprint scale/fade transitions, and smooth movement. Insertion/removal is immediate.
- `forced-colors: active` uses `Canvas`, `CanvasText`, `Highlight`, `HighlightText`, and `GrayText`. Do not use `forced-color-adjust: none`.
- Focus uses a 3 px `focus` outline plus a 2 px paper-colored separation halo and must not be clipped.
- Interactive fixture controls remain at least 24×24 CSS px. Map markers remain noninteractive in Phase 3.
- Surrounding controls and page content reflow at 320 CSS px without horizontal scrolling. The bounded two-dimensional map may retain its coordinate plane but must not widen the page.
- Alias/state labels remain usable with a 200% root-font approximation and may reposition to stay inside the map stage.
- No state relies on color alone.

Automated 320-CSS-pixel viewport and 200% root-font tests are approximations, not claims of native browser zoom equivalence. `docs/protocols/phase3-native-zoom.md` separately records Firefox 200% text-only zoom and Chrome/Chromium native 400% page zoom, using each browser's zoom controls rather than CSS `zoom`, device emulation, viewport scaling, or an OS magnifier. It records browser/OS versions, zoom, `innerWidth`, `clientWidth`, `scrollWidth`, map rectangle, focus traversal, expected/observed results, evidence paths, and reset to 100%; at 400%, the window is resized until reported CSS `innerWidth` is `320 ± 1` px. The map's two-dimensional-content exception does not exempt surrounding page content from reflow.

## Validated fixture set

Synthetic functional cases are:

- empty configured field;
- observed walk with survey steps;
- held after movement with no new step;
- fading/last-seen;
- three anonymous tracks;
- generation reset with no inherited step;
- all sources offline; and
- one composite containing all six valid tracks (tentative/observed with `source-unverified`, confirmed/observed, confirmed/interpolated, coasting/held, coasting/interpolated, and fading/last-seen) plus a separate offline station.

Every frame is validated by the production `validateRoomaboutsSnapshot()` function before it can render. Functional cases do not automatically create screenshots.

## Exact golden manifest

Implementation commits `tests/browser/visual/manifest.js`. Each frozen entry contains `id`, `scenarioId`, `frameIndex`, `renderMode`, `viewport`, `forcedColors`, `reducedMotion`, `colorScheme`, and `expectedFile`. The expected files live under a Chromium/Linux-specific directory. A release-contract test asserts the manifest has exactly the following nine unique entries and no orphan/missing files.

There are exactly nine reviewed Chromium/Linux goldens, all capturing `#card-host`:

1. observed primary scene at `390 × 844`;
2. observed primary scene at `844 × 390`;
3. observed primary scene at `1024 × 768`;
4. observed primary scene at `1440 × 900`;
5. observed primary scene at `1920 × 1080`;
6. composite six-track plus offline-station scene at `1024 × 768`;
7. the same composite in forced-colors emulation at `1024 × 768`;
8. reduced-motion observed-walk scene at `1024 × 768`; and
9. Canvas observed-walk smoke image at `1024 × 768`.

All nine use locale `en-US`, timezone `UTC`, light color scheme except system forced colors, device scale factor `1`, CSS screenshot scale, disabled animations, hidden caret, and `await document.fonts.ready`. Capture also waits for the fixture-ready signal, exactly one subscriber, and two animation frames; arbitrary sleeps are forbidden. The comparison tolerance is exact: Playwright `threshold: 0` and `maxDiffPixels: 0`. Forced-colors imagery is supplementary; shape, wording, computed-style, and semantic assertions are primary.

Goldens run with one worker on `ubuntu-24.04`. The acceptance protocol records the GitHub runner image/version, `/etc/os-release`, Node/npm/Playwright/browser/FFmpeg versions, installed `fontconfig`, FreeType, HarfBuzz, DejaVu, Liberation, and other resolved font-package versions, command line, and SHA-256 of every accepted image. A runner/font change invalidates comparison until explicit candidate generation and review. Normal CI is compare-only and cannot update goldens. One explicit maintainer update command writes synthetic expected/actual/diff artifacts for human review; it cannot commit or approve them.

## Originality red lines

The production UI and assets must not contain:

- protected franchise names, quotations, house/spell terminology, or wizard-themed copy;
- a folded multi-panel composition, central calligraphic title, ornate frame, ribbon/scroll title, compass rose, crest, castle, moon/star/wand/eye symbolism;
- handwriting or names revealed by spreading ink;
- torn or burned edges, folds, wax seals, or theatrical paper aging;
- traced/reference screenshots, copied prop layouts, detailed boot prints, or protected typography.

Warm paper plus moving labels plus footprints creates the highest similarity risk. The mitigation is to make technical survey language dominant: measured grid, mineral teal/rust states, modern status chips, system typography, abstract geometric steps, no ornamental framing, and no reveal animation.

## Acceptance checklist

- Read-only configured-zone geometry is visibly useful, handles malformed/partial geometry conservatively, and exposes no editor affordance or architectural claim.
- Source health and track lifecycle remain separate; every fixture frame passes the production validator.
- Every lifecycle/position state remains truthful without color-only meaning; Canvas and DOM expose synchronized bounded semantics for every accepted track, placed station, valid configured region, and aggregate source summary.
- Identical observed paths at different update cadences produce identical centerline records and left/right order.
- Held, interpolated, tentative, fading, stale, removed, or reset state emits no new print and cannot bridge when observation resumes.
- Sampling occurs once per accepted adapter result; render frequency, resize, screenshots, and CSS/Canvas switching cannot change history.
- Lifecycle boundaries clear state; records become logically invisible at six seconds, and the first eligible timer/snapshot/resume/reset/destroy trigger physically deletes expired coordinates and obsolete handles.
- Field Ledger ignores inherited visual overrides and causes no theme-initiated network request.
- Page scrolling, fixed viewports, media modes, focus, automated approximations, and named manual zoom checks pass.
- The exact nine-image manifest—including all six valid track pairings in the composite—compares at zero pixel tolerance on the recorded runner/font environment.
- Page-origin console warnings/errors and non-loopback test requests are zero.
- A fresh originality reviewer finds no protected name, copy, font, symbol, artwork, layout, or animation imitation.
- The inherited editor stylesheet and mutation bindings are not changed in Phase 3; functional editor re-enablement remains Phase 4 resolver work.

## Approval record

Approved by the user on 2026-11-15. Approval covers the Field Ledger direction, configured-geometry limits, state/source grammar, ephemeral footprint algorithm and timers, accessibility/input contract, hostile-input isolation, exact nine-image manifest, and originality red lines.
