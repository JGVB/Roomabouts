import '../../custom_components/radar_map_manager/www/radar-map-card.js';
import {
    createFakeHomeAssistantReplay,
    disconnectReplayAndNotifyCard,
} from './fake-hass.js';
import { SYNTHETIC_SCENARIOS } from './fixtures/synthetic-scenarios.js';
import { RoomaboutsTrailStore } from '../../custom_components/radar_map_manager/www/roomabouts-trails.js';

const elements = {
    cardHost: document.getElementById('card-host'),
    diagnostics: document.getElementById('diagnostics'),
    disconnect: document.getElementById('disconnect'),
    frame: document.getElementById('frame'),
    next: document.getElementById('next'),
    play: document.getElementById('play'),
    reconnect: document.getElementById('reconnect'),
    remount: document.getElementById('remount'),
    scenario: document.getElementById('scenario'),
    scenarioDescription: document.getElementById('scenario-description'),
    speed: document.getElementById('speed'),
    status: document.getElementById('status'),
};

export const DEFAULT_CARD_CONFIG = Object.freeze({
    type: 'custom:radar-map-card',
    map_group: 'default',
    target_render_mode: 'css',
    read_only: true,
});

let card = null;
const localDiagnostics = [];
const sourceCounters = {
    subscriptions: 0,
    unsubscriptions: 0,
    emissions: 0,
    deliveries: 0,
};
const cardInstrumentation = new WeakMap();
const presentationClock = {
    nowMs: 1000,
    nextTimerId: 1,
    timers: new Map(),
    now() {
        return this.nowMs;
    },
    setTimeout(callback, delayMs) {
        const id = this.nextTimerId;
        this.nextTimerId += 1;
        this.timers.set(id, {
            callback,
            dueAt: this.nowMs + Math.max(0, Number.isFinite(delayMs) ? delayMs : 0),
        });
        return id;
    },
    clearTimeout(id) {
        this.timers.delete(id);
    },
    elapseBy(deltaMs) {
        if (!Number.isFinite(deltaMs) || deltaMs < 0) {
            throw new TypeError('Presentation clock delta must be finite and non-negative');
        }
        this.nowMs += deltaMs;
        return this.nowMs;
    },
};

function boundedMessage(value) {
    return String(value || 'unknown').replace(/[\r\n]+/g, ' ').slice(0, 160);
}

function addLocalDiagnostic(event, message) {
    localDiagnostics.push({ event, message: boundedMessage(message) });
    if (localDiagnostics.length > 16) localDiagnostics.shift();
    renderDiagnostics();
}

function renderDiagnostics() {
    const harnessEntries = replay.diagnostics.slice(-12).map((entry) => JSON.stringify(entry));
    const localEntries = localDiagnostics.map((entry) => JSON.stringify(entry));
    elements.diagnostics.textContent = [...harnessEntries, ...localEntries].slice(-16).join('\n');
}

function renderState(state = replay.state) {
    elements.play.textContent = state.playing ? 'Pause' : 'Play';
    elements.play.setAttribute('aria-pressed', String(state.playing));
    elements.frame.max = String(state.frameCount - 1);
    elements.frame.value = String(state.frameIndex);
    const selected = SYNTHETIC_SCENARIOS.find((scenario) => scenario.id === state.scenarioId);
    elements.scenarioDescription.textContent = selected?.description || '';
    elements.status.textContent = [
        `scenario=${state.scenarioId}`,
        `frame=${state.frameIndex + 1}/${state.frameCount}`,
        `generation=${state.generationId}`,
        `sequence=${state.sequence}`,
        `logicalTimeMs=${state.logicalTimeMs}`,
        `speed=${state.speed}x`,
        `connected=${state.connected}`,
        `subscribers=${state.subscriberCount}`,
        `connection=${state.connectionGeneration}`,
    ].join(' · ');
    renderDiagnostics();
}

const replay = createFakeHomeAssistantReplay({
    scenarios: SYNTHETIC_SCENARIOS,
    onStateChange: (state) => renderState(state),
    onDiagnostic: (entry) => {
        if (entry.event === 'subscribed') sourceCounters.subscriptions += 1;
        if (entry.event === 'unsubscribed') sourceCounters.unsubscriptions += 1;
        if (entry.event === 'snapshot-emitted') {
            sourceCounters.emissions += 1;
            sourceCounters.deliveries += entry.subscriberCount;
        }
        renderDiagnostics();
    },
});

