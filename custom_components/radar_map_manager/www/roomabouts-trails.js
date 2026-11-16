/**
 * Pure, bounded survey-step sampling for the Roomabouts read-only field view.
 *
 * This module deliberately has no DOM, Canvas, Home Assistant, network, storage,
 * or logging dependency. Renderers may consume only immutable records returned
 * by visible().
 */

export const ROOMABOUTS_TRAIL_CONSTANTS = Object.freeze({
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
});

const EMPTY_RECORDS = Object.freeze([]);
const VALID_POSITION_PAIRS = new Set([
    'tentative|observed',
    'confirmed|observed',
    'confirmed|interpolated',
    'coasting|held',
    'coasting|interpolated',
    'fading|last-seen',
]);

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const recordLike = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const immutable = (value) => Object.freeze(value);
const compareRecords = (left, right) => (
    left.createdAtMs - right.createdAtMs || left.ordinal - right.ordinal
);

const result = (ok, reason, extra = {}) => immutable({ ok, reason, ...extra });

/**
 * Project an immutable map-space sample into a non-square CSS content box.
 * The returned screen position includes the accepted four-pixel side offset.
 */
export const projectRoomaboutsStep = (record, width, height) => {
    if (!recordLike(record)
        || !finite(record.x)
        || !finite(record.y)
        || !finite(record.rotationDeg)
        || (record.side !== 'left' && record.side !== 'right')
        || !finite(width)
        || !finite(height)
        || width <= 0
        || height <= 0) {
        return null;
    }

    const centerX = record.x * width / 100;
    const centerY = record.y * height / 100;
    const mapAngle = (record.rotationDeg - 90) * Math.PI / 180;
    const projectedX = Math.cos(mapAngle) * width / 100;
    const projectedY = Math.sin(mapAngle) * height / 100;
    const projectedLength = Math.hypot(projectedX, projectedY);
    if (!finite(centerX)
        || !finite(centerY)
        || !finite(projectedLength)
        || projectedLength <= 0) {
        return null;
    }

    const tangentX = projectedX / projectedLength;
    const tangentY = projectedY / projectedLength;
    const normalX = record.side === 'left' ? tangentY : -tangentY;
    const normalY = record.side === 'left' ? -tangentX : tangentX;
    const offsetX = normalX * ROOMABOUTS_TRAIL_CONSTANTS.lateralOffsetPx;
    const offsetY = normalY * ROOMABOUTS_TRAIL_CONSTANTS.lateralOffsetPx;
    const screenX = centerX + offsetX;
    const screenY = centerY + offsetY;
    const rotationDeg = Math.atan2(tangentY, tangentX) * 180 / Math.PI + 90;
    if (![offsetX, offsetY, screenX, screenY, rotationDeg].every(finite)) return null;

    return immutable({
        centerX,
        centerY,
        screenX,
        screenY,
        offsetX,
        offsetY,
        rotationDeg,
        side: record.side,
    });
};

const exactNumber = (value) => {
    if (Number.isNaN(value)) return 'NaN';
    if (value === Number.POSITIVE_INFINITY) return '+Infinity';
    if (value === Number.NEGATIVE_INFINITY) return '-Infinity';
    if (Object.is(value, -0)) return '-0';
    return String(value);
};

const trackFingerprint = (track) => {
    const position = recordLike(track?.position) ? track.position : {};
    return [
        String(track?.trackId),
        exactNumber(position.x),
        exactNumber(position.y),
        String(position.coordinateSpace),
        String(track?.lifecycle),
        String(track?.positionBasis),
        exactNumber(track?.observedAt),
        String(track?.emitFootprint),
    ].join('\u001f');
};

const presentationFingerprint = (presentation) => {
    const tracks = [...presentation.tracks]
        .sort((left, right) => String(left?.trackId).localeCompare(String(right?.trackId)))
        .map(trackFingerprint);
    return JSON.stringify([
        presentation.generationId,
        presentation.sequence,
        presentation.reset === true,
        tracks,
        [...presentation.removedTrackIds].sort(),
        [...presentation.clearedTrackIds].sort(),
    ]);
};

const validIdentifierList = (value) => (
    Array.isArray(value)
    && value.length <= 4096
    && value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 256)
    && new Set(value).size === value.length
);

