export const ROOMABOUTS_FIELD_LEDGER_TOKENS = Object.freeze({
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
});

export const ROOMABOUTS_FIELD_LEDGER_PROPERTIES = Object.freeze({
    '--roomabouts-surface-paper': ROOMABOUTS_FIELD_LEDGER_TOKENS.surfacePaper,
    '--roomabouts-surface-paper-deep': ROOMABOUTS_FIELD_LEDGER_TOKENS.surfacePaperDeep,
    '--roomabouts-ink': ROOMABOUTS_FIELD_LEDGER_TOKENS.ink,
    '--roomabouts-ink-muted': ROOMABOUTS_FIELD_LEDGER_TOKENS.inkMuted,
    '--roomabouts-line-region': ROOMABOUTS_FIELD_LEDGER_TOKENS.lineRegion,
    '--roomabouts-line-grid': ROOMABOUTS_FIELD_LEDGER_TOKENS.lineGrid,
    '--roomabouts-state-observed': ROOMABOUTS_FIELD_LEDGER_TOKENS.stateObserved,
    '--roomabouts-state-held': ROOMABOUTS_FIELD_LEDGER_TOKENS.stateHeld,
    '--roomabouts-state-last-seen': ROOMABOUTS_FIELD_LEDGER_TOKENS.stateLastSeen,
    '--roomabouts-state-offline': ROOMABOUTS_FIELD_LEDGER_TOKENS.stateOffline,
    '--roomabouts-state-attention': ROOMABOUTS_FIELD_LEDGER_TOKENS.stateAttention,
    '--roomabouts-focus': ROOMABOUTS_FIELD_LEDGER_TOKENS.focus,
    '--roomabouts-label-background': ROOMABOUTS_FIELD_LEDGER_TOKENS.labelBackground,
    '--roomabouts-label-text': ROOMABOUTS_FIELD_LEDGER_TOKENS.labelText,
});

const FIELD_LEDGER_PROPERTY_DECLARATIONS = Object.entries(ROOMABOUTS_FIELD_LEDGER_PROPERTIES)
    .map(([name, value]) => `    ${name}: ${value};`)
    .join('\n');

