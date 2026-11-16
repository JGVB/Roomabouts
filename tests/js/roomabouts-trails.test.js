import {
    ROOMABOUTS_TRAIL_CONSTANTS,
    RoomaboutsTrailStore,
    projectRoomaboutsStep,
} from '../../custom_components/radar_map_manager/www/roomabouts-trails.js';

const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const assertEquals = (actual, expected, message) => {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    assert(actualJson === expectedJson, `${message}: expected ${expectedJson}, got ${actualJson}`);
};

const assertClose = (actual, expected, message, epsilon = 1e-9) => {
    assert(
        Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon,
        `${message}: expected ${expected}, got ${actual}`,
    );
};

const makeTrack = (trackId, x, y, overrides = {}) => ({
    trackId,
    position: { x, y, coordinateSpace: 'map-layout' },
    positionBasis: 'observed',
    lifecycle: 'confirmed',
    observedAt: 0,
    emitFootprint: true,
    ...overrides,
});

const makePresentation = ({
    generationId = 'generation-a',
    sequence = 0,
    reset = sequence === 0,
    resetReason = reset ? 'initial-snapshot' : null,
    tracks = [],
    removedTrackIds = [],
    clearedTrackIds = [],
} = {}) => ({
    accepted: true,
    reset,
    resetReason,
    generationId,
    sequence,
    logicalTimeMs: sequence * 100,
    tracks,
    footprintCandidates: tracks.filter((track) => track.emitFootprint),
    removedTrackIds,
    clearedTrackIds,
});

const makeScheduler = (initialNow = 0) => {
    let now = initialNow;
    let nextHandle = 1;
    let clearCount = 0;
    const tasks = new Map();
    const issuedTasks = new Map();

    const setTimeout = (callback, delay) => {
        const handle = nextHandle;
        nextHandle += 1;
        const task = { callback, due: now + delay };
        tasks.set(handle, task);
        issuedTasks.set(handle, task);
        return handle;
    };

    const clearTimeout = (handle) => {
        if (tasks.delete(handle)) clearCount += 1;
    };

    const runDue = () => {
        let ran = true;
        while (ran) {
            ran = false;
            const due = [...tasks.entries()]
                .filter(([, task]) => task.due <= now)
                .sort((left, right) => left[1].due - right[1].due || left[0] - right[0]);
            if (due.length > 0) {
                const [handle, task] = due[0];
                tasks.delete(handle);
                task.callback();
                ran = true;
            }
        }
    };

    return {
        clock: () => now,
        setTimeout,
        clearTimeout,
        setNow: (value) => { now = value; },
        runDue,
        invokeIssued: (handle) => issuedTasks.get(handle)?.callback(),
        activeCount: () => tasks.size,
        activeHandles: () => [...tasks.keys()].sort((a, b) => a - b),
        clearCount: () => clearCount,
        deadlines: () => [...tasks.values()].map((task) => task.due).sort((a, b) => a - b),
    };
};

const makeStore = (scheduler, onChange) => new RoomaboutsTrailStore({
    clock: scheduler.clock,
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    onChange,
});

const visibleRecords = (store, now) => {
    const result = store.visible(now);
    assert(result.ok, `visible(${now}) should succeed`);
    return result.records;
};

const compactRecords = (records) => records.map((record) => ({
    x: record.x,
    y: record.y,
    rotationDeg: record.rotationDeg,
    side: record.side,
}));

Deno.test('footprint constants and projection are frozen, exact, and fail closed', () => {
    assert(Object.isFrozen(ROOMABOUTS_TRAIL_CONSTANTS), 'constants must be frozen');
    assertEquals(ROOMABOUTS_TRAIL_CONSTANTS, {
        spacing: 4,
        discontinuityThreshold: 25,
        maxObservationGapMs: 2000,
        coordinateEpsilon: 0.000001,
        lateralOffsetPx: 4,
        glyphWidthPx: 7,
        glyphHeightPx: 13,
        firstSide: 'left',
        maxEmissionsPerObservation: 8,
        maxRecordsPerOwner: 16,
        maxRecords: 96,
        expiryMs: 6000,
    }, 'accepted constants');

    const eastLeft = projectRoomaboutsStep({ x: 50, y: 50, rotationDeg: 90, side: 'left' }, 200, 100);
    assert(Object.isFrozen(eastLeft), 'projection must be immutable');
    assertClose(eastLeft.centerX, 100, 'east center x');
    assertClose(eastLeft.centerY, 50, 'east center y');
    assertClose(eastLeft.offsetX, 0, 'east left offset x');
    assertClose(eastLeft.offsetY, -4, 'east left offset y');
    assertClose(eastLeft.screenX, 100, 'east left screen x');
    assertClose(eastLeft.screenY, 46, 'east left screen y');
    assertClose(eastLeft.rotationDeg, 90, 'east screen rotation');
    assertEquals(eastLeft.side, 'left', 'side is retained');

    const southRight = projectRoomaboutsStep({ x: 25, y: 40, rotationDeg: 180, side: 'right' }, 200, 100);
    assertClose(southRight.centerX, 50, 'south center x');
    assertClose(southRight.centerY, 40, 'south center y');
    assertClose(southRight.screenX, 46, 'south right screen x');
    assertClose(southRight.screenY, 40, 'south right screen y');
    assertClose(southRight.rotationDeg, 180, 'south screen rotation');

    const diagonal = projectRoomaboutsStep({ x: 50, y: 50, rotationDeg: 135, side: 'left' }, 200, 100);
    assertClose(diagonal.rotationDeg, 116.56505117707799, 'non-square projected angle');
    assertClose(diagonal.offsetX, 4 / Math.sqrt(5), 'non-square left normal x');
    assertClose(diagonal.offsetY, -8 / Math.sqrt(5), 'non-square left normal y');

    const portrait = projectRoomaboutsStep({ x: 50, y: 50, rotationDeg: 135, side: 'left' }, 100, 200);
    assertClose(portrait.rotationDeg, 153.43494882292202, 'portrait projected angle');
    assertClose(portrait.centerX, 50, 'resize center x');
    assertClose(portrait.centerY, 100, 'resize center y');
    assertEquals(
        { x: diagonal.screenX, y: diagonal.screenY },
        { x: 100 + 4 / Math.sqrt(5), y: 50 - 8 / Math.sqrt(5) },
        'landscape projection is deterministic',
    );

    for (const invalid of [
        projectRoomaboutsStep(null, 100, 100),
        projectRoomaboutsStep({ x: Number.NaN, y: 0, rotationDeg: 90, side: 'left' }, 100, 100),
        projectRoomaboutsStep({ x: 0, y: 0, rotationDeg: 90, side: 'middle' }, 100, 100),
        projectRoomaboutsStep({ x: 0, y: 0, rotationDeg: 90, side: 'left' }, 0, 100),
        projectRoomaboutsStep({ x: 0, y: 0, rotationDeg: 90, side: 'left' }, 100, Infinity),
    ]) assertEquals(invalid, null, 'invalid projection must fail closed');
});

