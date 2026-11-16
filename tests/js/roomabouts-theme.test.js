import {
    ROOMABOUTS_FIELD_LEDGER_CSS,
    ROOMABOUTS_FIELD_LEDGER_PROPERTIES,
    ROOMABOUTS_FIELD_LEDGER_TOKENS,
    isRoomaboutsReadOnly,
    sanitizeRoomaboutsReadOnlyConfig,
} from '../../custom_components/radar_map_manager/www/roomabouts-theme.js';

const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const assertEquals = (actual, expected, message) => {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    assert(actualJson === expectedJson, `${message}: expected ${expectedJson}, got ${actualJson}`);
};

const assertThrows = (fn, message) => {
    let thrown = false;
    try {
        fn();
    } catch (error) {
        thrown = error instanceof TypeError;
    }
    assert(thrown, `${message}: expected TypeError`);
};

const expectedTokens = {
    surfacePaper: '#E7DDC5',
    surfacePaperDeep: '#D6C7A4',
    ink: '#242621',
    inkMuted: '#555448',
    lineRegion: '#766A56',
    lineGrid: '#9E8D6E',
    stateObserved: '#0B625D',
    stateHeld: '#745B17',
    stateLastSeen: '#665D4E',
    stateOffline: '#4F5960',
    stateAttention: '#922F2B',
    focus: '#005EA8',
    labelBackground: '#242621',
    labelText: '#FFF8E8',
};

const expectedProperties = {
    '--roomabouts-surface-paper': '#E7DDC5',
    '--roomabouts-surface-paper-deep': '#D6C7A4',
    '--roomabouts-ink': '#242621',
    '--roomabouts-ink-muted': '#555448',
    '--roomabouts-line-region': '#766A56',
    '--roomabouts-line-grid': '#9E8D6E',
    '--roomabouts-state-observed': '#0B625D',
    '--roomabouts-state-held': '#745B17',
    '--roomabouts-state-last-seen': '#665D4E',
    '--roomabouts-state-offline': '#4F5960',
    '--roomabouts-state-attention': '#922F2B',
    '--roomabouts-focus': '#005EA8',
    '--roomabouts-label-background': '#242621',
    '--roomabouts-label-text': '#FFF8E8',
};

const channelLuminance = (channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex) => {
    const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
    return (0.2126 * channelLuminance(channels[0]))
        + (0.7152 * channelLuminance(channels[1]))
        + (0.0722 * channelLuminance(channels[2]));
};

const contrast = (first, second) => {
    const light = Math.max(luminance(first), luminance(second));
    const dark = Math.min(luminance(first), luminance(second));
    return (light + 0.05) / (dark + 0.05);
};

Deno.test('Field Ledger exports the exact frozen semantic token and property schema', () => {
    assertEquals(ROOMABOUTS_FIELD_LEDGER_TOKENS, expectedTokens, 'semantic token values');
    assertEquals(ROOMABOUTS_FIELD_LEDGER_PROPERTIES, expectedProperties, 'CSS property mirror');
    assert(Object.isFrozen(ROOMABOUTS_FIELD_LEDGER_TOKENS), 'tokens must be frozen');
    assert(Object.isFrozen(ROOMABOUTS_FIELD_LEDGER_PROPERTIES), 'properties must be frozen');

    for (const [name, value] of Object.entries(expectedProperties)) {
        assert(
            ROOMABOUTS_FIELD_LEDGER_CSS.includes(`${name}: ${value};`),
            `CSS must mirror ${name}`,
        );
    }
});

Deno.test('essential Field Ledger colors retain the accepted contrast floor', () => {
    const paper = ROOMABOUTS_FIELD_LEDGER_TOKENS.surfacePaper;
    for (const token of [
        'ink',
        'inkMuted',
        'stateObserved',
        'stateHeld',
        'stateLastSeen',
        'stateOffline',
        'stateAttention',
        'focus',
    ]) {
        assert(contrast(ROOMABOUTS_FIELD_LEDGER_TOKENS[token], paper) >= 4.5, `${token} text contrast`);
    }
    assert(contrast(ROOMABOUTS_FIELD_LEDGER_TOKENS.lineRegion, paper) >= 3, 'region boundary contrast');
    assert(
        contrast(
            ROOMABOUTS_FIELD_LEDGER_TOKENS.labelText,
            ROOMABOUTS_FIELD_LEDGER_TOKENS.labelBackground,
        ) >= 4.5,
        'alias label contrast',
    );
});

