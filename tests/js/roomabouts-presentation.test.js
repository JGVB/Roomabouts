import {
    RoomaboutsPresentationAdapter,
    RoomaboutsSnapshotError,
    validateRoomaboutsSnapshot,
} from '../../custom_components/radar_map_manager/www/roomabouts-presentation.js';

const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const assertEquals = (actual, expected, message) => {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    assert(actualJson === expectedJson, `${message}: expected ${expectedJson}, got ${actualJson}`);
};

const makeTrack = (trackId, overrides = {}) => ({
    trackId,
    position: { x: 50, y: 40, coordinateSpace: 'map-layout' },
    positionBasis: 'observed',
    lifecycle: 'confirmed',
    anonymousAlias: 'Wayfarer-a1b2c3',
    sourceRefs: ['source-0123456789ab:slot-abcdef'],
    observedAt: 900,
    lastObservedAgeMs: 100,
    ...overrides,
});

const makeSnapshot = ({
    generationId = 'generation-a',
    sequence = 0,
    logicalTimeMs = 1000,
    mapId = 'default',
    resetReason,
    tracks = [],
    sourceHealth = [{
        sensorId: 'source-0123456789ab',
        status: 'online',
        reason: 'available',
        updatedAt: 950,
    }],
} = {}) => {
    const value = {
        schemaVersion: 1,
        generationId,
        sequence,
        logicalTimeMs,
        map: {
            mapId,
            config: {
                fused_color: '#112233CC',
                show_trails: true,
                target_render_mode: 'canvas',
            },
            zones: {
                include_zones: [],
                exclude_zones: [],
                entrance_zones: [],
                stationary_zones: [],
            },
            radars: [{
                sensorId: 'source-0123456789ab',
                mapGroup: mapId,
                paused: false,
                layout: { origin_x: 50, origin_y: 50, pose_revision: 'pose-0123456789ab' },
                monitor_zones: [],
                hw_detect_zones: [],
                hw_block_zones: [],
                hw_stay_zones: [],
            }],
        },
        tracks,
        sourceHealth,
    };
    if (resetReason !== undefined) value.resetReason = resetReason;
    return value;
};

Deno.test('adapter presents zero, one, and many tracks using backend lifecycle facts', () => {
    const adapter = new RoomaboutsPresentationAdapter();

    const empty = adapter.ingest(makeSnapshot());
    assert(empty.accepted, 'empty snapshot should be accepted');
    assert(empty.reset, 'the first snapshot starts a presentation lifetime');
    assertEquals(empty.tracks, [], 'zero tracks');
    assertEquals(empty.footprintCandidates, [], 'zero footprint candidates');

    const observed = makeTrack('track-aaaaaaaaaaaa');
    const held = makeTrack('track-bbbbbbbbbbbb', {
        positionBasis: 'held',
        lifecycle: 'coasting',
        anonymousAlias: 'Wayfarer-b2c3d4',
        uncertainty: ['held-in-stationary-zone'],
    });
    const lastSeen = makeTrack('track-cccccccccccc', {
        positionBasis: 'last-seen',
        lifecycle: 'fading',
        anonymousAlias: 'Wayfarer-c3d4e5',
        uncertainty: ['source-not-currently-observed'],
        posture: 'unknown',
    });
    const tentative = makeTrack('track-dddddddddddd', {
        lifecycle: 'tentative',
        anonymousAlias: 'Wayfarer-d4e5f6',
        uncertainty: ['source-unverified'],
    });
    const interpolated = makeTrack('track-eeeeeeeeeeee', {
        positionBasis: 'interpolated',
        lifecycle: 'coasting',
        anonymousAlias: 'Wayfarer-e5f6a7',
    });
    const many = adapter.ingest(makeSnapshot({
        sequence: 1,
        tracks: [lastSeen, tentative, held, observed, interpolated],
        sourceHealth: [
            {
                sensorId: 'source-0123456789ab',
                status: 'online',
                reason: 'available',
                updatedAt: 950,
            },
            {
                sensorId: 'source-fedcba987654',
                status: 'offline',
                reason: 'unavailable',
                updatedAt: 960,
            },
        ],
    }));

    assert(many.accepted, 'many-track snapshot should be accepted');
    assertEquals(many.tracks.map((track) => track.trackId), [
        'track-aaaaaaaaaaaa',
        'track-bbbbbbbbbbbb',
        'track-cccccccccccc',
        'track-dddddddddddd',
        'track-eeeeeeeeeeee',
    ], 'tracks are deterministic');
    assertEquals(many.footprintCandidates.map((track) => track.trackId), [
        'track-aaaaaaaaaaaa',
    ], 'only observed positions can emit footprints');
    assertEquals(many.tracks[1].uncertainty, ['held-in-stationary-zone'], 'held uncertainty');
    assertEquals(many.tracks[2].positionBasis, 'last-seen', 'last-seen basis');
    assert(!('identity' in many.tracks[0]), 'identity must remain absent');
    assert(!('identityConfidence' in many.tracks[0]), 'identity confidence must remain absent');
    assertEquals(many.tracks[0].anonymousAlias, observed.anonymousAlias, 'backend alias is preserved');
    assert(/^Wayfarer-[0-9a-f]{6}$/.test(many.tracks[0].anonymousAlias), 'alias format');
    assertEquals(many.sourceHealth[0].status, 'online', 'source health is preserved');
    assertEquals(many.sourceHealth[1].status, 'offline', 'offline state is not inferred away');
});