Deno.test('first observation anchors and exact spacing emits immutable alternating records', () => {
    const scheduler = makeScheduler();
    const store = makeStore(scheduler);
    assert(store.observeAccepted(makePresentation({
        tracks: [makeTrack('track-a', 0, 0, { observedAt: 100 })],
    })).ok, 'first presentation accepted');
    assertEquals(visibleRecords(store, 0), [], 'first observation emits nothing');

    scheduler.setNow(100);
    const moved = store.observeAccepted(makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 12, 0, { observedAt: 200 })],
    }));
    assertEquals(moved.emitted, 3, 'three four-unit steps emitted');
    const records = visibleRecords(store, 100);
    assertEquals(compactRecords(records), [
        { x: 4, y: 0, rotationDeg: 90, side: 'left' },
        { x: 8, y: 0, rotationDeg: 90, side: 'right' },
        { x: 12, y: 0, rotationDeg: 90, side: 'left' },
    ], 'centerline samples and side order');
    assertEquals(Object.keys(records[0]), [
        'ownerId', 'x', 'y', 'rotationDeg', 'side', 'createdAtMs', 'expiresAtMs', 'ordinal',
    ], 'record contains exactly the accepted fields');
    assert(Object.isFrozen(records[0]), 'record must be frozen');
    assert(Object.isFrozen(records), 'visible records array must be frozen');
    assertEquals(
        records.map(({ createdAtMs, expiresAtMs, ordinal }) => ({ createdAtMs, expiresAtMs, ordinal })),
        [
            { createdAtMs: 100, expiresAtMs: 6100, ordinal: 0 },
            { createdAtMs: 100, expiresAtMs: 6100, ordinal: 1 },
            { createdAtMs: 100, expiresAtMs: 6100, ordinal: 2 },
        ],
        'expiry and ordinal use presentation time',
    );
    assert(records.every((record) => record.ownerId === records[0].ownerId), 'one private owner key');
    assert(!records[0].ownerId.includes('track-a'), 'owner key must not expose track id');
    assertEquals(scheduler.activeCount(), 1, 'store owns at most one timer');
});

Deno.test('residual distance and corner interpolation are cadence invariant', () => {
    const scheduler = makeScheduler();
    const store = makeStore(scheduler);
    store.observeAccepted(makePresentation({ tracks: [makeTrack('track-a', 0, 0)] }));
    store.observeAccepted(makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 10, 0, { observedAt: 100 })],
    }));
    store.observeAccepted(makePresentation({
        sequence: 2,
        reset: false,
        tracks: [makeTrack('track-a', 10, 6, { observedAt: 200 })],
    }));
    assertEquals(compactRecords(visibleRecords(store, 0)), [
        { x: 4, y: 0, rotationDeg: 90, side: 'left' },
        { x: 8, y: 0, rotationDeg: 90, side: 'right' },
        { x: 10, y: 2, rotationDeg: 180, side: 'left' },
        { x: 10, y: 6, rotationDeg: 180, side: 'right' },
    ], 'residual crosses a corner along the new segment');

    const splitScheduler = makeScheduler();
    const split = makeStore(splitScheduler);
    const points = [[0, 0], [3, 0], [7, 0], [10, 0], [10, 1], [10, 4], [10, 6]];
    points.forEach(([x, y], index) => split.observeAccepted(makePresentation({
        sequence: index,
        reset: index === 0,
        tracks: [makeTrack('track-a', x, y, { observedAt: index * 100 })],
    })));
    assertEquals(
        compactRecords(visibleRecords(split, 0)),
        compactRecords(visibleRecords(store, 0)),
        'equivalent polyline at another cadence samples identically',
    );

    const exactScheduler = makeScheduler();
    const exact = makeStore(exactScheduler);
    [[0, 0], [3, 0], [5, 0], [8, 0]].forEach(([x, y], index) => exact.observeAccepted(makePresentation({
        sequence: index,
        reset: index === 0,
        tracks: [makeTrack('track-a', x, y, { observedAt: index * 100 })],
    })));
    assertEquals(
        visibleRecords(exact, 0).map((record) => record.x),
        [4, 8],
        'exact residual carries between updates',
    );
});

