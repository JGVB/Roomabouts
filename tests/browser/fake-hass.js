import { validateRoomaboutsSnapshot } from '../../custom_components/radar_map_manager/www/roomabouts-presentation.js';

const STREAM_TYPE = 'rmm/stream';
const MAX_SCENARIOS = 16;
const MAX_FRAMES = 512;
const MAX_DIAGNOSTICS = 64;
const MIN_SPEED = 0.25;
const MAX_SPEED = 4;

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function boundedText(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const normalized = value.replace(/[^A-Za-z0-9_.:/-]/g, '_').slice(0, 80);
    return normalized || fallback;
}

function validateSnapshotEnvelope(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        throw new TypeError('Synthetic snapshot must be an object');
    }
    if (snapshot.schemaVersion !== 1) {
        throw new TypeError('Synthetic snapshot schemaVersion must be 1');
    }
    if (typeof snapshot.generationId !== 'string' || snapshot.generationId.length === 0) {
        throw new TypeError('Synthetic snapshot generationId is required');
    }
    if (!Number.isSafeInteger(snapshot.sequence) || snapshot.sequence < 0) {
        throw new TypeError('Synthetic snapshot sequence must be a non-negative integer');
    }
    if (!Number.isFinite(snapshot.logicalTimeMs) || snapshot.logicalTimeMs < 0) {
        throw new TypeError('Synthetic snapshot logicalTimeMs must be finite and non-negative');
    }
    if (!snapshot.map || typeof snapshot.map !== 'object' || !Array.isArray(snapshot.tracks)) {
        throw new TypeError('Synthetic snapshot map and tracks are required');
    }
    if (!Array.isArray(snapshot.sourceHealth)) {
        throw new TypeError('Synthetic snapshot sourceHealth must be an array');
    }
}

function validateScenarios(scenarios) {
    if (!Array.isArray(scenarios) || scenarios.length === 0 || scenarios.length > MAX_SCENARIOS) {
        throw new TypeError(`Expected 1-${MAX_SCENARIOS} synthetic scenarios`);
    }
    const ids = new Set();
    const validated = [];
    for (const scenario of scenarios) {
        if (!scenario || typeof scenario !== 'object' || scenario.privacy !== 'synthetic-only') {
            throw new TypeError('Every fixture scenario must be marked synthetic-only');
        }
        if (typeof scenario.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(scenario.id)) {
            throw new TypeError('Scenario ID must be a bounded slug');
        }
        if (ids.has(scenario.id)) throw new TypeError('Scenario IDs must be unique');
        ids.add(scenario.id);
        if (!Array.isArray(scenario.frames) || scenario.frames.length === 0 || scenario.frames.length > MAX_FRAMES) {
            throw new TypeError(`Scenario frames must contain 1-${MAX_FRAMES} snapshots`);
        }
        const frames = scenario.frames.map((snapshot) => {
            validateSnapshotEnvelope(snapshot);
            return validateRoomaboutsSnapshot(snapshot);
        });
        validated.push({
            id: scenario.id,
            label: typeof scenario.label === 'string' ? scenario.label.slice(0, 96) : scenario.id,
            description: typeof scenario.description === 'string'
                ? scenario.description.slice(0, 256)
                : '',
            privacy: 'synthetic-only',
            frames,
        });
    }
    return validated;
}

function createBrowserClock() {
    return {
        now: () => globalThis.performance.now(),
        setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
        clearTimeout: (timer) => globalThis.clearTimeout(timer),
    };
}

export class ManualReplayClock {
    constructor(nowMs = 0) {
        if (!Number.isFinite(nowMs)) throw new TypeError('Clock start must be finite');
        this._nowMs = nowMs;
        this._nextTimer = 1;
        this._timers = new Map();
    }

    now() {
        return this._nowMs;
    }

    setTimeout(callback, delayMs) {
        if (typeof callback !== 'function') throw new TypeError('Timer callback is required');
        const timer = this._nextTimer++;
        const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 0;
        this._timers.set(timer, { callback, dueAt: this._nowMs + delay });
        return timer;
    }

    clearTimeout(timer) {
        this._timers.delete(timer);
    }

    advanceBy(deltaMs) {
        if (!Number.isFinite(deltaMs) || deltaMs < 0) {
            throw new TypeError('Clock advance must be finite and non-negative');
        }
        const target = this._nowMs + deltaMs;
        while (true) {
            const due = [...this._timers.entries()]
                .filter(([, task]) => task.dueAt <= target)
                .sort((left, right) => left[1].dueAt - right[1].dueAt || left[0] - right[0])[0];
            if (!due) break;
            const [timer, task] = due;
            this._timers.delete(timer);
            this._nowMs = task.dueAt;
            task.callback();
        }
        this._nowMs = target;
    }

