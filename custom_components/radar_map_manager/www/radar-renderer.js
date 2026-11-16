import { TargetFilter } from './radar-math.js?v=1.5.0';
import { ROOMABOUTS_FIELD_LEDGER_TOKENS } from './roomabouts-theme.js?v=1.5.0';
import { projectRoomaboutsStep } from './roomabouts-trails.js?v=1.5.0';

const MAX_DOM_TRAILS = 96;

export const ROOMABOUTS_SEMANTIC_LIMIT = 705;

const ROOMABOUTS_SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const ROOMABOUTS_EMPTY_RECORDS = Object.freeze([]);
const ROOMABOUTS_TRACK_STATES = Object.freeze({
    'confirmed|observed': 'Observed',
    'tentative|observed': 'Unconfirmed',
    'confirmed|interpolated': 'Estimated — not directly observed',
    'coasting|held': 'Held — not currently observed',
    'coasting|interpolated': 'Estimated — not currently observed',
    'fading|last-seen': 'Last seen — not current',
});
const ROOMABOUTS_UNCERTAINTY_TEXT = Object.freeze({
    'source-unverified': 'Source unverified',
    'source-not-currently-observed': 'Source not currently observed',
    'held-in-stationary-zone': 'Stationary-region hold',
});
const ROOMABOUTS_REGION_GROUPS = Object.freeze([
    Object.freeze(['include_zones', 'include', 'Included region']),
    Object.freeze(['exclude_zones', 'exclude', 'Excluded region']),
    Object.freeze(['entrance_zones', 'entrance', 'Entrance region']),
    Object.freeze(['stationary_zones', 'stationary', 'Stationary region']),
]);
const ROOMABOUTS_SOURCE_STATES = new Set(['online', 'degraded', 'offline', 'unknown']);
const ROOMABOUTS_SOURCE_STATE_RANK = Object.freeze({ unknown: 0, online: 1, degraded: 2, offline: 3 });
const ROOMABOUTS_RENDER_LIMITS = Object.freeze({
    zonesPerKind: 128,
    radars: 64,
    tracks: 128,
    sourceHealth: 64,
    uncertaintyReasons: 16,
});

const roomaboutsFinite = (value) => typeof value === 'number' && Number.isFinite(value);
const roomaboutsRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const roomaboutsOwnDataValue = (value, key) => {
    if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return undefined;
    try {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
    } catch (_error) {
        return undefined;
    }
};
const roomaboutsPoint = (point) => {
    if (!Array.isArray(point) || roomaboutsOwnDataValue(point, 'length') !== 2) return false;
    return roomaboutsFinite(roomaboutsOwnDataValue(point, 0))
        && roomaboutsFinite(roomaboutsOwnDataValue(point, 1));
};
const roomaboutsFreezePoint = (point) => Object.freeze([
    Object.is(point[0], -0) ? 0 : point[0],
    Object.is(point[1], -0) ? 0 : point[1],
]);
const roomaboutsFreezePoints = (points) => Object.freeze(points.map(roomaboutsFreezePoint));
const roomaboutsInField = (x, y) => x >= 0 && x <= 100 && y >= 0 && y <= 100;

const roomaboutsSignedArea = (points) => {
    let twiceArea = 0;
    for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
        twiceArea += points[previous][0] * points[index][1]
            - points[index][0] * points[previous][1];
    }
    return twiceArea / 2;
};

const roomaboutsClipBoundary = (points, inside, intersect) => {
    const result = [];
    if (points.length === 0) return result;
    let previous = points[points.length - 1];
    let previousInside = inside(previous);
    for (const current of points) {
        const currentInside = inside(current);
        if (currentInside !== previousInside) {
            const crossing = intersect(previous, current);
            if (roomaboutsPoint(crossing)) result.push(crossing);
        }
        if (currentInside) result.push([current[0], current[1]]);
        previous = current;
        previousInside = currentInside;
    }
    return result;
};

const roomaboutsClipPolygon = (source) => {
    let points = source.map((point) => [point[0], point[1]]);
    const verticalIntersection = (edge) => (from, to) => {
        const delta = to[0] - from[0];
        if (delta === 0) return [edge, from[1]];
        const ratio = (edge - from[0]) / delta;
        return [edge, from[1] + ratio * (to[1] - from[1])];
    };
    const horizontalIntersection = (edge) => (from, to) => {
        const delta = to[1] - from[1];
        if (delta === 0) return [from[0], edge];
        const ratio = (edge - from[1]) / delta;
        return [from[0] + ratio * (to[0] - from[0]), edge];
    };
    points = roomaboutsClipBoundary(points, ([x]) => x >= 0, verticalIntersection(0));
    points = roomaboutsClipBoundary(points, ([x]) => x <= 100, verticalIntersection(100));
    points = roomaboutsClipBoundary(points, (([, y]) => y >= 0), horizontalIntersection(0));
    points = roomaboutsClipBoundary(points, (([, y]) => y <= 100), horizontalIntersection(100));
    return points.filter(roomaboutsPoint).map(([x, y]) => [
        Math.min(100, Math.max(0, Object.is(x, -0) ? 0 : x)),
        Math.min(100, Math.max(0, Object.is(y, -0) ? 0 : y)),
    ]);
};

const roomaboutsCentroid = (points) => {
    const signedArea = roomaboutsSignedArea(points);
    if (!roomaboutsFinite(signedArea) || signedArea === 0) return null;
    let sumX = 0;
    let sumY = 0;
    for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
        const cross = points[previous][0] * points[index][1]
            - points[index][0] * points[previous][1];
        sumX += (points[previous][0] + points[index][0]) * cross;
        sumY += (points[previous][1] + points[index][1]) * cross;
    }
    const x = sumX / (6 * signedArea);
    const y = sumY / (6 * signedArea);
    if (!roomaboutsFinite(x)
        || !roomaboutsFinite(y)
        || !roomaboutsInField(x, y)
        || !roomaboutsPointInPolygon(x, y, points)) return null;
    return roomaboutsFreezePoint([x, y]);
};

const roomaboutsPointOnSegment = (x, y, from, to) => {
    const cross = (x - from[0]) * (to[1] - from[1]) - (y - from[1]) * (to[0] - from[0]);
    if (Math.abs(cross) > 1e-9) return false;
    return x >= Math.min(from[0], to[0]) - 1e-9
        && x <= Math.max(from[0], to[0]) + 1e-9
        && y >= Math.min(from[1], to[1]) - 1e-9
        && y <= Math.max(from[1], to[1]) + 1e-9;
};

const roomaboutsPointInPolygon = (x, y, points) => {
    let inside = false;
    for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
        const from = points[previous];
        const to = points[index];
        if (roomaboutsPointOnSegment(x, y, from, to)) return true;
        if ((to[1] > y) !== (from[1] > y)
            && x < (from[0] - to[0]) * (y - to[1]) / (from[1] - to[1]) + to[0]) {
            inside = !inside;
        }
    }
    return inside;
};

/**
 * Detach, validate, and clip one configured map polygon against the 0..100 field.
 * Invalid/degenerate input fails closed; the caller's geometry is never mutated.
 */
export const classifyRoomaboutsRegion = (sourcePoints) => {
    const pointCount = roomaboutsOwnDataValue(sourcePoints, 'length');
    if (!Array.isArray(sourcePoints)
        || !Number.isSafeInteger(pointCount)
        || pointCount < 3
        || pointCount > 256) {
        return null;
    }
    const points = [];
    for (let index = 0; index < pointCount; index += 1) {
        const point = roomaboutsOwnDataValue(sourcePoints, index);
        if (!roomaboutsPoint(point)) return null;
        points.push([
            roomaboutsOwnDataValue(point, 0),
            roomaboutsOwnDataValue(point, 1),
        ]);
    }
    const sourceArea = Math.abs(roomaboutsSignedArea(points));
    if (!roomaboutsFinite(sourceArea) || sourceArea === 0) return null;
    const allInside = points.every(([x, y]) => roomaboutsInField(x, y));
    const clipped = roomaboutsClipPolygon(points);
    const clippedArea = clipped.length >= 3 ? Math.abs(roomaboutsSignedArea(clipped)) : 0;
    if (!roomaboutsFinite(clippedArea) || clippedArea === 0) {
        return Object.freeze({
            points: roomaboutsFreezePoints(points),
            clippedPoints: ROOMABOUTS_EMPTY_RECORDS,
            status: 'outside',
            labelPoint: null,
        });
    }
    const frozenClipped = roomaboutsFreezePoints(clipped);
    return Object.freeze({
        points: roomaboutsFreezePoints(points),
        clippedPoints: frozenClipped,
        status: allInside ? 'inside' : 'partially-clipped',
        labelPoint: roomaboutsCentroid(clipped),
    });
};

const roomaboutsHorizontalSegments = (points, y) => {
    const crossings = [];
    for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
        const from = points[previous];
        const to = points[index];
        if ((from[1] > y) === (to[1] > y)) continue;
        const x = from[0] + (y - from[1]) * (to[0] - from[0]) / (to[1] - from[1]);
        if (roomaboutsFinite(x)) crossings.push(Math.min(100, Math.max(0, x)));
    }
    crossings.sort((left, right) => left - right);
    const segments = [];
    for (let index = 0; index + 1 < crossings.length; index += 2) {
        if (crossings[index + 1] - crossings[index] > 1e-9) {
            segments.push(Object.freeze([
                roomaboutsFreezePoint([crossings[index], y]),
                roomaboutsFreezePoint([crossings[index + 1], y]),
            ]));
        }
    }
    return segments;
};

const roomaboutsFallbackScanLines = (points) => {
    const ys = points.map((point) => point[1]);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const height = maxY - minY;
    if (!roomaboutsFinite(height) || height <= 0) return ROOMABOUTS_EMPTY_RECORDS;
    return Object.freeze([0.5, 0.25, 0.75, 0.125, 0.875].map((fraction) => (
        minY + height * fraction
    )));
};

const roomaboutsHatchSegments = (points) => {
    const segments = [];
    for (let y = 4; y < 100 && segments.length < 32; y += 8) {
        segments.push(...roomaboutsHorizontalSegments(points, y).slice(0, 32 - segments.length));
    }
    if (segments.length === 0) {
        for (const y of roomaboutsFallbackScanLines(points)) {
            const fallback = roomaboutsHorizontalSegments(points, y);
            if (fallback.length > 0) {
                segments.push(fallback[0]);
                break;
            }
        }
    }
    return Object.freeze(segments);
};

const roomaboutsStipplePoints = (points) => {
    const marks = [];
    for (let y = 4; y < 100 && marks.length < 64; y += 8) {
        for (let x = 4; x < 100 && marks.length < 64; x += 8) {
            if (roomaboutsPointInPolygon(x, y, points)) marks.push(roomaboutsFreezePoint([x, y]));
        }
    }
    if (marks.length === 0) {
        const centroid = roomaboutsCentroid(points);
        if (centroid) marks.push(centroid);
        else {
            for (const y of roomaboutsFallbackScanLines(points)) {
                const segments = roomaboutsHorizontalSegments(points, y);
                if (segments.length === 0) continue;
                const longest = [...segments].sort((left, right) => (
                    (right[1][0] - right[0][0]) - (left[1][0] - left[0][0])
                ))[0];
                marks.push(roomaboutsFreezePoint([
                    (longest[0][0] + longest[1][0]) / 2,
                    y,
                ]));
                break;
            }
        }
    }
    return Object.freeze(marks);
};

/** Return display-only facts for one of the six accepted lifecycle/position pairs. */
export const classifyRoomaboutsTrack = (track) => {
    if (!roomaboutsRecord(track)
        || !roomaboutsRecord(track.position)
        || track.position.coordinateSpace !== 'map-layout'
        || !roomaboutsFinite(track.position.x)
        || !roomaboutsFinite(track.position.y)) {
        return null;
    }
    const pair = `${track.lifecycle}|${track.positionBasis}`;
    const stateText = ROOMABOUTS_TRACK_STATES[pair];
    if (!stateText) return null;
    const uncertaintyText = [];
    if (Array.isArray(track.uncertainty)) {
        if (track.uncertainty.length > ROOMABOUTS_RENDER_LIMITS.uncertaintyReasons) return null;
        for (const reason of track.uncertainty) {
            const wording = ROOMABOUTS_UNCERTAINTY_TEXT[reason];
            if (wording && !uncertaintyText.includes(wording)) uncertaintyText.push(wording);
        }
    }
    let postureText = null;
    if (track.posture === 'suspected_fall') postureText = 'Suspected posture';
    else if (typeof track.posture === 'string' && track.posture !== '' && track.posture !== 'unknown') {
        postureText = 'Posture event';
    }
    return Object.freeze({
        lifecycle: track.lifecycle,
        positionBasis: track.positionBasis,
        stateText,
        postureText,
        uncertaintyText: Object.freeze(uncertaintyText),
        outsideField: !roomaboutsInField(track.position.x, track.position.y),
    });
};