Deno.test('epsilon, zero-length, exact duplicate, and later identical coordinates do not fabricate headings', () => {
    const scheduler = makeScheduler();
    const store = makeStore(scheduler);
    const first = makePresentation({ tracks: [makeTrack('track-a', 0, 0, { observedAt: 100 })] });
    store.observeAccepted(first);
    assertEquals(store.observeAccepted(first).reason, 'duplicate-presentation', 'whole presentation replay is a no-op');

    store.observeAccepted(makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 0.000001, 0, { observedAt: 200 })],
    }));
    store.observeAccepted(makePresentation({
        sequence: 2,
        reset: false,
        tracks: [makeTrack('track-a', 0, 0, { observedAt: 300 })],
    }));
    assertEquals(visibleRecords(store, 0), [], 'epsilon and later identical points emit nothing');

    store.observeAccepted(makePresentation({
        sequence: 3,
        reset: false,
        tracks: [makeTrack('track-a', 4, 0, { observedAt: 400 })],
    }));
    assertEquals(compactRecords(visibleRecords(store, 0)), [
        { x: 4, y: 0, rotationDeg: 90, side: 'left' },
    ], 'epsilon updates preserve the original anchor and side');
});

Deno.test('dedupe and ordering rejection clear anchors so stale movement cannot bridge', () => {
    const scheduler = makeScheduler();
    const store = makeStore(scheduler);
    store.observeAccepted(makePresentation({
        tracks: [makeTrack('track-a', 0, 0, { observedAt: 100 })],
    }));
    const emitted = makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 4, 0, { observedAt: 200 })],
    });
    store.observeAccepted(emitted);
    const before = visibleRecords(store, 0);
    assertEquals(store.observeAccepted(emitted).reason, 'duplicate-presentation', 'exact replay is ignored');
    assertEquals(visibleRecords(store, 0), before, 'replay does not allocate or alternate');

    const changedSameSequence = store.observeAccepted(makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 8, 0, { observedAt: 200 })],
    }));
    assertEquals(changedSameSequence.rejected, 1, 'same sequence nonduplicate is rejected');
    store.observeAccepted(makePresentation({
        sequence: 2,
        reset: false,
        tracks: [makeTrack('track-a', 12, 0, { observedAt: 300 })],
    }));
    assertEquals(visibleRecords(store, 0).length, 1, 'first recovery observation only reseeds');
    store.observeAccepted(makePresentation({
        sequence: 3,
        reset: false,
        tracks: [makeTrack('track-a', 16, 0, { observedAt: 400 })],
    }));
    assertEquals(
        visibleRecords(store, 0).map((record) => [record.x, record.side]),
        [[4, 'left'], [16, 'right']],
        'recovery cannot bridge across rejected coordinates',
    );

    const equalTime = store.observeAccepted(makePresentation({
        sequence: 4,
        reset: false,
        tracks: [makeTrack('track-a', 20, 0, { observedAt: 400 })],
    }));
    assertEquals(equalTime.rejected, 1, 'equal observedAt nonduplicate is rejected');
    store.observeAccepted(makePresentation({
        sequence: 5,
        reset: false,
        tracks: [makeTrack('track-a', 24, 0, { observedAt: 500 })],
    }));
    assertEquals(visibleRecords(store, 0).length, 2, 'equal-time rejection also forces reseed');
});

Deno.test('gap and discontinuity thresholds are strict and oversized segments reseed', () => {
    const scheduler = makeScheduler();
    const store = makeStore(scheduler);
    store.observeAccepted(makePresentation({
        tracks: [makeTrack('track-a', 0, 0, { observedAt: 0 })],
    }));
    store.observeAccepted(makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 4, 0, { observedAt: 2000 })],
    }));
    assertEquals(visibleRecords(store, 0).length, 1, 'exact 2000 ms gap remains eligible');
    store.observeAccepted(makePresentation({
        sequence: 2,
        reset: false,
        tracks: [makeTrack('track-a', 8, 0, { observedAt: 4001 })],
    }));
    assertEquals(visibleRecords(store, 0).length, 1, 'gap over 2000 ms reseeds');
    store.observeAccepted(makePresentation({
        sequence: 3,
        reset: false,
        tracks: [makeTrack('track-a', 12, 0, { observedAt: 6001 })],
    }));
    assertEquals(
        visibleRecords(store, 0).map((record) => [record.x, record.side]),
        [[4, 'left'], [12, 'right']],
        'post-gap motion starts from the new seed',
    );

    const distanceScheduler = makeScheduler();
    const distance = makeStore(distanceScheduler);
    distance.observeAccepted(makePresentation({ tracks: [makeTrack('track-a', 0, 0)] }));
    const atThreshold = distance.observeAccepted(makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 25, 0, { observedAt: 100 })],
    }));
    assertEquals(atThreshold.emitted, 6, 'exact 25-unit segment is sampled');
    assert(atThreshold.emitted <= ROOMABOUTS_TRAIL_CONSTANTS.maxEmissionsPerObservation, 'emission cap');
    distance.observeAccepted(makePresentation({
        sequence: 2,
        reset: false,
        tracks: [makeTrack('track-a', 50.000001, 0, { observedAt: 200 })],
    }));
    assertEquals(visibleRecords(distance, 0).length, 6, 'greater-than-25 segment only reseeds');
    distance.observeAccepted(makePresentation({
        sequence: 3,
        reset: false,
        tracks: [makeTrack('track-a', 54.000001, 0, { observedAt: 300 })],
    }));
    assertEquals(visibleRecords(distance, 0).at(-1).x, 54.000001, 'new seed does not bridge the jump');
});

