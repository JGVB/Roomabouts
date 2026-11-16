import {
    expect,
    FIXTURE_FAVICON_DATA_URL,
    isLoopbackRequest,
    test,
} from './roomabouts-test.js';

const EXPECTED_COMPOSITE_SEMANTICS = Object.freeze([
    'Included region: Included survey region — Inside field',
    'Excluded region: Excluded survey region — Inside field',
    'Entrance region: Entrance survey region — Inside field',
    'Stationary region: Stationary survey region — Inside field',
    'Station 1: Survey station — Online',
    'Station 2: Survey station — Offline',
    'Wayfarer-777771: Unconfirmed; Position basis: observed; Source unverified',
    'Wayfarer-777772: Observed; Position basis: observed',
    'Wayfarer-777773: Estimated — not directly observed; Position basis: interpolated',
    'Wayfarer-777774: Held — not currently observed; Position basis: held; Stationary-region hold',
    'Wayfarer-777775: Estimated — not currently observed; Position basis: interpolated; Source not currently observed',
    'Wayfarer-777776: Last seen — not current; Position basis: last-seen; Source not currently observed',
]);

const NO_RESAMPLING_COUNTERS = Object.freeze([
    'adapterDisconnect',
    'adapterIngest',
    'adapterReset',
    'storeDestroy',
    'storeExpire',
    'storeObserve',
    'storeReset',
]);

async function openFixture(page) {
    await page.goto('/tests/browser/fixture.html');
    await page.evaluate(() => globalThis.roomaboutsFixture.ready);
    await expect(page.locator('#status')).toContainText('subscribers=1');
}

async function callFixture(page, method, ...args) {
    return page.evaluate(async ({ method: methodName, args: methodArgs }) => (
        globalThis.roomaboutsFixture[methodName](...methodArgs)
    ), { method, args });
}

async function seedFootprints(page) {
    await callFixture(page, 'selectScenario', 'walk-and-fade', 1);
    await callFixture(page, 'step');
    await expect.poll(() => page.evaluate(() => (
        globalThis.roomaboutsFixture.card.renderer._roomaboutsTrailRecords.length
    ))).toBeGreaterThan(0);
    return page.evaluate(() => {
        const records = globalThis.roomaboutsFixture.card.renderer._roomaboutsTrailRecords;
        globalThis.__wave3dRecordRefs = [...records];
        globalThis.__wave3dRecordSignatures = records.map((record) => JSON.stringify(record));
        return records.length;
    });
}

async function evidenceSnapshot(page) {
    return page.evaluate(() => {
        const fixture = globalThis.roomaboutsFixture;
        const card = fixture.card;
        const records = card.renderer._roomaboutsTrailRecords;
        const baselineRefs = globalThis.__wave3dRecordRefs || [];
        return {
            card: fixture.cardStats(card),
            records: records.map((record) => JSON.stringify(record)),
            recordsStable: records.length === baselineRefs.length
                && records.every((record, index) => record === baselineRefs[index]),
            source: fixture.sourceStats(),
        };
    });
}

function expectPresentationOnly(before, after, { draw = false } = {}) {
    expect(after.source).toEqual(before.source);
    for (const counter of NO_RESAMPLING_COUNTERS) {
        expect(after.card.counters[counter], counter).toBe(before.card.counters[counter]);
    }
    expect(after.records).toEqual(before.records);
    expect(after.recordsStable).toBe(true);
    if (draw) expect(after.card.counters.draw).toBeGreaterThan(before.card.counters.draw);
}

async function addScrollRange(page) {
    await page.evaluate(() => {
        const sentinel = document.createElement('div');
        sentinel.id = 'wave-3d-scroll-sentinel';
        sentinel.style.height = '1200px';
        sentinel.setAttribute('aria-hidden', 'true');
        document.querySelector('main').append(sentinel);
    });
}

async function installInputProbe(page) {
    await page.evaluate(() => {
        const card = globalThis.roomaboutsFixture.card;
        const state = { captures: 0, events: [] };
        const originalCapture = Element.prototype.setPointerCapture;
        Element.prototype.setPointerCapture = function setPointerCapture(...args) {
            if (this === card || this.getRootNode?.()?.host === card) state.captures += 1;
            return originalCapture.apply(this, args);
        };
        for (const type of ['wheel', 'touchstart', 'touchmove', 'pointerdown', 'pointermove']) {
            document.addEventListener(type, (event) => {
                const host = document.getElementById('card-host');
                const path = event.composedPath();
                state.events.push({
                    defaultPrevented: event.defaultPrevented,
                    overCard: path.includes(card) || path.includes(host),
                    type,
                });
            });
        }
        globalThis.__roomaboutsInputProbe = state;
    });
}