const validPresentationEnvelope = (presentation) => {
    if (!recordLike(presentation)
        || presentation.accepted !== true
        || typeof presentation.generationId !== 'string'
        || presentation.generationId.length === 0
        || presentation.generationId.length > 256
        || !Number.isSafeInteger(presentation.sequence)
        || presentation.sequence < 0
        || !Array.isArray(presentation.tracks)
        || presentation.tracks.length > 128
        || !validIdentifierList(presentation.removedTrackIds)
        || !validIdentifierList(presentation.clearedTrackIds)) {
        return false;
    }
    const trackIds = presentation.tracks.map((track) => track?.trackId);
    return trackIds.every((trackId) => (
        typeof trackId === 'string' && trackId.length > 0 && trackId.length <= 256
    )) && new Set(trackIds).size === trackIds.length;
};

const validTrackFacts = (track) => {
    if (!recordLike(track)
        || !recordLike(track.position)
        || track.position.coordinateSpace !== 'map-layout'
        || !finite(track.position.x)
        || !finite(track.position.y)
        || !finite(track.observedAt)
        || typeof track.emitFootprint !== 'boolean') {
        return false;
    }
    const pair = `${track.lifecycle}|${track.positionBasis}`;
    if (!VALID_POSITION_PAIRS.has(pair)) return false;
    return track.emitFootprint !== true || pair === 'confirmed|observed';
};

const sameObservation = (left, right) => (
    left !== null
    && left.generationId === right.generationId
    && left.sequence === right.sequence
    && left.trackId === right.trackId
    && left.observedAt === right.observedAt
    && left.x === right.x
    && left.y === right.y
);

const orderedAfter = (left, right) => (
    left === null
    || (right.sequence > left.sequence && right.observedAt > left.observedAt)
);

export class RoomaboutsTrailStore {
    constructor({ clock, setTimeout, clearTimeout, onChange } = {}) {
        if (typeof clock !== 'function'
            || typeof setTimeout !== 'function'
            || typeof clearTimeout !== 'function'
            || (onChange !== undefined && typeof onChange !== 'function')) {
            throw new TypeError('RoomaboutsTrailStore requires clock and scheduler functions');
        }
        this._clock = clock;
        this._setTimeout = setTimeout;
        this._clearTimeout = clearTimeout;
        this._onChange = onChange || null;
        this._destroyed = false;
        this._generationId = null;
        this._lastClockMs = null;
        this._lastPresentationFingerprint = null;
        this._ownersByTrack = new Map();
        this._records = [];
        this._ownerEpoch = 0;
        this._nextOwnerOrdinal = 1;
        this._nextRecordOrdinal = 0;
        this._timerHandle = null;
        this._timerDeadline = null;
        this._timerGeneration = 0;
    }

    _resolveNow(value) {
        if (value !== undefined) return value;
        try {
            return this._clock();
        } catch (_error) {
            return null;
        }
    }

    _notify() {
        if (!this._onChange) return;
        try {
            this._onChange();
        } catch (_error) {
            // A presentation callback cannot weaken store bounds or cleanup.
        }
    }

    _cancelTimer() {
        this._timerGeneration += 1;
        if (this._timerHandle !== null) {
            try {
                this._clearTimeout(this._timerHandle);
            } catch (_error) {
                // The handle is still forgotten locally and cannot be reused.
            }
        }
        this._timerHandle = null;
        this._timerDeadline = null;
    }

    _armTimer(now) {
        if (this._destroyed || this._records.length === 0) {
            this._cancelTimer();
            return;
        }
        const earliest = Math.min(...this._records.map((record) => record.expiresAtMs));
        if (this._timerHandle !== null && this._timerDeadline === earliest) return;
        this._cancelTimer();
        const delay = Math.max(0, earliest - now);
        const timerGeneration = this._timerGeneration;
        try {
            const handle = this._setTimeout(
                () => this._timerExpired(timerGeneration),
                delay,
            );
            if (handle === undefined || handle === null) return;
            this._timerHandle = handle;
            this._timerDeadline = earliest;
        } catch (_error) {
            this._timerHandle = null;
            this._timerDeadline = null;
        }
    }

    _timerExpired(timerGeneration) {
        if (timerGeneration !== this._timerGeneration) return;
        this._timerGeneration += 1;
        this._timerHandle = null;
        this._timerDeadline = null;
        if (this._destroyed) return;
        let now;
        try {
            now = this._clock();
        } catch (_error) {
            return;
        }
        if (!finite(now) || (this._lastClockMs !== null && now < this._lastClockMs)) return;
        this._lastClockMs = now;
        const removed = this._deleteExpired(now);
        this._armTimer(now);
        if (removed > 0) this._notify();
    }