Deno.test('ineligible, invalid, removed, reset, and final-empty boundaries never leave a stale bridge', () => {
    const scheduler = makeScheduler();
    const store = makeStore(scheduler);
    const both = (sequence, ax, bx, overridesA = {}) => makePresentation({
        sequence,
        reset: sequence === 0,
        tracks: [
            makeTrack('track-a', ax, 0, { observedAt: sequence * 100, ...overridesA }),
            makeTrack('track-b', bx, 10, { observedAt: sequence * 100 }),
        ],
    });
    store.observeAccepted(both(0, 0, 0));
    store.observeAccepted(both(1, 4, 4));
    const initial = visibleRecords(store, 0);
    assertEquals(initial.length, 2, 'both owners emit');

    store.observeAccepted(both(2, 8, 8, {
        lifecycle: 'coasting',
        positionBasis: 'held',
        emitFootprint: false,
    }));
    assertEquals(visibleRecords(store, 0).length, 3, 'ineligible owner retains old print but emits none');
    store.observeAccepted(both(3, 12, 12));
    assertEquals(visibleRecords(store, 0).length, 4, 're-eligible owner only seeds while other advances');
    store.observeAccepted(both(4, 16, 16));
    assertEquals(
        visibleRecords(store, 0)
            .filter((record) => record.ownerId === initial[0].ownerId)
            .map((record) => [record.x, record.side]),
        [[4, 'left'], [16, 'right']],
        'ineligible state prevents an 8-to-12 bridge',
    );

    const invalid = both(5, Number.NaN, 20);
    assertEquals(store.observeAccepted(invalid).rejected, 1, 'nonfinite position rejected owner-locally');
    store.observeAccepted(both(6, 24, 24));
    const ownerAAfterInvalid = visibleRecords(store, 0)
        .filter((record) => record.ownerId === initial[0].ownerId)
        .map((record) => record.x);
    assertEquals(ownerAAfterInvalid, [4, 16], 'invalid coordinate clears anchor');

    store.observeAccepted(makePresentation({
        sequence: 7,
        reset: false,
        tracks: [makeTrack('track-b', 28, 10, { observedAt: 700 })],
        removedTrackIds: ['track-a'],
    }));
    assert(
        visibleRecords(store, 0).every((record) => record.ownerId !== initial[0].ownerId),
        'owner removal clears its prints immediately',
    );

    store.observeAccepted(makePresentation({ sequence: 8, reset: false, tracks: [] }));
    assertEquals(store.stats().recordCount, 0, 'final empty clears every print');
    assertEquals(store.stats().anchorCount, 0, 'final empty clears every anchor');
    assertEquals(scheduler.activeCount(), 0, 'final empty cancels timer');

    store.observeAccepted(makePresentation({
        sequence: 9,
        reset: false,
        tracks: [makeTrack('track-a', 50, 0, { observedAt: 900 })],
    }));
    store.observeAccepted(makePresentation({
        sequence: 10,
        reset: false,
        tracks: [makeTrack('track-a', 54, 0, { observedAt: 1000 })],
    }));
    assertEquals(store.stats().recordCount, 1, 'history can restart after final empty');
    store.observeAccepted(makePresentation({
        generationId: 'generation-b',
        sequence: 0,
        reset: true,
        resetReason: 'generation-change',
        tracks: [makeTrack('track-a', 80, 0, { observedAt: 0 })],
        clearedTrackIds: ['track-a'],
    }));
    assertEquals(store.stats().recordCount, 0, 'generation reset clears prints');
    store.observeAccepted(makePresentation({
        generationId: 'generation-b',
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 84, 0, { observedAt: 100 })],
    }));
    assertEquals(visibleRecords(store, 0).map((record) => record.x), [84], 'new generation starts fresh');
});

