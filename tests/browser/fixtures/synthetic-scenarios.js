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
                name: 'Synthetic region',
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

const EMPTY_MAP = deepFreeze({
    mapId: 'default',
    config: { target_render_mode: 'css' },
    zones: {
        include_zones: [],
        exclude_zones: [],
        entrance_zones: [],
        stationary_zones: [],
    },
    radars: [],
});

function radar(sensorHex, originX, originY) {
    return {
        sensorId: `source-${sensorHex}`,
        mapGroup: 'default',
        paused: false,
        layout: {
            origin_x: originX,
            origin_y: originY,
            pose_revision: `pose-${sensorHex}`,
            radar_type: 2,
            rotation: 0,
            scale_x: 5,
            scale_y: 5,
        },
        monitor_zones: [],
        hw_detect_zones: [],
        hw_block_zones: [],
        hw_stay_zones: [],
    };
}

const FIELD_LEDGER_MAP = deepFreeze({
    mapId: 'default',
    config: {
        fused_color: '#00FF00',
        show_heading: true,
        show_labels: true,
        show_trails: true,
        target_render_mode: 'css',
    },
    zones: {
        include_zones: [{
            name: 'Included survey region',
            points: [[8, 8], [42, 8], [42, 42], [8, 42]],
        }],
        exclude_zones: [{
            name: 'Excluded survey region',
            points: [[58, 8], [92, 8], [92, 42], [58, 42]],
        }],
        entrance_zones: [{
            name: 'Entrance survey region',
            points: [[8, 58], [30, 58], [30, 88], [8, 88]],
        }],
        stationary_zones: [{
            name: 'Stationary survey region',
            points: [[58, 58], [92, 58], [92, 88], [58, 88]],
        }],
    },
    radars: [
        radar('aaaaaaaaaaaa', 20, 92),
        radar('bbbbbbbbbbbb', 80, 92),
    ],
});

const FIELD_LEDGER_SOURCE_HEALTH = deepFreeze([
    {
        sensorId: 'source-aaaaaaaaaaaa',
        status: 'online',
        reason: 'available',
    },
    {
        sensorId: 'source-bbbbbbbbbbbb',
        status: 'offline',
        reason: 'unavailable',
    },
]);

const ALL_OFFLINE_SOURCE_HEALTH = deepFreeze(FIELD_LEDGER_MAP.radars.map((item) => ({
    sensorId: item.sensorId,
    status: 'offline',
    reason: 'unavailable',
})));

const HOSTILE_LITERAL_MAP = deepFreeze({
    ...FIELD_LEDGER_MAP,
    zones: {
        include_zones: [{
            name: '<img src=x onerror="roomaboutsCanary()">',
            points: [[8, 8], [42, 8], [42, 42], [8, 42]],
        }],
        exclude_zones: [{
            name: '<svg><image href="/tests/browser/canary-zone.svg"></image></svg>',
            points: [[58, 8], [92, 8], [92, 42], [58, 42]],
        }],
        entrance_zones: [{
            name: '"><a href="/tests/browser/canary-link">region</a>',
            points: [[8, 58], [30, 58], [30, 88], [8, 88]],
        }],
        stationary_zones: [{
            name: '<script>roomaboutsCanary()</script>',
            points: [[58, 58], [92, 58], [92, 88], [58, 88]],
        }],
    },
});

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
    posture,
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
    if (posture) value.posture = posture;
    return value;
}