export const ROOMABOUTS_FIELD_LEDGER_CSS = `
.roomabouts-readonly {
${FIELD_LEDGER_PROPERTY_DECLARATIONS}
    position: relative;
    overflow: hidden;
    box-sizing: border-box;
    color: var(--roomabouts-ink);
    background-color: var(--roomabouts-surface-paper);
    background-image:
        repeating-linear-gradient(
            0deg,
            transparent 0,
            transparent 23px,
            color-mix(in srgb, var(--roomabouts-line-grid) 20%, transparent) 23px,
            color-mix(in srgb, var(--roomabouts-line-grid) 20%, transparent) 24px
        ),
        repeating-linear-gradient(
            90deg,
            transparent 0,
            transparent 23px,
            color-mix(in srgb, var(--roomabouts-line-grid) 20%, transparent) 23px,
            color-mix(in srgb, var(--roomabouts-line-grid) 20%, transparent) 24px
        );
    border: 1px solid var(--roomabouts-surface-paper-deep);
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    touch-action: auto;
}

.roomabouts-readonly #map-container,
.roomabouts-readonly .roomabouts-visual-layer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
    touch-action: auto;
}

.roomabouts-readonly #click-layer,
.roomabouts-readonly #svg-canvas,
.roomabouts-readonly #rmm-canvas,
.roomabouts-readonly #dots-layer,
.roomabouts-readonly .roomabouts-visual-layer {
    pointer-events: none;
    touch-action: auto;
}

.roomabouts-readonly #fall-alert-banner,
.roomabouts-readonly #ws-status-dot,
.roomabouts-readonly #btn-toggle-mode,
.roomabouts-readonly #edit-ui,
.roomabouts-readonly .radar-panel,
.roomabouts-readonly .dot,
.roomabouts-readonly .trail-dot,
.roomabouts-readonly .heading-arrow {
    display: none;
}

.roomabouts-readonly .roomabouts-zone {
    fill: var(--roomabouts-surface-paper);
    fill-opacity: 0.78;
    stroke: var(--roomabouts-line-region);
    stroke-width: 1.75px;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
}

.roomabouts-readonly .roomabouts-zone[data-region-kind="exclude"] {
    fill: var(--roomabouts-surface-paper);
}

.roomabouts-readonly .roomabouts-zone[data-region-kind="entrance"] {
    fill: none;
    stroke-dasharray: 7 4;
}

.roomabouts-readonly .roomabouts-zone[data-region-kind="stationary"] {
    fill: var(--roomabouts-surface-paper);
}

.roomabouts-readonly .roomabouts-zone-hatch-line {
    fill: none;
    stroke: var(--roomabouts-line-region);
    stroke-width: 0.65px;
    stroke-dasharray: 3 7;
    stroke-linecap: square;
    opacity: 0.58;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
}

.roomabouts-readonly .roomabouts-zone-stipple-mark {
    r: 0.65px;
    fill: var(--roomabouts-line-region);
    fill-opacity: 0.48;
    stroke: none;
    pointer-events: none;
}

.roomabouts-readonly .roomabouts-zone-label {
    position: absolute;
    box-sizing: border-box;
    max-width: min(15rem, 50%, calc(100% - 1rem));
    padding: 0.12rem 0.3rem;
    overflow: hidden;
    color: var(--roomabouts-ink);
    background: var(--roomabouts-surface-paper);
    border: 1px solid color-mix(in srgb, var(--roomabouts-line-region) 45%, transparent);
    border-radius: 2px;
    font-family: ui-serif, Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif;
    font-size: clamp(0.75rem, 0.68rem + 0.2vw, 0.95rem);
    font-weight: 500;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
    transform: translate(-50%, -50%);
    pointer-events: none;
}

.roomabouts-readonly .roomabouts-track,
.roomabouts-readonly .roomabouts-station {
    position: absolute;
    box-sizing: border-box;
    width: 18px;
    height: 18px;
    margin: -9px 0 0 -9px;
    color: var(--roomabouts-ink);
    background: var(--roomabouts-surface-paper);
    border: 2px solid currentColor;
    border-radius: 50%;
    pointer-events: none;
}

.roomabouts-readonly .roomabouts-track::before {
    content: "";
    position: absolute;
    inset: 5px;
    border-radius: 50%;
    background: currentColor;
}

.roomabouts-readonly .roomabouts-track[data-lifecycle="confirmed"][data-position-basis="observed"] {
    color: var(--roomabouts-state-observed);
    border-style: solid;
}

.roomabouts-readonly .roomabouts-track[data-lifecycle="tentative"][data-position-basis="observed"] {
    color: var(--roomabouts-ink-muted);
    border-style: dotted;
    outline: 1px dotted currentColor;
    outline-offset: 3px;
}

.roomabouts-readonly .roomabouts-track[data-lifecycle="confirmed"][data-position-basis="interpolated"] {
    color: var(--roomabouts-state-held);
    border-style: dotted;
}

.roomabouts-readonly .roomabouts-track[data-lifecycle="coasting"][data-position-basis="held"] {
    color: var(--roomabouts-state-held);
    border-style: dashed;
}

.roomabouts-readonly .roomabouts-track[data-lifecycle="coasting"][data-position-basis="interpolated"] {
    color: var(--roomabouts-state-held);
    border-color: transparent;
    border-style: solid;
}

.roomabouts-readonly .roomabouts-track[data-lifecycle="fading"][data-position-basis="last-seen"] {
    color: var(--roomabouts-state-last-seen);
    border-style: dashed;
}

.roomabouts-readonly .roomabouts-track[data-lifecycle="tentative"]::before,
.roomabouts-readonly .roomabouts-track[data-position-basis="interpolated"]::before,
.roomabouts-readonly .roomabouts-track[data-position-basis="held"]::before,
.roomabouts-readonly .roomabouts-track[data-position-basis="last-seen"]::before {
    background: transparent;
}

.roomabouts-readonly .roomabouts-track[data-lifecycle="coasting"][data-position-basis="interpolated"]::before {
    inset: -2px;
    background: transparent;
    border: 2px dashed currentColor;
    border-radius: 50%;
}

.roomabouts-readonly .roomabouts-track[data-lifecycle="coasting"][data-position-basis="interpolated"]::after {
    content: "";
    position: absolute;
    top: -2px;
    left: 50%;
    width: 3px;
    height: 3px;
    margin-left: -1.5px;
    background: currentColor;
    border-radius: 50%;
    box-shadow: 0 17px 0 0 currentColor;
}

.roomabouts-readonly .roomabouts-track[data-lifecycle="fading"][data-position-basis="last-seen"]::after {
    content: "";
    position: absolute;
    top: -5px;
    left: 50%;
    width: 2px;
    height: 6px;
    margin-left: -1px;
    background: currentColor;
    border-radius: 1px;
}

.roomabouts-readonly .roomabouts-track-label,
.roomabouts-readonly .roomabouts-station-label {
    position: absolute;
    left: 50%;
    top: calc(100% + 5px);
    max-width: min(15rem, 70vw);
    padding: 0.2rem 0.42rem;
    overflow: hidden;
    color: var(--roomabouts-label-text);
    background: var(--roomabouts-label-background);
    border-radius: 2px;
    font-size: clamp(0.75rem, 0.55rem + 0.35vw, 1rem);
    font-weight: 500;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
    transform: translateX(-50%);
    pointer-events: none;
}

.roomabouts-readonly .roomabouts-posture {
    display: inline-block;
    padding: 0.1rem 0.3rem;
    color: var(--roomabouts-surface-paper);
    background: var(--roomabouts-state-attention);
    border: 1px solid var(--roomabouts-state-attention);
    border-radius: 2px;
    font-size: 0.75rem;
    font-weight: 600;
}

.roomabouts-readonly .roomabouts-station[data-source-status="online"] {
    color: var(--roomabouts-state-observed);
    border-style: solid;
}

.roomabouts-readonly .roomabouts-station[data-source-status="degraded"] {
    color: var(--roomabouts-state-held);
    border-style: dashed;
}

.roomabouts-readonly .roomabouts-station[data-source-status="offline"] {
    color: var(--roomabouts-state-offline);
    border-radius: 1px;
}

.roomabouts-readonly .roomabouts-station[data-source-status="unknown"] {
    color: var(--roomabouts-ink-muted);
    border-style: dotted;
    border-radius: 1px;
}

.roomabouts-readonly .roomabouts-station[data-source-status="offline"]::after {
    content: "";
    position: absolute;
    left: 1px;
    right: 1px;
    top: 7px;
    border-top: 2px solid currentColor;
    transform: rotate(-45deg);
    transform-origin: center;
}

.roomabouts-readonly .roomabouts-station[data-paused="true"]::before {
    content: "";
    position: absolute;
    inset: 4px 5px;
    border-right: 2px solid currentColor;
    border-left: 2px solid currentColor;
}

.roomabouts-readonly .roomabouts-step {
    position: absolute;
    width: 7px;
    height: 13px;
    color: var(--roomabouts-state-observed);
    transform-origin: 50% 50%;
    pointer-events: none;
}

.roomabouts-readonly .roomabouts-step::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 7px;
    height: 8px;
    background: currentColor;
    border-radius: 55% 55% 42% 45%;
    clip-path: polygon(0 0, 100% 0, 100% 100%, 42% 100%, 34% 78%, 0 78%);
}

.roomabouts-readonly .roomabouts-step::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 1px;
    width: 4px;
    height: 4px;
    background: var(--roomabouts-ink);
    border-radius: 1px;
}

.roomabouts-readonly .roomabouts-step[data-side="right"]::before {
    transform: scaleX(-1);
}

.roomabouts-readonly .roomabouts-step[data-side="right"]::after {
    right: 1px;
    left: auto;
}

.roomabouts-readonly .roomabouts-step[data-side="left"]::before {
    transform: none;
}

.roomabouts-readonly #roomabouts-semantic-layer {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
}

.roomabouts-readonly :focus-visible {
    box-shadow: 0 0 0 2px var(--roomabouts-surface-paper);
    outline: 3px solid var(--roomabouts-focus);
    outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
    .roomabouts-readonly .roomabouts-track,
    .roomabouts-readonly .roomabouts-step,
    .roomabouts-readonly .roomabouts-station {
        animation: none;
        transition: none;
    }
}

@media (forced-colors: active) {
    .roomabouts-readonly {
        color: CanvasText;
        background: Canvas;
        border-color: GrayText;
    }

    .roomabouts-readonly .roomabouts-zone,
    .roomabouts-readonly .roomabouts-track,
    .roomabouts-readonly .roomabouts-station,
    .roomabouts-readonly .roomabouts-step {
        color: CanvasText;
        fill: Canvas;
        stroke: CanvasText;
        border-color: CanvasText;
    }

    .roomabouts-readonly .roomabouts-track-label,
    .roomabouts-readonly .roomabouts-station-label,
    .roomabouts-readonly .roomabouts-zone-label {
        color: HighlightText;
        background: Highlight;
        border-color: CanvasText;
    }

    .roomabouts-readonly :focus-visible {
        box-shadow: 0 0 0 2px Canvas;
        outline-color: Highlight;
    }
}
`.trim();