async function installCanvasTrace(page) {
    await page.evaluate(() => {
        const renderer = globalThis.roomaboutsFixture.card.renderer;
        const state = { active: null, frame: null, frames: [] };
        const methods = [
            'save', 'translate', 'rotate', 'scale', 'beginPath', 'moveTo', 'lineTo',
            'quadraticCurveTo', 'closePath', 'roundRect', 'fill', 'fillRect', 'restore',
        ];
        for (const method of methods) {
            const original = CanvasRenderingContext2D.prototype[method];
            CanvasRenderingContext2D.prototype[method] = function wave3dCanvasTrace(...args) {
                if (state.active && this === renderer.ctx) {
                    state.active.calls.push({
                        args,
                        fillStyle: this.fillStyle,
                        method,
                        strokeStyle: this.strokeStyle,
                    });
                }
                return original.apply(this, args);
            };
        }
        const originalFrame = renderer._renderRoomaboutsCanvas.bind(renderer);
        renderer._renderRoomaboutsCanvas = (...args) => {
            const frame = [];
            state.frame = frame;
            try {
                return originalFrame(...args);
            } finally {
                state.frames.push(frame);
                state.frame = null;
            }
        };
        const originalStep = renderer._drawRoomaboutsCanvasStep.bind(renderer);
        renderer._drawRoomaboutsCanvasStep = (ctx, record, width, height, palette) => {
            const trace = { calls: [], height, palette, record, width };
            if (state.frame) state.frame.push(trace);
            state.active = trace;
            try {
                return originalStep(ctx, record, width, height, palette);
            } finally {
                state.active = null;
            }
        };
        globalThis.__wave3dCanvasTrace = state;
    });
}

test('browser requests are limited to the one fixture data URL and exact fixture directories', () => {
    expect(isLoopbackRequest(FIXTURE_FAVICON_DATA_URL)).toBe(true);
    expect(isLoopbackRequest('http://127.0.0.1:4173/tests/browser/fixture.html')).toBe(true);
    expect(isLoopbackRequest(
        'http://127.0.0.1:4173/custom_components/radar_map_manager/www/radar-renderer.js?v=1.5.0',
    )).toBe(true);
    for (const rejected of [
        'data:image/svg+xml,%3Csvg/%3E',
        'data:text/plain,fixture',
        'http://localhost:4173/tests/browser/fixture.html',
        'https://127.0.0.1:4173/tests/browser/fixture.html',
        'http://127.0.0.1:4174/tests/browser/fixture.html',
        'http://127.0.0.2:4173/tests/browser/fixture.html',
        'HTTP://127.0.0.1:4173/tests/browser/fixture.html',
        ' http://127.0.0.1:4173/tests/browser/fixture.html',
        'http://127.000.000.001:4173/tests/browser/fixture.html',
        'http://0177.0.0.1:4173/tests/browser/fixture.html',
        'https://example.invalid/tests/browser/fixture.html',
        'http://127.0.0.1:4173/package.json',
        'http://127.0.0.1:4173/tests/browser-evil/fixture.html',
        'http://user@127.0.0.1:4173/tests/browser/fixture.html',
        'http://user:secret@127.0.0.1:4173/tests/browser/fixture.html',
        'http://127.0.0.1:4173/tests/browser/%2foutside.js',
        'http://127.0.0.1:4173/tests/browser/%2Foutside.js',
        'http://127.0.0.1:4173/tests/browser/%5coutside.js',
        'http://127.0.0.1:4173/tests/browser/%5Coutside.js',
        'http://127.0.0.1:4173/tests/browser/%00fixture.js',
        'http://127.0.0.1:4173/tests/browser/%252foutside.js',
        'http://127.0.0.1:4173/tests/browser/%252e%252e/package.json',
        'http://127.0.0.1:4173/tests/browser/%E0%A4%A',
        'http://127.0.0.1:4173/tests/browser/../package.json',
        'http://127.0.0.1:4173/tests/browser/%2e%2e/package.json',
        'http://127.0.0.1:4173/tests/browser/./fixture.html',
        'http://127.0.0.1:4173/tests//browser/fixture.html',
        'http://127.0.0.1:4173/tests\\browser\\fixture.html',
        'http://127.0.0.1:4173/tests/browser/fixture\0.html',
    ]) {
        expect(isLoopbackRequest(rejected), rejected).toBe(false);
    }
});