Deno.test('anchor-only reseeds preserve strict side alternation across every boundary', () => {
    const scheduler = makeScheduler();
    const store = makeStore(scheduler);
    const observe = (sequence, x, observedAt, overrides = {}) => store.observeAccepted(
        makePresentation({
            sequence,
            reset: sequence === 0,
            tracks: [makeTrack('track-a', x, 0, { observedAt, ...overrides })],
        }),
    );
    observe(0, 0, 0);
    observe(1, 4, 100);
    observe(2, 8, 200, {
        lifecycle: 'coasting',
        positionBasis: 'held',
        emitFootprint: false,
    });
    observe(3, 12, 300);
    observe(4, 16, 400);
    observe(5, Number.NaN, 500);
    observe(6, 20, 600);
    observe(7, 24, 700);
    observe(8, 28, 700);
    observe(9, 32, 900);
    observe(10, 36, 1000);
    observe(11, 40, 4001);
    observe(12, 44, 5000);
    observe(13, 70, 5100);
    observe(14, 74, 5200);

    assertEquals(
        visibleRecords(store, 0).map((record) => [record.x, record.side]),
        [
            [4, 'left'],
            [16, 'right'],
            [24, 'left'],
            [36, 'right'],
            [44, 'left'],
            [74, 'right'],
        ],
        'ineligible, invalid, equal-time, gap, and jump reseeds all preserve alternation',
    );
});

Deno.test('record ordinals remain monotonic for an entire generation', () => {
    const scheduler = makeScheduler();
    const store = makeStore(scheduler);
    store.observeAccepted(makePresentation({ tracks: [makeTrack('track-a', 0, 0)] }));
    store.observeAccepted(makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 4, 0, { observedAt: 100 })],
    }));
    assertEquals(visibleRecords(store, 0)[0].ordinal, 0, 'first generation ordinal');

    store.observeAccepted(makePresentation({ sequence: 2, reset: false, tracks: [] }));
    store.observeAccepted(makePresentation({
        sequence: 3,
        reset: false,
        tracks: [makeTrack('track-a', 10, 0, { observedAt: 300 })],
    }));
    store.observeAccepted(makePresentation({
        sequence: 4,
        reset: false,
        tracks: [makeTrack('track-a', 14, 0, { observedAt: 400 })],
    }));
    assertEquals(visibleRecords(store, 0)[0].ordinal, 1, 'final-empty does not reuse ordinal');

    store.observeAccepted(makePresentation({
        sequence: 5,
        reset: true,
        resetReason: 'explicit-reset',
        tracks: [makeTrack('track-a', 20, 0, { observedAt: 500 })],
        clearedTrackIds: ['track-a'],
    }));
    store.observeAccepted(makePresentation({
        sequence: 6,
        reset: false,
        tracks: [makeTrack('track-a', 24, 0, { observedAt: 600 })],
    }));
    assertEquals(visibleRecords(store, 0)[0].ordinal, 2, 'same-generation reset preserves ordinal');

    store.observeAccepted(makePresentation({
        generationId: 'generation-b',
        sequence: 0,
        reset: true,
        resetReason: 'generation-change',
        tracks: [makeTrack('track-a', 30, 0)],
        clearedTrackIds: ['track-a'],
    }));
    store.observeAccepted(makePresentation({
        generationId: 'generation-b',
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 34, 0, { observedAt: 100 })],
    }));
    assertEquals(visibleRecords(store, 0)[0].ordinal, 0, 'new generation starts a new ordinal scope');
});

Deno.test('invalid new tracks never allocate owners and complete active sets prune omissions', () => {
    const scheduler = makeScheduler();
    const store = makeStore(scheduler);
    store.observeAccepted(makePresentation({ tracks: [makeTrack('track-a', 0, 0)] }));
    store.observeAccepted(makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 4, 0, { observedAt: 100 })],
    }));
    assertEquals(store.stats().recordCount, 1, 'valid owner begins with a print');

    store.observeAccepted(makePresentation({
        sequence: 2,
        reset: false,
        tracks: [makeTrack('malformed-2', Number.NaN, 0, { observedAt: 200 })],
    }));
    assertEquals(store.stats().ownerCount, 0, 'invalid new owner is never allocated');
    assertEquals(store.stats().recordCount, 0, 'absent prior owner is pruned without removal hint');

    for (let sequence = 3; sequence < 200; sequence += 1) {
        store.observeAccepted(makePresentation({
            sequence,
            reset: false,
            tracks: [makeTrack(`malformed-${sequence}`, Number.NaN, 0, {
                observedAt: sequence * 100,
            })],
        }));
    }
    assertEquals(store.stats().ownerCount, 0, 'malformed identifier churn remains allocation-free');

    store.observeAccepted(makePresentation({
        sequence: 200,
        reset: false,
        tracks: [makeTrack('held-a', 10, 0, {
            observedAt: 20000,
            lifecycle: 'coasting',
            positionBasis: 'held',
            emitFootprint: false,
        })],
    }));
    store.observeAccepted(makePresentation({
        sequence: 201,
        reset: false,
        tracks: [makeTrack('held-b', 10, 0, {
            observedAt: 20100,
            lifecycle: 'coasting',
            positionBasis: 'held',
            emitFootprint: false,
        })],
    }));
    assertEquals(store.stats().ownerCount, 1, 'valid ineligible active-set churn remains bounded');
    assertEquals(store.stats().anchorCount, 0, 'ineligible owner retains no anchor');
});

