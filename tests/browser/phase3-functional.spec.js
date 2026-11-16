import {
    expect,
    test,
} from './roomabouts-test.js';

const HOSTILE_REGION_NAMES = [
    '<img src=x onerror="roomaboutsCanary()">',
    '<svg><image href="/tests/browser/canary-zone.svg"></image></svg>',
    '"><a href="/tests/browser/canary-link">region</a>',
    '<script>roomaboutsCanary()</script>',
];

const HOSTILE_CONFIG = Object.freeze({
    type: 'custom:radar-map-card',
    map_group: 'default',
    read_only: true,
    style: 'background:U\\72L(/tests/browser/canary-config.png); color:#00ff00',
    bg_image: 'https://canary.invalid/roomabouts.png',
    fused_color: '#00FF00',
    show_heading: true,
    show_labels: true,
    show_trails: true,
    zone_color: '#FF00FF',
    target_color: '#00FFFF',
    radar_color: '#FFFF00',
    '--roomabouts-surface-paper': '#00FF00',
});

async function openFixture(page) {
    await page.goto('/tests/browser/fixture.html');
    await page.evaluate(() => globalThis.roomaboutsFixture.ready);
    await expect(page.locator('#status')).toContainText('subscribers=1');
}

async function callFixture(page, method, ...args) {
    return page.evaluate(async ({ method: methodName, args: methodArgs }) => {
        const fixture = globalThis.roomaboutsFixture;
        return fixture[methodName](...methodArgs);
    }, { method, args });
}

function cardLocator(page, selector) {
    return page.locator(`radar-map-card ${selector}`);
}

function expectBoundedRegionLabels(layout, expectedTexts) {
    expect(layout.labels.map((label) => label.text)).toEqual(expectedTexts);
    for (const label of layout.labels) {
        expect(label.width).toBeGreaterThan(0);
        expect(label.height).toBeGreaterThan(0);
        expect(label.width).toBeLessThanOrEqual(Math.min(320, layout.root.width * 0.5) + 1);
        expect(label.left).toBeGreaterThanOrEqual(layout.root.left - 1);
        expect(label.top).toBeGreaterThanOrEqual(layout.root.top - 1);
        expect(label.right).toBeLessThanOrEqual(layout.root.right + 1);
        expect(label.bottom).toBeLessThanOrEqual(layout.root.bottom + 1);
        expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth + 1);
        expect(label.scrollHeight).toBeLessThanOrEqual(label.clientHeight + 1);
        expect(label.overflow).not.toBe('hidden');
        expect(label.textOverflow).not.toBe('ellipsis');
    }
}

