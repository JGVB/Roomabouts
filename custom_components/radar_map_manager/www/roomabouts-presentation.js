export const ROOMABOUTS_SNAPSHOT_SCHEMA_VERSION = 1;

export const ROOMABOUTS_PRESENTATION_LIMITS = Object.freeze({
    maxTreeDepth: 12,
    maxTreeNodes: 20_000,
    maxObjectKeys: 64,
    maxArrayItems: 512,
    maxTracks: 128,
    maxSources: 64,
    maxRadars: 64,
    maxZonesPerKind: 128,
    maxPointsPerZone: 256,
});

const RESET_REASONS = new Set([
    'explicit-reset',
    'integration-load',
    'map-replaced',
    'privacy-clear',
    'source-restart',
]);
const LIFECYCLES = new Set(['tentative', 'confirmed', 'coasting', 'fading']);
const POSITION_BASES = new Set(['observed', 'interpolated', 'held', 'last-seen']);
const LIFECYCLE_POSITION_BASES = Object.freeze({
    tentative: new Set(['observed']),
    confirmed: new Set(['observed', 'interpolated']),
    coasting: new Set(['held', 'interpolated']),
    fading: new Set(['last-seen']),
});
const UNCERTAINTY_REASONS = new Set([
    'held-in-stationary-zone',
    'source-not-currently-observed',
    'source-unverified',
]);
const POSTURES = new Set([
    'fallen',
    'resting',
    'sitting',
    'standing',
    'suspected_fall',
    'unknown',
]);
const SOURCE_HEALTH_REASONS = new Set([
    'available',
    'initialized',
    'malformed',
    'partial-sample',
    'restart',
    'stale-sample',
    'unknown-sensor',
    'unsupported-unit',
    'unavailable',
]);
const SOURCE_STATUSES = new Set(['online', 'degraded', 'offline']);
const LOCAL_RESET_REASONS = new Set([
    ...RESET_REASONS,
    'disconnect',
    'generation-change',
    'initial-snapshot',
    'map-change',
]);
const MAP_ZONE_GROUPS = [
    'include_zones',
    'exclude_zones',
    'entrance_zones',
    'stationary_zones',
];
const RADAR_ZONE_GROUPS = [
    'monitor_zones',
    'hw_detect_zones',
    'hw_block_zones',
    'hw_stay_zones',
];
const MAP_CONFIG_KEYS = new Set([
    'ema_smoothing_level',
    'enable_tracking',
    'enable_verify_rule',
    'fall_alert_enabled',
    'fall_duration',
    'fall_threshold_h',
    'fused_color',
    'hibernation_ttl',
    'map_scale_x',
    'map_scale_y',
    'max_jump_base',
    'max_jump_speed',
    'merge_distance',
    'panel_opacity',
    'radar_radius',
    'show_heading',
    'show_labels',
    'show_trails',
    'stationary_max_hold',
    'target_height',
    'target_render_mode',
    'update_interval',
    'verify_delay',
    'zone_stroke',
]);
const BOOLEAN_CONFIG_KEYS = new Set([
    'enable_tracking',
    'enable_verify_rule',
    'fall_alert_enabled',
    'show_heading',
    'show_labels',
    'show_trails',
]);
const LAYOUT_KEYS = new Set([
    'ceiling_mount',
    'enable_3d',
    'mirror_x',
    'mount_height',
    'origin_x',
    'origin_y',
    'pose_revision',
    'radar_type',
    'rotation',
    'scale_x',
    'scale_y',
    'z_max',
    'z_min',
]);
const BOOLEAN_LAYOUT_KEYS = new Set(['ceiling_mount', 'enable_3d', 'mirror_x']);
const TRACK_ID = /^track-[0-9a-f]{12}$/;
const SOURCE_ID = /^source-[0-9a-f]{12}$/;
const SOURCE_REF = /^source-[0-9a-f]{12}(?::slot-[0-9a-f]{6})?$/;
const POSE_REVISION = /^pose-[0-9a-f]{12}$/;
const ANONYMOUS_ALIAS = /^Wayfarer-[0-9a-f]{6}$/;
const COLOR = /^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$/;

export class RoomaboutsSnapshotError extends TypeError {
    constructor(code, path) {
        super(`${path} does not match RoomaboutsSnapshotV1 (${code})`);
        this.name = 'RoomaboutsSnapshotError';
        this.code = code;
        this.path = path;
    }
}

const fail = (code, path) => {
    throw new RoomaboutsSnapshotError(code, path);
};

