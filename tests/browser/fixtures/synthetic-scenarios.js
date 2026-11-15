function deepFreeze(value) {
    if (!value || typeof value !== 'object') return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
}

const BASE_MAP = Object.freeze({
    mapId: 'default',
    config: Object.freeze({
        fused_color: '#6B4F2A',
        panel_opacity: 0.72,
        show_heading: false,
        show_labels: true,
        show_trails: true,
        target_render_mode: 'css',
        zone_stroke: 0.8,
    }),
    zones: Object.freeze({
        include_zones: Object.freeze([
            Object.freeze({
                name: 'Synthetic room',
                points: Object.freeze([
                    Object.freeze([12, 15]),
                    Object.freeze([88, 15]),
                    Object.freeze([88, 85]),
                    Object.freeze([12, 85]),
                ]),
            }),
        ]),
        exclude_zones: Object.freeze([]),
        entrance_zones: Object.freeze([]),
        stationary_zones: Object.freeze([]),
    }),
    radars: Object.freeze([
        Object.freeze({
            sensorId: 'source-aaaaaaaaaaaa',
            mapGroup: 'default',
            paused: false,
            layout: Object.freeze({
                origin_x: 50,
                origin_y: 92,
                pose_revision: 'pose-aaaaaaaaaaaa',
                radar_type: 2,
                rotation: 0,
                scale_x: 5,
                scale_y: 5,
            }),
            monitor_zones: Object.freeze([]),
            hw_detect_zones: Object.freeze([]),
            hw_block_zones: Object.freeze([]),
            hw_stay_zones: Object.freeze([]),
        }),
    ]),
});

const SOURCE_HEALTH_ONLINE = Object.freeze([
    Object.freeze({
        sensorId: 'source-aaaaaaaaaaaa',
        status: 'online',
        reason: 'available',
        updatedAt: 0,
    }),
]);

function track({
    trackId,
    alias,
    x,
    y,
    observedAt,
    age = 0,
    lifecycle = 'confirmed',
    positionBasis = 'observed',
    sourceRef = 'source-aaaaaaaaaaaa:slot-111111',
    uncertainty,
}) {
    const value = {
        trackId,
        position: { x, y, coordinateSpace: 'map-layout' },
        positionBasis,
        lifecycle,
        anonymousAlias: alias,
        sourceRefs: sourceRef ? [sourceRef] : [],
        observedAt,
        lastObservedAgeMs: age,
    };
    if (uncertainty) value.uncertainty = [uncertainty];
    return value;
}

function snapshot({ generationId, sequence, logicalTimeMs, tracks = [], resetReason }) {
    const value = {
        schemaVersion: 1,
        generationId,
        sequence,
        logicalTimeMs,
        map: BASE_MAP,
        tracks,
        sourceHealth: SOURCE_HEALTH_ONLINE.map((item) => ({
            ...item,
            updatedAt: logicalTimeMs,
        })),
    };
    if (resetReason) value.resetReason = resetReason;
    return value;
}

const WALK_TRACK_ID = 'track-111111111111';
const WALK_ALIAS = 'Wayfarer-111111';