Deno.test('owner and global caps evict deterministically by creation time then ordinal', () => {
    const buildOwnerCapped = () => {
        const scheduler = makeScheduler();
        const store = makeStore(scheduler);
        [0, 24, 0, 24].forEach((x, sequence) => store.observeAccepted(makePresentation({
            sequence,
            reset: sequence === 0,
            tracks: [makeTrack('track-a', x, 0, { observedAt: sequence * 100 })],
        })));
        return { scheduler, store };
    };
    const ownerCapped = buildOwnerCapped();
    const ownerRecords = visibleRecords(ownerCapped.store, 0);
    assertEquals(ownerRecords.length, 16, 'owner cap is exact');
    assertEquals(ownerRecords[0].ordinal, 2, 'oldest same-time ordinals are evicted first');
    assertEquals(ownerCapped.scheduler.activeCount(), 1, 'cap eviction keeps one timer');

    const buildGlobalCapped = () => {
        const scheduler = makeScheduler();
        const store = makeStore(scheduler);
        const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
        [0, 24, 0, 24].forEach((x, sequence) => store.observeAccepted(makePresentation({
            sequence,
            reset: sequence === 0,
            tracks: ids.map((id) => makeTrack(`track-${id}`, x, id.charCodeAt(0) - 97, {
                observedAt: sequence * 100,
            })),
        })));
        return { scheduler, store };
    };
    const first = buildGlobalCapped();
    const second = buildGlobalCapped();
    const firstRecords = visibleRecords(first.store, 0);
    const secondRecords = visibleRecords(second.store, 0);
    assertEquals(firstRecords.length, 96, 'global cap is exact');
    const counts = new Map();
    for (const record of firstRecords) counts.set(record.ownerId, (counts.get(record.ownerId) || 0) + 1);
    assert([...counts.values()].every((count) => count <= 16), 'owner cap remains true under global pressure');
    assertEquals(
        firstRecords.map((record) => [record.ownerId, record.x, record.y, record.ordinal]),
        secondRecords.map((record) => [record.ownerId, record.x, record.y, record.ordinal]),
        'global eviction is deterministic',
    );
    assertEquals(first.scheduler.activeCount(), 1, 'global cap never creates another timer');
});

Deno.test('logical expiry is exact and visible never performs physical cleanup', () => {
    const scheduler = makeScheduler();
    const store = makeStore(scheduler);
    store.observeAccepted(makePresentation({ tracks: [makeTrack('track-a', 0, 0)] }));
    store.observeAccepted(makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 4, 0, { observedAt: 100 })],
    }));
    assertEquals(visibleRecords(store, 5999).length, 1, 'visible at 5999 ms');
    assertEquals(visibleRecords(store, 6000).length, 0, 'invisible exactly at 6000 ms');
    assertEquals(visibleRecords(store, 6001).length, 0, 'invisible after 6000 ms');
    assertEquals(store.stats().recordCount, 1, 'render visibility does not physically delete');
    assertEquals(scheduler.activeCount(), 1, 'render visibility does not alter timer');

    scheduler.setNow(6000);
    scheduler.runDue();
    assertEquals(store.stats().recordCount, 0, 'on-time callback physically deletes');
    assertEquals(scheduler.activeCount(), 0, 'on-time callback consumes timer');
});

Deno.test('delayed callback, accepted observation, and explicit expiry hook clean physical records', () => {
    const changes = [];
    const scheduler = makeScheduler();
    const store = makeStore(scheduler, () => changes.push('changed'));
    store.observeAccepted(makePresentation({ tracks: [makeTrack('track-a', 0, 0)] }));
    store.observeAccepted(makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 4, 0, { observedAt: 100 })],
    }));
    scheduler.setNow(7000);
    assertEquals(visibleRecords(store, 7000).length, 0, 'delayed record remains logically hidden');
    assertEquals(store.stats().recordCount, 1, 'delayed timer may retain one bounded record');
    scheduler.runDue();
    assertEquals(store.stats().recordCount, 0, 'delayed callback deletes expired record');
    assert(changes.length > 0, 'timer cleanup notifies renderer');

    const nextScheduler = makeScheduler();
    const nextStore = makeStore(nextScheduler);
    nextStore.observeAccepted(makePresentation({ tracks: [makeTrack('track-a', 0, 0)] }));
    nextStore.observeAccepted(makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 4, 0, { observedAt: 100 })],
    }));
    nextScheduler.setNow(7000);
    nextStore.observeAccepted(makePresentation({
        sequence: 2,
        reset: false,
        tracks: [makeTrack('track-a', 8, 0, { observedAt: 200 })],
    }));
    const nextRecords = visibleRecords(nextStore, 7000);
    assertEquals(nextRecords.length, 1, 'accepted observation purges old and may add current record');
    assertEquals(nextRecords[0].createdAtMs, 7000, 'only current record remains');

    const resumeScheduler = makeScheduler();
    const resumeStore = makeStore(resumeScheduler);
    resumeStore.observeAccepted(makePresentation({ tracks: [makeTrack('track-a', 0, 0)] }));
    resumeStore.observeAccepted(makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 4, 0, { observedAt: 100 })],
    }));
    resumeScheduler.setNow(7000);
    const expired = resumeStore.expire();
    assertEquals(expired.removed, 1, 'visibility/pageshow cleanup removes expired record');
    assertEquals(resumeStore.stats().recordCount, 0, 'explicit cleanup is physical');
    assertEquals(resumeScheduler.activeCount(), 0, 'explicit cleanup cancels obsolete timer');
});

