import coordinateCases from '../fixtures/coordinate-cases.json' with { type: 'json' };
import { RadarMath, TargetFilter } from '../../custom_components/radar_map_manager/www/radar-math.js';

const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const assertAlmostEquals = (actual, expected, tolerance, message) => {
    const difference = Math.abs(actual - expected);
    assert(
        Number.isFinite(actual) && difference <= tolerance,
        `${message}: expected ${expected} +/- ${tolerance}, got ${actual}`
    );
};

const assertDeepEquals = (actual, expected, message) => {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    assert(actualJson === expectedJson, `${message}: expected ${expectedJson}, got ${actualJson}`);
};

for (const coordinateCase of coordinateCases.cases) {
    Deno.test(`coordinate transform: ${coordinateCase.name}`, () => {
        const math = new RadarMath();
        const { config, point_mm: point, expected_canvas: expected } = coordinateCase;
        const canvas = math.calculate(config, point);

        assertAlmostEquals(
            canvas.left,
            expected.left,
            coordinateCases.calculate_tolerance,
            'calculated x coordinate'
        );
        assertAlmostEquals(
            canvas.top,
            expected.top,
            coordinateCases.calculate_tolerance,
            'calculated y coordinate'
        );

        const local = math.canvasToRadarLocal(config, canvas.left, canvas.top);
        assertAlmostEquals(
            local.xm,
            point.x / 1000,
            coordinateCases.calculate_tolerance,
            'canvas-to-radar x round trip'
        );
        assertAlmostEquals(
            local.ym,
            point.y / 1000,
            coordinateCases.calculate_tolerance,
            'canvas-to-radar y round trip'
        );

        const roundedCanvas = math.radarLocalToCanvas(config, point.x / 1000, point.y / 1000);
        assertAlmostEquals(
            roundedCanvas[0],
            Number(expected.left.toFixed(2)),
            coordinateCases.calculate_tolerance,
            'radar-to-canvas x coordinate'
        );
        assertAlmostEquals(
            roundedCanvas[1],
            Number(expected.top.toFixed(2)),
            coordinateCases.calculate_tolerance,
            'radar-to-canvas y coordinate'
        );

        const roundedLocal = math.canvasToRadarLocal(config, roundedCanvas[0], roundedCanvas[1]);
        assertAlmostEquals(
            roundedLocal.xm,
            point.x / 1000,
            coordinateCases.round_trip_tolerance,
            'rounded x round trip'
        );
        assertAlmostEquals(
            roundedLocal.ym,
            point.y / 1000,
            coordinateCases.round_trip_tolerance,
            'rounded y round trip'
        );
    });
}

Deno.test('finite configuration parsing preserves valid zero values', () => {
    const math = new RadarMath();
    const zeroConfig = {
        radar_type: 1,
        enable_correction: true,
        ceiling_mount: false,
        mount_height: 0,
        target_height: 0,
        origin_x: 0,
        origin_y: 0,
        rotation: 0,
        scale_x: 0,
        scale_y: 0
    };

    assertDeepEquals(
        math.calculate(zeroConfig, { x: 1000, y: 1000 }),
        { left: 0, top: 0, active: true },
        'zero-valued configuration'
    );
    assertDeepEquals(
        math.canvasToRadarLocal(zeroConfig, 25, 25),
        { xm: 0, ym: 0 },
        'zero scale remains finite during inverse conversion'
    );

    const fallback = math.calculate({
        enable_correction: false,
        origin_x: null,
        origin_y: Number.POSITIVE_INFINITY,
        rotation: null,
        scale_x: null,
        scale_y: Number.NaN
    }, { x: 0, y: 0 });
    assertDeepEquals(fallback, { left: 50, top: 50, active: true }, 'null and non-finite fallback');
});

const snapshotTracks = (tracks) => tracks.map((track) => ({
    id: track.id,
    x: track.x,
    y: track.y,
    vx: track.vx,
    vy: track.vy,
    targetX: track.targetX,
    targetY: track.targetY,
    lastUpdate: track.lastUpdate,
    alpha: track.alpha,
    metadata: track.metadata,
    history: track.history
}));

const runFilterScenario = () => {
    let now = 1000;
    const filter = new TargetFilter(() => now);
    const frames = [];

    filter.update('person-1', 0, 0, { source: 'fixture' });
    now = 1040;
    filter.update('person-1', 1, 2, { source: 'fixture' });
    now = 1056;
    frames.push(snapshotTracks(filter.step()));
    frames.push({ lastFrameTime: filter.lastFrameTime, trackCount: filter.tracks.size });

    now = 1200;
    filter.prune(new Set(['person-1']));
    frames.push({ retainedCount: filter.tracks.size });
    now = 2000;
    filter.prune(new Set());
    frames.push({ prunedCount: filter.tracks.size });

    return frames;
};

Deno.test('TargetFilter uses its injected clock deterministically', () => {
    const firstRun = runFilterScenario();
    const secondRun = runFilterScenario();

    assertDeepEquals(firstRun, secondRun, 'replayed filter output');
    assertDeepEquals(firstRun[1], { lastFrameTime: 1056, trackCount: 1 }, 'step clock');
    assertDeepEquals(firstRun[2], { retainedCount: 1 }, 'active-key pruning');
    assertDeepEquals(firstRun[3], { prunedCount: 0 }, 'injected prune clock');
});