const roomaboutsDisplayName = (value) => (
    typeof value === 'string' ? value.slice(0, 256) : ''
);

/**
 * Build the sole immutable display scene. It intentionally drops sensor IDs,
 * track IDs, source references, health reasons, and map/config identifiers.
 */
export const buildRoomaboutsRenderScene = (presentation) => {
    if (!roomaboutsRecord(presentation)
        || presentation.accepted !== true
        || !roomaboutsRecord(presentation.map)
        || !roomaboutsRecord(presentation.map.zones)
        || !Array.isArray(presentation.map.radars)
        || presentation.map.radars.length > ROOMABOUTS_RENDER_LIMITS.radars
        || !Array.isArray(presentation.tracks)
        || presentation.tracks.length > ROOMABOUTS_RENDER_LIMITS.tracks
        || !Array.isArray(presentation.sourceHealth)
        || presentation.sourceHealth.length > ROOMABOUTS_RENDER_LIMITS.sourceHealth) {
        return null;
    }

    const regions = [];
    for (const [groupName, kind, genericLabel] of ROOMABOUTS_REGION_GROUPS) {
        const configured = presentation.map.zones[groupName];
        if (!Array.isArray(configured)
            || configured.length > ROOMABOUTS_RENDER_LIMITS.zonesPerKind) return null;
        for (let index = 0; index < configured.length; index += 1) {
            const value = configured[index];
            const geometry = classifyRoomaboutsRegion(Array.isArray(value) ? value : value?.points);
            if (!geometry) continue;
            const name = roomaboutsDisplayName(roomaboutsRecord(value) ? value.name : '');
            const statusText = geometry.status === 'inside'
                ? 'Inside field'
                : geometry.status === 'partially-clipped'
                    ? 'Partially clipped'
                    : 'Outside field — not shown';
            const semanticBase = `${genericLabel}${name ? `: ${name}` : ''}`;
            regions.push(Object.freeze({
                kind,
                name,
                points: geometry.points,
                clippedPoints: geometry.clippedPoints,
                status: geometry.status,
                labelPoint: geometry.labelPoint,
                hatchSegments: kind === 'exclude' && geometry.status !== 'outside'
                    ? roomaboutsHatchSegments(geometry.clippedPoints)
                    : ROOMABOUTS_EMPTY_RECORDS,
                stipplePoints: kind === 'stationary' && geometry.status !== 'outside'
                    ? roomaboutsStipplePoints(geometry.clippedPoints)
                    : ROOMABOUTS_EMPTY_RECORDS,
                semanticText: `${semanticBase} — ${statusText}`,
            }));
        }
    }

    const radars = presentation.map.radars;
    const healthBySensor = new Map();
    for (const health of presentation.sourceHealth) {
        const sensorId = roomaboutsOwnDataValue(health, 'sensorId');
        const rawStatus = roomaboutsOwnDataValue(health, 'status');
        if (typeof sensorId !== 'string') continue;
        const status = ROOMABOUTS_SOURCE_STATES.has(rawStatus) ? rawStatus : 'unknown';
        const previous = healthBySensor.get(sensorId);
        if (previous === undefined
            || ROOMABOUTS_SOURCE_STATE_RANK[status] > ROOMABOUTS_SOURCE_STATE_RANK[previous]) {
            healthBySensor.set(sensorId, status);
        }
    }
    const radarSensors = new Set();
    const stations = [];
    let unplacedCount = 0;
    for (let index = 0; index < radars.length; index += 1) {
        const radar = radars[index];
        const rawSensorId = roomaboutsOwnDataValue(radar, 'sensorId');
        const sensorId = typeof rawSensorId === 'string' ? rawSensorId : null;
        if (sensorId !== null) radarSensors.add(sensorId);
        const layout = roomaboutsOwnDataValue(radar, 'layout');
        const x = roomaboutsOwnDataValue(layout, 'origin_x');
        const y = roomaboutsOwnDataValue(layout, 'origin_y');
        if (!roomaboutsFinite(x) || !roomaboutsFinite(y) || !roomaboutsInField(x, y)) {
            unplacedCount += 1;
            continue;
        }
        const status = sensorId === null ? 'unknown' : (healthBySensor.get(sensorId) || 'unknown');
        const paused = roomaboutsOwnDataValue(radar, 'paused') === true;
        const healthText = status === 'unknown'
            ? 'Health unknown'
            : `${status[0].toUpperCase()}${status.slice(1)}`;
        const stateText = paused ? `Paused — ${healthText}` : healthText;
        const label = `Station ${index + 1}`;
        stations.push(Object.freeze({
            x,
            y,
            label,
            status,
            paused,
            stateText,
            semanticText: `${label}: Survey station — ${stateText}`,
        }));
    }
    let unmatchedHealthCount = 0;
    for (const sensorId of healthBySensor.keys()) {
        if (!radarSensors.has(sensorId)) unmatchedHealthCount += 1;
    }
    const summaryParts = [];
    if (unplacedCount > 0) summaryParts.push(`Unplaced or off-field stations: ${unplacedCount}`);
    if (unmatchedHealthCount > 0) summaryParts.push(`Unmatched source health: ${unmatchedHealthCount}`);
    const sourceSummary = summaryParts.length > 0 ? summaryParts.join('; ') : null;

    const tracks = [];
    for (const track of presentation.tracks) {
        const facts = classifyRoomaboutsTrack(track);
        const alias = roomaboutsDisplayName(track?.anonymousAlias);
        if (!facts || alias === '') return null;
        const semanticParts = [
            `${alias}: ${facts.stateText}`,
            `Position basis: ${facts.positionBasis}`,
        ];
        if (facts.postureText) semanticParts.push(facts.postureText);
        semanticParts.push(...facts.uncertaintyText);
        if (facts.outsideField) semanticParts.push('Outside field — not shown');
        tracks.push(Object.freeze({
            x: track.position.x,
            y: track.position.y,
            alias,
            lifecycle: facts.lifecycle,
            positionBasis: facts.positionBasis,
            stateText: facts.stateText,
            postureText: facts.postureText,
            uncertaintyText: facts.uncertaintyText,
            outsideField: facts.outsideField,
            semanticText: semanticParts.join('; '),
        }));
    }

    const semanticItems = [
        ...regions.map((region) => region.semanticText),
        ...stations.map((station) => station.semanticText),
        ...tracks.map((track) => track.semanticText),
    ];
    if (sourceSummary !== null) semanticItems.push(sourceSummary);
    if (semanticItems.length > ROOMABOUTS_SEMANTIC_LIMIT) return null;
    return Object.freeze({
        regions: Object.freeze(regions),
        stations: Object.freeze(stations),
        tracks: Object.freeze(tracks),
        sourceSummary,
        semanticItems: Object.freeze(semanticItems),
    });
};