Deno.test('Field Ledger CSS is deterministic, procedural, isolated, and noninteractive', () => {
    assert(typeof ROOMABOUTS_FIELD_LEDGER_CSS === 'string', 'CSS must be text');
    assert(ROOMABOUTS_FIELD_LEDGER_CSS === `${ROOMABOUTS_FIELD_LEDGER_CSS}`, 'CSS is deterministic');
    assert(ROOMABOUTS_FIELD_LEDGER_CSS.includes('.roomabouts-readonly {'), 'read-only root scope');
    assert(ROOMABOUTS_FIELD_LEDGER_CSS.includes('repeating-linear-gradient('), 'procedural grid');
    assert(ROOMABOUTS_FIELD_LEDGER_CSS.includes('.roomabouts-readonly .roomabouts-track'), 'track scope');
    assert(ROOMABOUTS_FIELD_LEDGER_CSS.includes('.roomabouts-readonly .roomabouts-step'), 'step scope');
    assert(ROOMABOUTS_FIELD_LEDGER_CSS.includes('.roomabouts-readonly .roomabouts-station'), 'station scope');
    assert(ROOMABOUTS_FIELD_LEDGER_CSS.includes('.roomabouts-readonly .roomabouts-zone'), 'zone scope');
    assert(
        ROOMABOUTS_FIELD_LEDGER_CSS.includes(
            'color-mix(in srgb, var(--roomabouts-line-grid) 20%, transparent)',
        ),
        'grid derives from the frozen line-grid property',
    );
    assert(ROOMABOUTS_FIELD_LEDGER_CSS.includes('[data-lifecycle="confirmed"]'), 'typed lifecycle styling');
    assert(ROOMABOUTS_FIELD_LEDGER_CSS.includes('[data-position-basis="observed"]'), 'typed position styling');
    assert(ROOMABOUTS_FIELD_LEDGER_CSS.includes('[data-side="left"]'), 'left survey step');
    assert(ROOMABOUTS_FIELD_LEDGER_CSS.includes('[data-side="right"]'), 'right survey step');
    assert(ROOMABOUTS_FIELD_LEDGER_CSS.includes('width: 7px;'), 'frozen glyph width');
    assert(ROOMABOUTS_FIELD_LEDGER_CSS.includes('height: 13px;'), 'frozen glyph height');
    assert(ROOMABOUTS_FIELD_LEDGER_CSS.includes('#roomabouts-semantic-layer'), 'semantic layer styling');
    assert(ROOMABOUTS_FIELD_LEDGER_CSS.includes('clip-path: inset(50%);'), 'bounded hidden semantics');
    assert(ROOMABOUTS_FIELD_LEDGER_CSS.includes('pointer-events: none;'), 'read-only pointer behavior');
    assert(ROOMABOUTS_FIELD_LEDGER_CSS.includes('touch-action: auto;'), 'dashboard scrolling behavior');
    assert(ROOMABOUTS_FIELD_LEDGER_CSS.includes('@media (prefers-reduced-motion: reduce)'), 'reduced motion');
    assert(ROOMABOUTS_FIELD_LEDGER_CSS.includes('@media (forced-colors: active)'), 'forced colors');
});