const observedMetadata = Object.freeze({
    lifecycle: 'confirmed',
    positionBasis: 'observed',
    emitFootprint: true,
});

Deno.test('TargetFilter records history only for confirmed observed positions', () => {
    let now = 1000;
    const filter = new TargetFilter(() => now);

    const tentative = filter.update('tentative', 10, 20, {
        lifecycle: 'tentative',
        positionBasis: 'observed',
        emitFootprint: true,
    });
    const held = filter.update('held', 30, 40, {
        lifecycle: 'coasting',
        positionBasis: 'held',
        emitFootprint: true,
    });
    const fading = filter.update('fading', 50, 60, {
        lifecycle: 'fading',
        positionBasis: 'last-seen',
        emitFootprint: true,
    });
    const observed = filter.update('observed', 70, 80, observedMetadata);

    assertDeepEquals(tentative.history, [], 'tentative history is empty');
    assertDeepEquals(held.history, [], 'held history is empty');
    assertDeepEquals(fading.history, [], 'last-seen history is empty');
    assertDeepEquals(
        observed.history,
        [{ x: 70, y: 80, time: 1000 }],
        'confirmed observed history starts at the observation',
    );

    now = 1040;
    filter.step();
    assertDeepEquals(tentative.history, [], 'tentative step cannot add history');
    assertDeepEquals(held.history, [], 'held step cannot add history');
    assertDeepEquals(fading.history, [], 'fading step cannot add history');
});

Deno.test('TargetFilter clears non-emitting anchors and does not bridge re-observation', () => {
    let now = 2000;
    const filter = new TargetFilter(() => now);

    filter.update('track', 1, 1, observedMetadata);
    now = 2100;
    filter.update('track', 2, 2, observedMetadata);
    assertDeepEquals(
        filter.tracks.get('track').history,
        [
            { x: 1, y: 1, time: 2000 },
            { x: 2, y: 2, time: 2100 },
        ],
        'observed measurements create history using backend coordinates and time',
    );
    now = 2116;
    filter.step();

    now = 2200;
    filter.update('track', 3, 3, {
        lifecycle: 'coasting',
        positionBasis: 'held',
        emitFootprint: false,
    });
    assertDeepEquals(filter.tracks.get('track').history, [], 'held state clears the trail anchor');

    now = 2300;
    filter.update('track', 90, 90, observedMetadata);
    const reobserved = filter.tracks.get('track');
    assertDeepEquals(
        reobserved.history,
        [{ x: 90, y: 90, time: 2300 }],
        're-observation starts a new trail at the new position',
    );
    assertDeepEquals(
        { x: reobserved.x, y: reobserved.y, vx: reobserved.vx, vy: reobserved.vy },
        { x: 90, y: 90, vx: 0, vy: 0 },
        're-observation cannot interpolate from the stale anchor',
    );
});

Deno.test('TargetFilter steps never fabricate observed history samples', () => {
    let now = 4000;
    const filter = new TargetFilter(() => now);

    filter.update('track', 0, 0, observedMetadata);
    now = 4100;
    filter.update('track', 1, 2, observedMetadata);
    const measurementHistory = JSON.parse(JSON.stringify(filter.tracks.get('track').history));

    for (const frameTime of [4116, 4132, 4200, 4500]) {
        now = frameTime;
        filter.step();
    }

    assertDeepEquals(
        filter.tracks.get('track').history,
        measurementHistory,
        'filter-frame prediction cannot add trail samples without a backend update',
    );
    assertDeepEquals(
        measurementHistory,
        [
            { x: 0, y: 0, time: 4000 },
            { x: 1, y: 2, time: 4100 },
        ],
        'history samples use observed measurement coordinates and time',
    );
});

Deno.test('TargetFilter observed history stays distance-spaced and bounded', () => {
    let now = 5000;
    const filter = new TargetFilter(() => now);
    filter.update('track', 0, 0, observedMetadata);

    now += 30;
    filter.update('track', 0.4, 0, observedMetadata);
    assert(filter.tracks.get('track').history.length === 1, 'distance threshold remains strict');

    now += 30;
    filter.update('track', 0.41, 0, observedMetadata);
    for (let x = 1; x <= 8; x += 1) {
        now += 30;
        filter.update('track', x, 0, observedMetadata);
    }

    const history = filter.tracks.get('track').history;
    assert(history.length === 6, 'history remains capped at six observed samples');
    assertDeepEquals(
        history.map((sample) => sample.x),
        [3, 4, 5, 6, 7, 8],
        'oldest observed samples are evicted in insertion order',
    );
});

Deno.test('TargetFilter clear resets track and frame clock state', () => {
    let now = 3000;
    const filter = new TargetFilter(() => now);
    filter.update('track', 1, 1, observedMetadata);
    now = 3500;
    filter.clear();

    assert(filter.tracks.size === 0, 'clear removes tracks');
    assert(filter.lastFrameTime === 3500, 'clear resets the frame clock');
});