export class RadarRenderer {
    constructor(math, root, timers = {}) {
        this.math = math;
        this.root = root;
        this._setTimeout = timers.setTimeout || ((callback, delay) => setTimeout(callback, delay));
        this._clearTimeout = timers.clearTimeout || ((timerId) => clearTimeout(timerId));
        this.canvas = null;
        this.ctx = null;
        this.animFrameId = null;
        this.currentConfig = null;
        this._isCanvasCleared = false;
        this._domCache = {};
        this._trailEntries = new Map();
        this._resizeHandler = null;
        this._ro = null;
        this.targetFilter = new TargetFilter();
        this._roomaboutsScene = null;
        this._roomaboutsTrailRecords = ROOMABOUTS_EMPTY_RECORDS;
        this._roomaboutsActive = false;
        this._roomaboutsCanvasMode = false;
    }
    _removeTrail(trail) {
        if (!trail) return;
        const entry = this._trailEntries.get(trail);
        if (entry) this._clearTimeout(entry.timerId);
        this._trailEntries.delete(trail);
        if (trail.parentNode) trail.parentNode.removeChild(trail);
    }
    _removeTrailsForOwner(ownerId) {
        for (const [trail, entry] of [...this._trailEntries.entries()]) {
            if (entry.ownerId === ownerId) this._removeTrail(trail);
        }
    }
    _clearTrails() {
        for (const trail of [...this._trailEntries.keys()]) this._removeTrail(trail);
    }
    _trackTrail(trail, ownerId) {
        while (this._trailEntries.size >= MAX_DOM_TRAILS) {
            const oldestTrail = this._trailEntries.keys().next().value;
            this._removeTrail(oldestTrail);
        }
        const timerId = this._setTimeout(() => this._removeTrail(trail), 1200);
        this._trailEntries.set(trail, { timerId, ownerId });
    }
    _removeDomCacheEntry(id) {
        if (id.startsWith('fused_')) this._removeTrailsForOwner(id);
        const element = this._domCache[id];
        if (element?.parentNode) element.parentNode.removeChild(element);
        delete this._domCache[id];
    }
    _removeStaleDomEntries(currentActiveIds) {
        for (const id of Object.keys(this._domCache)) {
            if (!currentActiveIds.has(id)) this._removeDomCacheEntry(id);
        }
    }
    _roomaboutsDocument() {
        return this.root?.ownerDocument
            || this.root?.host?.ownerDocument
            || (typeof document !== 'undefined' ? document : null);
    }
    _clearRoomaboutsChildren(element) {
        if (!element) return;
        if (typeof element.replaceChildren === 'function') {
            element.replaceChildren();
            return;
        }
        while (element.firstChild) element.removeChild(element.firstChild);
    }
    _ensureRoomaboutsLayers() {
        const doc = this._roomaboutsDocument();
        if (!doc || typeof doc.createElement !== 'function') return null;
        const parent = this.root.getElementById('map-container')
            || this.root.getElementById('root')
            || this.root;
        if (!parent || typeof parent.appendChild !== 'function') return null;
        let visual = this.root.getElementById('roomabouts-visual-layer');
        if (!visual) {
            visual = doc.createElement('div');
            visual.setAttribute('id', 'roomabouts-visual-layer');
            visual.setAttribute('class', 'roomabouts-visual-layer');
            parent.appendChild(visual);
        }
        visual.setAttribute('aria-hidden', 'true');
        let semantic = this.root.getElementById('roomabouts-semantic-layer');
        if (!semantic) {
            semantic = doc.createElement('div');
            semantic.setAttribute('id', 'roomabouts-semantic-layer');
            parent.appendChild(semantic);
        }
        semantic.setAttribute('role', 'list');
        return { visual, semantic };
    }
    _renderRoomaboutsSemantics(scene, semantic) {
        const doc = this._roomaboutsDocument();
        if (!doc || !semantic || typeof doc.createElement !== 'function') return false;
        const items = [];
        for (const text of scene.semanticItems) {
            const item = doc.createElement('div');
            item.setAttribute('role', 'listitem');
            item.setAttribute('class', 'roomabouts-semantic-item');
            item.textContent = text;
            items.push(item);
        }
        if (typeof semantic.replaceChildren === 'function') semantic.replaceChildren(...items);
        else {
            this._clearRoomaboutsChildren(semantic);
            for (const item of items) semantic.appendChild(item);
        }
        return true;
    }
    acceptRoomaboutsPresentation(presentation) {
        const scene = buildRoomaboutsRenderScene(presentation);
        if (!scene) {
            this.clearRoomaboutsPresentation();
            return false;
        }
        const layers = this._ensureRoomaboutsLayers();
        if (!layers || !this._renderRoomaboutsSemantics(scene, layers.semantic)) {
            this.clearRoomaboutsPresentation();
            return false;
        }
        this._roomaboutsScene = scene;
        return true;
    }
    setRoomaboutsTrailRecords(records) {
        if (!Array.isArray(records) || records.length > MAX_DOM_TRAILS) {
            this._roomaboutsTrailRecords = ROOMABOUTS_EMPTY_RECORDS;
            return false;
        }
        const detached = [];
        for (const record of records) {
            if (!roomaboutsRecord(record)
                || !roomaboutsFinite(record.x)
                || !roomaboutsFinite(record.y)
                || !roomaboutsFinite(record.rotationDeg)
                || (record.side !== 'left' && record.side !== 'right')) {
                this._roomaboutsTrailRecords = ROOMABOUTS_EMPTY_RECORDS;
                return false;
            }
            detached.push(Object.freeze({
                x: record.x,
                y: record.y,
                rotationDeg: record.rotationDeg,
                side: record.side,
            }));
        }
        this._roomaboutsTrailRecords = detached.length > 0
            ? Object.freeze(detached)
            : ROOMABOUTS_EMPTY_RECORDS;
        return true;
    }
    clearRoomaboutsPresentation() {
        this._roomaboutsScene = null;
        this._roomaboutsTrailRecords = ROOMABOUTS_EMPTY_RECORDS;
        this._roomaboutsActive = false;
        this._roomaboutsCanvasMode = false;
        this._clearRoomaboutsChildren(this.root.getElementById('svg-canvas'));
        this._clearRoomaboutsChildren(this.root.getElementById('roomabouts-visual-layer'));
        this._clearRoomaboutsChildren(this.root.getElementById('roomabouts-semantic-layer'));
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }
    clearRuntime() {
        if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
        this.clearRoomaboutsPresentation();
        this._clearTrails();
        this.targetFilter.clear();
        this._removeStaleDomEntries(new Set());
        const dotsLayer = this.root.getElementById('dots-layer');
        if (dotsLayer) dotsLayer.innerHTML = '';
        const svg = this.root.getElementById('svg-canvas');
        if (svg) svg.innerHTML = '';
        if (this.ctx && this.canvas) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        this._isCanvasCleared = true;
        this.currentState = null;
        this.currentHass = null;
    }
    destroy() {
        this.clearRuntime();
        if (this._ro) this._ro.disconnect();
        this._ro = null;
        if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
        this._resizeHandler = null;
        this.canvas = null;
        this.ctx = null;
    }
    wakeRenderLoop() {
        if (!this.canvas || !this.ctx) return;
        if (this.animFrameId === null) {
            this.animFrameId = requestAnimationFrame(() => this.renderLoop());
        }
    }
    _create(tag, attrs = {}, style = {}) {
        const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        for (const [k, v] of Object.entries(style)) el.style[k] = v;
        return el;
    }
    _createRoomaboutsSvg(tag, attributes = {}) {
        const doc = this._roomaboutsDocument();
        if (!doc || typeof doc.createElementNS !== 'function') return null;
        const element = doc.createElementNS(ROOMABOUTS_SVG_NAMESPACE, tag);
        for (const [name, value] of Object.entries(attributes)) {
            element.setAttribute(name, String(value));
        }
        return element;
    }
    drawRoomaboutsMap(scene, svg) {
        if (!scene || !svg) return false;
        this._clearRoomaboutsChildren(svg);
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('aria-hidden', 'true');
        const layer = this._createRoomaboutsSvg('g', {
            class: 'roomabouts-map-layer',
            'aria-hidden': 'true',
        });
        if (!layer) return false;
        for (const region of scene.regions) {
            if (region.status === 'outside' || region.clippedPoints.length < 3) continue;
            const polygon = this._createRoomaboutsSvg('polygon', {
                class: 'roomabouts-zone',
                'data-region-kind': region.kind,
                'data-clip-status': region.status,
                points: region.points.map(([x, y]) => `${x},${y}`).join(' '),
            });
            if (polygon) layer.appendChild(polygon);
            for (const segment of region.hatchSegments) {
                const line = this._createRoomaboutsSvg('line', {
                    class: 'roomabouts-zone-hatch-line',
                    x1: segment[0][0],
                    y1: segment[0][1],
                    x2: segment[1][0],
                    y2: segment[1][1],
                });
                if (line) layer.appendChild(line);
            }
            for (const point of region.stipplePoints) {
                const mark = this._createRoomaboutsSvg('circle', {
                    class: 'roomabouts-zone-stipple-mark',
                    cx: point[0],
                    cy: point[1],
                    r: 0.65,
                });
                if (mark) layer.appendChild(mark);
            }
        }
        svg.appendChild(layer);
        return true;
    }
    _positionRoomaboutsElement(element, x, y) {
        element.style.left = `${x}%`;
        element.style.top = `${y}%`;
    }
    _createRoomaboutsStation(station, doc) {
        const element = doc.createElement('div');
        element.setAttribute('class', 'roomabouts-station');
        element.setAttribute('data-source-status', station.status);
        element.setAttribute('data-paused', String(station.paused));
        element.setAttribute('aria-hidden', 'true');
        this._positionRoomaboutsElement(element, station.x, station.y);
        const label = doc.createElement('span');
        label.setAttribute('class', 'roomabouts-station-label');
        label.textContent = `${station.label} · Survey station — ${station.stateText}`;
        element.appendChild(label);
        return element;
    }
    _createRoomaboutsRegionLabel(region, doc) {
        if (!region.labelPoint) return null;
        const labels = {
            include: 'Included region',
            exclude: 'Excluded region',
            entrance: 'Entrance region',
            stationary: 'Stationary region',
        };
        const element = doc.createElement('div');
        element.setAttribute('class', 'roomabouts-zone-label');
        element.setAttribute('data-region-kind', region.kind);
        element.setAttribute('aria-hidden', 'true');
        this._positionRoomaboutsElement(element, region.labelPoint[0], region.labelPoint[1]);
        element.textContent = region.name || labels[region.kind];
        return element;
    }
    _createRoomaboutsTrack(track, doc) {
        const element = doc.createElement('div');
        element.setAttribute('class', 'roomabouts-track');
        element.setAttribute('data-lifecycle', track.lifecycle);
        element.setAttribute('data-position-basis', track.positionBasis);
        element.setAttribute('aria-hidden', 'true');
        this._positionRoomaboutsElement(element, track.x, track.y);
        const label = doc.createElement('span');
        label.setAttribute('class', 'roomabouts-track-label');
        label.textContent = `${track.alias} · ${track.stateText}`;
        if (track.postureText) {
            const posture = doc.createElement('span');
            posture.setAttribute('class', 'roomabouts-posture');
            posture.textContent = track.postureText;
            label.appendChild(posture);
        }
        element.appendChild(label);
        return element;
    }
    _createRoomaboutsStep(record, width, height, doc) {
        const projection = projectRoomaboutsStep(record, width, height);
        if (!projection) return null;
        const element = doc.createElement('div');
        element.setAttribute('class', 'roomabouts-step');
        element.setAttribute('data-side', projection.side);
        element.setAttribute('aria-hidden', 'true');
        element.style.left = `${projection.screenX}px`;
        element.style.top = `${projection.screenY}px`;
        element.style.transform = `translate(-50%, -50%) rotate(${projection.rotationDeg}deg)`;
        return element;
    }
    _renderRoomaboutsDom(scene, mode) {
        const layers = this._ensureRoomaboutsLayers();
        const doc = this._roomaboutsDocument();
        if (!layers || !doc || typeof doc.createElement !== 'function') return false;
        const visual = layers.visual;
        this._clearRoomaboutsChildren(visual);
        for (const region of scene.regions) {
            const label = this._createRoomaboutsRegionLabel(region, doc);
            if (label) visual.appendChild(label);
        }
        for (const station of scene.stations) {
            visual.appendChild(this._createRoomaboutsStation(station, doc));
        }
        if (mode === 'css') {
            for (const track of scene.tracks) {
                if (!track.outsideField) visual.appendChild(this._createRoomaboutsTrack(track, doc));
            }
            const bounds = typeof visual.getBoundingClientRect === 'function'
                ? visual.getBoundingClientRect()
                : { width: visual.clientWidth, height: visual.clientHeight };
            const width = Number(bounds.width) || Number(visual.clientWidth) || 0;
            const height = Number(bounds.height) || Number(visual.clientHeight) || 0;
            if (width > 0 && height > 0) {
                for (const record of this._roomaboutsTrailRecords) {
                    const step = this._createRoomaboutsStep(record, width, height, doc);
                    if (step) visual.appendChild(step);
                }
            }
        }
        return true;
    }
    _clearRoomaboutsCanvas() {
        if (!this.ctx || !this.canvas) return;
        if (typeof this.ctx.setTransform === 'function') this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this._isCanvasCleared = true;
    }
    _roomaboutsCanvasMetrics() {
        if (!this.canvas || !this.ctx) return null;
        const rect = typeof this.canvas.getBoundingClientRect === 'function'
            ? this.canvas.getBoundingClientRect()
            : { width: this.canvas.clientWidth, height: this.canvas.clientHeight };
        const width = Number(rect.width) || Number(this.canvas.clientWidth) || 0;
        const height = Number(rect.height) || Number(this.canvas.clientHeight) || 0;
        if (!roomaboutsFinite(width) || !roomaboutsFinite(height) || width <= 0 || height <= 0) return null;
        const rawRatio = typeof window !== 'undefined' ? Number(window.devicePixelRatio) : 1;
        const ratio = roomaboutsFinite(rawRatio) ? Math.min(3, Math.max(1, rawRatio)) : 1;
        const backingWidth = Math.max(1, Math.round(width * ratio));
        const backingHeight = Math.max(1, Math.round(height * ratio));
        if (this.canvas.width !== backingWidth) this.canvas.width = backingWidth;
        if (this.canvas.height !== backingHeight) this.canvas.height = backingHeight;
        return Object.freeze({ width, height, scaleX: backingWidth / width, scaleY: backingHeight / height });
    }
    _roomaboutsCanvasTrackColor(track) {
        if (track.lifecycle === 'confirmed' && track.positionBasis === 'observed') {
            return ROOMABOUTS_FIELD_LEDGER_TOKENS.stateObserved;
        }
        if (track.lifecycle === 'fading') return ROOMABOUTS_FIELD_LEDGER_TOKENS.stateLastSeen;
        if (track.lifecycle === 'tentative') return ROOMABOUTS_FIELD_LEDGER_TOKENS.inkMuted;
        return ROOMABOUTS_FIELD_LEDGER_TOKENS.stateHeld;
    }
    _drawRoomaboutsCanvasTrack(ctx, track, width, height) {
        if (track.outsideField) return;
        const x = track.x * width / 100;
        const y = track.y * height / 100;
        if (!roomaboutsFinite(x) || !roomaboutsFinite(y)) return;
        const color = this._roomaboutsCanvasTrackColor(track);
        ctx.save();
        ctx.translate(x, y);
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        if (track.lifecycle === 'tentative') ctx.setLineDash([1.5, 3]);
        else if (track.lifecycle === 'coasting' && track.positionBasis === 'interpolated') {
            ctx.setLineDash([6, 3, 1.5, 3]);
        }
        else if (track.positionBasis === 'interpolated') ctx.setLineDash([2, 3]);
        else if (track.positionBasis === 'held' || track.positionBasis === 'last-seen') ctx.setLineDash([5, 3]);
        else ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.stroke();
        if (track.lifecycle === 'tentative') {
            ctx.beginPath();
            ctx.arc(0, 0, 12, 0, Math.PI * 2);
            ctx.stroke();
        }
        if (track.lifecycle === 'confirmed' && track.positionBasis === 'observed') {
            ctx.beginPath();
            ctx.arc(0, 0, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        if (track.lifecycle === 'coasting' && track.positionBasis === 'interpolated') {
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(0, -9, 1.7, 0, Math.PI * 2);
            ctx.arc(0, 9, 1.7, 0, Math.PI * 2);
            ctx.fill();
        }
        if (track.lifecycle === 'fading' && track.positionBasis === 'last-seen') {
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(0, -14);
            ctx.lineTo(0, -9);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.font = '500 12px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const labelText = `${track.alias} · ${track.stateText}`;
        const labelMeasure = typeof ctx.measureText === 'function'
            ? ctx.measureText(labelText).width
            : labelText.length * 6;
        const labelWidth = Math.max(1, labelMeasure + 8);
        ctx.fillStyle = ROOMABOUTS_FIELD_LEDGER_TOKENS.labelBackground;
        ctx.fillRect(-labelWidth / 2, 13, labelWidth, 18);
        ctx.fillStyle = ROOMABOUTS_FIELD_LEDGER_TOKENS.labelText;
        ctx.fillText(labelText, 0, 15);
        if (track.postureText) {
            ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
            const measured = typeof ctx.measureText === 'function'
                ? ctx.measureText(track.postureText).width
                : track.postureText.length * 6;
            const badgeWidth = Math.max(1, measured + 8);
            ctx.fillStyle = ROOMABOUTS_FIELD_LEDGER_TOKENS.stateAttention;
            ctx.fillRect(-badgeWidth / 2, 33, badgeWidth, 17);
            ctx.fillStyle = ROOMABOUTS_FIELD_LEDGER_TOKENS.labelText;
            ctx.fillText(track.postureText, 0, 35);
        }
        ctx.restore();
    }
    _drawRoomaboutsCanvasStep(ctx, record, width, height) {
        const projection = projectRoomaboutsStep(record, width, height);
        if (!projection) return;
        ctx.save();
        ctx.translate(projection.screenX, projection.screenY);
        ctx.rotate(projection.rotationDeg * Math.PI / 180);
        if (projection.side === 'right') ctx.scale(-1, 1);
        ctx.translate(-3.5, -6.5);
        ctx.fillStyle = ROOMABOUTS_FIELD_LEDGER_TOKENS.stateObserved;
        ctx.beginPath();
        ctx.moveTo(0.7, 0);
        ctx.lineTo(6.3, 0);
        ctx.quadraticCurveTo(7, 0, 7, 0.7);
        ctx.lineTo(7, 7.3);
        ctx.quadraticCurveTo(7, 8, 6.3, 8);
        ctx.lineTo(2.94, 8);
        ctx.lineTo(2.38, 6.24);
        ctx.lineTo(0, 6.24);
        ctx.lineTo(0, 0.7);
        ctx.quadraticCurveTo(0, 0, 0.7, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = ROOMABOUTS_FIELD_LEDGER_TOKENS.ink;
        ctx.fillRect(1, 9, 4, 4);
        ctx.restore();
    }
    _renderRoomaboutsCanvas() {
        if (!this._roomaboutsScene || !this.ctx || !this.canvas) return false;
        const metrics = this._roomaboutsCanvasMetrics();
        if (!metrics) {
            this._clearRoomaboutsCanvas();
            return false;
        }
        const { width, height, scaleX, scaleY } = metrics;
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
        for (const track of this._roomaboutsScene.tracks) {
            this._drawRoomaboutsCanvasTrack(this.ctx, track, width, height);
        }
        for (const record of this._roomaboutsTrailRecords) {
            this._drawRoomaboutsCanvasStep(this.ctx, record, width, height);
        }
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this._isCanvasCleared = false;
        return true;
    }
    _drawRoomaboutsReadonly(config, svg, dotsLayer) {
        this._roomaboutsActive = true;
        this._roomaboutsCanvasMode = config?.target_render_mode === 'canvas';
        this.initCanvasEngine();
        if (dotsLayer) dotsLayer.style.display = 'none';
        if (svg) svg.style.display = 'block';
        if (this.canvas) this.canvas.style.display = this._roomaboutsCanvasMode ? 'block' : 'none';
        const scene = this._roomaboutsScene;
        if (!scene) {
            if (svg) this._clearRoomaboutsChildren(svg);
            const layers = this._ensureRoomaboutsLayers();
            if (layers) this._clearRoomaboutsChildren(layers.visual);
            this._clearRoomaboutsCanvas();
            return;
        }
        this.drawRoomaboutsMap(scene, svg);
        this._renderRoomaboutsDom(scene, this._roomaboutsCanvasMode ? 'canvas' : 'css');
        if (this._roomaboutsCanvasMode) this._renderRoomaboutsCanvas();
        else this._clearRoomaboutsCanvas();
    }
    calculateStandardCoord(cfg, xRaw, yRaw) {
        return this.math.calculate(cfg, { x: xRaw, y: yRaw, z: 0 });
    }
    initCanvasEngine() {
        if (!this.canvas) {
            this.canvas = this.root.getElementById('rmm-canvas');
            if (!this.canvas) return;
            this.ctx = this.canvas.getContext('2d');
            const updateCanvasSize = () => {
                if (!this.canvas) return;
                const rect = this.canvas.getBoundingClientRect();
                const rw = Math.round(rect.width || this.canvas.clientWidth || 0);
                const rh = Math.round(rect.height || this.canvas.clientHeight || 0);
                if (rw > 0 && rh > 0 && (this.canvas.width !== rw || this.canvas.height !== rh)) {
                    this.canvas.width = rw;
                    this.canvas.height = rh;
                    this.wakeRenderLoop();
                }
            };
            if (window.ResizeObserver && this.canvas.parentElement) {
                this._ro = new ResizeObserver(() => updateCanvasSize());
                this._ro.observe(this.canvas.parentElement);
            }
            this._resizeHandler = updateCanvasSize;
            window.addEventListener('resize', updateCanvasSize);
            updateCanvasSize(); 
        }
        this.wakeRenderLoop();
    }
    renderLoop() {
        if (!this.ctx || !this.canvas) return;
        if (this.canvas.width === 0 || this.canvas.height === 0) {
            const rw = Math.round(this.canvas.clientWidth || 0);
            const rh = Math.round(this.canvas.clientHeight || 0);
            if (rw > 0 && rh > 0) {
                this.canvas.width = rw;
                this.canvas.height = rh;
            }
        }
        if (this._roomaboutsActive) {
            if (this._roomaboutsCanvasMode) this._renderRoomaboutsCanvas();
            else this._clearRoomaboutsCanvas();
            this.animFrameId = null;
            return;
        }
        const globalConfig = (this.currentState?.data && this.currentState.data.global_config) || {};
        const renderMode = globalConfig.target_render_mode || this.currentConfig?.target_render_mode || 'css';
        const isCanvasMode = (renderMode === 'canvas');
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const activeTargets = (isCanvasMode && this.targetFilter) ? this.targetFilter.step(now) : [];
        const hasTargets = isCanvasMode && activeTargets.length > 0;
        const hasCalibration = !!(this.currentState?.calibration?.active && this.currentState?.calibration?.map);
        if (!hasTargets && !hasCalibration) {
            if (!this._isCanvasCleared) {
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this._isCanvasCleared = true;
            }
            this.animFrameId = null;
            return;
        }
        this._isCanvasCleared = false;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (hasCalibration) {
            this.drawCalibrationDot();
        }
        if (hasTargets) {
            this.renderCanvasTargets(activeTargets, now);
        }
        this.animFrameId = requestAnimationFrame(() => this.renderLoop());
    }
    drawCalibrationDot() {
        if (!this.currentState?.calibration?.map || !this.ctx || !this.canvas) return;
        const tx = this.currentState.calibration.map.x;
        const ty = this.currentState.calibration.map.y;
        const scaleX = this.canvas.width / 100;
        const scaleY = this.canvas.height / 100;
        const px = tx * scaleX;
        const py = ty * scaleY;
        this.ctx.save();
        this.ctx.shadowColor = 'magenta';
        this.ctx.shadowBlur = 10;
        this.ctx.fillStyle = 'magenta';
        this.ctx.beginPath();
        this.ctx.arc(px, py, 8, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        this.ctx.restore();
    }
    renderCanvasTargets(activeTargets, now) {
        if (!this.ctx || !this.canvas) return;
        const scaleX = this.canvas.width / 100;
        const scaleY = this.canvas.height / 100;
        if (scaleX <= 0 || scaleY <= 0) return;
        const config = this.currentConfig || {};
        const state = this.currentState || {};
        const globalConfig = (state.data && state.data.global_config) || {};
        const targetRadius = config.target_radius || 8;
        const fusedColor = config.fused_color || globalConfig.fused_color || '#FFD700';
        const isLayoutMode = (state.editing && state.editMode === 'layout');
        const isTracking = globalConfig.enable_tracking !== false;
        const showHeading = !isLayoutMode && (globalConfig.show_heading !== undefined ? globalConfig.show_heading : (config.show_heading !== false)) !== false && isTracking;
        const showLabels = (globalConfig.show_labels !== undefined ? globalConfig.show_labels : config.show_labels) === true && isTracking;
        const showTrails = !isLayoutMode && (globalConfig.show_trails !== undefined ? globalConfig.show_trails : (config.show_trails !== false)) !== false && isTracking;
        const currentRadar = state.radar;
        const globalZones = (state.data && state.data.global_zones) || {};
        const excludeZones = globalZones.exclude_zones || [];
        if (showTrails) {
            for (let tIdx = 0; tIdx < activeTargets.length; tIdx++) {
                const track = activeTargets[tIdx];
                const meta = track.metadata || {};
                if (!meta.emitFootprint) continue;
                if (!track.history || track.history.length <= 1) continue;
                const trailCol = meta.color || fusedColor;
                for (let hIdx = 0; hIdx < track.history.length - 1; hIdx++) {
                    const hPt = track.history[hIdx];
                    const ageSec = (now - hPt.time) / 1000;
                    if (ageSec > 1.2) continue;
                    const trailAlpha = Math.max(0, (1 - ageSec / 1.2) * 0.45 * track.alpha);
                    if (trailAlpha > 0.01) {
                        this.ctx.save();
                        this.ctx.globalAlpha = trailAlpha;
                        this.ctx.fillStyle = trailCol;
                        this.ctx.beginPath();
                        this.ctx.arc(hPt.x * scaleX, hPt.y * scaleY, targetRadius * 0.65, 0, Math.PI * 2);
                        this.ctx.fill();
                        this.ctx.restore();
                    }
                }
            }
        }
        for (let tIdx = 0; tIdx < activeTargets.length; tIdx++) {
            const track = activeTargets[tIdx];
            if (excludeZones.some(z => this._isPointInPoly(track.x, track.y, z))) {
                continue;
            }
            const meta = track.metadata || {};
            const px = track.x * scaleX;
            const py = track.y * scaleY;
            const isHold = !!meta.isHold;
            const isHibernating = !!meta.isHibernating;
            const isUnverified = !!meta.isUnverified;
            const isFallen = (meta.posture === 'fallen');
            const isSuspectedFall = (meta.posture === 'suspected_fall');
            const isSelected = isLayoutMode && (meta.radarName === currentRadar || meta.isSelected);
            let col = meta.color || fusedColor;
            if (isFallen) col = '#FF2D55';
            else if (isSuspectedFall) col = '#FF9800';
            const r = isSelected ? (targetRadius * 1.3) : targetRadius;
            if (isFallen) {
                const tNorm1 = ((now % 1200) / 1200);
                const tNorm2 = (((now + 600) % 1200) / 1200);
                [tNorm1, tNorm2].forEach(tn => {
                    const waveR = r + tn * (r * 2.5);
                    const waveAlpha = (1 - tn) * 0.85 * track.alpha;
                    if (waveAlpha > 0.01) {
                        this.ctx.save();
                        this.ctx.globalAlpha = waveAlpha;
                        this.ctx.strokeStyle = '#FF334B';
                        this.ctx.lineWidth = 2.2;
                        this.ctx.beginPath();
                        this.ctx.arc(px, py, waveR, 0, Math.PI * 2);
                        this.ctx.stroke();
                        this.ctx.restore();
                    }
                });
            }
            this.ctx.save();
            this.ctx.globalAlpha = 0.35 * track.alpha;
            this.ctx.fillStyle = '#000000';
            this.ctx.beginPath();
            this.ctx.ellipse(px, py + r * 0.45, r * 1.05, r * 0.55, 0, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
            this.ctx.save();
            let baseAlpha = 1.0;
            if (isHold) baseAlpha = 0.6;
            else if (isHibernating) baseAlpha = 0.3;
            else if (isUnverified) baseAlpha = 0.8;
            this.ctx.globalAlpha = baseAlpha * track.alpha;
            if (!isHold && !isHibernating) {
                if (isFallen) {
                    this.ctx.shadowColor = '#FF0033';
                    this.ctx.shadowBlur = 18;
                } else if (isSuspectedFall) {
                    const pulse = 0.5 + 0.5 * Math.sin(now / 150);
                    this.ctx.shadowColor = '#FF9800';
                    this.ctx.shadowBlur = 10 + 8 * pulse;
                } else {
                    this.ctx.shadowBlur = 0;
                    this.ctx.fillStyle = isSelected ? 'rgba(255, 255, 255, 0.28)' : (col + '33');
                    this.ctx.beginPath();
                    this.ctx.arc(px, py, r + (isSelected ? 4 : 2.5), 0, Math.PI * 2);
                    this.ctx.fill();
                }
            }
            this.ctx.beginPath();
            this.ctx.arc(px, py, r, 0, Math.PI * 2);
            if (isHold || isUnverified) {
                this.ctx.fillStyle = 'transparent';
            } else if (isHibernating) {
                this.ctx.fillStyle = '#555555';
            } else {
                this.ctx.fillStyle = col;
            }
            this.ctx.fill();
            if (isFallen) {
                this.ctx.setLineDash([]);
                this.ctx.strokeStyle = '#FFFFFF';
                this.ctx.lineWidth = 2.5;
            } else if (isSuspectedFall) {
                this.ctx.setLineDash([3, 2]);
                this.ctx.strokeStyle = '#FFE082';
                this.ctx.lineWidth = 2.0;
            } else if (isHold) {
                this.ctx.setLineDash([4, 3]);
                this.ctx.strokeStyle = col;
                this.ctx.lineWidth = 2;
            } else if (isUnverified) {
                this.ctx.setLineDash([]);
                this.ctx.strokeStyle = '#FF9800';
                this.ctx.lineWidth = 2;
            } else if (isHibernating) {
                this.ctx.setLineDash([]);
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                this.ctx.lineWidth = 1;
            } else if (isSelected) {
                this.ctx.setLineDash([]);
                this.ctx.strokeStyle = '#FFFFFF';
                this.ctx.lineWidth = 2.5;
            } else {
                this.ctx.setLineDash([]);
                this.ctx.strokeStyle = '#FFFFFF';
                this.ctx.lineWidth = 1.5;
            }
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            this.ctx.restore();
            if (showHeading && meta.emitFootprint) {
                const speed = Math.hypot(track.vx, track.vy);
                if (speed > 0.18) {
                    const angle = Math.atan2(track.vy * scaleY, track.vx * scaleX);
                    const floatingGap = Math.max(4.5, r * 0.65); 
                    const tipDist = r + floatingGap;
                    const tipX = px + Math.cos(angle) * tipDist;
                    const tipY = py + Math.sin(angle) * tipDist;
                    const wingLen = Math.max(5.0, r * 0.68); 
                    const wingAngle = Math.PI / 3; 
                    this.ctx.save();
                    this.ctx.globalAlpha = 0.95 * track.alpha;
                    this.ctx.shadowColor = '#FFFFFF';
                    this.ctx.shadowBlur = Math.max(2, r * 0.35);
                    this.ctx.strokeStyle = '#FFFFFF';
                    this.ctx.lineWidth = Math.max(1.3, +(r * 0.20).toFixed(1)); 
                    this.ctx.lineCap = 'round';
                    this.ctx.lineJoin = 'round';
                    this.ctx.beginPath();
                    this.ctx.moveTo(tipX - wingLen * Math.cos(angle - wingAngle), tipY - wingLen * Math.sin(angle - wingAngle));
                    this.ctx.lineTo(tipX, tipY);
                    this.ctx.lineTo(tipX - wingLen * Math.cos(angle + wingAngle), tipY - wingLen * Math.sin(angle + wingAngle));
                    this.ctx.stroke();
                    this.ctx.restore();
                }
            }
            const labelText = meta.anonymousAlias !== undefined
                ? String(meta.anonymousAlias)
                : (meta.label !== undefined ? String(meta.label) : '');
            const shouldShowLabel = (isLayoutMode || showLabels) && labelText;
            if (shouldShowLabel && labelText) {
                this.ctx.save();
                this.ctx.globalAlpha = track.alpha;
                const fontSize = Math.max(7, Math.round(r * (labelText.length > 1 ? 0.72 : 0.90)));
                this.ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                let textCol = '#111111';
                if (isHold || isUnverified) {
                    textCol = col || '#FFFFFF';
                    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
                    this.ctx.shadowBlur = 3;
                } else if (isHibernating) {
                    textCol = '#DDDDDD';
                    this.ctx.shadowBlur = 0;
                } else {
                    let yiq = 200;
                    if (col && typeof col === 'string') {
                        if (col.startsWith('#')) {
                            let c = col.slice(1);
                            if (c.length === 3 || c.length === 4) c = c.split('').slice(0, 3).map(x => x + x).join('');
                            if (c.length >= 6) {
                                const cr = parseInt(c.substr(0, 2), 16);
                                const cg = parseInt(c.substr(2, 2), 16);
                                const cb = parseInt(c.substr(4, 2), 16);
                                yiq = (cr * 299 + cg * 587 + cb * 114) / 1000;
                            }
                        } else if (col.startsWith('rgb')) {
                            const m = col.match(/\d+/g);
                            if (m && m.length >= 3) {
                                yiq = (parseInt(m[0]) * 299 + parseInt(m[1]) * 587 + parseInt(m[2]) * 114) / 1000;
                            }
                        }
                    }
                    textCol = (yiq >= 135) ? '#111111' : '#FFFFFF';
                    if (textCol === '#FFFFFF') {
                        this.ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
                        this.ctx.shadowBlur = 2;
                    } else {
                        this.ctx.shadowBlur = 0;
                    }
                }
                this.ctx.fillStyle = textCol;
                const offsetY = (fontSize <= 10) ? 0.5 : 0;
                this.ctx.fillText(labelText, px, py + offsetY);
                this.ctx.restore();
            }
            if (isFallen || isSuspectedFall) {
                this.ctx.save();
                this.ctx.globalAlpha = track.alpha;
                const hText = (meta.abs_height !== undefined && meta.abs_height !== null)
                    ? `${Number(meta.abs_height).toFixed(2)}m`
                    : '';
                const alias = meta.anonymousAlias || '';
                const badgeText = isFallen ? `🚨 ${alias} 跌倒 ${hText}` : `⚠️ ${alias} 疑似 ${hText}`;
                this.ctx.font = 'bold 9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
                const textMetrics = this.ctx.measureText(badgeText);
                const textWidth = textMetrics.width;
                const badgeW = textWidth + 12;
                const badgeH = 16;
                const badgeX = px - badgeW / 2;
                const badgeY = py - r - badgeH - 4;
                this.ctx.fillStyle = isFallen ? 'rgba(230, 20, 50, 0.92)' : 'rgba(235, 140, 0, 0.92)';
                this.ctx.shadowColor = isFallen ? 'rgba(255, 0, 50, 0.6)' : 'rgba(255, 150, 0, 0.6)';
                this.ctx.shadowBlur = 8;
                this.ctx.beginPath();
                if (typeof this.ctx.roundRect === 'function') {
                    this.ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
                } else {
                    this.ctx.rect(badgeX, badgeY, badgeW, badgeH);
                }
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
                this.ctx.lineWidth = 1;
                this.ctx.stroke();
                this.ctx.fillStyle = '#FFFFFF';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(badgeText, px, badgeY + badgeH / 2 + 0.5);
                this.ctx.restore();
            }
        }
    }
    updateFusedTargets(fusedList) {
        if (!this.targetFilter || !Array.isArray(fusedList)) return;
        const activeKeys = new Set();
        const globalConfig = (this.currentState?.data && this.currentState.data.global_config) || {};
        const fusedColor = this.currentConfig?.fused_color || globalConfig.fused_color || '#FFD700';
        fusedList.forEach(t => {
            if (t.x === undefined || t.y === undefined) return;
            const key = `fused_${t.id}`;
            activeKeys.add(key);
            const semantics = this._fusedSemantics(t);
            this.targetFilter.update(key, parseFloat(t.x), parseFloat(t.y), {
                lifecycle: t.lifecycle,
                positionBasis: t.positionBasis,
                anonymousAlias: t.anonymousAlias,
                emitFootprint: semantics.emitFootprint,
                posture: t.posture,
                abs_height: t.abs_height,
                fall_duration: t.fall_duration,
                isHold: semantics.isHold,
                isHibernating: semantics.isHibernating,
                isUnverified: semantics.isUnverified,
                color: fusedColor,
                type: 'fused'
            });
        });
        this.targetFilter.prune(activeKeys);
    }
    _fusedSemantics(target) {
        const emitFootprint = target.emitFootprint === true
            && target.lifecycle === 'confirmed'
            && target.positionBasis === 'observed';
        return {
            emitFootprint,
            isHold: target.lifecycle === 'coasting'
                || target.positionBasis === 'held'
                || target.positionBasis === 'interpolated',
            isHibernating: target.lifecycle === 'fading'
                || target.positionBasis === 'last-seen',
            isUnverified: target.lifecycle === 'tentative',
        };
    }
    getRadarConfig(state, rName, hass) {
        const getVal = (key, def) => {
            let val = def;
            if (state.editMode === 'layout' && rName === state.radar && state.layoutChanges && state.layoutChanges[key] !== undefined) {
                val = state.layoutChanges[key];
            } else {
                const radarData = (state.data && state.data[rName]) || {};
                const layout = radarData.layout || {};
                if (layout[key] !== undefined) val = layout[key];
            }
            if (key === 'mirror_x' || key === 'enable_3d' || key === 'ceiling_mount') return !!val;
            if (typeof val === 'string') val = parseFloat(val);
            if (typeof val !== 'number' || isNaN(val)) return def;
            return val;
        };
        const radarType = getVal('radar_type', 1);
        const radarH = getVal('mount_height', 2.5);
        const isCeiling = getVal('ceiling_mount', false);
        return {
            origin_x: getVal('origin_x', 50),
            origin_y: getVal('origin_y', 50),
            scale_x: getVal('scale_x', 5),
            scale_y: getVal('scale_y', 5),
            rotation: getVal('rotation', 0),
            mirror_x: getVal('mirror_x', false),
            mount_height: radarH,
            radar_type: radarType,
            ceiling_mount: isCeiling,
            target_height: 1.2
        };
    }
    _getAllRadars(state, config, hass) {
        const rawList = config.radars || [];
        const nameSet = new Set();
        rawList.forEach(r => nameSet.add((typeof r === 'object') ? r.name : r));
        if (state && state.data) {
            Object.keys(state.data).forEach(k => {
                if (!['global_zones', 'global_config', '[object Object]', 'rd_default'].includes(k)) nameSet.add(k);
            });
        }
        return Array.from(nameSet).map(name => ({ name }));
    }
    _isPointInPoly(x, y, poly) {
        const pts = Array.isArray(poly) ? poly : (poly.points || []);
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const xi = pts[i][0], yi = pts[i][1];
            const xj = pts[j][0], yj = pts[j][1];
            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }
    draw(state, config, hass) {
        this.currentState = state;
        this.currentHass = hass;
        this.currentConfig = config;
        const svg = this.root.getElementById('svg-canvas');
        const dotsLayer = this.root.getElementById('dots-layer');
        if (!svg || !dotsLayer) return;
        if (config?.read_only === true && state?.editing !== true) {
            this._drawRoomaboutsReadonly(config, svg, dotsLayer);
            return;
        }
        this._roomaboutsActive = false;
        this._roomaboutsCanvasMode = false;
        this.initCanvasEngine();
        if (!hass || !hass.states) return;
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        const allRadars = this._getAllRadars(state, config, hass);
        this.drawZones(state, config, svg);
        this.drawDrawingGuides(state, svg);
        if (state.editing && state.editMode === 'layout') {
            this.drawRadarAvatars(state, config, svg, hass, allRadars, state.aspectRatio);
        }
        this.drawTargets(state, config, hass, allRadars);
    }
    drawDrawingGuides(state, svg) {
        const isDrawing = state.isAddingNew || (state.editing && state.points && state.points.length > 0);
        if (!isDrawing || !state.mousePos) return;
        let { x, y } = state.mousePos;
        if (state.isCalibratingMap && state.points && state.points.length > 0) {
            if (state.isCalibratingMap === 'X') y = state.points[0][1];
            if (state.isCalibratingMap === 'Y') x = state.points[0][0];
        }
        const guideStyle = {
            stroke: '#FFD700',
            strokeWidth: '0.2',
            strokeDasharray: '2,2',
            strokeOpacity: '0.6',
            pointerEvents: 'none'
        };
        svg.appendChild(this._create('line', { x1: 0, y1: y, x2: 100, y2: y }, guideStyle));
        svg.appendChild(this._create('line', { x1: x, y1: 0, x2: x, y2: 100 }, guideStyle));
    }
    drawRadarAvatars(state, config, svg, hass, radarList, aspectRatio) {
        const currentRadar = state.radar;
        const baseSize = parseFloat(config.label_size) || 3.5;
        const avatarFontSize = Math.max(1.5, baseSize * 0.7);
        const globalConfig = (state.data && state.data.global_config) || {};
        const radarR = parseFloat(config.radar_radius !== undefined ? config.radar_radius : (config.radar_size !== undefined ? config.radar_size : (globalConfig.radar_radius !== undefined ? globalConfig.radar_radius : 1.1))) || 1.1;
        const rotR = Math.max(0.7, radarR * 0.8);
        radarList.forEach(rObj => {
            const rName = rObj.name;
            const isCurrent = (rName === currentRadar);
            let isOffline = false;
            if (hass) {
                const lowerRName = rName.toLowerCase();
                const verEnt = hass.states[`sensor.${lowerRName}_version`];
                const btnEnt = hass.states[`button.${lowerRName}_restart_radar`];
                if ((verEnt && verEnt.state === 'unavailable') || (btnEnt && btnEnt.state === 'unavailable')) {
                    isOffline = true;
                }
            }
            const rData = state.data[rName] || {};
            const isPaused = (rData.paused === true);
            let opacity = 0.4;
            let strokeColor = '#666';
            if (isCurrent) {
                strokeColor = isPaused ? '#888888' : '#FFD700'; 
                opacity = state.fov_edit_mode ? 0.2 : (isPaused ? 0.6 : 1.0);
            } else if (isOffline) {
                strokeColor = '#dc3545'; 
                opacity = 0.6;
            } else if (isPaused) {
                strokeColor = '#555555'; 
                opacity = 0.45;
            } else {
                strokeColor = '#03A9F4'; 
                opacity = 0.7;
            }
            const ptrEvents = state.fov_edit_mode ? 'none' : 'all';
            const cfg = this.getRadarConfig(state, rName, hass);
            const ox = cfg.origin_x;
            const oy = cfg.origin_y;
            const group = this._create('g', { 'data-id': rName, 'data-radar': rName, class: 'radar-group' });
            group.appendChild(this._create('circle', {
                cx: ox, cy: oy, r: radarR, class: 'radar-handle-body', 'data-id': rName, 'data-radar': rName
            }, { fill: strokeColor, stroke: 'white', strokeWidth: Math.max(0.3, radarR * 0.35), opacity: opacity, pointerEvents: ptrEvents, cursor: 'move' }));
            if (isCurrent) {
                const handlePos = this.calculateStandardCoord({ ...cfg, mirror_x: false, enable_correction: false }, 0, 4000);
                const hx = handlePos.left; const hy = handlePos.top;
                let pathD = "";
                if (cfg.ceiling_mount) {
                    for (let i = 0; i <= 36; i++) {
                        const angDeg = i * 10;
                        const angRad = angDeg * Math.PI / 180;
                        const pScreen = this.calculateStandardCoord({ ...cfg, enable_correction: false }, 4000 * Math.sin(angRad), 4000 * Math.cos(angRad));
                        if (i === 0) pathD += `M ${pScreen.left} ${pScreen.top}`;
                        else pathD += ` L ${pScreen.left} ${pScreen.top}`;
                    }
                    pathD += " Z";
                } else {
                    pathD = `M ${ox} ${oy}`;
                    const fovWidthDeg = 120; const startAngle = -fovWidthDeg / 2;
                    for (let i = 0; i <= 10; i++) {
                        const angDeg = startAngle + (i / 10) * fovWidthDeg;
                        const angRad = angDeg * Math.PI / 180;
                        const pScreen = this.calculateStandardCoord({ ...cfg, enable_correction: false }, 4000 * Math.sin(angRad), 4000 * Math.cos(angRad));
                        pathD += ` L ${pScreen.left} ${pScreen.top}`;
                    }
                    pathD += ` Z`;
                }
                group.appendChild(this._create('path', { d: pathD }, { fill: 'cyan', fillOpacity: '0.15', stroke: 'cyan', strokeWidth: '0.5', strokeDasharray: '2,1', pointerEvents: 'none' }));
                group.appendChild(this._create('line', { x1: ox, y1: oy, x2: hx, y2: hy }, { stroke: strokeColor, strokeWidth: '0.8', strokeDasharray: '4,2', opacity: opacity, pointerEvents: 'none' }));
                group.appendChild(this._create('circle', { cx: hx, cy: hy, r: rotR, class: 'radar-handle-rot', 'data-id': rName, 'data-radar': rName }, { fill: 'cyan', stroke: 'white', strokeWidth: Math.max(0.3, radarR * 0.35), opacity: opacity, pointerEvents: ptrEvents, cursor: 'alias' }));
                const txt = this._create('text', { x: hx, y: hy - rotR - 0.8 }, { fontSize: `${avatarFontSize}px`, fill: 'cyan', textAnchor: 'middle', fontWeight: 'bold', pointerEvents: 'none', textShadow: '1px 1px 1px black', opacity: opacity });
                txt.textContent = isPaused ? `${Math.round(cfg.rotation)}° ⏸` : `${Math.round(cfg.rotation)}°`;
                group.appendChild(txt);
                group.appendChild(this._create('line', { x1: 0, y1: oy, x2: 100, y2: oy }, { stroke: 'rgba(255, 255, 0, 0.3)', strokeWidth: '0.2', pointerEvents: 'none' }));
                group.appendChild(this._create('line', { x1: ox, y1: 0, x2: ox, y2: 100 }, { stroke: 'rgba(255, 255, 0, 0.3)', strokeWidth: '0.2', pointerEvents: 'none' }));
            } else {
                const name = this._create('text', { x: ox, y: oy + radarR + 1.8 }, { fontSize: `${avatarFontSize * 0.8}px`, fill: strokeColor, textAnchor: 'middle', pointerEvents: 'none', textShadow: '1px 1px 1px black', fontWeight: 'bold' });
                name.textContent = isOffline ? `${rName} (Off)` : (isPaused ? `${rName} (⏸)` : rName);
                group.appendChild(name);
            }
            svg.appendChild(group);
        });
    }
    _calculateArea(points) {
        if (!points || points.length < 3) return 0;
        let area = 0;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) area += (points[j][0] + points[i][0]) * (points[j][1] - points[i][1]);
        return Math.abs(area / 2);
    }
    drawZones(state, config, svg) {
        if (!state.editing) return;
        if (state.editMode === 'settings' && !state.isCalibratingMap) return;
        const isLayout = state.editMode === 'layout';
        const baseR = config.handle_radius || 4;
        const globalConfig = (state.data && state.data.global_config) || {};
        const zoneStroke = parseFloat(globalConfig.zone_stroke !== undefined ? globalConfig.zone_stroke : (config.zone_stroke !== undefined ? config.zone_stroke : 0.8)) || 0.8;
        const showLabels = config.show_labels !== false;
        const handleStroke = Math.max(0.6, zoneStroke * 1.25);
        const labelSize = parseFloat(config.label_size) || 3.5;
        const TYPE_COLORS = {
            'monitor_zones': '#FFB300',
            'include_zones': '#00E676',
            'exclude_zones': '#EF4444',
            'hw_detect_zones': '#00E676',
            'hw_block_zones': '#EF4444',
            'hw_stay_zones': '#A855F7',
            'entrance_zones': '#00BFFF',
            'stationary_zones': '#A855F7'
        };
        const renderedLabelPositions = [];
        const createPoly = (obj, typeKey, pIdx, rName) => {
            const group = this._create('g', { 'data-type': typeKey, 'data-index': pIdx, 'data-radar': rName || '' });
            const pts = Array.isArray(obj) ? obj : obj.points;
            if (!pts || pts.length === 0) return null;
            const ptsStr = pts.map(p => p.join(',')).join(' ');
            let isSelZone = false;
            const activeRadarType = state.radar_zone_type || 'monitor_zones';
            if (isLayout) {
                if (typeKey === activeRadarType && rName === state.radar && state.selectedIndex === pIdx) {
                    isSelZone = true;
                }
            } else {
                if (typeKey === state.type && state.selectedIndex === pIdx) {
                    isSelZone = true;
                }
            }
            const color = TYPE_COLORS[typeKey] || 'white';
            let strokeColor = color;
            let strokeWidth = zoneStroke;
            let fillOpacity = 0.2;
            let ptrEvents = 'all';
            let strokeOpacity = 1.0;
            let cursorStyle = 'pointer';
            let showThisLabel = false; 
            if (isLayout) {
                if (typeKey !== 'monitor_zones' && typeKey !== 'hw_detect_zones' && typeKey !== 'hw_block_zones' && typeKey !== 'hw_stay_zones') return null;
                if (rName === state.radar) {
                    const viewMode = state.zone_view_mode || 'focus';
                    if (viewMode === 'hidden' && !state.fov_edit_mode && !isSelZone) {
                        return null;
                    }
                    if (!state.fov_edit_mode) {
                        ptrEvents = 'none';
                        cursorStyle = 'default';
                        if (viewMode === 'all') {
                            fillOpacity = 0.04;
                            strokeWidth = Math.max(0.2, zoneStroke * 0.4);
                            strokeOpacity = 0.4;
                            showThisLabel = false;
                        } else {
                            if (typeKey === activeRadarType) {
                                fillOpacity = 0.08;
                                strokeWidth = Math.max(0.35, zoneStroke * 0.6);
                                strokeOpacity = 0.65;
                                showThisLabel = true;
                            } else {
                                fillOpacity = 0.02;
                                strokeWidth = Math.max(0.15, zoneStroke * 0.3);
                                strokeOpacity = 0.15;
                                showThisLabel = false;
                            }
                        }
                    } else {
                        if (typeKey === activeRadarType) {
                            ptrEvents = 'all';
                            fillOpacity = 0.35;
                            strokeColor = color;
                            strokeWidth = Math.max(0.5, zoneStroke * 1.0);
                            strokeOpacity = 1.0;
                            showThisLabel = true;
                        } else {
                            ptrEvents = 'none';
                            fillOpacity = 0.0;
                            strokeColor = color;
                            strokeOpacity = 0.12;
                            strokeWidth = Math.max(0.15, zoneStroke * 0.25);
                            showThisLabel = false;
                        }
                    }
                    if (isSelZone) {
                        strokeColor = color;
                        strokeWidth = Math.max(0.8, zoneStroke * 2.0);
                        fillOpacity = 0.55;
                        strokeOpacity = 1.0;
                        cursorStyle = 'move';
                        showThisLabel = true;
                    }
                } else {
                    ptrEvents = 'none';
                    fillOpacity = 0.02;
                    strokeOpacity = 0.12;
                    strokeWidth = Math.max(0.15, zoneStroke * 0.25);
                    showThisLabel = false;
                }
            } else {
                if (typeKey === 'monitor_zones' || typeKey === 'hw_detect_zones' || typeKey === 'hw_block_zones' || typeKey === 'hw_stay_zones') return null;
                if (typeKey === state.type) {
                    fillOpacity = 0.3;
                    ptrEvents = 'all';
                    strokeWidth = Math.max(0.5, zoneStroke * 1.0);
                    showThisLabel = true;
                    if (isSelZone) {
                        strokeColor = color;
                        strokeWidth = Math.max(0.8, zoneStroke * 2.0);
                        fillOpacity = 0.5;
                        cursorStyle = 'move';
                    }
                } else {
                    fillOpacity = 0.05;
                    strokeColor = '#555';
                    ptrEvents = 'none';
                    strokeWidth = Math.max(0.15, zoneStroke * 0.3);
                    showThisLabel = false;
                }
            }
            group.appendChild(this._create('polygon', {
                points: ptsStr, class: 'zone-poly', 'data-type': typeKey, 'data-index': pIdx, 'data-radar': rName || ''
            }, { fill: color, fillOpacity: fillOpacity, stroke: strokeColor, strokeWidth: strokeWidth, strokeOpacity: strokeOpacity, pointerEvents: ptrEvents, cursor: cursorStyle }));
            if (showLabels && obj.name && showThisLabel) {
                const center = this.math.getCentroid(pts);
                let cx = center[0];
                let cy = center[1];
                for (const prev of renderedLabelPositions) {
                    if (Math.hypot(cx - prev.x, cy - prev.y) < 3.8) {
                        cy = (prev.offsetY < 0) ? (cy + 3.2) : (cy - 3.2);
                        break;
                    }
                }
                renderedLabelPositions.push({ x: cx, y: cy, offsetY: cy - center[1] });
                const textLen = (obj.name || '').length;
                const badgeW = Math.max(3.5, textLen * (labelSize * 0.52) + 1.2);
                const badgeH = labelSize * 1.25;
                const badgeX = cx - badgeW / 2;
                const badgeY = cy - badgeH / 2;
                const badgeRect = this._create('rect', {
                    x: badgeX,
                    y: badgeY,
                    width: badgeW,
                    height: badgeH,
                    rx: badgeH * 0.25,
                    ry: badgeH * 0.25,
                    class: 'zone-label-badge'
                }, {
                    fill: 'rgba(15, 23, 42, 0.75)',
                    stroke: strokeColor,
                    strokeWidth: Math.max(0.12, zoneStroke * 0.2),
                    strokeOpacity: 0.7,
                    pointerEvents: 'none'
                });
                group.appendChild(badgeRect);
                const txt = this._create('text', {
                    x: cx,
                    y: cy + (labelSize * 0.35),
                    class: 'zone-label'
                }, {
                    fontSize: `${labelSize}px`,
                    fill: '#FFFFFF',
                    textAnchor: 'middle',
                    fontWeight: '500',
                    pointerEvents: 'none',
                    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                    opacity: 1
                });
                txt.textContent = obj.name;
                group.appendChild(txt);
            }
            if (isSelZone) {
                pts.forEach((p, iIdx) => {
                    const isDrag = state.dragState?.isDragging && state.dragState.polyIndex === pIdx && state.dragState.pointIndex === iIdx;
                    const isSelPt = (state.selectedPointIndex === iIdx);
                    const r = (isDrag || isSelPt) ? (baseR * 1.5) : baseR;
                    let fill = "rgba(255,255,255,0.4)"; let stroke = "none"; let strokeW = 0;
                    if (isDrag) { fill = color; stroke = "white"; strokeW = handleStroke; }
                    else if (isSelPt) { fill = color; stroke = "white"; strokeW = handleStroke; }
                    group.appendChild(this._create('circle', {
                        cx: p[0], cy: p[1], r: r, class: 'zone-handle', 'data-type': typeKey, 'data-index': pIdx, 'data-point-index': iIdx, 'data-radar': rName || ''
                    }, { fill: fill, stroke: stroke, strokeWidth: strokeW, pointerEvents: 'all', cursor: 'move' }));
                });
            }
            if (isSelZone && (typeKey === 'hw_block_zones' || typeKey === 'hw_detect_zones' || typeKey === 'hw_stay_zones') && pts.length >= 3) {
                const cfg = this.getRadarConfig(state, rName, null);
                const ox = parseFloat(cfg.origin_x) || 50; const oy = parseFloat(cfg.origin_y) || 50;
                const sx = parseFloat(cfg.scale_x) || 5; const sy = parseFloat(cfg.scale_y) || 5;
                const rot = parseFloat(cfg.rotation) || 0;
                const baseRad = (rot - 90) * Math.PI / 180.0;
                const yVecX = Math.cos(baseRad); const yVecY = Math.sin(baseRad);
                const xVecX = Math.cos(baseRad + (Math.PI / 2)); const xVecY = Math.sin(baseRad + (Math.PI / 2));
                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                pts.forEach(p => {
                    const dx = p[0] - ox; const dy = p[1] - oy;
                    let lx = (dx * xVecX + dy * xVecY) / sx;
                    let ly = (dx * yVecX + dy * yVecY) / sy;
                    if (cfg.mirror_x) lx = -lx;
                    if (lx < minX) minX = lx; if (lx > maxX) maxX = lx;
                    if (ly < minY) minY = ly; if (ly > maxY) maxY = ly;
                });
                const tempCfg = Object.assign({}, cfg, { enable_correction: false });
                const c1 = this.math.calculate(tempCfg, { x: minX * 1000, y: minY * 1000 });
                const c2 = this.math.calculate(tempCfg, { x: maxX * 1000, y: minY * 1000 });
                const c3 = this.math.calculate(tempCfg, { x: maxX * 1000, y: maxY * 1000 });
                const c4 = this.math.calculate(tempCfg, { x: minX * 1000, y: maxY * 1000 });
                const boxPts = `${c1.left},${c1.top} ${c2.left},${c2.top} ${c3.left},${c3.top} ${c4.left},${c4.top}`;
                const boxColor = TYPE_COLORS[typeKey] || '#FFFFFF';
                const boxStroke = Math.max(0.35, zoneStroke * 0.75);
                group.appendChild(this._create('polygon', { points: boxPts }, {
                    fill: 'none', stroke: boxColor, strokeWidth: boxStroke,
                    strokeDasharray: '2,2', pointerEvents: 'none', opacity: 0.85
                }));
            }
            return group;
        };
        if (state.editMode !== 'settings') {
            let drawTasks = [];
            if (state.data) {
                Object.keys(state.data).forEach(rName => {
                    if (['global_zones', 'global_config', '[object Object]', 'rd_default'].includes(rName)) return;
                    ['monitor_zones', 'hw_detect_zones', 'hw_block_zones', 'hw_stay_zones'].forEach(zType => {
                        if (state.data[rName] && Array.isArray(state.data[rName][zType])) {
                            state.data[rName][zType].forEach((p, i) => drawTasks.push({ obj: p, type: zType, idx: i, rName: rName, area: this._calculateArea(Array.isArray(p) ? p : p.points) }));
                        }
                    });
                });
            }
            const globalZones = (state.data && state.data.global_zones) || {};
            ['include_zones', 'exclude_zones', 'entrance_zones', 'stationary_zones'].forEach(tKey => {
                const list = globalZones[tKey];
                if (Array.isArray(list)) {
                    list.forEach((p, i) => drawTasks.push({ obj: p, type: tKey, idx: i, rName: 'global', area: this._calculateArea(Array.isArray(p) ? p : p.points) }));
                }
            });
            drawTasks.sort((a, b) => b.area - a.area);
            drawTasks.forEach(task => { const el = createPoly(task.obj, task.type, task.idx, task.rName); if (el) svg.appendChild(el); });
        }
        if (state.points.length > 0) {
            let activeType = state.type;
            if (state.editMode === 'layout') activeType = state.radar_zone_type || 'monitor_zones';
            else if (state.editMode === 'global') activeType = state.global_zone_type || 'include_zones';
            const color = TYPE_COLORS[activeType] || 'white';
            if (state.isCalibratingMap) {
                state.points.forEach(p => svg.appendChild(this._create('circle', { cx: p[0], cy: p[1], r: baseR * 1.5 }, { fill: '#FFD700', stroke: 'white', strokeWidth: 1, pointerEvents: 'none' })));
                if (state.points.length === 1 && state.mousePos) {
                    let mx = state.mousePos.x;
                    let my = state.mousePos.y;
                    if (state.isCalibratingMap === 'X') my = state.points[0][1];
                    if (state.isCalibratingMap === 'Y') mx = state.points[0][0];
                    svg.appendChild(this._create('line', { x1: state.points[0][0], y1: state.points[0][1], x2: mx, y2: my }, { stroke: '#FFD700', strokeWidth: zoneStroke * 1.5, strokeDasharray: "4,2", pointerEvents: 'none' }));
                } else if (state.points.length === 2) {
                    svg.appendChild(this._create('line', {
                        x1: state.points[0][0], y1: state.points[0][1],
                        x2: state.points[1][0], y2: state.points[1][1]
                    }, { stroke: '#FFD700', strokeWidth: zoneStroke * 1.5, pointerEvents: 'none' }));
                }
            } else {
                state.points.forEach(p => svg.appendChild(this._create('circle', { cx: p[0], cy: p[1], r: baseR }, { fill: 'white', fillOpacity: 0.5, pointerEvents: 'none' })));
                const ptsStr = state.points.map(p => p.join(',')).join(' ');
                if (state.points.length >= 3) svg.appendChild(this._create('polygon', { points: ptsStr }, { fill: color, fillOpacity: 0.2, stroke: color, strokeWidth: zoneStroke, strokeDasharray: "4,2", pointerEvents: 'none' }));
                else svg.appendChild(this._create('polyline', { points: ptsStr }, { fill: 'none', stroke: color, strokeWidth: zoneStroke, pointerEvents: 'none' }));
            }
        }
    }
    drawTargets(state, config, hass, allRadars) {
        this.currentState = state;
        this.currentConfig = config;
        const globalConfig = (state.data && state.data.global_config) || {};
        const renderMode = globalConfig.target_render_mode || config.target_render_mode || 'css';
        const isCanvasMode = (renderMode === 'canvas');
        this.isCanvasMode = isCanvasMode;
        const hasCalibration = !!(state?.calibration?.active && state?.calibration?.map);
        if (isCanvasMode || hasCalibration) {
            this.wakeRenderLoop();
        }
        const dotsLayer = this.root.getElementById('dots-layer');
        if (isCanvasMode) {
            this._clearTrails();
            this._removeStaleDomEntries(new Set());
            if (dotsLayer) {
                dotsLayer.style.display = 'none';
                if (dotsLayer.firstChild) dotsLayer.innerHTML = '';
            }
            this.drawTargetsCanvas(state, config, hass, allRadars);
        } else {
            if (dotsLayer) {
                dotsLayer.style.display = 'block';
            }
            if (this.targetFilter) {
                this.targetFilter.clear(); 
            }
            this.drawTargetsDOM(state, config, hass, allRadars, dotsLayer);
        }
    }
    drawTargetsDOM(state, config, hass, allRadars, dotsLayer) {
        if (!dotsLayer) return;
        const currentActiveIds = new Set();
        const globalConfig = (state.data && state.data.global_config) || {};
        const targetRadius = config.target_radius || 8;
        const fusedColor = config.fused_color || globalConfig.fused_color || '#FFD700';
        const isTracking = globalConfig.enable_tracking !== false;
        const isLayoutMode = (state.editing && state.editMode === 'layout');
        const showHeading = !isLayoutMode && (globalConfig.show_heading !== undefined ? globalConfig.show_heading : (config.show_heading !== false)) !== false && isTracking;
        const showTrails = !isLayoutMode && (globalConfig.show_trails !== undefined ? globalConfig.show_trails : (config.show_trails !== false)) !== false && isTracking;
        const showLabels = (globalConfig.show_labels !== undefined ? globalConfig.show_labels : config.show_labels) === true && isTracking;
        const updateSec = parseFloat(globalConfig.update_interval || 0.1);
        const transitionDuration = Math.min(0.8, Math.max(0.12, updateSec * 1.05));
        const transitionStyle = isTracking ? `left ${transitionDuration}s linear, top ${transitionDuration}s linear, opacity 0.3s, border 0.3s, box-shadow 0.3s` : 'opacity 0.3s, border 0.3s';
        const globalZones = (state.data && state.data.global_zones) || {};
        const excludeZones = globalZones.exclude_zones || [];
        if (state.editMode === 'zone' || state.editMode === 'settings' || !state.editing) {
            const sourceFusedList = state.fused_targets || [];
            sourceFusedList.forEach(t => {
                if (t.x === undefined || t.y === undefined) return;
                if (excludeZones.some(z => this._isPointInPoly(t.x, t.y, z))) return;
                const dotId = `fused_${t.id}`;
                currentActiveIds.add(dotId);
                let dot = this._domCache[dotId];
                if (!dot) {
                    dot = document.createElement('div');
                    dot.id = dotId;
                    dot.className = 'dot';
                    dot.style.position = 'absolute';
                    dot.style.color = 'white';
                    const strokeW = Math.max(0.5, targetRadius * 0.08);
                    dot.style.webkitTextStroke = `${strokeW}px black`;
                    dot.style.paintOrder = "stroke fill";
                    dot.style.textShadow = 'none';
                    dot.style.fontWeight = '900';
                    const fontSize = Math.max(9, targetRadius * 1.3);
                    dot.style.fontSize = `${fontSize}px`;
                    dotsLayer.appendChild(dot);
                    this._domCache[dotId] = dot;
                }
                dot.style.width = `${targetRadius * 2}px`;
                dot.style.height = `${targetRadius * 2}px`;
                dot.style.transition = transitionStyle;
                const semantics = this._fusedSemantics(t);
                const { emitFootprint, isHold, isHibernating, isUnverified } = semantics;
                const isFallen = (t.posture === 'fallen');
                const isSuspectedFall = (t.posture === 'suspected_fall');
                let col = fusedColor;
                if (isFallen) col = '#FF2D55';
                else if (isSuspectedFall) col = '#FF9800';
                if (!emitFootprint) {
                    delete dot.dataset.lastTx;
                    delete dot.dataset.lastTy;
                }
                if (showTrails && emitFootprint && dot.dataset.lastTx !== undefined && dot.dataset.lastTy !== undefined) {
                    const prevX = parseFloat(dot.dataset.lastTx);
                    const prevY = parseFloat(dot.dataset.lastTy);
                    const dx = t.x - prevX;
                    const dy = t.y - prevY;
                    if (dx * dx + dy * dy > 0.04) {
                        const trail = document.createElement('div');
                        trail.className = 'trail-dot';
                        trail.style.width = `${targetRadius * 1.4}px`;
                        trail.style.height = `${targetRadius * 1.4}px`;
                        trail.style.background = col;
                        trail.style.left = prevX + '%';
                        trail.style.top = prevY + '%';
                        this._trackTrail(trail, dotId);
                        dotsLayer.insertBefore(trail, dot);
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                trail.style.opacity = '0';
                                trail.style.transform = 'translate(-50%, -50%) scale(0.2)';
                            });
                        });
                    }
                }
                const arrowId = `arrow_${dotId}`;
                if (showHeading && emitFootprint) {
                    currentActiveIds.add(arrowId);
                    let arrow = this._domCache[arrowId];
                    const wingAngle = Math.PI / 3; 
                    const wingLen = Math.max(5.0, targetRadius * 0.68);
                    const floatingGap = Math.max(4.5, targetRadius * 0.65);
                    const arrowStroke = Math.max(1.3, +(targetRadius * 0.20).toFixed(1));
                    const dx = +(wingLen * Math.cos(wingAngle)).toFixed(2);
                    const dy = +(wingLen * Math.sin(wingAngle)).toFixed(2);
                    const tipDist = targetRadius + floatingGap;
                    if (!arrow) {
                        arrow = document.createElement('div');
                        arrow.id = arrowId;
                        arrow.className = 'dot-arrow';
                        arrow.style.position = 'absolute';
                        arrow.style.pointerEvents = 'none';
                        arrow.style.zIndex = '15';
                        arrow.style.transformOrigin = '0 0';
                        arrow.style.width = '0px';
                        arrow.style.height = '0px';
                        dotsLayer.appendChild(arrow);
                        this._domCache[arrowId] = arrow;
                    }
                    if (arrow.dataset.radius !== String(targetRadius)) {
                        arrow.dataset.radius = String(targetRadius);
                        arrow.innerHTML = `<svg style="position: absolute; left: 0; top: 0; overflow: visible; display: block;">
                            <path d="M ${-dx} ${-dy} L 0 0 L ${-dx} ${dy}" fill="none" stroke="white" stroke-width="${arrowStroke}" stroke-linecap="round" stroke-linejoin="round" style="filter: drop-shadow(0 0 2px rgba(0,0,0,0.85));"/>
                        </svg>`;
                    }
                    arrow.style.transition = `${transitionStyle}, transform 0.25s ease-out`;
                    arrow.style.left = t.x + '%';
                    arrow.style.top = t.y + '%';
                    if (dot.dataset.lastTx !== undefined && dot.dataset.lastTy !== undefined) {
                        const moveDx = t.x - parseFloat(dot.dataset.lastTx);
                        const moveDy = t.y - parseFloat(dot.dataset.lastTy);
                        if (moveDx * moveDx + moveDy * moveDy > 0.04) {
                            const deg = Math.atan2(moveDy, moveDx) * 180 / Math.PI;
                            arrow.dataset.deg = deg;
                            arrow.dataset.lastMove = Date.now();
                        }
                    }
                    const currentDeg = arrow.dataset.deg;
                    const isMoving = arrow.dataset.lastMove && (Date.now() - parseFloat(arrow.dataset.lastMove) < 2500);
                    if (currentDeg !== undefined && isMoving) {
                        arrow.style.display = 'block';
                        arrow.style.opacity = '0.95';
                        arrow.style.transform = `rotate(${currentDeg}deg) translateX(${tipDist}px)`;
                    } else {
                        arrow.style.opacity = '0';
                    }
                }
                const badgeId = `badge_${dotId}`;
                if (isFallen || isSuspectedFall) {
                    currentActiveIds.add(badgeId);
                    let badge = this._domCache[badgeId];
                    if (!badge) {
                        badge = document.createElement('div');
                        badge.id = badgeId;
                        badge.className = 'fall-badge';
                        badge.style.position = 'absolute';
                        badge.style.pointerEvents = 'none';
                        badge.style.zIndex = '20';
                        badge.style.transform = 'translate(-50%, -100%)';
                        badge.style.padding = '1px 6px';
                        badge.style.borderRadius = '8px';
                        badge.style.fontSize = '9px';
                        badge.style.fontWeight = 'bold';
                        badge.style.color = '#FFFFFF';
                        badge.style.whiteSpace = 'nowrap';
                        badge.style.border = '1px solid rgba(255, 255, 255, 0.85)';
                        dotsLayer.appendChild(badge);
                        this._domCache[badgeId] = badge;
                    }
                    badge.style.transition = transitionStyle;
                    badge.style.left = t.x + '%';
                    badge.style.top = `calc(${t.y}% - ${targetRadius + 4}px)`;
                    const hText = (t.abs_height !== undefined && t.abs_height !== null) ? `${Number(t.abs_height).toFixed(2)}m` : '';
                    const alias = t.anonymousAlias || '';
                    badge.innerText = isFallen ? `🚨 ${alias} 跌倒 ${hText}` : `⚠️ ${alias} 疑似 ${hText}`;
                    badge.style.background = isFallen ? 'rgba(230, 20, 50, 0.92)' : 'rgba(235, 140, 0, 0.92)';
                    badge.style.boxShadow = isFallen ? '0 0 8px rgba(255, 0, 50, 0.6)' : '0 0 8px rgba(255, 150, 0, 0.6)';
                    badge.style.display = 'block';
                }
                if (emitFootprint) {
                    dot.dataset.lastTx = t.x;
                    dot.dataset.lastTy = t.y;
                }
                if (isHold) {
                    dot.style.background = 'transparent';
                    dot.style.border = `2px dashed ${col}`;
                    dot.style.opacity = '0.6';
                    dot.style.boxShadow = 'none';
                } else if (isUnverified) {
                    dot.style.background = 'transparent';
                    dot.style.border = `2px solid #FF9800`;
                    dot.style.opacity = '0.8';
                    dot.style.boxShadow = 'none';
                } else if (isHibernating) {
                    dot.style.background = '#555555';
                    dot.style.border = '1px solid rgba(255, 255, 255, 0.5)';
                    dot.style.opacity = '0.3';
                    dot.style.boxShadow = 'none';
                } else if (isFallen) {
                    dot.style.background = '#FF2D55';
                    dot.style.border = '2px solid white';
                    dot.style.opacity = '1.0';
                    dot.style.boxShadow = '0 0 16px #FF0033';
                } else if (isSuspectedFall) {
                    dot.style.background = '#FF9800';
                    dot.style.border = '1.5px solid white';
                    dot.style.opacity = '1.0';
                    dot.style.boxShadow = '0 0 12px #FF9800';
                } else {
                    dot.style.background = col;
                    dot.style.border = '1.5px solid white';
                    dot.style.opacity = '1.0';
                    dot.style.boxShadow = `0 0 8px ${col}`;
                }
                dot.style.left = t.x + '%';
                dot.style.top = t.y + '%';
                const label = showLabels ? (t.anonymousAlias || '') : '';
                dot.innerText = label;
                if (showLabels && label) {
                    dot.title = `${label}\nLifecycle: ${t.lifecycle}\nPosition: ${t.positionBasis}\nPosture: ${t.posture || 'unknown'}`;
                } else {
                    dot.removeAttribute('title');
                }
            });
        } else if (state.editing && state.editMode === 'layout') {
            const defColors = ['#00FF00', '#FF0000', '#00FFFF', '#FF00FF', '#FFFF00', '#FFA500'];
            const userColors = config.target_colors || [];
            const targetsToDraw = typeof allRadars !== 'undefined' ? allRadars : this._getAllRadars(state, config, hass);
            const showLbl = config.show_labels !== false;
            targetsToDraw.forEach(rObj => {
                const rName = rObj.name;
                const rData = (state.data && state.data[rName]) || {};
                if (rData.paused === true) return;
                const cfg = this.getRadarConfig(state, rName, hass);
                const isSelected = (rName === state.radar);
                for (let i = 1; i <= 5; i++) {
                    this.processTarget(hass, rName, i, cfg, targetRadius, showLbl, userColors, defColors, null, dotsLayer, currentActiveIds, isSelected);
                }
            });
        }
        this._removeStaleDomEntries(currentActiveIds);
    }
    drawTargetsCanvas(state, config, hass, allRadars) {
        if (!this.targetFilter) return;
        const currentActiveIds = new Set();
        if (state.editMode === 'zone' || state.editMode === 'settings' || !state.editing) {
            const sourceFusedList = state.fused_targets || [];
            const globalConfig = (state.data && state.data.global_config) || {};
            const fusedColor = config.fused_color || globalConfig.fused_color || '#FFD700';
            const showLabels = (globalConfig.show_labels !== undefined ? globalConfig.show_labels : config.show_labels) === true;
            sourceFusedList.forEach(t => {
                if (t.x === undefined || t.y === undefined) return;
                const dotId = `fused_${t.id}`;
                currentActiveIds.add(dotId);
                const semantics = this._fusedSemantics(t);
                this.targetFilter.update(dotId, parseFloat(t.x), parseFloat(t.y), {
                    lifecycle: t.lifecycle,
                    positionBasis: t.positionBasis,
                    anonymousAlias: t.anonymousAlias,
                    emitFootprint: semantics.emitFootprint,
                    posture: t.posture,
                    abs_height: t.abs_height,
                    fall_duration: t.fall_duration,
                    isHold: semantics.isHold,
                    isHibernating: semantics.isHibernating,
                    isUnverified: semantics.isUnverified,
                    color: fusedColor,
                    type: 'fused'
                });
            });
        } else if (state.editing && state.editMode === 'layout') {
            const defColors = ['#00FF00', '#FF0000', '#00FFFF', '#FF00FF', '#FFFF00', '#FFA500'];
            const userColors = config.target_colors || [];
            const targetsToDraw = typeof allRadars !== 'undefined' ? allRadars : this._getAllRadars(state, config, hass);
            const showLabels = config.show_labels !== false;
            targetsToDraw.forEach(rObj => {
                const rName = rObj.name;
                const rData = (state.data && state.data[rName]) || {};
                if (rData.paused === true) return;
                const cfg = this.getRadarConfig(state, rName, hass);
                const isSelected = (rName === state.radar);
                for (let i = 1; i <= 5; i++) {
                    this.processTarget(hass, rName, i, cfg, config.target_radius || 8, showLabels, userColors, defColors, null, null, currentActiveIds, isSelected);
                }
            });
        }
        this.targetFilter.prune(currentActiveIds);
    }
    processTarget(hass, rName, i, cfg, radius, showLbl, uCols, dCols, unitOverride, layer, currentActiveIds, isSelected) {
        if (!hass || !hass.states) return false;
        const lowerName = rName.toLowerCase();
        let xs = hass.states[`sensor.${lowerName}_target_${i}_x`];
        let ys = hass.states[`sensor.${lowerName}_target_${i}_y`];
        let zs = hass.states[`sensor.${lowerName}_target_${i}_z`];
        let is1D = false;
        if (!ys || ys.state === 'unavailable') {
            const possibleDistEntities = [`sensor.${lowerName}_distance`, `sensor.${lowerName}_target_${i}_distance`];
            for (const entId of possibleDistEntities) {
                const ent = hass.states[entId];
                if (ent && ent.state !== 'unavailable') {
                    if (entId.includes(`target_${i}`) || i === 1) { ys = ent; xs = null; is1D = true; break; }
                }
            }
        }
        if (ys && ys.state !== 'unavailable') {
            let yVal = parseFloat(ys.state);
            let unit = unitOverride || ys.attributes.unit_of_measurement;
            let xVal = 0; let zVal = 0;
            if (xs && xs.state !== 'unavailable') xVal = parseFloat(xs.state);
            if (zs && zs.state !== 'unavailable') zVal = parseFloat(zs.state);
            if (isNaN(yVal)) return false;
            if (!unit) {
                if (Math.abs(yVal) < 50) unit = 'm';
                else unit = 'mm';
            }
            if (unit === 'cm') { xVal *= 10; yVal *= 10; zVal *= 10; }
            else if (unit === 'm') { xVal *= 1000; yVal *= 1000; zVal *= 1000; }
            if (Math.abs(yVal) > 10) {
                this.renderDot(layer, rName, i, xVal, yVal, zVal, cfg, radius, showLbl, uCols, dCols, is1D, currentActiveIds, isSelected);
                return true;
            }
        }
        return false;
    }
    renderDot(layer, rName, idx, xVal, yVal, zVal, cfg, r, showLbl, uCols, dCols, is1D, currentActiveIds, isSelected) {
        const ground = this.math.calculate(cfg, { x: xVal, y: yVal, z: zVal });
        if (!ground || !ground.active) return;
        const dotId = `raw_${rName}_${idx}`;
        if (currentActiveIds) currentActiveIds.add(dotId);
        const colorIdx = (typeof idx === 'number') ? ((idx > 9) ? (idx % dCols.length) : (idx - 1)) : 0;
        const col = uCols[colorIdx] || dCols[colorIdx % dCols.length] || 'white';
        if (this.isCanvasMode) {
            if (this.targetFilter) {
                this.targetFilter.update(dotId, ground.left, ground.top, {
                    radarName: rName,
                    index: idx,
                    color: col,
                    label: showLbl ? (is1D ? "D" : ((idx > 9) ? "D" : idx)) : '',
                    is1D: is1D,
                    type: 'raw',
                    isSelected: isSelected
                });
            }
        } else if (layer) {
            let dot = this._domCache[dotId];
            if (!dot) {
                dot = document.createElement('div');
                dot.id = dotId;
                dot.className = 'dot';
                dot.style.position = 'absolute';
                layer.appendChild(dot);
                this._domCache[dotId] = dot;
            }
            dot.style.width = `${r * 2}px`;
            dot.style.height = `${r * 2}px`;
            dot.style.background = col;
            dot.style.color = 'black';
            dot.style.textShadow = '0 0 1px white';
            const fontSize = Math.max(8, r * 1.1);
            dot.style.fontSize = `${fontSize}px`;
            dot.style.transition = 'left 0.15s linear, top 0.15s linear, transform 0.2s, box-shadow 0.2s';
            dot.style.left = ground.left + '%';
            dot.style.top = ground.top + '%';
            if (isSelected) {
                dot.style.border = '2px solid white';
                dot.style.boxShadow = '0 0 12px white';
                dot.style.transform = 'translate(-50%, -50%) scale(1.3)';
                dot.style.zIndex = '100';
            } else {
                dot.style.border = '1px solid rgba(0,0,0,0.5)';
                dot.style.boxShadow = 'none';
                dot.style.transform = 'translate(-50%, -50%) scale(1)';
                dot.style.zIndex = '10';
            }
            dot.innerText = showLbl ? (is1D ? "D" : ((idx > 9) ? "D" : idx)) : '';
        }
    }
    _toRgba(cStr, alpha = 1) {
        if (!cStr || typeof cStr !== 'string') return `rgba(255, 215, 0, ${alpha})`;
        if (cStr.startsWith('#')) {
            let h = cStr.slice(1);
            if (h.length === 3 || h.length === 4) h = h.split('').slice(0, 3).map(x => x + x).join('');
            if (h.length >= 6) {
                const r = parseInt(h.substr(0, 2), 16);
                const g = parseInt(h.substr(2, 2), 16);
                const b = parseInt(h.substr(4, 2), 16);
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            }
        } else if (cStr.startsWith('rgb')) {
            const m = cStr.match(/\d+/g);
            if (m && m.length >= 3) {
                return `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${alpha})`;
            }
        }
        return `rgba(255, 255, 255, ${alpha})`;
    }
}