export const SYNTHETIC_SCENARIOS = deepFreeze([
    Object.freeze({
        id: 'walk-and-fade',
        label: 'Walk, hold, and fade',
        description: 'One anonymous synthetic track changes source slot, coasts, fades, and expires.',
        privacy: 'synthetic-only',
        frames: Object.freeze([
            snapshot({
                generationId: 'fixture-walk-generation-a',
                sequence: 0,
                logicalTimeMs: 0,
                resetReason: 'integration-load',
            }),
            snapshot({
                generationId: 'fixture-walk-generation-a',
                sequence: 1,
                logicalTimeMs: 500,
                tracks: [track({
                    trackId: WALK_TRACK_ID,
                    alias: WALK_ALIAS,
                    x: 28,
                    y: 72,
                    observedAt: 500,
                })],
            }),
            snapshot({
                generationId: 'fixture-walk-generation-a',
                sequence: 2,
                logicalTimeMs: 1000,
                tracks: [track({
                    trackId: WALK_TRACK_ID,
                    alias: WALK_ALIAS,
                    x: 42,
                    y: 60,
                    observedAt: 1000,
                    sourceRef: 'source-aaaaaaaaaaaa:slot-999999',
                })],
            }),
            snapshot({
                generationId: 'fixture-walk-generation-a',
                sequence: 3,
                logicalTimeMs: 1500,
                tracks: [track({
                    trackId: WALK_TRACK_ID,
                    alias: WALK_ALIAS,
                    x: 42,
                    y: 60,
                    observedAt: 1000,
                    age: 500,
                    lifecycle: 'coasting',
                    positionBasis: 'held',
                    sourceRef: null,
                    uncertainty: 'held-in-stationary-zone',
                })],
            }),
            snapshot({
                generationId: 'fixture-walk-generation-a',
                sequence: 4,
                logicalTimeMs: 2200,
                tracks: [track({
                    trackId: WALK_TRACK_ID,
                    alias: WALK_ALIAS,
                    x: 42,
                    y: 60,
                    observedAt: 1000,
                    age: 1200,
                    lifecycle: 'fading',
                    positionBasis: 'last-seen',
                    sourceRef: null,
                    uncertainty: 'source-not-currently-observed',
                })],
            }),
            snapshot({
                generationId: 'fixture-walk-generation-a',
                sequence: 5,
                logicalTimeMs: 3000,
            }),
        ]),
    }),
    Object.freeze({
        id: 'generation-reset',
        label: 'Generation reset and ID reuse',
        description: 'A reused inherited identity receives a new opaque track and alias after restart.',
        privacy: 'synthetic-only',
        frames: Object.freeze([
            snapshot({
                generationId: 'fixture-reset-generation-a',
                sequence: 0,
                logicalTimeMs: 0,
                resetReason: 'integration-load',
                tracks: [track({
                    trackId: 'track-222222222222',
                    alias: 'Wayfarer-222222',
                    x: 36,
                    y: 55,
                    observedAt: 0,
                })],
            }),
            snapshot({
                generationId: 'fixture-reset-generation-a',
                sequence: 1,
                logicalTimeMs: 700,
                tracks: [track({
                    trackId: 'track-222222222222',
                    alias: 'Wayfarer-222222',
                    x: 50,
                    y: 48,
                    observedAt: 700,
                })],
            }),
            snapshot({
                generationId: 'fixture-reset-generation-b',
                sequence: 0,
                logicalTimeMs: 0,
                resetReason: 'source-restart',
                tracks: [track({
                    trackId: 'track-333333333333',
                    alias: 'Wayfarer-333333',
                    x: 50,
                    y: 48,
                    observedAt: 0,
                    sourceRef: 'source-aaaaaaaaaaaa:slot-111111',
                })],
            }),
            snapshot({
                generationId: 'fixture-reset-generation-b',
                sequence: 1,
                logicalTimeMs: 600,
                tracks: [track({
                    trackId: 'track-333333333333',
                    alias: 'Wayfarer-333333',
                    x: 63,
                    y: 40,
                    observedAt: 600,
                })],
            }),
        ]),
    }),
    Object.freeze({
        id: 'three-anonymous-tracks',
        label: 'Three anonymous tracks',
        description: 'The maximum initial synthetic renderer load with no identity claims.',
        privacy: 'synthetic-only',
        frames: Object.freeze([
            snapshot({
                generationId: 'fixture-many-generation-a',
                sequence: 0,
                logicalTimeMs: 0,
                resetReason: 'integration-load',
                tracks: [
                    track({
                        trackId: 'track-444444444444',
                        alias: 'Wayfarer-444444',
                        x: 30,
                        y: 35,
                        observedAt: 0,
                        sourceRef: 'source-aaaaaaaaaaaa:slot-111111',
                    }),
                    track({
                        trackId: 'track-555555555555',
                        alias: 'Wayfarer-555555',
                        x: 50,
                        y: 55,
                        observedAt: 0,
                        sourceRef: 'source-aaaaaaaaaaaa:slot-222222',
                    }),
                    track({
                        trackId: 'track-666666666666',
                        alias: 'Wayfarer-666666',
                        x: 70,
                        y: 42,
                        observedAt: 0,
                        sourceRef: 'source-aaaaaaaaaaaa:slot-333333',
                    }),
                ],
            }),
            snapshot({
                generationId: 'fixture-many-generation-a',
                sequence: 1,
                logicalTimeMs: 800,
                tracks: [
                    track({
                        trackId: 'track-444444444444',
                        alias: 'Wayfarer-444444',
                        x: 36,
                        y: 32,
                        observedAt: 800,
                        sourceRef: 'source-aaaaaaaaaaaa:slot-111111',
                    }),
                    track({
                        trackId: 'track-555555555555',
                        alias: 'Wayfarer-555555',
                        x: 54,
                        y: 60,
                        observedAt: 800,
                        sourceRef: 'source-aaaaaaaaaaaa:slot-222222',
                    }),
                    track({
                        trackId: 'track-666666666666',
                        alias: 'Wayfarer-666666',
                        x: 66,
                        y: 48,
                        observedAt: 800,
                        sourceRef: 'source-aaaaaaaaaaaa:slot-333333',
                    }),
                ],
            }),
        ]),
    }),
]);