test('Field Ledger renders configured regions, truthful track pairs, and separate station health', async ({
    page,
}) => {
    await openFixture(page);
    await callFixture(page, 'selectScenario', 'six-state-composite');

    const root = cardLocator(page, '.roomabouts-readonly');
    await expect(root).toHaveCount(1);
    await expect(cardLocator(page, '.roomabouts-track')).toHaveCount(6);
    await expect(cardLocator(page, '.roomabouts-station')).toHaveCount(2);
    await expect(cardLocator(page, '.roomabouts-zone')).toHaveCount(4);

    const pairs = await cardLocator(page, '.roomabouts-track').evaluateAll((items) => items.map((item) => [
        item.dataset.lifecycle,
        item.dataset.positionBasis,
    ]));
    expect(pairs).toEqual([
        ['tentative', 'observed'],
        ['confirmed', 'observed'],
        ['confirmed', 'interpolated'],
        ['coasting', 'held'],
        ['coasting', 'interpolated'],
        ['fading', 'last-seen'],
    ]);

    const stationStatuses = await cardLocator(page, '.roomabouts-station').evaluateAll((items) => (
        items.map((item) => item.dataset.sourceStatus)
    ));
    expect(stationStatuses).toEqual(['online', 'offline']);
    await expect(cardLocator(page, '.roomabouts-track[data-lifecycle="offline"]')).toHaveCount(0);

    for (const kind of ['include', 'exclude', 'entrance', 'stationary']) {
        await expect(cardLocator(page, `.roomabouts-zone[data-region-kind="${kind}"]`)).toHaveCount(1);
    }
    expect(await cardLocator(page, '.roomabouts-zone-hatch-line').count()).toBeGreaterThan(0);
    expect(await cardLocator(page, '.roomabouts-zone-stipple-mark').count()).toBeGreaterThan(0);

    const labelLayout = await page.evaluate(() => {
        const shadow = globalThis.roomaboutsFixture.card.shadowRoot;
        const rootRect = shadow.querySelector('.roomabouts-readonly').getBoundingClientRect();
        return {
            root: {
                left: rootRect.left,
                top: rootRect.top,
                right: rootRect.right,
                bottom: rootRect.bottom,
                width: rootRect.width,
            },
            labels: [...shadow.querySelectorAll('.roomabouts-zone-label')].map((label) => {
                const rect = label.getBoundingClientRect();
                const style = getComputedStyle(label);
                return {
                    text: label.textContent,
                    left: rect.left,
                    top: rect.top,
                    right: rect.right,
                    bottom: rect.bottom,
                    width: rect.width,
                    height: rect.height,
                    clientHeight: label.clientHeight,
                    clientWidth: label.clientWidth,
                    overflow: style.overflow,
                    scrollHeight: label.scrollHeight,
                    scrollWidth: label.scrollWidth,
                    textOverflow: style.textOverflow,
                };
            }),
        };
    });
    expectBoundedRegionLabels(labelLayout, [
        'Included survey region',
        'Excluded survey region',
        'Entrance survey region',
        'Stationary survey region',
    ]);

    const isolation = await page.evaluate(() => {
        const shadow = globalThis.roomaboutsFixture.card.shadowRoot;
        const hidden = ['#fall-alert-banner', '#ws-status-dot', '#btn-toggle-mode', '#edit-ui']
            .map((selector) => shadow.querySelector(selector))
            .filter(Boolean)
            .every((item) => getComputedStyle(item).display === 'none');
        const fieldText = [
            shadow.querySelector('.roomabouts-visual-layer')?.textContent || '',
            shadow.querySelector('#roomabouts-semantic-layer')?.textContent || '',
        ].join(' ');
        return {
            fieldText,
            hidden,
            oldDots: shadow.querySelectorAll('.dot, .trail-dot, .heading-arrow').length,
            visualAriaHidden: shadow.querySelector('.roomabouts-visual-layer')?.getAttribute('aria-hidden'),
        };
    });
    expect(isolation.hidden).toBe(true);
    expect(isolation.oldDots).toBe(0);
    expect(isolation.visualAriaHidden).toBe('true');
    expect(isolation.fieldText).not.toMatch(/source-[0-9a-f]|track-[0-9a-f]/i);
    expect(isolation.fieldText).not.toMatch(/fall alert|alarm|emergency|[🚨⚠✨🪄🔮]/iu);
});

test('all-sources-offline remains station state without fabricating tracks', async ({ page }) => {
    await openFixture(page);
    await callFixture(page, 'selectScenario', 'all-sources-offline');

    await expect(cardLocator(page, '.roomabouts-track')).toHaveCount(0);
    await expect(cardLocator(page, '.roomabouts-station')).toHaveCount(2);
    await expect(cardLocator(page, '.roomabouts-station[data-source-status="offline"]')).toHaveCount(2);
    const labels = await cardLocator(page, '.roomabouts-station-label').allTextContents();
    expect(labels).toHaveLength(2);
    expect(labels.every((label) => label.includes('Offline'))).toBe(true);
});