Deno.test('timer is rearmed for the earliest remaining deadline and reset/destroy cancel handles', () => {
    const scheduler = makeScheduler();
    const store = makeStore(scheduler);
    store.observeAccepted(makePresentation({
        tracks: [makeTrack('track-a', 0, 0), makeTrack('track-b', 0, 10)],
    }));
    store.observeAccepted(makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 4, 0, { observedAt: 100 }), makeTrack('track-b', 0, 10, { observedAt: 100 })],
    }));
    assertEquals(scheduler.deadlines(), [6000], 'first owner supplies earliest deadline');
    const staleEarliestHandle = scheduler.activeHandles()[0];
    scheduler.setNow(100);
    store.observeAccepted(makePresentation({
        sequence: 2,
        reset: false,
        tracks: [makeTrack('track-a', 4, 0, { observedAt: 200 }), makeTrack('track-b', 4, 10, { observedAt: 200 })],
    }));
    assertEquals(scheduler.deadlines(), [6000], 'later emission does not add a second timer');
    store.observeAccepted(makePresentation({
        sequence: 3,
        reset: false,
        tracks: [makeTrack('track-b', 4, 10, { observedAt: 300 })],
        removedTrackIds: ['track-a'],
    }));
    assertEquals(scheduler.deadlines(), [6100], 'removing earliest owner rearms to next deadline');
    assert(scheduler.clearCount() >= 1, 'obsolete timer handle is cancelled');
    const rearmedHandle = scheduler.activeHandles()[0];
    assert(rearmedHandle !== staleEarliestHandle, 'rearm owns a new handle');
    scheduler.invokeIssued(staleEarliestHandle);
    assertEquals(scheduler.activeHandles(), [rearmedHandle], 'cancelled callback cannot replace live timer');
    assertEquals(scheduler.deadlines(), [6100], 'cancelled callback cannot duplicate a deadline');

    store.reset('disconnect', 100);
    assertEquals(scheduler.activeCount(), 0, 'reset cancels timer');
    assertEquals(store.stats().recordCount, 0, 'reset clears records');
    assertEquals(store.stats().anchorCount, 0, 'reset clears anchors');

    store.observeAccepted(makePresentation({ tracks: [makeTrack('track-a', 0, 0)] }), 100);
    store.observeAccepted(makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 4, 0, { observedAt: 100 })],
    }), 100);
    assertEquals(scheduler.activeCount(), 1, 'history restarted');
    const preDestroyHandle = scheduler.activeHandles()[0];
    store.destroy();
    assertEquals(scheduler.activeCount(), 0, 'destroy cancels timer');
    assertEquals(store.stats().recordCount, 0, 'destroy clears records');
    assert(store.stats().destroyed, 'destroyed state is reported without coordinates');
    scheduler.invokeIssued(preDestroyHandle);
    assertEquals(scheduler.activeCount(), 0, 'stale callback after destroy is inert');
    assertEquals(store.stats().recordCount, 0, 'stale callback cannot revive destroyed history');
    assertEquals(store.observeAccepted(makePresentation()).reason, 'destroyed', 'destroyed store rejects work');
});

Deno.test('cancelled callback stays inert across reset and replacement history', () => {
    const scheduler = makeScheduler();
    const store = makeStore(scheduler);
    store.observeAccepted(makePresentation({ tracks: [makeTrack('track-a', 0, 0)] }));
    store.observeAccepted(makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 4, 0, { observedAt: 100 })],
    }));
    const oldHandle = scheduler.activeHandles()[0];

    store.reset('explicit-reset', 0);
    store.observeAccepted(makePresentation({
        generationId: 'generation-b',
        tracks: [makeTrack('track-b', 0, 10)],
    }), 0);
    store.observeAccepted(makePresentation({
        generationId: 'generation-b',
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-b', 4, 10, { observedAt: 100 })],
    }), 0);
    const replacementHandle = scheduler.activeHandles()[0];
    assert(replacementHandle !== oldHandle, 'replacement history owns a new timer');
    const replacementRecords = visibleRecords(store, 0);

    scheduler.invokeIssued(oldHandle);
    assertEquals(scheduler.activeHandles(), [replacementHandle], 'pre-reset callback cannot clear live handle');
    assertEquals(scheduler.deadlines(), [6000], 'pre-reset callback cannot arm a duplicate');
    assertEquals(visibleRecords(store, 0), replacementRecords, 'pre-reset callback cannot alter new history');
});