const isRecord = (value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

const assertTreeBounds = (root) => {
    const stack = [{ value: root, depth: 0 }];
    const seen = new WeakSet();
    let nodes = 0;
    while (stack.length) {
        const { value, depth } = stack.pop();
        nodes += 1;
        if (nodes > ROOMABOUTS_PRESENTATION_LIMITS.maxTreeNodes) fail('tree-too-large', '$');
        if (depth > ROOMABOUTS_PRESENTATION_LIMITS.maxTreeDepth) fail('tree-too-deep', '$');
        if (value === null || typeof value !== 'object') continue;
        if (seen.has(value)) fail('cyclic-value', '$');
        seen.add(value);
        if (Array.isArray(value)) {
            if (value.length > ROOMABOUTS_PRESENTATION_LIMITS.maxArrayItems) {
                fail('array-too-large', '$');
            }
            for (const item of value) stack.push({ value: item, depth: depth + 1 });
            continue;
        }
        if (!isRecord(value)) fail('unsupported-object', '$');
        const keys = Object.keys(value);
        if (keys.length > ROOMABOUTS_PRESENTATION_LIMITS.maxObjectKeys) {
            fail('object-too-large', '$');
        }
        for (const key of keys) stack.push({ value: value[key], depth: depth + 1 });
    }
};

const exactKeys = (value, required, optional, path) => {
    if (!isRecord(value)) fail('object-required', path);
    const allowed = new Set([...required, ...optional]);
    for (const key of Object.keys(value)) {
        if (!allowed.has(key)) fail('unsupported-field', path);
    }
    for (const key of required) {
        if (!Object.hasOwn(value, key)) fail('missing-field', path);
    }
};

const safeString = (value, path, { maxLength = 128, pattern } = {}) => {
    if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
        fail('invalid-string', path);
    }
    if (pattern && !pattern.test(value)) fail('invalid-string-format', path);
    return value;
};

const finiteNumber = (value, path, { min = -1_000_000_000, max = 1_000_000_000 } = {}) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        fail('invalid-number', path);
    }
    return value;
};

const safeInteger = (value, path) => {
    if (!Number.isSafeInteger(value) || value < 0) fail('invalid-integer', path);
    return value;
};

const enumValue = (value, allowed, path) => {
    if (!allowed.has(value)) fail('invalid-enum', path);
    return value;
};

const copyUniqueStringList = (value, path, { maxItems, allowed, pattern }) => {
    if (!Array.isArray(value) || value.length > maxItems) fail('invalid-array', path);
    const result = [];
    const seen = new Set();
    for (let index = 0; index < value.length; index += 1) {
        const itemPath = `${path}[${index}]`;
        const item = safeString(value[index], itemPath, { maxLength: 128, pattern });
        if (allowed && !allowed.has(item)) fail('invalid-enum', itemPath);
        if (seen.has(item)) fail('duplicate-value', path);
        seen.add(item);
        result.push(item);
    }
    return result;
};

const copyPoint = (value, path) => {
    if (!Array.isArray(value) || value.length !== 2) fail('invalid-point', path);
    return [
        finiteNumber(value[0], `${path}[0]`),
        finiteNumber(value[1], `${path}[1]`),
    ];
};

const copyZone = (value, path) => {
    exactKeys(value, ['points'], ['name', 'delay', 'color'], path);
    if (!Array.isArray(value.points)
        || value.points.length > ROOMABOUTS_PRESENTATION_LIMITS.maxPointsPerZone) {
        fail('invalid-points', `${path}.points`);
    }
    const zone = {
        points: value.points.map((point, index) => copyPoint(point, `${path}.points[${index}]`)),
    };
    if (Object.hasOwn(value, 'name')) {
        zone.name = safeString(value.name, `${path}.name`, { maxLength: 96 });
    }
    if (Object.hasOwn(value, 'delay')) {
        zone.delay = finiteNumber(value.delay, `${path}.delay`, { min: 0, max: 86_400 });
    }
    if (Object.hasOwn(value, 'color')) {
        zone.color = safeString(value.color, `${path}.color`, { maxLength: 9, pattern: COLOR });
    }
    return zone;
};

const copyZoneList = (value, path) => {
    if (!Array.isArray(value)
        || value.length > ROOMABOUTS_PRESENTATION_LIMITS.maxZonesPerKind) {
        fail('invalid-zone-list', path);
    }
    return value.map((zone, index) => copyZone(zone, `${path}[${index}]`));
};

const copyZones = (value, path, groups) => {
    exactKeys(value, groups, [], path);
    const result = {};
    for (const group of groups) result[group] = copyZoneList(value[group], `${path}.${group}`);
    return result;
};