test('full shared labels and the focus contract remain usable at 320px and 200% text', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await openFixture(page);
    await callFixture(page, 'selectScenario', 'six-state-composite');
    const normalFontSize = await page.evaluate(() => Number.parseFloat(getComputedStyle(
        globalThis.roomaboutsFixture.card.shadowRoot.querySelector('.roomabouts-track-label'),
    ).fontSize));
    await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
        globalThis.roomaboutsFixture.card._queueRender();
    });
    await callFixture(page, 'waitForStable');

    await page.evaluate(() => {
        globalThis.__wave3dSemanticNodes = [...globalThis.roomaboutsFixture.card.shadowRoot.querySelectorAll(
            '#roomabouts-semantic-layer [role="listitem"]',
        )];
    });
    let labelTexts = null;
    for (const mode of ['css', 'canvas']) {
        await callFixture(page, 'setRenderMode', mode);
        const evidence = await page.evaluate(() => {
            const shadow = globalThis.roomaboutsFixture.card.shadowRoot;
            const root = shadow.querySelector('.roomabouts-readonly');
            const rootRect = root.getBoundingClientRect();
            const labels = [...shadow.querySelectorAll(
                '.roomabouts-zone-label, .roomabouts-station-label, .roomabouts-track-label',
            )];
            const focusable = [...shadow.querySelectorAll(
                'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
            )].filter((element) => !element.disabled && getComputedStyle(element).display !== 'none');
            return {
                documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                focusableCount: focusable.length,
                labels: labels.map((label) => {
                    const rect = label.getBoundingClientRect();
                    const style = getComputedStyle(label);
                    const range = document.createRange();
                    range.selectNodeContents(label);
                    const textRects = [...range.getClientRects()];
                    return {
                        bottom: rect.bottom,
                        clientHeight: label.clientHeight,
                        clientWidth: label.clientWidth,
                        fontSize: Number.parseFloat(style.fontSize),
                        fullTextRendered: label.innerText === label.textContent
                            && textRects.every((textRect) => (
                                textRect.left >= rect.left - 1
                                && textRect.right <= rect.right + 1
                                && textRect.top >= rect.top - 1
                                && textRect.bottom <= rect.bottom + 1
                            )),
                        left: rect.left,
                        overflow: style.overflow,
                        overflowWrap: style.overflowWrap,
                        right: rect.right,
                        scrollHeight: label.scrollHeight,
                        scrollWidth: label.scrollWidth,
                        text: label.textContent,
                        textOverflow: style.textOverflow,
                        top: rect.top,
                    };
                }),
                root: {
                    ariaLabel: root.getAttribute('aria-label'),
                    bottom: rootRect.bottom,
                    left: rootRect.left,
                    right: rootRect.right,
                    role: root.getAttribute('role'),
                    top: rootRect.top,
                },
                semanticNodesStable: [...shadow.querySelectorAll(
                    '#roomabouts-semantic-layer [role="listitem"]',
                )].every((item, index) => item === globalThis.__wave3dSemanticNodes[index]),
                semanticTexts: [...shadow.querySelectorAll('#roomabouts-semantic-layer [role="listitem"]')]
                    .map((item) => item.textContent),
            };
        });
        expect(evidence.documentOverflow).toBeLessThanOrEqual(0);
        expect(evidence.root).toMatchObject({ role: 'region', ariaLabel: 'Roomabouts field view' });
        expect(evidence.semanticTexts).toEqual(EXPECTED_COMPOSITE_SEMANTICS);
        expect(evidence.semanticNodesStable).toBe(true);
        expect(evidence.focusableCount).toBe(0);
        expect(evidence.labels).toHaveLength(12);
        for (const label of evidence.labels) {
            expect(label.left, `${mode} ${label.text} left`).toBeGreaterThanOrEqual(evidence.root.left - 1);
            expect(label.right, `${mode} ${label.text} right`).toBeLessThanOrEqual(evidence.root.right + 1);
            expect(label.top, `${mode} ${label.text} top`).toBeGreaterThanOrEqual(evidence.root.top - 1);
            expect(label.bottom, `${mode} ${label.text} bottom`).toBeLessThanOrEqual(evidence.root.bottom + 1);
            expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth + 1);
            expect(label.scrollHeight).toBeLessThanOrEqual(label.clientHeight + 1);
            expect(label.fullTextRendered, `${mode} ${label.text} rendered`).toBe(true);
            expect(label.overflow).not.toBe('hidden');
            expect(label.overflowWrap).toBe('anywhere');
            expect(label.textOverflow).not.toBe('ellipsis');
            expect(label.fontSize).toBeGreaterThan(normalFontSize);
        }
        const texts = evidence.labels.map((label) => label.text);
        if (labelTexts === null) labelTexts = texts;
        else expect(texts).toEqual(labelTexts);
    }

    const normalFocus = await page.evaluate(() => {
        const shadow = globalThis.roomaboutsFixture.card.shadowRoot;
        const root = shadow.querySelector('.roomabouts-readonly');
        const probe = document.createElement('button');
        probe.id = 'wave3d-focus-probe';
        probe.textContent = 'Focus probe';
        Object.assign(probe.style, {
            height: '44px',
            left: '20px',
            position: 'absolute',
            top: '20px',
            width: '100px',
            zIndex: '20',
        });
        root.append(probe);
        probe.focus();
        const style = getComputedStyle(probe);
        const rect = probe.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        const resolveColor = (value) => {
            const colorProbe = document.createElement('span');
            colorProbe.style.color = value;
            root.append(colorProbe);
            const color = getComputedStyle(colorProbe).color;
            colorProbe.remove();
            return color;
        };
        return {
            boxShadow: style.boxShadow,
            focusVisible: probe.matches(':focus-visible'),
            haloColor: resolveColor(getComputedStyle(root).getPropertyValue('--roomabouts-surface-paper').trim()),
            inside: rect.left - 5 >= rootRect.left
                && rect.top - 5 >= rootRect.top
                && rect.right + 5 <= rootRect.right
                && rect.bottom + 5 <= rootRect.bottom,
            outlineColor: style.outlineColor,
            outlineOffset: style.outlineOffset,
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            tokenColor: resolveColor(getComputedStyle(root).getPropertyValue('--roomabouts-focus').trim()),
        };
    });
    expect(normalFocus).toMatchObject({
        focusVisible: true,
        inside: true,
        outlineOffset: '2px',
        outlineStyle: 'solid',
        outlineWidth: '3px',
    });
    expect(normalFocus.outlineColor).toBe(normalFocus.tokenColor);
    expect(normalFocus.boxShadow).toContain(normalFocus.haloColor);
    expect(normalFocus.boxShadow).toContain('2px');

    await page.emulateMedia({ forcedColors: 'active' });
    const forcedFocus = await page.evaluate(() => {
        const shadow = globalThis.roomaboutsFixture.card.shadowRoot;
        const root = shadow.querySelector('.roomabouts-readonly');
        const probe = shadow.querySelector('#wave3d-focus-probe');
        probe.focus();
        const style = getComputedStyle(probe);
        const rect = probe.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        const color = (token) => {
            const item = document.createElement('span');
            item.style.color = token;
            root.append(item);
            const resolved = getComputedStyle(item).color;
            item.remove();
            return resolved;
        };
        const result = {
            borderColor: style.borderColor,
            borderStyle: style.borderStyle,
            borderWidth: style.borderWidth,
            boxShadow: style.boxShadow,
            canvas: color('Canvas'),
            focusVisible: probe.matches(':focus-visible'),
            highlight: color('Highlight'),
            inside: rect.left - 5 >= rootRect.left
                && rect.top - 5 >= rootRect.top
                && rect.right + 5 <= rootRect.right
                && rect.bottom + 5 <= rootRect.bottom,
            outlineColor: style.outlineColor,
            outlineOffset: style.outlineOffset,
            outlineWidth: style.outlineWidth,
        };
        probe.remove();
        result.focusableCount = [...shadow.querySelectorAll(
            'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )].filter((element) => !element.disabled && getComputedStyle(element).display !== 'none').length;
        return result;
    });
    expect(forcedFocus).toMatchObject({
        focusVisible: true,
        focusableCount: 0,
        inside: true,
        outlineOffset: '2px',
        outlineWidth: '3px',
    });
    expect(forcedFocus.outlineColor).toBe(forcedFocus.highlight);
    expect(forcedFocus.borderColor).toBe(forcedFocus.canvas);
    expect(forcedFocus.borderStyle).toBe('solid');
    expect(forcedFocus.borderWidth).toBe('2px');
});

