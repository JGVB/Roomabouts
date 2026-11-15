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