const copyConfig = (value, path) => {
    if (!isRecord(value)) fail('object-required', path);
    const result = {};
    for (const key of Object.keys(value).sort()) {
        if (!MAP_CONFIG_KEYS.has(key)) fail('unsupported-field', path);
        const itemPath = `${path}.${key}`;
        if (BOOLEAN_CONFIG_KEYS.has(key)) {
            if (typeof value[key] !== 'boolean') fail('invalid-boolean', itemPath);
            result[key] = value[key];
        } else if (key === 'fused_color') {
            result[key] = safeString(value[key], itemPath, { maxLength: 9, pattern: COLOR });
        } else if (key === 'target_render_mode') {
            result[key] = enumValue(value[key], new Set(['css', 'canvas']), itemPath);
        } else {
            result[key] = finiteNumber(value[key], itemPath);
        }
    }
    return result;
};

const copyLayout = (value, path) => {
    if (!isRecord(value)) fail('object-required', path);
    const result = {};
    for (const key of Object.keys(value).sort()) {
        if (!LAYOUT_KEYS.has(key)) fail('unsupported-field', path);
        const itemPath = `${path}.${key}`;
        if (BOOLEAN_LAYOUT_KEYS.has(key)) {
            if (typeof value[key] !== 'boolean') fail('invalid-boolean', itemPath);
            result[key] = value[key];
        } else if (key === 'pose_revision') {
            result[key] = safeString(value[key], itemPath, {
                maxLength: 17,
                pattern: POSE_REVISION,
            });
        } else {
            result[key] = finiteNumber(value[key], itemPath);
        }
    }
    return result;
};

const copyRadar = (value, path, expectedMapId) => {
    const required = ['sensorId', 'mapGroup', 'paused', 'layout', ...RADAR_ZONE_GROUPS];
    exactKeys(value, required, [], path);
    const sensorId = safeString(value.sensorId, `${path}.sensorId`, {
        maxLength: 19,
        pattern: SOURCE_ID,
    });
    const mapGroup = safeString(value.mapGroup, `${path}.mapGroup`, { maxLength: 128 });
    if (mapGroup !== expectedMapId) fail('map-mismatch', `${path}.mapGroup`);
    if (typeof value.paused !== 'boolean') fail('invalid-boolean', `${path}.paused`);
    const radar = {
        sensorId,
        mapGroup,
        paused: value.paused,
        layout: copyLayout(value.layout, `${path}.layout`),
    };
    for (const group of RADAR_ZONE_GROUPS) {
        radar[group] = copyZoneList(value[group], `${path}.${group}`);
    }
    return radar;
};

const copyMap = (value, path) => {
    exactKeys(value, ['mapId', 'config', 'zones', 'radars'], [], path);
    const mapId = safeString(value.mapId, `${path}.mapId`, { maxLength: 128 });
    if (!Array.isArray(value.radars)
        || value.radars.length > ROOMABOUTS_PRESENTATION_LIMITS.maxRadars) {
        fail('invalid-radars', `${path}.radars`);
    }
    const seenSensors = new Set();
    const radars = value.radars.map((radar, index) => {
        const copied = copyRadar(radar, `${path}.radars[${index}]`, mapId);
        if (seenSensors.has(copied.sensorId)) fail('duplicate-source', `${path}.radars`);
        seenSensors.add(copied.sensorId);
        return copied;
    });
    return {
        mapId,
        config: copyConfig(value.config, `${path}.config`),
        zones: copyZones(value.zones, `${path}.zones`, MAP_ZONE_GROUPS),
        radars,
    };
};