test('portrait, landscape, and square projections stay exact through CSS to Canvas to CSS', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 1000 });
    await openFixture(page);
    const recordCount = await seedFootprints(page);
    expect(recordCount).toBeGreaterThan(0);
    await installCanvasTrace(page);

    for (const surface of [
        { name: 'portrait', width: 320, height: 520 },
        { name: 'landscape', width: 520, height: 320 },
        { name: 'square', width: 420, height: 420 },
    ]) {
        const resizeBefore = await evidenceSnapshot(page);
        await page.evaluate(({ width, height }) => {
            const host = document.getElementById('card-host');
            const card = globalThis.roomaboutsFixture.card;
            Object.assign(host.style, {
                border: '0',
                height: `${height + 2}px`,
                maxWidth: 'none',
                width: `${width + 2}px`,
            });
            card.style.minHeight = '0';
            globalThis.__wave3dCanvasTrace.frames.length = 0;
        }, surface);
        await expect.poll(() => page.evaluate(() => (
            globalThis.roomaboutsFixture.cardStats().counters.queue
        ))).toBeGreaterThan(resizeBefore.card.counters.queue);
        await callFixture(page, 'waitForStable', resizeBefore.card.counters.draw);
        const resizeAfter = await evidenceSnapshot(page);
        expectPresentationOnly(resizeBefore, resizeAfter, { draw: true });

        for (const mode of ['css', 'canvas', 'css']) {
            const actionBefore = await evidenceSnapshot(page);
            await page.evaluate(() => { globalThis.__wave3dCanvasTrace.frames.length = 0; });
            await callFixture(page, 'setRenderMode', mode);
            const actionAfter = await evidenceSnapshot(page);
            expectPresentationOnly(actionBefore, actionAfter, { draw: true });

            const geometry = await page.evaluate(async ({ expectedMode, expectedSurface }) => {
                const { projectRoomaboutsStep } = await import(
                    '/custom_components/radar_map_manager/www/roomabouts-trails.js?v=1.5.0'
                );
                const card = globalThis.roomaboutsFixture.card;
                const shadow = card.shadowRoot;
                const visual = shadow.querySelector('.roomabouts-visual-layer');
                const canvas = shadow.querySelector('#rmm-canvas');
                const rect = visual.getBoundingClientRect();
                const canvasRect = canvas.getBoundingClientRect();
                const records = card.renderer._roomaboutsTrailRecords;
                const baseline = globalThis.__wave3dRecordRefs;
                const failures = [];
                const near = (left, right, tolerance = 0.01) => Math.abs(left - right) <= tolerance;
                if (!near(rect.width, expectedSurface.width, 0.1)
                    || !near(rect.height, expectedSurface.height, 0.1)) failures.push('visual-surface-size');
                if (expectedMode === 'canvas'
                    && (!near(canvasRect.width, expectedSurface.width, 0.1)
                        || !near(canvasRect.height, expectedSurface.height, 0.1))) {
                    failures.push(`canvas-surface-size:${canvasRect.width}x${canvasRect.height}`);
                }
                if (records.length !== baseline.length
                    || records.some((record, index) => record !== baseline[index])) failures.push('record-order-identity');

                const expected = records.map((record, index) => {
                    const projected = projectRoomaboutsStep(record, rect.width, rect.height);
                    if (!projected) {
                        failures.push(`projection-null-${index}`);
                        return null;
                    }
                    if (!near(projected.centerX, record.x * rect.width / 100)
                        || !near(projected.centerY, record.y * rect.height / 100)) {
                        failures.push(`center-${index}`);
                    }
                    if (!near(Math.hypot(projected.offsetX, projected.offsetY), 4)) {
                        failures.push(`offset-${index}`);
                    }
                    if (!near(projected.screenX, projected.centerX + projected.offsetX)
                        || !near(projected.screenY, projected.centerY + projected.offsetY)
                        || projected.side !== record.side) failures.push(`projected-tuple-${index}`);
                    return projected;
                });

                if (expectedMode === 'css') {
                    const steps = [...shadow.querySelectorAll('.roomabouts-step')];
                    if (steps.length !== records.length) failures.push('css-count');
                    steps.forEach((step, index) => {
                        const projected = expected[index];
                        const rotation = Number.parseFloat(
                            step.style.transform.match(/rotate\(([-+0-9.eE]+)deg\)/u)?.[1] ?? 'NaN',
                        );
                        if (!projected
                            || !near(Number.parseFloat(step.style.left), projected.screenX)
                            || !near(Number.parseFloat(step.style.top), projected.screenY)
                            || !near(rotation, projected.rotationDeg)
                            || step.dataset.side !== projected.side) failures.push(`css-step-${index}`);
                    });
                } else {
                    const frames = globalThis.__wave3dCanvasTrace.frames;
                    const frame = [...frames].reverse().find((candidate) => candidate.length > 0) || [];
                    if (frame.length !== records.length) failures.push('canvas-count');
                    frame.forEach((trace, index) => {
                        const projected = expected[index];
                        const calls = trace.calls;
                        const translations = calls.filter((call) => call.method === 'translate');
                        const rotation = calls.find((call) => call.method === 'rotate');
                        const mirror = calls.find((call) => call.method === 'scale');
                        const fills = calls.filter((call) => call.method === 'fill');
                        const roundedHeel = calls.find((call) => call.method === 'roundRect');
                        if (trace.record !== records[index]
                            || !near(trace.width, rect.width)
                            || !near(trace.height, rect.height)) failures.push(`canvas-ref-${index}`);
                        if (!projected
                            || translations.length < 2
                            || !near(translations[0].args[0], projected.screenX)
                            || !near(translations[0].args[1], projected.screenY)
                            || !rotation
                            || !near(rotation.args[0], projected.rotationDeg * Math.PI / 180)
                            || !near(translations[1].args[0], -3.5)
                            || !near(translations[1].args[1], -6.5)) failures.push(`canvas-transform-${index}`);
                        if ((projected?.side === 'right' && JSON.stringify(mirror?.args) !== '[-1,1]')
                            || (projected?.side === 'left' && mirror)) failures.push(`canvas-side-${index}`);
                        if (fills.length !== 2
                            || JSON.stringify(roundedHeel?.args) !== '[1,9,4,4,1]'
                            || calls.some((call) => call.method === 'fillRect')
                            || calls[0]?.method !== 'save'
                            || calls.at(-1)?.method !== 'restore') failures.push(`canvas-draw-${index}`);
                    });
                }
                return {
                    canvasHeight: canvasRect.height,
                    canvasWidth: canvasRect.width,
                    failures,
                    height: rect.height,
                    width: rect.width,
                };
            }, { expectedMode: mode, expectedSurface: surface });
            expect(geometry.failures, `${surface.name} ${mode}`).toEqual([]);
            expect(geometry).toMatchObject({
                width: surface.width,
                height: surface.height,
            });
            if (mode === 'canvas') {
                expect(geometry).toMatchObject({
                    canvasWidth: surface.width,
                    canvasHeight: surface.height,
                });
            }
        }
    }
});