    _deleteExpired(now) {
        const previousLength = this._records.length;
        this._records = this._records.filter((record) => now < record.expiresAtMs);
        return previousLength - this._records.length;
    }

    _clearSampling({ keepGeneration = false, preserveRecordOrdinal = false } = {}) {
        const changed = this._records.length > 0;
        this._cancelTimer();
        this._ownersByTrack.clear();
        this._records = [];
        this._lastPresentationFingerprint = null;
        this._ownerEpoch += 1;
        this._nextOwnerOrdinal = 1;
        if (!preserveRecordOrdinal) this._nextRecordOrdinal = 0;
        if (!keepGeneration) this._generationId = null;
        return changed;
    }

    _resetForClock(now) {
        const changed = this._clearSampling();
        this._lastClockMs = finite(now) ? now : null;
        if (changed) this._notify();
    }

    _owner(trackId) {
        let owner = this._ownersByTrack.get(trackId);
        if (owner) return owner;
        owner = {
            ownerId: `owner-${this._ownerEpoch}-${this._nextOwnerOrdinal}`,
            anchor: null,
            residual: 0,
            nextSide: ROOMABOUTS_TRAIL_CONSTANTS.firstSide,
            lastObservation: null,
        };
        this._nextOwnerOrdinal += 1;
        this._ownersByTrack.set(trackId, owner);
        return owner;
    }

    _clearAnchor(owner) {
        owner.anchor = null;
        owner.residual = 0;
    }

    _removeOwner(trackId) {
        const owner = this._ownersByTrack.get(trackId);
        if (!owner) return false;
        this._ownersByTrack.delete(trackId);
        const previousLength = this._records.length;
        this._records = this._records.filter((record) => record.ownerId !== owner.ownerId);
        return previousLength !== this._records.length;
    }

    _evictOldest(predicate, count) {
        if (count <= 0) return;
        const evicted = new Set(
            this._records.filter(predicate).sort(compareRecords).slice(0, count),
        );
        if (evicted.size > 0) {
            this._records = this._records.filter((record) => !evicted.has(record));
        }
    }

    _reserve(ownerId, count) {
        const ownerCount = this._records.filter((record) => record.ownerId === ownerId).length;
        this._evictOldest(
            (record) => record.ownerId === ownerId,
            Math.max(0, ownerCount + count - ROOMABOUTS_TRAIL_CONSTANTS.maxRecordsPerOwner),
        );
        this._evictOldest(
            () => true,
            Math.max(0, this._records.length + count - ROOMABOUTS_TRAIL_CONSTANTS.maxRecords),
        );
    }