Deno.test('throwing injected clock fails closed in every public default-clock path', () => {
    const scheduler = makeScheduler();
    const throwingClock = () => {
        throw new Error('clock unavailable');
    };
    const store = new RoomaboutsTrailStore({
        clock: throwingClock,
        setTimeout: scheduler.setTimeout,
        clearTimeout: scheduler.clearTimeout,
    });
    store.observeAccepted(makePresentation({ tracks: [makeTrack('track-a', 0, 0)] }), 0);
    store.observeAccepted(makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 4, 0, { observedAt: 100 })],
    }), 0);
    assertEquals(store.visible().reason, 'invalid-clock', 'visible catches default clock exception');
    assertEquals(store.stats().recordCount, 1, 'failed visible remains nonmutating');
    assertEquals(store.expire().reason, 'invalid-clock', 'expire catches default clock exception');
    assertEquals(store.stats().recordCount, 1, 'failed expiry remains nonmutating');

    const rejected = store.observeAccepted(makePresentation({
        sequence: 2,
        reset: false,
        tracks: [makeTrack('track-a', 8, 0, { observedAt: 200 })],
    }));
    assertEquals(rejected.reason, 'invalid-clock', 'observe catches default clock exception');
    assertEquals(store.stats().recordCount, 0, 'failed observe resets private history');
    assertEquals(scheduler.activeCount(), 0, 'failed observe cancels timer');

    store.observeAccepted(makePresentation({ tracks: [makeTrack('track-a', 0, 0)] }), 0);
    store.observeAccepted(makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 4, 0, { observedAt: 100 })],
    }), 0);
    assertEquals(store.reset().reason, 'invalid-clock', 'reset catches default clock exception');
    assertEquals(store.stats().recordCount, 0, 'failed-clock reset still clears history');
    assertEquals(scheduler.activeCount(), 0, 'failed-clock reset cancels timer');
});

Deno.test('clock regression fails closed in visible and resets/rejects observe', () => {
    const scheduler = makeScheduler(100);
    const store = makeStore(scheduler);
    store.observeAccepted(makePresentation({ tracks: [makeTrack('track-a', 0, 0)] }));
    store.observeAccepted(makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 4, 0, { observedAt: 100 })],
    }));
    const failed = store.visible(99);
    assert(Object.isFrozen(failed), 'failed visibility is immutable');
    assertEquals(failed, { ok: false, reason: 'clock-regression', records: [] }, 'visible regression result');
    assertEquals(store.stats().recordCount, 1, 'visible regression does not mutate');

    const rejected = store.observeAccepted(makePresentation({
        sequence: 2,
        reset: false,
        tracks: [makeTrack('track-a', 8, 0, { observedAt: 200 })],
    }), 99);
    assertEquals(rejected.reason, 'clock-regression', 'observe regression is rejected');
    assertEquals(store.stats().recordCount, 0, 'observe regression resets complete store');
    assertEquals(store.stats().anchorCount, 0, 'observe regression clears anchor');
    assertEquals(scheduler.activeCount(), 0, 'observe regression cancels timer');

    store.observeAccepted(makePresentation({
        sequence: 3,
        reset: false,
        tracks: [makeTrack('track-a', 12, 0, { observedAt: 300 })],
    }), 99);
    assertEquals(store.stats().recordCount, 0, 'first observation after reset only seeds');
    store.observeAccepted(makePresentation({
        sequence: 4,
        reset: false,
        tracks: [makeTrack('track-a', 16, 0, { observedAt: 400 })],
    }), 100);
    assertEquals(visibleRecords(store, 100).map((record) => record.x), [16], 'history restarts without revival');

    store.reset('backward-seek', 10);
    assert(store.visible(10).ok, 'explicit reset establishes an older monotonic baseline');
});

Deno.test('invalid coordinate spaces and lifecycle combinations fail closed owner-locally', () => {
    const scheduler = makeScheduler();
    const store = makeStore(scheduler);
    store.observeAccepted(makePresentation({ tracks: [makeTrack('track-a', 0, 0)] }));
    const invalidSpace = store.observeAccepted(makePresentation({
        sequence: 1,
        reset: false,
        tracks: [makeTrack('track-a', 4, 0, {
            position: { x: 4, y: 0, coordinateSpace: 'screen' },
            observedAt: 100,
        })],
    }));
    assertEquals(invalidSpace.rejected, 1, 'invalid coordinate space rejected');
    store.observeAccepted(makePresentation({
        sequence: 2,
        reset: false,
        tracks: [makeTrack('track-a', 8, 0, { observedAt: 200 })],
    }));
    assertEquals(store.stats().recordCount, 0, 'valid recovery seeds after invalid space');

    const invalidPair = store.observeAccepted(makePresentation({
        sequence: 3,
        reset: false,
        tracks: [makeTrack('track-a', 12, 0, {
            observedAt: 300,
            lifecycle: 'fading',
            positionBasis: 'observed',
            emitFootprint: true,
        })],
    }));
    assertEquals(invalidPair.rejected, 1, 'invalid lifecycle pair rejected');
    store.observeAccepted(makePresentation({
        sequence: 4,
        reset: false,
        tracks: [makeTrack('track-a', 16, 0, { observedAt: 400 })],
    }));
    assertEquals(store.stats().recordCount, 0, 'invalid lifecycle also forces reseed');

    const invalidTime = store.observeAccepted(makePresentation({
        sequence: 5,
        reset: false,
        tracks: [makeTrack('track-a', 20, 0, { observedAt: Number.POSITIVE_INFINITY })],
    }));
    assertEquals(invalidTime.rejected, 1, 'nonfinite observation time rejected');
    assertEquals(store.visible(Number.NaN).reason, 'invalid-clock', 'nonfinite render clock fails closed');
    assert(Object.isFrozen(store.stats()), 'bounded stats are immutable');
    assertEquals(
        Object.keys(store.stats()).sort(),
        ['anchorCount', 'destroyed', 'ownerCount', 'recordCount', 'timerScheduled'],
        'stats expose only bounded counts and state',
    );
});