test('forced colors redraw live footprints and wheel scrolling never resamples', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openFixture(page);
    await seedFootprints(page);
    await addScrollRange(page);
    await installInputProbe(page);

    const pointerAndMotion = await page.evaluate(() => {
        const shadow = globalThis.roomaboutsFixture.card.shadowRoot;
        const pointerSelectors = [
            '.roomabouts-readonly', '#map-container', '#click-layer', '#svg-canvas',
            '#rmm-canvas', '#dots-layer', '.roomabouts-visual-layer',
        ];
        const motionSelectors = [
            '.roomabouts-visual-layer', '.roomabouts-track-label', '.roomabouts-track',
            '.roomabouts-step', '.roomabouts-station',
        ];
        return {
            motion: motionSelectors.map((selector) => {
                const style = getComputedStyle(shadow.querySelector(selector));
                return [style.animationName, style.transitionDuration];
            }),
            pointer: pointerSelectors.map((selector) => {
                const style = getComputedStyle(shadow.querySelector(selector));
                return [selector, style.pointerEvents, style.touchAction];
            }),
        };
    });
    expect(pointerAndMotion.motion.every(([animation, duration]) => (
        animation === 'none' && duration === '0s'
    ))).toBe(true);
    expect(pointerAndMotion.pointer[0]).toEqual(['.roomabouts-readonly', 'auto', 'auto']);
    expect(pointerAndMotion.pointer.slice(1).every(([, pointer, touch]) => (
        pointer === 'none' && touch === 'auto'
    ))).toBe(true);

    await callFixture(page, 'setRenderMode', 'canvas');
    await page.evaluate(() => {
        const renderer = globalThis.roomaboutsFixture.card.renderer;
        const state = { active: null, frames: [] };
        const originalFill = CanvasRenderingContext2D.prototype.fill;
        CanvasRenderingContext2D.prototype.fill = function wave3dColorFill(...args) {
            if (state.active && this === renderer.ctx) state.active.push(this.fillStyle);
            return originalFill.apply(this, args);
        };
        const originalStep = renderer._drawRoomaboutsCanvasStep.bind(renderer);
        renderer._drawRoomaboutsCanvasStep = (...args) => {
            const fills = [];
            state.active = fills;
            try {
                return originalStep(...args);
            } finally {
                state.frames.push(fills);
                state.active = null;
            }
        };
        globalThis.__wave3dColorTrace = state;
    });
    const mediaBefore = await evidenceSnapshot(page);
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
    await expect.poll(() => page.evaluate(() => (
        globalThis.roomaboutsFixture.cardStats().counters.mediaHandler
    ))).toBe(mediaBefore.card.counters.mediaHandler + 1);
    await expect.poll(() => page.evaluate(() => (
        globalThis.roomaboutsFixture.cardStats().counters.queue
    ))).toBeGreaterThan(mediaBefore.card.counters.queue);
    await callFixture(page, 'waitForStable', mediaBefore.card.counters.draw);
    const mediaAfter = await evidenceSnapshot(page);
    expectPresentationOnly(mediaBefore, mediaAfter, { draw: true });
    expect(mediaAfter.card.counters.canvasSteps).toBeGreaterThan(mediaBefore.card.counters.canvasSteps);

    const canvasColors = await page.evaluate(() => {
        const frames = globalThis.__wave3dColorTrace.frames.filter((fills) => fills.length > 0);
        return frames.at(-1);
    });
    expect(canvasColors).toHaveLength(2);

    const cssBefore = await evidenceSnapshot(page);
    await callFixture(page, 'setRenderMode', 'css');
    const cssAfter = await evidenceSnapshot(page);
    expectPresentationOnly(cssBefore, cssAfter, { draw: true });
    const colorParity = await page.evaluate((actualCanvasColors) => {
        const step = globalThis.roomaboutsFixture.card.shadowRoot.querySelector('.roomabouts-step');
        const context = document.createElement('canvas').getContext('2d');
        const normalize = (value) => {
            context.fillStyle = '#010203';
            context.fillStyle = value;
            return context.fillStyle;
        };
        const cssColors = [
            getComputedStyle(step, '::before').backgroundColor,
            getComputedStyle(step, '::after').backgroundColor,
        ].map(normalize);
        const palette = globalThis.roomaboutsFixture.card.renderer._roomaboutsCanvasPalette();
        return {
            canvas: actualCanvasColors.map(normalize),
            css: cssColors,
            expected: [palette.stateObserved, palette.ink].map(normalize),
            forcedAdjustments: [step, step.parentElement].map(
                (element) => getComputedStyle(element).forcedColorAdjust,
            ),
        };
    }, canvasColors);
    expect(colorParity.canvas).toEqual(colorParity.expected);
    expect(colorParity.css).toEqual(colorParity.expected);
    expect(colorParity.forcedAdjustments.every((value) => value !== 'none')).toBe(true);

    await page.locator('#card-host').scrollIntoViewIfNeeded();
    const box = await page.locator('#card-host').boundingBox();
    const point = { x: box.x + box.width / 2, y: box.y + Math.min(box.height - 5, box.height / 2) };
    expect(await page.evaluate(({ x, y }) => {
        const target = document.elementFromPoint(x, y);
        const host = document.getElementById('card-host');
        return target === host || target === host.querySelector('radar-map-card') || host.contains(target);
    }, point)).toBe(true);
    const wheelBefore = await evidenceSnapshot(page);
    const scrollBefore = await page.evaluate(() => scrollY);
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, 320);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scrollBefore);
    const wheelAfter = await evidenceSnapshot(page);
    expectPresentationOnly(wheelBefore, wheelAfter);
    const probe = await page.evaluate(() => globalThis.__roomaboutsInputProbe);
    expect(probe.captures).toBe(0);
    expect(probe.events.some((event) => event.type === 'wheel')).toBe(true);
    expect(probe.events.every((event) => event.defaultPrevented === false)).toBe(true);
});