function populateControls() {
    for (const scenario of SYNTHETIC_SCENARIOS) {
        const option = document.createElement('option');
        option.value = scenario.id;
        option.textContent = scenario.label;
        elements.scenario.append(option);
    }
    elements.scenario.value = replay.state.scenarioId;
    elements.speed.value = String(replay.state.speed);
}

function instrumentCard(nextCard, store) {
    const counters = {
        adapterDisconnect: 0,
        adapterIngest: 0,
        adapterReset: 0,
        canvasSteps: 0,
        draw: 0,
        mediaHandler: 0,
        pageshowHandler: 0,
        queue: 0,
        storeDestroy: 0,
        storeExpire: 0,
        storeObserve: 0,
        storeReset: 0,
        storeVisible: 0,
        visibilityHandler: 0,
    };
    const wrap = (owner, method, counter) => {
        const original = owner[method].bind(owner);
        owner[method] = (...args) => {
            counters[counter] += 1;
            return original(...args);
        };
    };
    wrap(nextCard.presentationAdapter, 'disconnect', 'adapterDisconnect');
    wrap(nextCard.presentationAdapter, 'ingest', 'adapterIngest');
    wrap(nextCard.presentationAdapter, 'reset', 'adapterReset');
    wrap(store, 'destroy', 'storeDestroy');
    wrap(store, 'expire', 'storeExpire');
    wrap(store, 'observeAccepted', 'storeObserve');
    wrap(store, 'reset', 'storeReset');
    wrap(store, 'visible', 'storeVisible');
    wrap(nextCard, '_drawCurrentView', 'draw');
    wrap(nextCard, '_queueRender', 'queue');
    const originalCanvasStep = nextCard.renderer._drawRoomaboutsCanvasStep.bind(nextCard.renderer);
    nextCard.renderer._drawRoomaboutsCanvasStep = (...args) => {
        counters.canvasSteps += 1;
        return originalCanvasStep(...args);
    };
    const originalVisibility = nextCard._boundRoomaboutsVisibilityChange;
    const originalPageShow = nextCard._boundRoomaboutsPageShow;
    const originalMedia = nextCard._boundRoomaboutsMediaChange;
    nextCard._boundRoomaboutsVisibilityChange = (...args) => {
        counters.visibilityHandler += 1;
        return originalVisibility(...args);
    };
    nextCard._boundRoomaboutsPageShow = (...args) => {
        counters.pageshowHandler += 1;
        return originalPageShow(...args);
    };
    nextCard._boundRoomaboutsMediaChange = (...args) => {
        counters.mediaHandler += 1;
        return originalMedia(...args);
    };
    cardInstrumentation.set(nextCard, { counters, store });
}

function createCard(config = DEFAULT_CARD_CONFIG) {
    const nextCard = document.createElement('radar-map-card');
    nextCard._roomaboutsTrailStore.destroy();
    const store = new RoomaboutsTrailStore({
        clock: () => presentationClock.now(),
        setTimeout: (callback, delayMs) => presentationClock.setTimeout(callback, delayMs),
        clearTimeout: (id) => presentationClock.clearTimeout(id),
        onChange: () => nextCard._handleRoomaboutsTrailStoreChange(),
    });
    nextCard._roomaboutsTrailStore = store;
    instrumentCard(nextCard, store);
    nextCard.setConfig(config);
    nextCard.hass = replay.hass;
    return nextCard;
}

function animationFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
}

function cardStats(target = card) {
    const entry = target ? cardInstrumentation.get(target) : null;
    if (!entry) return null;
    return Object.freeze({
        counters: Object.freeze({ ...entry.counters }),
        store: entry.store.stats(),
    });
}

function sourceStats() {
    return Object.freeze({ ...sourceCounters });
}

function clockStats() {
    return Object.freeze({
        nowMs: presentationClock.now(),
        pendingCount: presentationClock.timers.size,
    });
}

