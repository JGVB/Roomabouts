import { RadarRenderer } from '../../custom_components/radar_map_manager/www/radar-renderer.js';

const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const makeLayer = () => ({
    children: [],
    innerHTML: '',
    style: {},
    get firstChild() {
        return this.children[0] || null;
    },
    appendChild(element) {
        this.children.push(element);
        element.parentNode = this;
    },
    insertBefore(element, before) {
        const index = this.children.indexOf(before);
        if (index < 0) this.children.push(element);
        else this.children.splice(index, 0, element);
        element.parentNode = this;
    },
    removeChild(element) {
        const index = this.children.indexOf(element);
        if (index >= 0) this.children.splice(index, 1);
        element.parentNode = null;
    },
});

const attachElement = (layer, id = '') => {
    const element = { id, parentNode: null };
    layer.appendChild(element);
    return element;
};

const makeTimerHarness = () => {
    let nextId = 1;
    const pending = new Map();
    return {
        pending,
        options: {
            setTimeout(callback, delay) {
                const id = nextId;
                nextId += 1;
                pending.set(id, { callback, delay });
                return id;
            },
            clearTimeout(id) {
                pending.delete(id);
            },
        },
        fire(id) {
            const timer = pending.get(id);
            assert(timer, `timer ${id} should be pending`);
            timer.callback();
        },
    };
};

const makeHarness = () => {
    const dotsLayer = makeLayer();
    const svgLayer = makeLayer();
    const root = {
        getElementById(id) {
            if (id === 'dots-layer') return dotsLayer;
            if (id === 'svg-canvas') return svgLayer;
            return null;
        },
    };
    const timers = makeTimerHarness();
    const renderer = new RadarRenderer({}, root, timers.options);
    return { renderer, dotsLayer, timers };
};

Deno.test('renderer removes only trails owned by stale fused targets', () => {
    const { renderer, dotsLayer, timers } = makeHarness();
    const dotA = attachElement(dotsLayer, 'fused_a');
    const dotB = attachElement(dotsLayer, 'fused_b');
    renderer._domCache.fused_a = dotA;
    renderer._domCache.fused_b = dotB;

    const trailA = attachElement(dotsLayer, 'trail_a');
    const trailB = attachElement(dotsLayer, 'trail_b');
    renderer._trackTrail(trailA, 'fused_a');
    renderer._trackTrail(trailB, 'fused_b');

    renderer._removeStaleDomEntries(new Set(['fused_b']));
    assert(!renderer._domCache.fused_a, 'departed fused dot should be removed');
    assert(renderer._domCache.fused_b === dotB, 'surviving fused dot should remain');
    assert(!renderer._trailEntries.has(trailA), 'departed owner trail should be removed immediately');
    assert(renderer._trailEntries.get(trailB)?.ownerId === 'fused_b', 'surviving owner trail remains');
    assert(trailA.parentNode === null, 'departed owner trail leaves the DOM');
    assert(trailB.parentNode === dotsLayer, 'surviving owner trail stays in the DOM');

    renderer._removeStaleDomEntries(new Set());
    assert(renderer._trailEntries.size === 0, 'final-empty state removes every owned trail');
    assert(trailB.parentNode === null, 'final surviving trail is removed immediately');
    assert(timers.pending.size === 0, 'owner cleanup cancels both timers');
});

Deno.test('renderer trail cap evicts the oldest owned element before insertion', () => {
    const { renderer, dotsLayer, timers } = makeHarness();
    const trails = [];

    for (let index = 0; index < 97; index += 1) {
        const trail = { id: `trail_${index}`, parentNode: null };
        renderer._trackTrail(trail, `fused_${index}`);
        dotsLayer.appendChild(trail);
        trails.push(trail);
    }

    assert(renderer._trailEntries.size === 96, 'trail registry is hard-capped at 96');
    assert(!renderer._trailEntries.has(trails[0]), 'oldest trail is evicted first');
    assert(trails[0].parentNode === null, 'evicted trail is removed from the DOM');
    assert(renderer._trailEntries.has(trails[96]), 'newest trail is retained');
    assert(timers.pending.size === 96, 'eviction cancels the oldest timeout');

    renderer._clearTrails();
    assert(renderer._trailEntries.size === 0, 'full trail clear empties the registry');
    assert(dotsLayer.children.length === 0, 'full trail clear removes every DOM element');
    assert(timers.pending.size === 0, 'full trail clear cancels every timeout');
});

Deno.test('renderer timeout and runtime reset remove owned trails immediately', () => {
    const { renderer, dotsLayer, timers } = makeHarness();
    const timedTrail = attachElement(dotsLayer, 'timed_trail');
    renderer._trackTrail(timedTrail, 'fused_timed');
    const timerId = renderer._trailEntries.get(timedTrail).timerId;
    assert(timers.pending.get(timerId)?.delay === 1200, 'trail timeout remains bounded');

    timers.fire(timerId);
    assert(!renderer._trailEntries.has(timedTrail), 'timeout removes the registry entry');
    assert(timedTrail.parentNode === null, 'timeout removes the DOM element');
    assert(timers.pending.size === 0, 'timeout cleanup clears its timer');

    const dot = attachElement(dotsLayer, 'fused_reset');
    const resetTrail = attachElement(dotsLayer, 'reset_trail');
    renderer._domCache.fused_reset = dot;
    renderer._trackTrail(resetTrail, 'fused_reset');
    renderer.clearRuntime();
    assert(renderer._trailEntries.size === 0, 'runtime reset clears owned trails');
    assert(Object.keys(renderer._domCache).length === 0, 'runtime reset clears cached dots');
    assert(resetTrail.parentNode === null, 'runtime reset removes trail DOM');
    assert(dot.parentNode === null, 'runtime reset removes target DOM');
    assert(timers.pending.size === 0, 'runtime reset cancels pending trail timers');
});