test('pageshow, visible resume, teardown, and remount clean up exactly once', async ({ page }) => {
    await openFixture(page);
    await seedFootprints(page);

    const expireByResume = async (eventName) => {
        const physicalBefore = await page.evaluate(() => globalThis.roomaboutsFixture.cardStats().store.recordCount);
        expect(physicalBefore).toBeGreaterThan(0);
        await callFixture(page, 'elapsePresentationClock', 6000);
        expect(await page.evaluate(() => globalThis.roomaboutsFixture.cardStats().store.recordCount)).toBe(physicalBefore);
        const before = await evidenceSnapshot(page);
        await page.evaluate((name) => {
            if (name === 'pageshow') {
                window.dispatchEvent(new Event('pageshow'));
                return;
            }
            const descriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
            Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
            document.dispatchEvent(new Event('visibilitychange'));
            if (descriptor) Object.defineProperty(document, 'visibilityState', descriptor);
            else delete document.visibilityState;
        }, eventName);
        await callFixture(page, 'waitForStable', before.card.counters.draw);
        const after = await evidenceSnapshot(page);
        expect(after.source).toEqual(before.source);
        for (const counter of [
            'adapterDisconnect', 'adapterIngest', 'adapterReset', 'storeDestroy', 'storeObserve', 'storeReset',
        ]) expect(after.card.counters[counter], counter).toBe(before.card.counters[counter]);
        expect(after.card.counters.storeExpire).toBe(before.card.counters.storeExpire + 1);
        expect(after.card.counters.draw).toBeGreaterThan(before.card.counters.draw);
        expect(after.card.store.recordCount).toBe(0);
        expect(after.records).toEqual([]);
        const handler = eventName === 'pageshow' ? 'pageshowHandler' : 'visibilityHandler';
        expect(after.card.counters[handler]).toBe(before.card.counters[handler] + 1);
    };

    await expireByResume('pageshow');
    await seedFootprints(page);
    await expireByResume('visibilitychange');
    await seedFootprints(page);

    const remountEvidence = await page.evaluate(async () => {
        const fixture = globalThis.roomaboutsFixture;
        const oldCard = fixture.card;
        const oldBefore = fixture.cardStats(oldCard);
        const sourceBefore = fixture.sourceStats();
        globalThis.__wave3dOldCard = oldCard;
        await fixture.mountCard();
        return {
            clock: fixture.clockStats(),
            newCard: fixture.cardStats(),
            newListeners: {
                media: fixture.card._roomaboutsMediaQueries.length,
                resume: fixture.card._roomaboutsResumeListenersAttached,
                subscribers: fixture.replay.state.subscriberCount,
            },
            oldAfter: fixture.cardStats(oldCard),
            oldBefore,
            oldRuntime: {
                cachedRecords: oldCard.renderer._roomaboutsTrailRecords.length,
                media: oldCard._roomaboutsMediaQueries.length,
                resume: oldCard._roomaboutsResumeListenersAttached,
                rootPresent: oldCard.shadowRoot.querySelector('.roomabouts-readonly') !== null,
                scene: oldCard.renderer._roomaboutsScene,
            },
            sourceAfter: fixture.sourceStats(),
            sourceBefore,
        };
    });
    expect(remountEvidence.sourceAfter).toEqual({
        subscriptions: remountEvidence.sourceBefore.subscriptions + 1,
        unsubscriptions: remountEvidence.sourceBefore.unsubscriptions + 1,
        emissions: remountEvidence.sourceBefore.emissions + 1,
        deliveries: remountEvidence.sourceBefore.deliveries + 1,
    });
    expect(remountEvidence.oldAfter.counters.storeDestroy)
        .toBe(remountEvidence.oldBefore.counters.storeDestroy + 1);
    expect(remountEvidence.oldAfter.store).toMatchObject({ destroyed: true, recordCount: 0, timerScheduled: false });
    expect(remountEvidence.oldRuntime).toEqual({
        cachedRecords: 0,
        media: 0,
        resume: false,
        rootPresent: false,
        scene: null,
    });
    expect(remountEvidence.newListeners).toEqual({ media: 1, resume: true, subscribers: 1 });
    expect(remountEvidence.clock.pendingCount).toBe(0);

    const postBaseline = await page.evaluate(() => ({
        newCard: globalThis.roomaboutsFixture.cardStats(),
        oldCard: globalThis.roomaboutsFixture.cardStats(globalThis.__wave3dOldCard),
        source: globalThis.roomaboutsFixture.sourceStats(),
    }));
    await page.evaluate(() => {
        const host = document.getElementById('card-host');
        host.style.width = '500px';
        window.dispatchEvent(new Event('resize'));
    });
    await expect.poll(() => page.evaluate(() => globalThis.roomaboutsFixture.cardStats().counters.queue))
        .toBeGreaterThan(postBaseline.newCard.counters.queue);
    await callFixture(page, 'waitForStable', postBaseline.newCard.counters.draw);
    const afterResize = await page.evaluate(() => globalThis.roomaboutsFixture.cardStats());
    expect(afterResize.counters.draw).toBeGreaterThan(postBaseline.newCard.counters.draw);

    const mediaBefore = afterResize.counters;
    await page.emulateMedia({ forcedColors: 'active' });
    await expect.poll(() => page.evaluate(() => globalThis.roomaboutsFixture.cardStats().counters.mediaHandler))
        .toBe(mediaBefore.mediaHandler + 1);
    await callFixture(page, 'waitForStable', mediaBefore.draw);
    const resumeBefore = await page.evaluate(() => globalThis.roomaboutsFixture.cardStats().counters);
    await page.evaluate(() => {
        window.dispatchEvent(new Event('pageshow'));
        const descriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
        if (descriptor) Object.defineProperty(document, 'visibilityState', descriptor);
        else delete document.visibilityState;
    });
    await callFixture(page, 'waitForStable', resumeBefore.draw);
    const postActions = await page.evaluate(() => ({
        newCard: globalThis.roomaboutsFixture.cardStats(),
        oldCard: globalThis.roomaboutsFixture.cardStats(globalThis.__wave3dOldCard),
        source: globalThis.roomaboutsFixture.sourceStats(),
    }));
    expect(postActions.source).toEqual(postBaseline.source);
    expect(postActions.oldCard).toEqual(postBaseline.oldCard);
    expect(postActions.newCard.counters.pageshowHandler).toBe(resumeBefore.pageshowHandler + 1);
    expect(postActions.newCard.counters.visibilityHandler).toBe(resumeBefore.visibilityHandler + 1);
    expect(postActions.newCard.counters.storeExpire).toBe(resumeBefore.storeExpire + 2);
    for (const counter of [
        'adapterDisconnect', 'adapterIngest', 'adapterReset', 'storeDestroy', 'storeObserve', 'storeReset',
    ]) {
        expect(postActions.newCard.counters[counter], counter)
            .toBe(postBaseline.newCard.counters[counter]);
    }
});