test('hostile config and region names remain inert in both render modes', async ({
    page,
    roomaboutsNetworkBoundary,
}) => {
    const canaryRequests = [];
    page.on('request', (request) => {
        if (/canary|example\.invalid/i.test(request.url())) canaryRequests.push(request.url());
    });
    await page.addInitScript(() => {
        globalThis.__roomaboutsCanaryCalls = 0;
        globalThis.roomaboutsCanary = () => {
            globalThis.__roomaboutsCanaryCalls += 1;
        };
    });
    await openFixture(page);
    await callFixture(page, 'selectScenario', 'hostile-literals');

    let hostileSemanticBaseline = null;
    for (const mode of ['css', 'canvas']) {
        await callFixture(page, 'mountCard', { ...HOSTILE_CONFIG, target_render_mode: mode });
        await expect(cardLocator(page, '.roomabouts-readonly')).toHaveCount(1);
        const result = await page.evaluate((expectedNames) => {
            const card = globalThis.roomaboutsFixture.card;
            const shadow = card.shadowRoot;
            const labels = [...shadow.querySelectorAll('.roomabouts-zone-label')];
            const semanticItems = [...shadow.querySelectorAll('#roomabouts-semantic-layer [role="listitem"]')];
            const root = shadow.querySelector('.roomabouts-readonly');
            const canvas = shadow.querySelector('#rmm-canvas');
            const inspected = [
                ...shadow.querySelectorAll('.roomabouts-visual-layer *'),
                ...shadow.querySelectorAll('#roomabouts-semantic-layer *'),
            ];
            const fieldText = [
                shadow.querySelector('.roomabouts-visual-layer')?.textContent || '',
                shadow.querySelector('#roomabouts-semantic-layer')?.textContent || '',
            ].join(' ');
            return {
                canaryCalls: globalThis.__roomaboutsCanaryCalls,
                config: card.config,
                configKeys: Object.keys(card.config).sort(),
                fieldText,
                injectedNodes: shadow.querySelectorAll(
                    '.roomabouts-visual-layer img, '
                    + '.roomabouts-visual-layer svg, '
                    + '.roomabouts-visual-layer image, '
                    + '.roomabouts-visual-layer foreignObject, '
                    + '.roomabouts-visual-layer script, '
                    + '.roomabouts-visual-layer a, '
                    + '#roomabouts-semantic-layer img, '
                    + '#roomabouts-semantic-layer svg, '
                    + '#roomabouts-semantic-layer image, '
                    + '#roomabouts-semantic-layer foreignObject, '
                    + '#roomabouts-semantic-layer script, '
                    + '#roomabouts-semantic-layer a',
                ).length,
                inheritedVisuals: shadow.querySelectorAll(
                    '.dot, .trail-dot, .heading-arrow, #fall-alert-banner, #ws-status-dot, #edit-ui',
                ).length,
                labelChildren: labels.map((label) => label.children.length),
                labelTexts: labels.map((label) => label.textContent),
                labelLayout: (() => {
                    const rootRect = root.getBoundingClientRect();
                    return {
                        root: {
                            left: rootRect.left,
                            top: rootRect.top,
                            right: rootRect.right,
                            bottom: rootRect.bottom,
                            width: rootRect.width,
                        },
                        labels: labels.map((label) => {
                            const rect = label.getBoundingClientRect();
                            const style = getComputedStyle(label);
                            return {
                                text: label.textContent,
                                left: rect.left,
                                top: rect.top,
                                right: rect.right,
                                bottom: rect.bottom,
                                width: rect.width,
                                height: rect.height,
                                clientHeight: label.clientHeight,
                                clientWidth: label.clientWidth,
                                overflow: style.overflow,
                                scrollHeight: label.scrollHeight,
                                scrollWidth: label.scrollWidth,
                                textOverflow: style.textOverflow,
                            };
                        }),
                    };
                })(),
                paperToken: getComputedStyle(root).getPropertyValue('--roomabouts-surface-paper').trim(),
                rootBackground: getComputedStyle(root).backgroundImage,
                namesPresent: expectedNames.every((name) => labels.some((label) => label.textContent === name)),
                semanticChildren: semanticItems.map((item) => item.children.length),
                semanticNamesPresent: expectedNames.every((name) => (
                    semanticItems.some((item) => item.textContent.includes(name))
                )),
                semanticTexts: semanticItems.map((item) => item.textContent),
                eventAttributes: inspected.flatMap((element) => (
                    [...element.attributes].map((attribute) => attribute.name)
                )).filter((name) => /^on/i.test(name)),
                visualEffects: inspected
                    .filter((element) => element.matches(
                        '.roomabouts-zone-label, .roomabouts-station, .roomabouts-track, .roomabouts-step',
                    ))
                    .map((element) => {
                        const style = getComputedStyle(element);
                        return [style.animationName, style.filter, style.textShadow];
                    }),
                canvasDisplay: getComputedStyle(canvas).display,
                domTrackCount: shadow.querySelectorAll('.roomabouts-track').length,
                domStepCount: shadow.querySelectorAll('.roomabouts-step').length,
            };
        }, HOSTILE_REGION_NAMES);

        expect(result.configKeys).toEqual(['map_group', 'read_only', 'target_render_mode', 'type']);
        expect(result.config).toEqual({
            type: 'custom:radar-map-card',
            map_group: 'default',
            target_render_mode: mode,
            read_only: true,
        });
        expect(result.paperToken).toBe('#E7DDC5');
        expect(result.rootBackground).not.toMatch(/canary|url\s*\(/i);
        expect(result.namesPresent).toBe(true);
        expect(result.semanticNamesPresent).toBe(true);
        expectBoundedRegionLabels(result.labelLayout, HOSTILE_REGION_NAMES);
        expect(result.labelChildren.every((count) => count === 0)).toBe(true);
        expect(result.semanticChildren.every((count) => count === 0)).toBe(true);
        expect(result.injectedNodes).toBe(0);
        expect(result.inheritedVisuals).toBe(0);
        expect(result.eventAttributes).toEqual([]);
        expect(result.visualEffects.every(([animation, filter, textShadow]) => (
            animation === 'none' && filter === 'none' && textShadow === 'none'
        ))).toBe(true);
        expect(result.canaryCalls).toBe(0);
        if (hostileSemanticBaseline === null) hostileSemanticBaseline = result.semanticTexts;
        else expect(result.semanticTexts).toEqual(hostileSemanticBaseline);
        if (mode === 'css') {
            expect(result.fieldText).toContain('Suspected posture');
            expect(result.canvasDisplay).toBe('none');
            expect(result.domTrackCount).toBe(1);
        } else {
            expect(result.canvasDisplay).toBe('block');
            expect(result.domTrackCount).toBe(0);
            expect(result.domStepCount).toBe(0);
        }
        expect(result.fieldText).not.toMatch(/fall alert|alarm|emergency|[🚨⚠✨🪄🔮]/iu);
    }

    expect(canaryRequests).toEqual([]);
    expect(roomaboutsNetworkBoundary).toEqual([]);
});

test('only observed movement emits steps and every lifecycle boundary cleans them', async ({ page }) => {
    await openFixture(page);
    await callFixture(page, 'selectScenario', 'walk-and-fade');
    await expect(cardLocator(page, '.roomabouts-step')).toHaveCount(0);

    await callFixture(page, 'step');
    await expect(cardLocator(page, '.roomabouts-step')).toHaveCount(0);
    const acceptedOrder = await page.evaluate(() => {
        const card = globalThis.roomaboutsFixture.card;
        const events = [];
        const store = card._roomaboutsTrailStore;
        const originalObserve = store.observeAccepted.bind(store);
        const originalAccept = card.renderer.acceptRoomaboutsPresentation.bind(card.renderer);
        const originalDraw = card.renderer.draw.bind(card.renderer);
        store.observeAccepted = (...args) => {
            events.push('observe:start');
            const value = originalObserve(...args);
            events.push('observe:end');
            return value;
        };
        card.renderer.acceptRoomaboutsPresentation = (...args) => {
            events.push('accept');
            return originalAccept(...args);
        };
        card.renderer.draw = (...args) => {
            events.push('draw');
            return originalDraw(...args);
        };
        try {
            globalThis.roomaboutsFixture.replay.step();
        } finally {
            store.observeAccepted = originalObserve;
            card.renderer.acceptRoomaboutsPresentation = originalAccept;
            card.renderer.draw = originalDraw;
        }
        return events;
    });
    expect(acceptedOrder).toEqual(['observe:start', 'observe:end', 'accept', 'draw']);
    await callFixture(page, 'waitForStable');
    const observedStepCount = await cardLocator(page, '.roomabouts-step').count();
    expect(observedStepCount).toBeGreaterThan(0);

    const stepsBeforeModeSwitch = await cardLocator(page, '.roomabouts-step').evaluateAll((steps) => (
        steps.map((step) => ({
            side: step.dataset.side,
            left: step.style.left,
            top: step.style.top,
            transform: step.style.transform,
        }))
    ));
    const semanticsBeforeModeSwitch = await cardLocator(page, '#roomabouts-semantic-layer [role="listitem"]').allTextContents();
    await callFixture(page, 'setRenderMode', 'canvas');
    const canvasEvidence = await page.evaluate(() => {
        const shadow = globalThis.roomaboutsFixture.card.shadowRoot;
        const canvas = shadow.querySelector('#rmm-canvas');
        const rect = canvas.getBoundingClientRect();
        const context = canvas.getContext('2d');
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let hasNontransparentPixel = false;
        for (let index = 3; index < pixels.length; index += 4) {
            if (pixels[index] !== 0) {
                hasNontransparentPixel = true;
                break;
            }
        }
        return {
            display: getComputedStyle(canvas).display,
            width: rect.width,
            height: rect.height,
            hasNontransparentPixel,
            domTracks: shadow.querySelectorAll('.roomabouts-track').length,
            domSteps: shadow.querySelectorAll('.roomabouts-step').length,
            semantics: [...shadow.querySelectorAll('#roomabouts-semantic-layer [role="listitem"]')]
                .map((item) => item.textContent),
        };
    });
    expect(canvasEvidence.display).toBe('block');
    expect(canvasEvidence.width).toBeGreaterThan(0);
    expect(canvasEvidence.height).toBeGreaterThan(0);
    expect(canvasEvidence.hasNontransparentPixel).toBe(true);
    expect(canvasEvidence.domTracks).toBe(0);
    expect(canvasEvidence.domSteps).toBe(0);
    expect(canvasEvidence.semantics).toEqual(semanticsBeforeModeSwitch);
    await callFixture(page, 'setRenderMode', 'css');
    await expect(cardLocator(page, '.roomabouts-step')).toHaveCount(observedStepCount);
    const stepsAfterModeSwitch = await cardLocator(page, '.roomabouts-step').evaluateAll((steps) => (
        steps.map((step) => ({
            side: step.dataset.side,
            left: step.style.left,
            top: step.style.top,
            transform: step.style.transform,
        }))
    ));
    expect(stepsAfterModeSwitch).toEqual(stepsBeforeModeSwitch);

    await callFixture(page, 'step');
    await expect(cardLocator(page, '.roomabouts-step')).toHaveCount(observedStepCount);
    await callFixture(page, 'step');
    await expect(cardLocator(page, '.roomabouts-step')).toHaveCount(observedStepCount);

    const immediateFinalEmpty = await page.evaluate(() => {
        globalThis.roomaboutsFixture.replay.step();
        const card = globalThis.roomaboutsFixture.card;
        const shadow = card.shadowRoot;
        return {
            cachedTrails: card.renderer._roomaboutsTrailRecords.length,
            sceneTracks: card.renderer._roomaboutsScene?.tracks.length,
            steps: shadow.querySelectorAll('.roomabouts-step').length,
            tracks: shadow.querySelectorAll('.roomabouts-track').length,
        };
    });
    expect(immediateFinalEmpty).toEqual({
        cachedTrails: 0,
        sceneTracks: 0,
        steps: 0,
        tracks: 0,
    });
    await callFixture(page, 'waitForStable');

    await callFixture(page, 'selectScenario', 'generation-reset');
    await callFixture(page, 'step');
    expect(await cardLocator(page, '.roomabouts-step').count()).toBeGreaterThan(0);
    await callFixture(page, 'step');
    await expect(cardLocator(page, '.roomabouts-step')).toHaveCount(0);

    await callFixture(page, 'selectScenario', 'walk-and-fade');
    await callFixture(page, 'step');
    await callFixture(page, 'step');
    expect(await cardLocator(page, '.roomabouts-step').count()).toBeGreaterThan(0);
    await callFixture(page, 'disconnect');
    await expect(cardLocator(page, '.roomabouts-step')).toHaveCount(0);
    await expect(page.locator('#status')).toContainText('subscribers=0');

    await callFixture(page, 'reconnect');
    await expect(cardLocator(page, '.roomabouts-step')).toHaveCount(0);
    await expect(page.locator('#status')).toContainText('subscribers=1');

    await callFixture(page, 'mountCard');
    await expect(cardLocator(page, '.roomabouts-step')).toHaveCount(0);
    await expect(page.locator('#status')).toContainText('subscribers=1');
});

test('stream subscription requires a mounted configured card in either setup order', async ({ page }) => {
    await openFixture(page);
    const result = await page.evaluate(async () => {
        const config = globalThis.roomaboutsFixture.defaultCardConfig;

        let orphanSubscribeCalls = 0;
        const orphan = document.createElement('radar-map-card');
        orphan.setConfig(config);
        orphan.hass = {
            connection: {
                connected: true,
                subscribeMessage() {
                    orphanSubscribeCalls += 1;
                    return Promise.resolve(() => {});
                },
            },
            language: 'en',
            states: {},
        };
        await Promise.resolve();

        globalThis.roomaboutsFixture.card.remove();
        await Promise.resolve();
        let orderedSubscribeCalls = 0;
        let orderedUnsubscribeCalls = 0;
        const ordered = document.createElement('radar-map-card');
        document.getElementById('card-host').replaceChildren(ordered);
        ordered.hass = {
            connection: {
                connected: true,
                subscribeMessage() {
                    orderedSubscribeCalls += 1;
                    return Promise.resolve(() => {
                        orderedUnsubscribeCalls += 1;
                    });
                },
            },
            language: 'en',
            states: {},
        };
        await Promise.resolve();
        const beforeConfig = orderedSubscribeCalls;
        ordered.setConfig(config);
        await Promise.resolve();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const afterConfig = orderedSubscribeCalls;
        ordered.remove();
        await Promise.resolve();

        return {
            orphanConnected: orphan.isConnected,
            orphanPresentation: orphan._roomaboutsPresentation,
            orphanSubscribeCalls,
            beforeConfig,
            afterConfig,
            orderedUnsubscribeCalls,
        };
    });

    expect(result).toEqual({
        orphanConnected: false,
        orphanPresentation: null,
        orphanSubscribeCalls: 0,
        beforeConfig: 0,
        afterConfig: 1,
        orderedUnsubscribeCalls: 1,
    });
});
