import '../../custom_components/radar_map_manager/www/radar-map-card.js';
import {
    createFakeHomeAssistantReplay,
    disconnectReplayAndNotifyCard,
} from './fake-hass.js';
import { SYNTHETIC_SCENARIOS } from './fixtures/synthetic-scenarios.js';

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
    onDiagnostic: () => renderDiagnostics(),
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

function createCard(config = DEFAULT_CARD_CONFIG) {
    const nextCard = document.createElement('radar-map-card');
    nextCard.setConfig(config);
    nextCard.hass = replay.hass;
    return nextCard;
}

function animationFrame() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function waitForStable() {
    await document.fonts.ready;
    await Promise.resolve();
    await animationFrame();
    await animationFrame();
    const expectedSubscribers = replay.state.connected ? 1 : 0;
    if (!card?.isConnected) throw new Error('Synthetic card is not mounted');
    if (replay.state.subscriberCount !== expectedSubscribers) {
        throw new Error('Synthetic subscriber did not reach its bounded ready state');
    }
    return Object.freeze({
        connected: replay.state.connected,
        frameIndex: replay.state.frameIndex,
        scenarioId: replay.state.scenarioId,
        subscriberCount: replay.state.subscriberCount,
    });
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
    elements.cardHost.replaceChildren(card);
    renderState();
    return waitForStable();
}

async function selectScenario(scenarioId, frameIndex = 0) {
    if (!Number.isInteger(frameIndex) || frameIndex < 0) {
        throw new TypeError('Synthetic frame index must be a non-negative integer');
    }
    let nextHass = replay.selectScenario(scenarioId);
    if (frameIndex > 0) nextHass = replay.seek(frameIndex);
    card.hass = nextHass;
    elements.scenario.value = scenarioId;
    return waitForStable();
}

async function seek(frameIndex) {
    card.hass = replay.seek(frameIndex);
    return waitForStable();
}

async function step(delta = 1) {
    replay.step(delta);
    return waitForStable();
}

async function setRenderMode(mode) {
    if (mode !== 'css' && mode !== 'canvas') {
        throw new TypeError('Synthetic render mode must be css or canvas');
    }
    card.setConfig({ ...DEFAULT_CARD_CONFIG, target_render_mode: mode });
    return waitForStable();
}

async function disconnect() {
    disconnectReplayAndNotifyCard(card, replay);
    return waitForStable();
}

async function reconnect() {
    card.hass = replay.reconnect();
    return waitForStable();
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
    disconnect,
    mountCard,
    reconnect,
    seek,
    selectScenario,
    setRenderMode,
    step,
    waitForStable,
});

await ready;