    _sample(owner, observation, now) {
        if (owner.anchor === null) {
            owner.anchor = { x: observation.x, y: observation.y };
            owner.residual = 0;
            owner.lastObservation = observation;
            return { emitted: 0, rejected: 0, changed: false };
        }

        const deltaX = observation.x - owner.anchor.x;
        const deltaY = observation.y - owner.anchor.y;
        const length = Math.hypot(deltaX, deltaY);
        const observationGap = observation.observedAt - owner.lastObservation.observedAt;
        if (!finite(length) || !finite(observationGap)) {
            this._clearAnchor(owner);
            return { emitted: 0, rejected: 1, changed: false };
        }
        if (length <= ROOMABOUTS_TRAIL_CONSTANTS.coordinateEpsilon) {
            owner.lastObservation = observation;
            return { emitted: 0, rejected: 0, changed: false };
        }
        if (observationGap > ROOMABOUTS_TRAIL_CONSTANTS.maxObservationGapMs
            || length > ROOMABOUTS_TRAIL_CONSTANTS.discontinuityThreshold) {
            owner.anchor = { x: observation.x, y: observation.y };
            owner.residual = 0;
            owner.lastObservation = observation;
            return { emitted: 0, rejected: 0, changed: false };
        }

        const unitX = deltaX / length;
        const unitY = deltaY / length;
        const rotationDeg = Math.atan2(deltaY, deltaX) * 180 / Math.PI + 90;
        let consumed = 0;
        let needed = ROOMABOUTS_TRAIL_CONSTANTS.spacing - owner.residual;
        const possibleEmissions = length + ROOMABOUTS_TRAIL_CONSTANTS.coordinateEpsilon < needed
            ? 0
            : 1 + Math.floor(
                (length - needed + ROOMABOUTS_TRAIL_CONSTANTS.coordinateEpsilon)
                / ROOMABOUTS_TRAIL_CONSTANTS.spacing,
            );
        if (possibleEmissions > ROOMABOUTS_TRAIL_CONSTANTS.maxEmissionsPerObservation) {
            owner.anchor = { x: observation.x, y: observation.y };
            owner.residual = 0;
            owner.lastObservation = observation;
            return { emitted: 0, rejected: 1, changed: false };
        }
        let nextSide = owner.nextSide;
        const samples = [];
        while (length - consumed + ROOMABOUTS_TRAIL_CONSTANTS.coordinateEpsilon >= needed) {
            const travel = Math.min(needed, length - consumed);
            consumed += travel;
            samples.push({
                x: owner.anchor.x + unitX * consumed,
                y: owner.anchor.y + unitY * consumed,
                rotationDeg,
                side: nextSide,
            });
            nextSide = nextSide === 'left' ? 'right' : 'left';
            needed = ROOMABOUTS_TRAIL_CONSTANTS.spacing;
        }

        const finalResidual = samples.length > 0
            ? length - consumed
            : owner.residual + length;
        owner.anchor = { x: observation.x, y: observation.y };
        owner.residual = finalResidual;
        owner.nextSide = nextSide;
        owner.lastObservation = observation;
        if (samples.length === 0) return { emitted: 0, rejected: 0, changed: false };

        this._reserve(owner.ownerId, samples.length);
        for (const sample of samples) {
            this._records.push(immutable({
                ownerId: owner.ownerId,
                x: sample.x,
                y: sample.y,
                rotationDeg: sample.rotationDeg,
                side: sample.side,
                createdAtMs: now,
                expiresAtMs: now + ROOMABOUTS_TRAIL_CONSTANTS.expiryMs,
                ordinal: this._nextRecordOrdinal,
            }));
            this._nextRecordOrdinal += 1;
        }
        return { emitted: samples.length, rejected: 0, changed: true };
    }

    _observeTrack(track, presentation, now) {
        const existingOwner = this._ownersByTrack.get(track.trackId) || null;
        if (!validTrackFacts(track)) {
            if (existingOwner) this._clearAnchor(existingOwner);
            return { emitted: 0, rejected: 1, changed: false };
        }
        const owner = existingOwner || this._owner(track.trackId);
        const observation = {
            generationId: presentation.generationId,
            sequence: presentation.sequence,
            trackId: track.trackId,
            observedAt: track.observedAt,
            x: track.position.x,
            y: track.position.y,
        };
        const duplicate = sameObservation(owner.lastObservation, observation);
        const eligible = track.emitFootprint === true
            && track.lifecycle === 'confirmed'
            && track.positionBasis === 'observed';

        if (!eligible) {
            if (!duplicate && !orderedAfter(owner.lastObservation, observation)) {
                this._clearAnchor(owner);
                return { emitted: 0, rejected: 1, changed: false };
            }
            if (!duplicate) owner.lastObservation = observation;
            this._clearAnchor(owner);
            return { emitted: 0, rejected: 0, changed: false };
        }
        if (duplicate) return { emitted: 0, rejected: 0, changed: false };
        if (!orderedAfter(owner.lastObservation, observation)) {
            this._clearAnchor(owner);
            return { emitted: 0, rejected: 1, changed: false };
        }
        return this._sample(owner, observation, now);
    }

