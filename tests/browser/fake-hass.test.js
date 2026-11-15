import { validateRoomaboutsSnapshot } from '../../custom_components/radar_map_manager/www/roomabouts-presentation.js';
import {
    disconnectReplayAndNotifyCard,
    FakeHomeAssistantReplay,
    ManualReplayClock,
} from './fake-hass.js';
import { SYNTHETIC_SCENARIOS } from './fixtures/synthetic-scenarios.js';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function assertEquals(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

async function assertRejects(callback, pattern, message) {
    try {
        await callback();
    } catch (error) {
        assert(pattern.test(String(error?.message || error)), message);
        return;
    }
    throw new Error(`${message}: expected rejection`);
}

function makeReplay(options = {}) {
    return new FakeHomeAssistantReplay({
        scenarios: SYNTHETIC_SCENARIOS,
        clock: new ManualReplayClock(),
        ...options,
    });
}

Deno.test('synthetic scenarios contain no credentials, network destinations, or identity fields', () => {
    const forbiddenKeys = new Set([
        'auth_passed',
        'configuration_url',
        'device_pin',
        'identity',
        'identityConfidence',
        'mqtt',
        'password',
        'radar_ip',
        'token',
    ]);
    const pending = [...SYNTHETIC_SCENARIOS];
    while (pending.length) {
        const value = pending.pop();
        if (Array.isArray(value)) {
            pending.push(...value);
        } else if (value && typeof value === 'object') {
            for (const [key, child] of Object.entries(value)) {
                assert(!forbiddenKeys.has(key), `forbidden fixture key: ${key}`);
                pending.push(child);
            }
        } else if (typeof value === 'string') {
            assert(!/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(value), `fixture contains an IP-like value: ${value}`);
        }
    }
    assert(SYNTHETIC_SCENARIOS.every((scenario) => scenario.privacy === 'synthetic-only'), 'privacy marker');
    for (const scenario of SYNTHETIC_SCENARIOS) {
        for (const frame of scenario.frames) {
            const validated = validateRoomaboutsSnapshot(frame);
            assertEquals(validated.schemaVersion, 1, `${scenario.id} production validation`);
        }
    }
    const resetScenario = SYNTHETIC_SCENARIOS.find((scenario) => scenario.id === 'generation-reset');
    const generationATrack = resetScenario.frames[1].tracks[0];
    const generationBTrack = resetScenario.frames[2].tracks[0];
    assertEquals(generationBTrack.trackId, generationATrack.trackId, 'opaque track ID is reused');
    assert(generationBTrack.anonymousAlias !== generationATrack.anonymousAlias, 'alias changes at reset');
});

Deno.test('rmm stream subscription immediately emits a detached current snapshot and tears down', async () => {
    const replay = makeReplay();
    const messages = [];
    const unsubscribe = await replay.hass.connection.subscribeMessage(
        (message) => messages.push(message),
        { type: 'rmm/stream' },
    );

    assertEquals(messages.length, 1, 'initial message count');
    assertEquals(messages[0].data.schemaVersion, 1, 'snapshot schema');
    assertEquals(replay.state.subscriberCount, 1, 'subscriber count');
    messages[0].data.map.mapId = 'mutated-by-test';
    replay.emitCurrent('clone-check');
    assertEquals(messages[1].data.map.mapId, 'default', 'second snapshot remains detached');

    unsubscribe();
    unsubscribe();
    assertEquals(replay.state.subscriberCount, 0, 'idempotent unsubscribe');
});

Deno.test('playback uses the injected clock and scales semantic delays', async () => {
    const clock = new ManualReplayClock();
    const replay = makeReplay({ clock });
    const sequences = [];
    await replay.hass.connection.subscribeMessage(
        (message) => sequences.push(message.data.sequence),
        { type: 'rmm/stream' },
    );

    replay.setSpeed(2);
    replay.play();
    assertEquals(clock.pendingCount, 1, 'one scheduled frame');
    clock.advanceBy(249);
    assertEquals(sequences, [0], 'frame waits for scaled delay');
    clock.advanceBy(1);
    assertEquals(sequences, [0, 1], 'next frame emitted at scaled delay');
    assertEquals(replay.state.frameIndex, 1, 'frame advanced');
    replay.pause();
    assertEquals(clock.pendingCount, 0, 'pause clears timer');
});

Deno.test('seek and scenario selection replace the connection before replaying older sequences', async () => {
    const replay = makeReplay();
    const oldConnection = replay.hass.connection;
    const oldMessages = [];
    const oldUnsubscribe = await oldConnection.subscribeMessage(
        (message) => oldMessages.push(message.data.sequence),
        { type: 'rmm/stream' },
    );

    const seekHass = replay.seek(2);
    assert(!oldConnection.connected, 'old connection is disconnected by seek');
    assertEquals(replay.state.subscriberCount, 0, 'seek clears old subscribers');
    const seekMessages = [];
    await seekHass.connection.subscribeMessage(
        (message) => seekMessages.push(message.data.sequence),
        { type: 'rmm/stream' },
    );
    assertEquals(seekMessages, [2], 'seeked connection starts at selected frame');

    oldUnsubscribe();
    assertEquals(replay.state.subscriberCount, 1, 'old unsubscribe cannot alter new connection');

    const scenarioHass = replay.selectScenario('generation-reset');
    assertEquals(replay.state.scenarioId, 'generation-reset', 'scenario selected');
    assertEquals(replay.state.subscriberCount, 0, 'scenario change clears previous subscriber');
    const scenarioMessages = [];
    await scenarioHass.connection.subscribeMessage(
        (message) => scenarioMessages.push(message.data.generationId),
        { type: 'rmm/stream' },
    );
    assertEquals(scenarioMessages, ['fixture-reset-generation-a'], 'selected scenario emitted');
});

Deno.test('disconnect, reconnect, stepping, and invalid control input fail deterministically', async () => {
    const replay = makeReplay();
    const firstConnection = replay.hass.connection;
    await firstConnection.subscribeMessage(() => {}, { type: 'rmm/stream' });
    replay.step();
    assertEquals(replay.state.frameIndex, 1, 'step advances one frame');

    const assignedHass = [];
    const card = {
        set hass(value) {
            assignedHass.push(value);
        },
    };
    const disconnectedState = disconnectReplayAndNotifyCard(card, replay);
    assert(!firstConnection.connected, 'disconnect updates connection');
    assertEquals(replay.state.subscriberCount, 0, 'disconnect clears subscribers');
    assertEquals(disconnectedState.connected, false, 'disconnect helper returns cleared state');
    assertEquals(assignedHass.length, 1, 'disconnect immediately notifies card');
    assert(assignedHass[0] === replay.hass, 'card receives disconnected Hass object');
    const nextHass = replay.reconnect();
    assert(nextHass.connection !== firstConnection, 'reconnect replaces connection object');
    assert(nextHass.connection.connected, 'replacement is connected');

    await assertRejects(
        () => nextHass.connection.subscribeMessage(() => {}, { type: 'not-rmm' }),
        /only rmm\/stream/,
        'unsupported subscription rejected',
    );
    await assertRejects(
        () => nextHass.callService('radar_map_manager', 'update_map_config', { token: 'CANARY' }),
        /read-only/,
        'mutating service rejected',
    );
    assertEquals(replay.diagnostics.some((entry) => JSON.stringify(entry).includes('CANARY')), false, 'payload excluded');
    await assertRejects(() => Promise.resolve(replay.setSpeed(10)), /between/, 'invalid speed rejected');
    await assertRejects(() => Promise.resolve(replay.step(-1)), /positive/, 'reverse step rejected');
    await assertRejects(() => Promise.resolve(replay.seek(999)), /out of bounds/, 'invalid seek rejected');
});

Deno.test('diagnostics remain bounded and never retain service payloads', async () => {
    const replay = makeReplay();
    for (let index = 0; index < 80; index += 1) {
        await replay.hass.callService('radar_map_manager', 'mutate', { password: `secret-${index}` }).catch(() => {});
    }
    assertEquals(replay.diagnostics.length, 64, 'diagnostic cap');
    const serialized = JSON.stringify(replay.diagnostics);
    assert(!serialized.includes('secret-'), 'payload values are not retained');
    assert(!serialized.includes('password'), 'payload keys are not retained');
});