    get pendingCount() {
        return this._timers.size;
    }
}

export class FakeHomeAssistantReplay {
    constructor({
        scenarios,
        clock = createBrowserClock(),
        onStateChange = null,
        onDiagnostic = null,
    }) {
        const validatedScenarios = validateScenarios(scenarios);
        if (
            !clock
            || typeof clock.now !== 'function'
            || typeof clock.setTimeout !== 'function'
            || typeof clock.clearTimeout !== 'function'
        ) {
            throw new TypeError('Replay clock must provide now/setTimeout/clearTimeout');
        }
        this._scenarios = new Map(validatedScenarios.map((scenario) => [scenario.id, scenario]));
        this._scenario = validatedScenarios[0];
        this._clock = clock;
        this._onStateChange = onStateChange;
        this._onDiagnostic = onDiagnostic;
        this._frameIndex = 0;
        this._speed = 1;
        this._playing = false;
        this._timer = null;
        this._diagnostics = [];
        this._connectionGeneration = 0;
        this._createConnection();
    }

    get hass() {
        return this._hass;
    }

    get state() {
        const snapshot = this.currentSnapshot;
        return Object.freeze({
            scenarioId: this._scenario.id,
            scenarioLabel: this._scenario.label,
            frameIndex: this._frameIndex,
            frameCount: this._scenario.frames.length,
            logicalTimeMs: snapshot.logicalTimeMs,
            generationId: snapshot.generationId,
            sequence: snapshot.sequence,
            speed: this._speed,
            playing: this._playing,
            connected: this._connection.connected,
            subscriberCount: this._subscribers.size,
            connectionGeneration: this._connectionGeneration,
        });
    }

    get currentSnapshot() {
        return cloneJson(this._scenario.frames[this._frameIndex]);
    }

    get diagnostics() {
        return this._diagnostics.map((entry) => ({ ...entry }));
    }

    selectScenario(scenarioId) {
        const scenario = this._scenarios.get(scenarioId);
        if (!scenario) throw new RangeError('Unknown synthetic scenario');
        this.pause('scenario-change');
        this._scenario = scenario;
        this._frameIndex = 0;
        const hass = this.reconnect();
        this._record('scenario-selected', { scenarioId: scenario.id });
        this._notifyState();
        return hass;
    }

    seek(frameIndex) {
        return this.restartAtFrame(frameIndex);
    }