Deno.test('invalid snapshots fail closed without advancing adapter state', () => {
    const adapter = new RoomaboutsPresentationAdapter();
    const initial = adapter.ingest(makeSnapshot({ tracks: [makeTrack('track-aaaaaaaaaaaa')] }));
    const initialAlias = initial.tracks[0].anonymousAlias;

    const secretBearing = makeSnapshot({
        sequence: 1,
        tracks: [{ ...makeTrack('track-aaaaaaaaaaaa'), device_pin: 'CANARY-SECRET' }],
    });
    const rejected = adapter.ingest(secretBearing);
    assertEquals(
        { accepted: rejected.accepted, reason: rejected.reason },
        { accepted: false, reason: 'invalid-snapshot' },
        'unsupported fields are rejected',
    );
    assert(!JSON.stringify(rejected).includes('CANARY-SECRET'), 'rejection does not echo input');

    const nonFinite = makeSnapshot({ sequence: 1, tracks: [makeTrack('track-aaaaaaaaaaaa')] });
    nonFinite.tracks[0].position.x = Number.NaN;
    assertEquals(adapter.ingest(nonFinite).reason, 'invalid-snapshot', 'non-finite coordinate');

    const duplicateIds = makeSnapshot({
        sequence: 1,
        tracks: [makeTrack('track-aaaaaaaaaaaa'), makeTrack('track-aaaaaaaaaaaa')],
    });
    assertEquals(adapter.ingest(duplicateIds).reason, 'invalid-snapshot', 'duplicate IDs');

    const recovered = adapter.ingest(makeSnapshot({
        sequence: 1,
        tracks: [makeTrack('track-aaaaaaaaaaaa')],
    }));
    assert(recovered.accepted, 'valid sequence remains available after rejection');
    assertEquals(recovered.tracks[0].anonymousAlias, initialAlias, 'invalid input cannot reset aliases');
});

Deno.test('duplicate and out-of-order snapshots cannot revive visual state', () => {
    const adapter = new RoomaboutsPresentationAdapter();
    const first = adapter.ingest(makeSnapshot({
        sequence: 5,
        tracks: [makeTrack('track-aaaaaaaaaaaa')],
    }));
    assert(first.accepted, 'initial sequence');

    const duplicate = adapter.ingest(makeSnapshot({
        sequence: 5,
        tracks: [makeTrack('track-bbbbbbbbbbbb')],
    }));
    assertEquals(duplicate.reason, 'duplicate-sequence', 'duplicate is ignored');
    assertEquals(duplicate.footprintCandidates, [], 'duplicate emits no footprints');

    const old = adapter.ingest(makeSnapshot({ sequence: 4, tracks: [] }));
    assertEquals(old.reason, 'out-of-order-sequence', 'old snapshot is ignored');

    const next = adapter.ingest(makeSnapshot({ sequence: 6, tracks: [] }));
    assert(next.accepted, 'next sequence is accepted');
    assertEquals(next.removedTrackIds, ['track-aaaaaaaaaaaa'], 'accepted absence removes old track');

    const reentry = adapter.ingest(makeSnapshot({
        sequence: 7,
        tracks: [makeTrack('track-aaaaaaaaaaaa')],
    }));
    assert(reentry.accepted, 'same-generation re-entry is accepted at a new sequence');
    assertEquals(reentry.clearedTrackIds, [], 're-entry does not fabricate a reset');
});