async function waitForStable(afterDraw = null) {
    await document.fonts.ready;
    await Promise.resolve();
    const expectedSubscribers = replay.state.connected ? 1 : 0;
    if (!card?.isConnected) throw new Error('Synthetic card is not mounted');
    const baseline = afterDraw ?? cardStats(card).counters.draw;
    const requestRender = afterDraw === null;
    if (requestRender && card._renderFrameId === null) card._queueRender();
    for (let attempt = 0; attempt < 120; attempt += 1) {
        await animationFrame();
        const stats = cardStats(card);
        if (stats.counters.draw > baseline
            && card._renderFrameId === null
            && card.isRendering === false
            && replay.state.subscriberCount === expectedSubscribers) {
            return Object.freeze({
                connected: replay.state.connected,
                draw: stats.counters.draw,
                frameIndex: replay.state.frameIndex,
                scenarioId: replay.state.scenarioId,
                subscriberCount: replay.state.subscriberCount,
            });
        }
        if (requestRender
            && card._renderFrameId === null
            && stats.counters.draw <= baseline) card._queueRender();
    }
    throw new Error('Synthetic card did not reach a bounded render revision');
}

async function mountCard(config = DEFAULT_CARD_CONFIG) {
    if (card) {
        card.remove();
        await Promise.resolve();
        if (replay.state.subscriberCount !== 0) {
            addLocalDiagnostic('teardown-failed', `subscribers=${replay.state.subscriberCount}`);
        } else {
            addLocalDiagnostic('teardown-ok', 'previous card unsubscribed');
        }
    }
    card = createCard(config);
    const draw = cardStats(card).counters.draw;
    elements.cardHost.replaceChildren(card);
    renderState();
    return waitForStable(draw);
}

async function selectScenario(scenarioId, frameIndex = 0) {
    if (!Number.isInteger(frameIndex) || frameIndex < 0) {
        throw new TypeError('Synthetic frame index must be a non-negative integer');
    }
    const draw = cardStats(card).counters.draw;
    let nextHass = replay.selectScenario(scenarioId);
    if (frameIndex > 0) nextHass = replay.seek(frameIndex);
    card.hass = nextHass;
    elements.scenario.value = scenarioId;
    return waitForStable(draw);
}

async function seek(frameIndex) {
    const draw = cardStats(card).counters.draw;
    card.hass = replay.seek(frameIndex);
    return waitForStable(draw);
}

async function step(delta = 1) {
    const draw = cardStats(card).counters.draw;
    replay.step(delta);
    return waitForStable(draw);
}

async function setRenderMode(mode) {
    if (mode !== 'css' && mode !== 'canvas') {
        throw new TypeError('Synthetic render mode must be css or canvas');
    }
    const draw = cardStats(card).counters.draw;
    card.setConfig({ ...DEFAULT_CARD_CONFIG, target_render_mode: mode });
    return waitForStable(draw);
}

async function disconnect() {
    const draw = cardStats(card).counters.draw;
    disconnectReplayAndNotifyCard(card, replay);
    return waitForStable(draw);
}

async function reconnect() {
    const draw = cardStats(card).counters.draw;
    card.hass = replay.reconnect();
    return waitForStable(draw);
}

function runControl(action) {
    try {
        const result = action();
        if (result && typeof result.then === 'function') {
            result.catch((error) => addLocalDiagnostic('control-error', error?.message || error));
        }
    } catch (error) {
        addLocalDiagnostic('control-error', error?.message || error);
    }
}

elements.play.addEventListener('click', () => runControl(() => {
    if (replay.state.playing) replay.pause();
    else replay.play();
}));

elements.next.addEventListener('click', () => runControl(() => step()));

elements.frame.addEventListener('change', () => runControl(() => seek(Number(elements.frame.value))));

elements.speed.addEventListener('change', () => runControl(() => {
    replay.setSpeed(Number(elements.speed.value));
}));

elements.scenario.addEventListener('change', () => runControl(() => (
    selectScenario(elements.scenario.value)
)));

elements.disconnect.addEventListener('click', () => runControl(() => disconnect()));

elements.reconnect.addEventListener('click', () => runControl(() => reconnect()));

elements.remount.addEventListener('click', () => runControl(() => mountCard()));

window.addEventListener('error', (event) => {
    addLocalDiagnostic('browser-error', event.message);
});

window.addEventListener('unhandledrejection', (event) => {
    addLocalDiagnostic('unhandled-rejection', event.reason?.message || event.reason);
});

populateControls();
const ready = mountCard();

window.roomaboutsFixture = Object.freeze({
    defaultCardConfig: DEFAULT_CARD_CONFIG,
    replay,
    ready,
    get card() {
        return card;
    },
    cardStats,
    clockStats,
    disconnect,
    elapsePresentationClock: (deltaMs) => presentationClock.elapseBy(deltaMs),
    mountCard,
    reconnect,
    seek,
    selectScenario,
    setRenderMode,
    sourceStats,
    step,
    waitForStable,
});

await ready;