const copyTrack = (value, path, logicalTimeMs) => {
    exactKeys(
        value,
        [
            'trackId',
            'position',
            'positionBasis',
            'lifecycle',
            'anonymousAlias',
            'sourceRefs',
            'observedAt',
            'lastObservedAgeMs',
        ],
        ['uncertainty', 'posture'],
        path,
    );
    exactKeys(value.position, ['x', 'y', 'coordinateSpace'], [], `${path}.position`);
    if (value.position.coordinateSpace !== 'map-layout') {
        fail('invalid-coordinate-space', `${path}.position.coordinateSpace`);
    }
    const observedAt = finiteNumber(value.observedAt, `${path}.observedAt`, {
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
    });
    if (observedAt > logicalTimeMs) fail('future-observation', `${path}.observedAt`);
    const positionBasis = enumValue(
        value.positionBasis,
        POSITION_BASES,
        `${path}.positionBasis`,
    );
    const lifecycle = enumValue(value.lifecycle, LIFECYCLES, `${path}.lifecycle`);
    if (!LIFECYCLE_POSITION_BASES[lifecycle].has(positionBasis)) {
        fail('incompatible-lifecycle-position', path);
    }
    const track = {
        trackId: safeString(value.trackId, `${path}.trackId`, {
            maxLength: 18,
            pattern: TRACK_ID,
        }),
        position: {
            x: finiteNumber(value.position.x, `${path}.position.x`),
            y: finiteNumber(value.position.y, `${path}.position.y`),
            coordinateSpace: 'map-layout',
        },
        positionBasis,
        lifecycle,
        anonymousAlias: safeString(value.anonymousAlias, `${path}.anonymousAlias`, {
            maxLength: 15,
            pattern: ANONYMOUS_ALIAS,
        }),
        sourceRefs: copyUniqueStringList(value.sourceRefs, `${path}.sourceRefs`, {
            maxItems: 32,
            pattern: SOURCE_REF,
        }),
        observedAt,
        lastObservedAgeMs: finiteNumber(value.lastObservedAgeMs, `${path}.lastObservedAgeMs`, {
            min: 0,
            max: Number.MAX_SAFE_INTEGER,
        }),
    };
    if (Object.hasOwn(value, 'uncertainty')) {
        track.uncertainty = copyUniqueStringList(value.uncertainty, `${path}.uncertainty`, {
            maxItems: 16,
            allowed: UNCERTAINTY_REASONS,
        });
    }
    if (Object.hasOwn(value, 'posture')) {
        track.posture = enumValue(value.posture, POSTURES, `${path}.posture`);
    }
    return track;
};

const copySourceHealth = (value, path, logicalTimeMs) => {
    if (!Array.isArray(value)
        || value.length > ROOMABOUTS_PRESENTATION_LIMITS.maxSources) {
        fail('invalid-source-health', path);
    }
    const result = [];
    const seen = new Set();
    for (let index = 0; index < value.length; index += 1) {
        const item = value[index];
        const itemPath = `${path}[${index}]`;
        exactKeys(item, ['sensorId', 'status', 'reason'], ['updatedAt'], itemPath);
        const sensorId = safeString(item.sensorId, `${itemPath}.sensorId`, {
            maxLength: 19,
            pattern: SOURCE_ID,
        });
        if (seen.has(sensorId)) fail('duplicate-source', path);
        seen.add(sensorId);
        const copied = {
            sensorId,
            status: enumValue(item.status, SOURCE_STATUSES, `${itemPath}.status`),
            reason: enumValue(item.reason, SOURCE_HEALTH_REASONS, `${itemPath}.reason`),
        };
        if (Object.hasOwn(item, 'updatedAt')) {
            copied.updatedAt = finiteNumber(item.updatedAt, `${itemPath}.updatedAt`, {
                min: 0,
                max: Number.MAX_SAFE_INTEGER,
            });
            if (copied.updatedAt > logicalTimeMs) fail('future-source-health', `${itemPath}.updatedAt`);
        }
        result.push(copied);
    }
    return result;
};

/** Validate and detach one bounded RoomaboutsSnapshotV1 value. */
export function validateRoomaboutsSnapshot(value) {
    assertTreeBounds(value);
    exactKeys(
        value,
        ['schemaVersion', 'generationId', 'sequence', 'logicalTimeMs', 'map', 'tracks', 'sourceHealth'],
        ['resetReason'],
        '$',
    );
    if (value.schemaVersion !== ROOMABOUTS_SNAPSHOT_SCHEMA_VERSION) {
        fail('invalid-schema-version', '$.schemaVersion');
    }
    const generationId = safeString(value.generationId, '$.generationId', { maxLength: 256 });
    const sequence = safeInteger(value.sequence, '$.sequence');
    const logicalTimeMs = finiteNumber(value.logicalTimeMs, '$.logicalTimeMs', {
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
    });
    if (!Array.isArray(value.tracks)
        || value.tracks.length > ROOMABOUTS_PRESENTATION_LIMITS.maxTracks) {
        fail('invalid-tracks', '$.tracks');
    }
    const seenTrackIds = new Set();
    const seenAliases = new Set();
    const tracks = value.tracks.map((track, index) => {
        const copied = copyTrack(track, `$.tracks[${index}]`, logicalTimeMs);
        if (seenTrackIds.has(copied.trackId)) fail('duplicate-track', '$.tracks');
        if (seenAliases.has(copied.anonymousAlias)) fail('duplicate-alias', '$.tracks');
        seenTrackIds.add(copied.trackId);
        seenAliases.add(copied.anonymousAlias);
        return copied;
    });
    const snapshot = {
        schemaVersion: ROOMABOUTS_SNAPSHOT_SCHEMA_VERSION,
        generationId,
        sequence,
        logicalTimeMs,
        map: copyMap(value.map, '$.map'),
        tracks,
        sourceHealth: copySourceHealth(value.sourceHealth, '$.sourceHealth', logicalTimeMs),
    };
    if (Object.hasOwn(value, 'resetReason')) {
        snapshot.resetReason = enumValue(value.resetReason, RESET_REASONS, '$.resetReason');
    }
    return snapshot;
}