test.describe('phone touch input', () => {
    test.use({
        hasTouch: true,
        isMobile: true,
        viewport: { width: 390, height: 844 },
    });

    test('a touch drag over live footprints scrolls without capture, prevention, or resampling', async ({
        context,
        page,
    }) => {
        await openFixture(page);
        await seedFootprints(page);
        await addScrollRange(page);
        await installInputProbe(page);
        await page.locator('#card-host').scrollIntoViewIfNeeded();
        const box = await page.locator('#card-host').boundingBox();
        const x = box.x + box.width / 2;
        const startY = box.y + Math.min(box.height - 20, box.height * 0.75);
        const beforeScroll = await page.evaluate(() => scrollY);
        expect(await page.evaluate(({ x: clientX, y: clientY }) => {
            const target = document.elementFromPoint(clientX, clientY);
            const host = document.getElementById('card-host');
            return target === host || target === host.querySelector('radar-map-card') || host.contains(target);
        }, { x, y: startY })).toBe(true);
        const before = await evidenceSnapshot(page);
        const session = await context.newCDPSession(page);
        await session.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ x, y: startY, radiusX: 2, radiusY: 2, force: 1, id: 1 }],
        });
        for (const delta of [45, 90, 135]) {
            await session.send('Input.dispatchTouchEvent', {
                type: 'touchMove',
                touchPoints: [{ x, y: startY - delta, radiusX: 2, radiusY: 2, force: 1, id: 1 }],
            });
        }
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(beforeScroll);
        const after = await evidenceSnapshot(page);
        expectPresentationOnly(before, after);
        const probe = await page.evaluate(() => globalThis.__roomaboutsInputProbe);
        expect(probe.captures).toBe(0);
        expect(probe.events.some((event) => event.type === 'touchstart' && event.overCard)).toBe(true);
        expect(probe.events.some((event) => event.type === 'touchmove')).toBe(true);
        expect(probe.events.every((event) => event.defaultPrevented === false)).toBe(true);
    });
});