Deno.test('aliases ignore source slots and never cross reset boundaries', () => {
    const adapter = new RoomaboutsPresentationAdapter();
    const id = 'track-aaaaaaaaaaaa';
    const first = adapter.ingest(makeSnapshot({ tracks: [makeTrack(id)] }));
    const firstAlias = first.tracks[0].anonymousAlias;

    const relabeled = adapter.ingest(makeSnapshot({
        sequence: 1,
        tracks: [makeTrack(id, { sourceRefs: ['source-fedcba987654:slot-123456'] })],
    }));
    assertEquals(relabeled.tracks[0].anonymousAlias, firstAlias, 'slot relabel cannot change alias');
    assert(!relabeled.tracks[0].anonymousAlias.includes('123456'), 'slot is not encoded into alias');

    const hibernating = adapter.ingest(makeSnapshot({
        sequence: 2,
        tracks: [makeTrack(id, {
            positionBasis: 'last-seen',
            lifecycle: 'fading',
            sourceRefs: [],
            uncertainty: ['source-not-currently-observed'],
        })],
    }));
    assertEquals(hibernating.footprintCandidates, [], 'last-seen target cannot emit a footprint');

    const nextGeneration = adapter.ingest(makeSnapshot({
        generationId: 'generation-b',
        sequence: 0,
        resetReason: 'source-restart',
        tracks: [makeTrack(id, { anonymousAlias: 'Wayfarer-b2c3d4' })],
    }));
    assert(nextGeneration.reset, 'generation change resets presentation state');
    assertEquals(nextGeneration.clearedTrackIds, [id], 'old track is explicitly cleared');
    assert(nextGeneration.tracks[0].anonymousAlias !== firstAlias, 'generation changes alias');

    const mapChange = adapter.ingest(makeSnapshot({
        generationId: 'generation-b',
        sequence: 1,
        mapId: 'second-floor',
        tracks: [makeTrack(id, { anonymousAlias: 'Wayfarer-b2c3d4' })],
    }));
    assert(mapChange.reset, 'map change resets presentation state');
    assertEquals(mapChange.clearedTrackIds, [id], 'map boundary clears prior alias lifetime');

    const explicitReset = adapter.ingest(makeSnapshot({
        generationId: 'generation-b',
        sequence: 2,
        mapId: 'second-floor',
        resetReason: 'explicit-reset',
        tracks: [makeTrack(id, { anonymousAlias: 'Wayfarer-c3d4e5' })],
    }));
    assert(explicitReset.reset, 'explicit reset clears presentation state');
    assertEquals(explicitReset.clearedTrackIds, [id], 'explicit reset clears prior alias lifetime');

    const beforeDisconnect = explicitReset.tracks[0].anonymousAlias;
    const disconnect = adapter.disconnect();
    assertEquals(disconnect.clearedTrackIds, [id], 'disconnect clears active tracks');
    const reconnected = adapter.ingest(makeSnapshot({
        generationId: 'generation-c',
        sequence: 0,
        mapId: 'second-floor',
        resetReason: 'integration-load',
        tracks: [makeTrack(id, { anonymousAlias: 'Wayfarer-d4e5f6' })],
    }));
    assert(reconnected.tracks[0].anonymousAlias !== beforeDisconnect, 'reconnect changes alias');
});

Deno.test('validator enforces bounded exact RoomaboutsSnapshotV1 shapes', () => {
    const valid = makeSnapshot({ tracks: [makeTrack('track-aaaaaaaaaaaa')] });
    const clone = validateRoomaboutsSnapshot(valid);
    assert(clone !== valid, 'validator returns a detached value');
    assertEquals(clone, valid, 'detached value is semantically equal');

    const cases = [];
    cases.push({ ...valid, schemaVersion: 2 });
    cases.push({ ...valid, unknown: true });
    cases.push({ ...valid, generationId: 'x'.repeat(257) });
    cases.push({ ...valid, sequence: Number.MAX_SAFE_INTEGER + 1 });
    cases.push({ ...valid, tracks: new Array(129).fill(makeTrack('track-aaaaaaaaaaaa')) });
    cases.push({ ...valid, sourceHealth: [{ ...valid.sourceHealth[0], token: 'secret' }] });
    cases.push({ ...valid, sourceHealth: [valid.sourceHealth[0], { ...valid.sourceHealth[0] }] });
    cases.push({ ...valid, map: { ...valid.map, config: { device_pin: 'secret' } } });
    for (const [lifecycle, positionBasis] of [
        ['tentative', 'held'],
        ['confirmed', 'last-seen'],
        ['coasting', 'observed'],
        ['fading', 'interpolated'],
    ]) {
        cases.push({
            ...valid,
            tracks: [makeTrack('track-aaaaaaaaaaaa', { lifecycle, positionBasis })],
        });
    }
    cases.push({
        ...valid,
        map: {
            ...valid.map,
            zones: {
                ...valid.map.zones,
                include_zones: [{ points: new Array(257).fill([0, 0]) }],
            },
        },
    });
    cases.push({
        ...valid,
        map: {
            ...valid.map,
            radars: new Array(65).fill(null).map((_, index) => ({
                ...valid.map.radars[0],
                sensorId: `source-${index.toString(16).padStart(12, '0')}`,
            })),
        },
    });

    for (const candidate of cases) {
        let error = null;
        try {
            validateRoomaboutsSnapshot(candidate);
        } catch (caught) {
            error = caught;
        }
        assert(error instanceof RoomaboutsSnapshotError, 'malformed snapshot should throw typed error');
    }
});