Deno.test('Field Ledger region treatments use distinct URL-free procedural geometry', () => {
    const css = ROOMABOUTS_FIELD_LEDGER_CSS;
    assert(css.includes('.roomabouts-readonly .roomabouts-zone-hatch-line {'), 'excluded-region hatch primitive');
    assert(css.includes('stroke-dasharray: 3 7;'), 'sparse technical hatch cadence');
    assert(css.includes('stroke-linecap: square;'), 'technical hatch line ends');
    assert(css.includes('.roomabouts-readonly .roomabouts-zone-stipple-mark {'), 'stationary-region stipple primitive');
    assert(css.includes('r: 0.65px;'), 'restrained stipple radius');
    assert(css.includes('fill-opacity: 0.48;'), 'restrained stipple opacity');
    assert(
        css.includes('.roomabouts-readonly .roomabouts-zone[data-region-kind="entrance"] {'),
        'entrance-region selector',
    );
    assert(css.includes('stroke-dasharray: 7 4;'), 'entrance boundary dash');
    assert(!/url\s*\(/i.test(css), 'procedural region treatments are URL-free');
});

Deno.test('Field Ledger draws geometric dash-dot and clock-tick state grammar', () => {
    const css = ROOMABOUTS_FIELD_LEDGER_CSS;
    const dashDotSelector = '.roomabouts-readonly .roomabouts-track[data-lifecycle="coasting"]'
        + '[data-position-basis="interpolated"]';
    assert(css.includes(`${dashDotSelector}::before {`), 'dash-dot ring owns a dashed ring primitive');
    assert(css.includes(`${dashDotSelector}::after {`), 'dash-dot ring owns explicit dot primitives');
    assert(css.includes('border: 2px dashed currentColor;'), 'dash-dot ring geometric dash component');
    assert(css.includes('box-shadow: 0 17px 0 0 currentColor;'), 'dash-dot ring opposing zero-blur dots');
    assert(!css.includes('border-style: dashed dotted;'), 'invalid opposite-side border shorthand is absent');

    const tickSelector = '.roomabouts-readonly .roomabouts-track[data-lifecycle="fading"]'
        + '[data-position-basis="last-seen"]::after {';
    assert(css.includes(tickSelector), 'last-seen ring owns one clock-like tick primitive');
    assert(css.includes('top: -5px;'), 'clock tick crosses the ring at twelve o’clock');
    assert(css.includes('height: 6px;'), 'clock tick has deterministic length');
});

Deno.test('focus uses a paper separation halo and explicit forced-colors treatment', () => {
    const css = ROOMABOUTS_FIELD_LEDGER_CSS;
    assert(
        css.includes('box-shadow: 0 0 0 2px var(--roomabouts-surface-paper);'),
        'two-pixel paper separation halo',
    );
    assert(css.includes('outline: 3px solid var(--roomabouts-focus);'), 'three-pixel focus outline');
    assert(css.includes('outline-offset: 2px;'), 'focus outline follows the separation halo');
    assert(css.includes('box-shadow: 0 0 0 2px Canvas;'), 'forced-colors separation halo');
    assert(css.includes('outline-color: Highlight;'), 'forced-colors focus outline');

    const allowedShadows = new Set([
        '0 0 0 2px var(--roomabouts-surface-paper)',
        '0 17px 0 0 currentColor',
        '0 0 0 2px Canvas',
    ]);
    const shadows = [...css.matchAll(/box-shadow\s*:\s*([^;]+);/gi)].map((match) => match[1].trim());
    assert(shadows.length === allowedShadows.size, 'only reviewed zero-blur shadows are present');
    for (const shadow of shadows) {
        assert(allowedShadows.has(shadow), `unexpected shadow treatment ${shadow}`);
    }
});

Deno.test('Field Ledger CSS clears inherited presentation without unsafe or franchise styling', () => {
    const css = ROOMABOUTS_FIELD_LEDGER_CSS;
    const lower = css.toLowerCase();
    for (const selector of [
        '#fall-alert-banner',
        '#ws-status-dot',
        '#btn-toggle-mode',
        '#edit-ui',
        '.radar-panel',
        '.dot',
        '.trail-dot',
        '.heading-arrow',
    ]) {
        assert(css.includes(selector), `inherited ${selector} must be isolated`);
    }
    for (const prohibited of [
        /url\s*\(/i,
        /@import/i,
        /@font-face/i,
        /image-set\s*\(/i,
        /!important/i,
        /forced-color-adjust\s*:\s*none/i,
        /text-shadow\s*:(?!\s*none)/i,
        /harry|potter|marauder|hogwarts|wizard|spell/i,
        /🚨|⚠|✨|🪄|🔮/u,
        /fall alert|alarm|emergency/i,
    ]) {
        assert(!prohibited.test(css), `prohibited CSS pattern ${prohibited}`);
    }
    assert(!lower.includes(':root'), 'tokens must not leak to the document root');
    assert(!lower.includes('font-family: cursive'), 'no handwriting font');
});

Deno.test('read-only activation is strict and fails closed for malformed state', () => {
    assert(isRoomaboutsReadOnly({ read_only: true }, { editing: false }), 'read-only non-editor state');
    assert(isRoomaboutsReadOnly({ read_only: true }, {}), 'absent editing flag is not editor mode');
    assert(!isRoomaboutsReadOnly({ read_only: true }, { editing: true }), 'editing disables Field Ledger');
    assert(!isRoomaboutsReadOnly({ read_only: false }, { editing: false }), 'false read-only flag');
    assert(!isRoomaboutsReadOnly({ read_only: 1 }, { editing: false }), 'truthy flag is not accepted');
    assert(!isRoomaboutsReadOnly(null, { editing: false }), 'null config');
    assert(!isRoomaboutsReadOnly({ read_only: true }, null), 'null state');
    assert(!isRoomaboutsReadOnly({ read_only: true }, { editing: 'false' }), 'non-boolean editor flag');
    assert(!isRoomaboutsReadOnly([], { editing: false }), 'array config');
    assert(!isRoomaboutsReadOnly({ read_only: true }, []), 'array state');

    let getterRead = false;
    const hostile = {};
    Object.defineProperty(hostile, 'read_only', {
        enumerable: true,
        get() {
            getterRead = true;
            return true;
        },
    });
    assert(!isRoomaboutsReadOnly(hostile, { editing: false }), 'accessor config fails closed');
    assert(!getterRead, 'activation must not invoke a hostile getter');
});

Deno.test('read-only sanitizer creates only the detached typed allowlist', () => {
    let unsafeGetterRead = false;
    const input = {
        type: 'custom:radar-map-card',
        map_group: 'First floor_2',
        target_render_mode: 'canvas',
        read_only: false,
        fused_color: '#00FF00',
        show_heading: true,
        show_trails: true,
        zone_color: '#FF00FF',
        target_color: '#00FFFF',
        radar_color: '#FFFF00',
    };
    Object.defineProperty(input, 'style', {
        enumerable: true,
        get() {
            unsafeGetterRead = true;
            throw new Error('unsafe style must never be read');
        },
    });
    Object.defineProperty(input, 'bg_image', {
        enumerable: true,
        get() {
            unsafeGetterRead = true;
            throw new Error('unsafe image must never be read');
        },
    });

    const sanitized = sanitizeRoomaboutsReadOnlyConfig(input);
    assertEquals(sanitized, {
        type: 'custom:radar-map-card',
        map_group: 'First floor_2',
        target_render_mode: 'canvas',
        read_only: true,
    }, 'typed allowlist');
    assert(sanitized !== input, 'sanitized config must be detached');
    assert(Object.isFrozen(sanitized), 'sanitized config must be immutable');
    assert(!unsafeGetterRead, 'discarded visual fields must not be read');

    input.map_group = 'Changed';
    input.target_render_mode = 'css';
    assertEquals(sanitized, {
        type: 'custom:radar-map-card',
        map_group: 'First floor_2',
        target_render_mode: 'canvas',
        read_only: true,
    }, 'output must not retain input state');
});

Deno.test('read-only sanitizer supplies stable safe defaults', () => {
    assertEquals(sanitizeRoomaboutsReadOnlyConfig({}), {
        type: 'custom:radar-map-card',
        map_group: 'default',
        target_render_mode: 'css',
        read_only: true,
    }, 'default read-only config');

    const nullPrototype = Object.create(null);
    nullPrototype.map_group = 'A';
    assertEquals(sanitizeRoomaboutsReadOnlyConfig(nullPrototype), {
        type: 'custom:radar-map-card',
        map_group: 'A',
        target_render_mode: 'css',
        read_only: true,
    }, 'null-prototype JSON record');
});

Deno.test('read-only sanitizer rejects inherited configuration without invoking inherited accessors', () => {
    let getterRead = false;
    const prototype = {};
    for (const key of ['style', 'bg_image', 'map_group', 'target_render_mode']) {
        Object.defineProperty(prototype, key, {
            configurable: true,
            enumerable: true,
            get() {
                getterRead = true;
                throw new Error('inherited configuration must not be read');
            },
        });
    }
    const inherited = Object.create(prototype);
    assertThrows(
        () => sanitizeRoomaboutsReadOnlyConfig(inherited),
        'non-JSON inherited configuration',
    );
    assert(!getterRead, 'inherited properties must never be evaluated');
});

Deno.test('read-only sanitizer rejects malformed allowlisted values without touching other fields', () => {
    for (const value of [null, undefined, [], new Date(), 'config', 7]) {
        assertThrows(() => sanitizeRoomaboutsReadOnlyConfig(value), `config ${String(value)}`);
    }
    for (const type of ['', 'radar-map-card', 'custom:other-card', 3]) {
        assertThrows(() => sanitizeRoomaboutsReadOnlyConfig({ type }), `type ${String(type)}`);
    }
    for (const map_group of [
        '',
        ' leading',
        'trailing ',
        '-leading',
        'trailing-',
        '../escape',
        'a'.repeat(65),
        'bad\u0000group',
        12,
    ]) {
        assertThrows(() => sanitizeRoomaboutsReadOnlyConfig({ map_group }), `map group ${String(map_group)}`);
    }
    for (const target_render_mode of ['', 'CSS', 'webgl', true, 1]) {
        assertThrows(
            () => sanitizeRoomaboutsReadOnlyConfig({ target_render_mode }),
            `render mode ${String(target_render_mode)}`,
        );
    }

    for (const key of ['type', 'map_group', 'target_render_mode']) {
        const hostile = {};
        Object.defineProperty(hostile, key, {
            enumerable: true,
            get() {
                throw new Error('accessor must not run');
            },
        });
        assertThrows(() => sanitizeRoomaboutsReadOnlyConfig(hostile), `${key} accessor`);
    }
});