    /** Consume one complete, accepted presentation result exactly once. */
    observeAccepted(presentation, now) {
        if (this._destroyed) return result(false, 'destroyed', { emitted: 0, rejected: 0 });
        now = this._resolveNow(now);
        if (!finite(now)) {
            this._resetForClock(null);
            return result(false, 'invalid-clock', { emitted: 0, rejected: 0 });
        }
        if (this._lastClockMs !== null && now < this._lastClockMs) {
            this._resetForClock(now);
            return result(false, 'clock-regression', { emitted: 0, rejected: 0 });
        }
        this._lastClockMs = now;
        const expired = this._deleteExpired(now);

        if (!validPresentationEnvelope(presentation)) {
            this._resetForClock(now);
            return result(false, 'invalid-presentation', { emitted: 0, rejected: 0 });
        }
        const fingerprint = presentationFingerprint(presentation);
        if (fingerprint === this._lastPresentationFingerprint) {
            this._armTimer(now);
            if (expired > 0) this._notify();
            return result(true, 'duplicate-presentation', { emitted: 0, rejected: 0 });
        }

        let changed = expired > 0;
        const sameGeneration = this._generationId === presentation.generationId;
        const boundary = this._generationId === null
            || !sameGeneration
            || presentation.reset === true;
        if (boundary) {
            changed = this._clearSampling({
                preserveRecordOrdinal: sameGeneration,
            }) || changed;
            this._generationId = presentation.generationId;
        } else {
            for (const trackId of [...presentation.clearedTrackIds, ...presentation.removedTrackIds]) {
                changed = this._removeOwner(trackId) || changed;
            }
        }

        if (presentation.tracks.length === 0) {
            changed = this._clearSampling({
                keepGeneration: true,
                preserveRecordOrdinal: true,
            }) || changed;
            this._lastPresentationFingerprint = fingerprint;
            this._armTimer(now);
            if (changed) this._notify();
            return result(true, boundary ? 'reset' : 'observed', { emitted: 0, rejected: 0 });
        }

        let emitted = 0;
        let rejected = 0;
        const tracks = [...presentation.tracks].sort((left, right) => (
            left.trackId < right.trackId ? -1 : left.trackId > right.trackId ? 1 : 0
        ));
        const activeTrackIds = new Set(tracks.map((track) => track.trackId));
        for (const trackId of [...this._ownersByTrack.keys()]) {
            if (!activeTrackIds.has(trackId)) changed = this._removeOwner(trackId) || changed;
        }
        for (const track of tracks) {
            const trackResult = this._observeTrack(track, presentation, now);
            emitted += trackResult.emitted;
            rejected += trackResult.rejected;
            changed = trackResult.changed || changed;
        }

        this._lastPresentationFingerprint = fingerprint;
        this._armTimer(now);
        if (changed) this._notify();
        return result(true, boundary ? 'reset' : 'observed', { emitted, rejected });
    }

    /** Return logically visible records without changing sampling or cleanup state. */
    visible(now) {
        if (this._destroyed) return immutable({ ok: false, reason: 'destroyed', records: EMPTY_RECORDS });
        now = this._resolveNow(now);
        if (!finite(now)) return immutable({ ok: false, reason: 'invalid-clock', records: EMPTY_RECORDS });
        if (this._lastClockMs !== null && now < this._lastClockMs) {
            return immutable({ ok: false, reason: 'clock-regression', records: EMPTY_RECORDS });
        }
        const records = Object.freeze(
            this._records.filter((record) => now < record.expiresAtMs).sort(compareRecords),
        );
        return immutable({ ok: true, records });
    }

    /** Explicit physical cleanup hook for timer, visibilitychange, and pageshow paths. */
    expire(now) {
        if (this._destroyed) return result(false, 'destroyed', { removed: 0 });
        now = this._resolveNow(now);
        if (!finite(now)) return result(false, 'invalid-clock', { removed: 0 });
        if (this._lastClockMs !== null && now < this._lastClockMs) {
            return result(false, 'clock-regression', { removed: 0 });
        }
        this._lastClockMs = now;
        const removed = this._deleteExpired(now);
        this._armTimer(now);
        if (removed > 0) this._notify();
        return result(true, 'expired', { removed });
    }

    /** Clear every private owner/record and establish a new clock baseline. */
    reset(_reason = 'explicit-reset', now) {
        if (this._destroyed) return result(false, 'destroyed');
        now = this._resolveNow(now);
        const changed = this._clearSampling();
        this._lastClockMs = finite(now) ? now : null;
        if (changed) this._notify();
        return finite(now) ? result(true, 'reset') : result(false, 'invalid-clock');
    }

    /** Permanently stop the store and cancel its sole owned timer. */
    destroy() {
        if (this._destroyed) return result(true, 'destroyed');
        const changed = this._clearSampling();
        this._destroyed = true;
        this._lastClockMs = null;
        if (changed) this._notify();
        return result(true, 'destroyed');
    }

    /** Bounded test diagnostics. Never exposes identifiers, coordinates, or times. */
    stats() {
        let anchorCount = 0;
        for (const owner of this._ownersByTrack.values()) {
            if (owner.anchor !== null) anchorCount += 1;
        }
        return immutable({
            ownerCount: this._ownersByTrack.size,
            anchorCount,
            recordCount: this._records.length,
            timerScheduled: this._timerHandle !== null,
            destroyed: this._destroyed,
        });
    }
}