function snapshot({
    generationId,
    sequence,
    logicalTimeMs,
    map = BASE_MAP,
    tracks = [],
    sourceHealth = SOURCE_HEALTH_ONLINE,
    resetReason,
}) {
    const value = {
        schemaVersion: 1,
        generationId,
        sequence,
        logicalTimeMs,
        map,
        tracks,
        sourceHealth: sourceHealth.map((item) => ({
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
        description: 'The same opaque track ID is reused with a different alias after a generation restart.',
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
                    trackId: 'track-222222222222',
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
                    trackId: 'track-222222222222',
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
        description: 'Three anonymous synthetic tracks with no identity claims.',
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
    Object.freeze({
        id: 'empty-configured-field',
        label: 'Empty configured field',
        description: 'A bounded empty field with no configured regions, stations, or tracks.',
        privacy: 'synthetic-only',
        frames: Object.freeze([
            snapshot({
                generationId: 'fixture-empty-generation-a',
                sequence: 0,
                logicalTimeMs: 0,
                resetReason: 'integration-load',
                map: EMPTY_MAP,
                sourceHealth: [],
            }),
        ]),
    }),
    Object.freeze({
        id: 'all-sources-offline',
        label: 'All survey stations offline',
        description: 'Two placed synthetic survey stations are offline with no track lifecycle claim.',
        privacy: 'synthetic-only',
        frames: Object.freeze([
            snapshot({
                generationId: 'fixture-offline-generation-a',
                sequence: 0,
                logicalTimeMs: 1000,
                resetReason: 'integration-load',
                map: FIELD_LEDGER_MAP,
                sourceHealth: ALL_OFFLINE_SOURCE_HEALTH,
            }),
        ]),
    }),
    Object.freeze({
        id: 'six-state-composite',
        label: 'Six truthful track states',
        description: 'All six valid track pairs, four configured region kinds, and a separate offline station.',
        privacy: 'synthetic-only',
        frames: Object.freeze([
            snapshot({
                generationId: 'fixture-composite-generation-a',
                sequence: 0,
                logicalTimeMs: 1000,
                resetReason: 'integration-load',
                map: FIELD_LEDGER_MAP,
                sourceHealth: FIELD_LEDGER_SOURCE_HEALTH,
                tracks: [
                    track({
                        trackId: 'track-777777777771',
                        alias: 'Wayfarer-777771',
                        x: 18,
                        y: 25,
                        observedAt: 1000,
                        lifecycle: 'tentative',
                        uncertainty: 'source-unverified',
                        sourceRef: null,
                    }),
                    track({
                        trackId: 'track-777777777772',
                        alias: 'Wayfarer-777772',
                        x: 32,
                        y: 35,
                        observedAt: 1000,
                    }),
                    track({
                        trackId: 'track-777777777773',
                        alias: 'Wayfarer-777773',
                        x: 47,
                        y: 28,
                        observedAt: 900,
                        age: 100,
                        lifecycle: 'confirmed',
                        positionBasis: 'interpolated',
                        sourceRef: null,
                    }),
                    track({
                        trackId: 'track-777777777774',
                        alias: 'Wayfarer-777774',
                        x: 60,
                        y: 45,
                        observedAt: 800,
                        age: 200,
                        lifecycle: 'coasting',
                        positionBasis: 'held',
                        uncertainty: 'held-in-stationary-zone',
                        sourceRef: null,
                    }),
                    track({
                        trackId: 'track-777777777775',
                        alias: 'Wayfarer-777775',
                        x: 72,
                        y: 55,
                        observedAt: 850,
                        age: 150,
                        lifecycle: 'coasting',
                        positionBasis: 'interpolated',
                        uncertainty: 'source-not-currently-observed',
                        sourceRef: null,
                    }),
                    track({
                        trackId: 'track-777777777776',
                        alias: 'Wayfarer-777776',
                        x: 82,
                        y: 68,
                        observedAt: 500,
                        age: 500,
                        lifecycle: 'fading',
                        positionBasis: 'last-seen',
                        uncertainty: 'source-not-currently-observed',
                        sourceRef: null,
                    }),
                ],
            }),
        ]),
    }),
    Object.freeze({
        id: 'hostile-literals',
        label: 'Hostile literals stay text',
        description: 'Markup-like region names and a posture event remain inert synthetic data.',
        privacy: 'synthetic-only',
        frames: Object.freeze([
            snapshot({
                generationId: 'fixture-hostile-generation-a',
                sequence: 0,
                logicalTimeMs: 1000,
                resetReason: 'integration-load',
                map: HOSTILE_LITERAL_MAP,
                sourceHealth: FIELD_LEDGER_SOURCE_HEALTH,
                tracks: [track({
                    trackId: 'track-888888888888',
                    alias: 'Wayfarer-888888',
                    x: 50,
                    y: 50,
                    observedAt: 1000,
                    posture: 'suspected_fall',
                })],
            }),
        ]),
    }),
]);