/** Only a confirmed, directly observed position may propose a new footprint. */
export const isFootprintEligible = (track) => (
    track?.lifecycle === 'confirmed' && track?.positionBasis === 'observed'
);

const ignoredResult = (reason, errorCode) => {
    const result = {
        accepted: false,
        reason,
        reset: false,
        tracks: [],
        sourceHealth: [],
        footprintCandidates: [],
        removedTrackIds: [],
        clearedTrackIds: [],
    };
    if (errorCode) result.errorCode = errorCode;
    return result;
};

export class RoomaboutsPresentationAdapter {
    /** Track only generation/sequence/lifecycle identifiers; never retain coordinates. */
    constructor() {
        this._generationId = null;
        this._mapId = null;
        this._lastSequence = null;
        this._activeTrackIds = new Set();
    }

    /** Accept one snapshot or return a side-effect-free ignored result. */
    ingest(rawSnapshot) {
        let snapshot;
        try {
            snapshot = validateRoomaboutsSnapshot(rawSnapshot);
        } catch (error) {
            if (error instanceof RoomaboutsSnapshotError) {
                return ignoredResult('invalid-snapshot', error.code);
            }
            return ignoredResult('invalid-snapshot', 'validation-failed');
        }

        const sameGeneration = this._generationId === snapshot.generationId;
        if (sameGeneration && this._lastSequence !== null && snapshot.sequence <= this._lastSequence) {
            const reason = snapshot.sequence === this._lastSequence
                ? 'duplicate-sequence'
                : 'out-of-order-sequence';
            return ignoredResult(reason);
        }

        let boundaryReason = null;
        if (this._generationId === null) {
            boundaryReason = snapshot.resetReason || 'initial-snapshot';
        } else if (!sameGeneration) {
            boundaryReason = snapshot.resetReason || 'generation-change';
        } else if (snapshot.map.mapId !== this._mapId) {
            boundaryReason = snapshot.resetReason || 'map-change';
        } else if (snapshot.resetReason) {
            boundaryReason = snapshot.resetReason;
        }

        const clearedTrackIds = boundaryReason
            ? [...this._activeTrackIds].sort()
            : [];
        if (boundaryReason) this._activeTrackIds.clear();

        const tracks = snapshot.tracks
            .map((track) => ({ ...track, emitFootprint: isFootprintEligible(track) }))
            .sort((left, right) => (
                left.trackId < right.trackId ? -1 : left.trackId > right.trackId ? 1 : 0
            ));
        const nextTrackIds = new Set(tracks.map((track) => track.trackId));
        const removedTrackIds = boundaryReason
            ? []
            : [...this._activeTrackIds]
                .filter((trackId) => !nextTrackIds.has(trackId))
                .sort();

        this._generationId = snapshot.generationId;
        this._mapId = snapshot.map.mapId;
        this._lastSequence = snapshot.sequence;
        this._activeTrackIds = nextTrackIds;

        return {
            accepted: true,
            reason: 'accepted',
            reset: boundaryReason !== null,
            resetReason: boundaryReason,
            schemaVersion: snapshot.schemaVersion,
            generationId: snapshot.generationId,
            sequence: snapshot.sequence,
            logicalTimeMs: snapshot.logicalTimeMs,
            map: snapshot.map,
            tracks,
            sourceHealth: snapshot.sourceHealth,
            footprintCandidates: tracks.filter((track) => track.emitFootprint),
            removedTrackIds,
            clearedTrackIds,
        };
    }

    /** Clear every generation-scoped identifier without echoing an unsafe reason. */
    reset(reason = 'explicit-reset') {
        const safeReason = LOCAL_RESET_REASONS.has(reason) ? reason : 'explicit-reset';
        const clearedTrackIds = [...this._activeTrackIds].sort();
        this._generationId = null;
        this._mapId = null;
        this._lastSequence = null;
        this._activeTrackIds.clear();
        return {
            accepted: true,
            reason: 'reset',
            reset: true,
            resetReason: safeReason,
            tracks: [],
            sourceHealth: [],
            footprintCandidates: [],
            removedTrackIds: [],
            clearedTrackIds,
        };
    }

    disconnect() {
        return this.reset('disconnect');
    }
}