const MAP_GROUP_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9 _-]{0,62}[A-Za-z0-9])?$/u;
const CARD_TYPE = 'custom:radar-map-card';
const RENDER_MODES = new Set(['css', 'canvas']);

const isPlainRecord = (value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

const readOwnDataProperty = (record, key, fallback) => {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (descriptor === undefined) return fallback;
    if (!Object.hasOwn(descriptor, 'value')) {
        throw new TypeError(`Roomabouts read-only config ${key} must be a data property`);
    }
    return descriptor.value;
};

export const isRoomaboutsReadOnly = (config, state) => {
    try {
        if (!isPlainRecord(config) || !isPlainRecord(state)) return false;
        const readOnlyDescriptor = Object.getOwnPropertyDescriptor(config, 'read_only');
        if (!readOnlyDescriptor || !Object.hasOwn(readOnlyDescriptor, 'value')) return false;
        const editingDescriptor = Object.getOwnPropertyDescriptor(state, 'editing');
        if (editingDescriptor && !Object.hasOwn(editingDescriptor, 'value')) return false;
        const editing = editingDescriptor?.value;
        if (editing !== undefined && typeof editing !== 'boolean') return false;
        return readOnlyDescriptor.value === true && editing !== true;
    } catch (_error) {
        return false;
    }
};

export const sanitizeRoomaboutsReadOnlyConfig = (config) => {
    if (!isPlainRecord(config)) {
        throw new TypeError('Roomabouts read-only config must be a plain object');
    }

    const type = readOwnDataProperty(config, 'type', CARD_TYPE);
    const mapGroup = readOwnDataProperty(config, 'map_group', 'default');
    const renderMode = readOwnDataProperty(config, 'target_render_mode', 'css');

    if (type !== CARD_TYPE) {
        throw new TypeError('Roomabouts read-only config has an unsupported card type');
    }
    if (typeof mapGroup !== 'string' || !MAP_GROUP_PATTERN.test(mapGroup)) {
        throw new TypeError('Roomabouts read-only config has an invalid map_group');
    }
    if (typeof renderMode !== 'string' || !RENDER_MODES.has(renderMode)) {
        throw new TypeError('Roomabouts read-only config has an invalid target_render_mode');
    }

    return Object.freeze({
        type: CARD_TYPE,
        map_group: mapGroup,
        target_render_mode: renderMode,
        read_only: true,
    });
};
