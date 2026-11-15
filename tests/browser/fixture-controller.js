import '../../custom_components/radar_map_manager/www/radar-map-card.js';
import { createFakeHomeAssistantReplay } from './fake-hass.js';
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

function createCard() {
    const nextCard = document.createElement('radar-map-card');
    nextCard.setConfig({
        type: 'custom:radar-map-card',
        map_group: 'default',
        read_only: true,
        show_labels: true,
        show_trails: true,
        target_render_mode: 'css',
    });
    nextCard.hass = replay.hass;
    return nextCard;
}

async function mountCard() {
    if (card) {
        card.remove();
        await Promise.resolve();
        if (replay.state.subscriberCount !== 0) {
            addLocalDiagnostic('teardown-failed', `subscribers=${replay.state.subscriberCount}`);
        } else {
            addLocalDiagnostic('teardown-ok', 'previous card unsubscribed');
        }
    }
    card = createCard();
    elements.cardHost.replaceChildren(card);
    renderState();
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

elements.next.addEventListener('click', () => runControl(() => replay.step()));

elements.frame.addEventListener('change', () => runControl(() => {
    const nextHass = replay.seek(Number(elements.frame.value));
    card.hass = nextHass;
}));

elements.speed.addEventListener('change', () => runControl(() => {
    replay.setSpeed(Number(elements.speed.value));
}));

elements.scenario.addEventListener('change', () => runControl(() => {
    const nextHass = replay.selectScenario(elements.scenario.value);
    card.hass = nextHass;
}));

elements.disconnect.addEventListener('click', () => runControl(() => replay.disconnect()));

elements.reconnect.addEventListener('click', () => runControl(() => {
    card.hass = replay.reconnect();
}));

elements.remount.addEventListener('click', () => runControl(() => mountCard()));

window.addEventListener('error', (event) => {
    addLocalDiagnostic('browser-error', event.message);
});

window.addEventListener('unhandledrejection', (event) => {
    addLocalDiagnostic('unhandled-rejection', event.reason?.message || event.reason);
});

window.roomaboutsFixture = Object.freeze({
    replay,
    get card() {
        return card;
    },
    mountCard,
});

populateControls();
await mountCard();