    restartAtFrame(frameIndex) {
        if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= this._scenario.frames.length) {
            throw new RangeError('Replay frame index is out of bounds');
        }
        this.pause('seek-restart');
        this._frameIndex = frameIndex;
        const hass = this.reconnect();
        this._record('replay-restarted', { frameIndex });
        this._notifyState();
        return hass;
    }

    step(delta = 1) {
        if (!Number.isInteger(delta) || delta <= 0) throw new TypeError('Step delta must be a positive integer');
        this.pause('step');
        const next = Math.max(0, Math.min(this._scenario.frames.length - 1, this._frameIndex + delta));
        this._frameIndex = next;
        this._record('step', { frameIndex: next });
        this.emitCurrent('step');
        this._notifyState();
    }

    setSpeed(speed) {
        if (!Number.isFinite(speed) || speed < MIN_SPEED || speed > MAX_SPEED) {
            throw new RangeError(`Replay speed must be between ${MIN_SPEED} and ${MAX_SPEED}`);
        }
        this._speed = speed;
        this._record('speed-changed', { speed });
        if (this._playing) {
            this._clearTimer();
            this._scheduleNext();
        }
        this._notifyState();
    }

    play() {
        if (!this._connection.connected || this._playing) return;
        if (this._frameIndex >= this._scenario.frames.length - 1) {
            this._record('play-at-end', { frameIndex: this._frameIndex });
            this._notifyState();
            return;
        }
        this._playing = true;
        this._record('play', { frameIndex: this._frameIndex });
        this._scheduleNext();
        this._notifyState();
    }

    pause(reason = 'manual') {
        const wasPlaying = this._playing;
        this._playing = false;
        this._clearTimer();
        if (wasPlaying) this._record('pause', { reason: boundedText(reason, 'manual') });
        this._notifyState();
    }

    emitCurrent(reason = 'manual') {
        if (!this._connection.connected) {
            this._record('emit-skipped-disconnected', { reason: boundedText(reason, 'manual') });
            return 0;
        }
        const message = { data: cloneJson(this.currentSnapshot) };
        let delivered = 0;
        for (const subscriber of [...this._subscribers]) {
            try {
                subscriber(cloneJson(message));
                delivered += 1;
            } catch (_error) {
                this._record('subscriber-error', { frameIndex: this._frameIndex });
            }
        }
        this._record('snapshot-emitted', {
            frameIndex: this._frameIndex,
            reason: boundedText(reason, 'manual'),
            subscriberCount: delivered,
        });
        return delivered;
    }

    disconnect() {
        this.pause('disconnect');
        this._connection.connected = false;
        const subscriberCount = this._subscribers.size;
        this._subscribers.clear();
        this._record('disconnected', { subscriberCount });
        this._notifyState();
    }

    reconnect() {
        this.disconnect();
        this._createConnection();
        this._record('reconnected', { connectionGeneration: this._connectionGeneration });
        this._notifyState();
        return this._hass;
    }

    destroy() {
        this.disconnect();
        this._onStateChange = null;
        this._onDiagnostic = null;
    }

    _createConnection() {
        this._connectionGeneration += 1;
        const subscribers = new Set();
        this._subscribers = subscribers;
        const generation = this._connectionGeneration;
        const connection = {
            connected: true,
            subscribeMessage: async (callback, message) => {
                if (typeof callback !== 'function') throw new TypeError('Subscription callback is required');
                if (!message || message.type !== STREAM_TYPE || Object.keys(message).length !== 1) {
                    throw new Error('Offline fixture supports only rmm/stream');
                }
                if (!connection.connected || generation !== this._connectionGeneration) {
                    throw new Error('Offline fixture connection is unavailable');
                }
                subscribers.add(callback);
                this._record('subscribed', { subscriberCount: subscribers.size });
                this.emitCurrent('initial-subscription');
                this._notifyState();
                let active = true;
                return () => {
                    if (!active) return;
                    active = false;
                    subscribers.delete(callback);
                    this._record('unsubscribed', { subscriberCount: subscribers.size });
                    this._notifyState();
                };
            },
        };
        this._connection = connection;
        this._hass = {
            connection: this._connection,
            states: {},
            language: 'en',
            locale: { language: 'en' },
            themes: { default_theme: 'default', themes: {} },
            selectedTheme: { theme: 'default', dark: false },
            user: { id: 'synthetic-admin', is_admin: true, name: 'Synthetic administrator' },
            callService: async (domain, service, _payload) => {
                this._record('service-rejected', {
                    domain: boundedText(domain, 'unknown-domain'),
                    service: boundedText(service, 'unknown-service'),
                });
                throw new Error('Offline Roomabouts fixture is read-only');
            },
        };
    }

    _scheduleNext() {
        if (!this._playing) return;
        if (this._frameIndex >= this._scenario.frames.length - 1) {
            this.pause('ended');
            return;
        }
        const current = this._scenario.frames[this._frameIndex];
        const next = this._scenario.frames[this._frameIndex + 1];
        const semanticDelta = Math.abs(next.logicalTimeMs - current.logicalTimeMs) || 500;
        const delay = semanticDelta / this._speed;
        this._timer = this._clock.setTimeout(() => {
            this._timer = null;
            if (!this._playing) return;
            this._frameIndex += 1;
            this.emitCurrent('playback');
            this._notifyState();
            this._scheduleNext();
        }, delay);
    }

    _clearTimer() {
        if (this._timer === null) return;
        this._clock.clearTimeout(this._timer);
        this._timer = null;
    }

    _record(event, details = {}) {
        const entry = {
            event,
            atMs: this._clock.now(),
            scenarioId: this._scenario.id,
            ...details,
        };
        this._diagnostics.push(entry);
        if (this._diagnostics.length > MAX_DIAGNOSTICS) {
            this._diagnostics.splice(0, this._diagnostics.length - MAX_DIAGNOSTICS);
        }
        if (typeof this._onDiagnostic === 'function') this._onDiagnostic({ ...entry });
    }

    _notifyState() {
        if (typeof this._onStateChange === 'function') this._onStateChange(this.state);
    }
}

export function createFakeHomeAssistantReplay(options) {
    return new FakeHomeAssistantReplay(options);
}

export function disconnectReplayAndNotifyCard(card, replay) {
    if (!card || typeof card !== 'object') throw new TypeError('Card instance is required');
    if (!replay || typeof replay.disconnect !== 'function' || !replay.hass) {
        throw new TypeError('Replay instance is required');
    }
    replay.disconnect();
    card.hass = replay.hass;
    return replay.state;
}
