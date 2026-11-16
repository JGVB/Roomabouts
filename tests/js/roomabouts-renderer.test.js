import {
    ROOMABOUTS_SEMANTIC_LIMIT,
    RadarRenderer,
    buildRoomaboutsRenderScene,
    classifyRoomaboutsRegion,
    classifyRoomaboutsTrack,
} from '../../custom_components/radar_map_manager/www/radar-renderer.js';

const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const assertEquals = (actual, expected, message) => {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    assert(actualJson === expectedJson, `${message}: expected ${expectedJson}, got ${actualJson}`);
};

const makeZoneGroups = () => ({
    include_zones: [],
    exclude_zones: [],
    entrance_zones: [],
    stationary_zones: [],
});

const makePresentation = ({ zones, radars = [], tracks = [], sourceHealth = [] } = {}) => ({
    accepted: true,
    generationId: 'generation-a',
    sequence: 0,
    map: {
        mapId: 'default',
        config: { target_render_mode: 'canvas', fused_color: '#FF00FF' },
        zones: zones || makeZoneGroups(),
        radars,
    },
    tracks,
    sourceHealth,
});

const makeTrack = (lifecycle, positionBasis, overrides = {}) => ({
    trackId: 'track-private',
    position: { x: 50, y: 40, coordinateSpace: 'map-layout' },
    lifecycle,
    positionBasis,
    anonymousAlias: 'Wayfarer-a1b2c3',
    sourceRefs: ['source-private:slot-private'],
    observedAt: 10,
    lastObservedAgeMs: 0,
    emitFootprint: lifecycle === 'confirmed' && positionBasis === 'observed',
    ...overrides,
});

Deno.test('configured-region geometry fails closed without mutating source points', () => {
    const sparse = [];
    sparse.length = 3;
    sparse[0] = [0, 0];
    sparse[2] = [10, 0];
    for (const points of [
        null,
        [],
        sparse,
        [[0, 0], [1, 1]],
        [[0, 0], [10, 10], [20, 20]],
        [[0, 0], [10, Number.NaN], [20, 0]],
        [[0, 0], [10], [20, 0]],
    ]) {
        assertEquals(classifyRoomaboutsRegion(points), null, 'invalid polygon');
    }

    const points = [[10, 10], [90, 10], [90, 90], [10, 90]];
    const before = JSON.stringify(points);
    const region = classifyRoomaboutsRegion(points);
    assertEquals(region.status, 'inside', 'inside classification');
    assertEquals(region.labelPoint, [50, 50], 'inside centroid');
    assertEquals(JSON.stringify(points), before, 'source geometry remains untouched');
    assert(region.points !== points && region.points[0] !== points[0], 'geometry is detached');
    assert(Object.isFrozen(region) && Object.isFrozen(region.points), 'classification is immutable');

    const tiny = classifyRoomaboutsRegion([[0, 0], [1e-12, 0], [0, 1e-12]]);
    assert(tiny !== null && tiny.status === 'inside', 'finite nonzero area is not treated as degenerate');
});

Deno.test('field clipping classifies partial, outside, surrounding, and boundary polygons', () => {
    const partial = classifyRoomaboutsRegion([[-10, 20], [40, 20], [40, 80], [-10, 80]]);
    assertEquals(partial.status, 'partially-clipped', 'partially clipped polygon');
    assert(partial.clippedPoints.every(([x, y]) => x >= 0 && x <= 100 && y >= 0 && y <= 100), 'clip bounds');
    assert(partial.labelPoint !== null, 'visible partial polygon has a label point');

    const outside = classifyRoomaboutsRegion([[120, 20], [140, 20], [140, 40], [120, 40]]);
    assertEquals(outside.status, 'outside', 'fully outside polygon');
    assertEquals(outside.clippedPoints, [], 'outside intersection is empty');
    assertEquals(outside.labelPoint, null, 'outside polygon has no in-field label');

    const surrounding = classifyRoomaboutsRegion([[-10, -10], [110, -10], [110, 110], [-10, 110]]);
    assertEquals(surrounding.status, 'partially-clipped', 'surrounding polygon is clipped');
    assertEquals(surrounding.labelPoint, [50, 50], 'surrounding centroid');

    const boundary = classifyRoomaboutsRegion([[0, 0], [100, 0], [100, 100], [0, 100]]);
    assertEquals(boundary.status, 'inside', 'closed field boundary is inside');

    const concave = classifyRoomaboutsRegion([
        [0, 0], [100, 0], [100, 100], [70, 100],
        [70, 30], [30, 30], [30, 100], [0, 100],
    ]);
    assertEquals(concave.labelPoint, null, 'centroid outside a concave intersection is omitted');
});

Deno.test('excluded hatch and stationary stipple are deterministic, bounded, and URL-free', () => {
    const zones = makeZoneGroups();
    zones.exclude_zones.push({ name: 'Excluded', points: [[5, 5], [95, 5], [95, 95], [5, 95]] });
    zones.stationary_zones.push({ name: 'Stationary', points: [[10, 10], [90, 10], [90, 90], [10, 90]] });
    const first = buildRoomaboutsRenderScene(makePresentation({ zones }));
    const second = buildRoomaboutsRenderScene(makePresentation({ zones }));
    assertEquals(first.regions, second.regions, 'procedural marks are deterministic');
    assert(first.regions[0].hatchSegments.length > 0, 'excluded hatch segments');
    assert(first.regions[0].hatchSegments.length <= 32, 'hatch cap');
    assert(first.regions[1].stipplePoints.length > 0, 'stationary stipple points');
    assert(first.regions[1].stipplePoints.length <= 64, 'stipple cap');
    assert(!JSON.stringify(first.regions).toLowerCase().includes('url('), 'no URL-bearing geometry');

    const smallZones = makeZoneGroups();
    smallZones.exclude_zones.push({ points: [[5, 5], [10, 5], [10, 10], [5, 10]] });
    smallZones.stationary_zones.push({ points: [[13, 5], [18, 5], [18, 10], [13, 10]] });
    const small = buildRoomaboutsRenderScene(makePresentation({ zones: smallZones }));
    assert(small.regions[0].hatchSegments.length > 0, 'small visible exclusion keeps a hatch');
    assert(small.regions[1].stipplePoints.length > 0, 'small visible stationary region keeps a stipple');
});

Deno.test('all six track fact pairs have exact truthful wording', () => {
    const cases = [
        ['confirmed', 'observed', 'Observed'],
        ['tentative', 'observed', 'Unconfirmed'],
        ['confirmed', 'interpolated', 'Estimated — not directly observed'],
        ['coasting', 'held', 'Held — not currently observed'],
        ['coasting', 'interpolated', 'Estimated — not currently observed'],
        ['fading', 'last-seen', 'Last seen — not current'],
    ];
    for (const [lifecycle, basis, wording] of cases) {
        const result = classifyRoomaboutsTrack(makeTrack(lifecycle, basis));
        assertEquals(result.stateText, wording, `${lifecycle}/${basis}`);
    }
    assertEquals(classifyRoomaboutsTrack(makeTrack('offline', 'observed')), null, 'offline is not a track lifecycle');
    assertEquals(classifyRoomaboutsTrack(makeTrack('fading', 'observed')), null, 'invalid lifecycle pairing');
});

Deno.test('posture, uncertainty, and outside-field wording remain bounded and orthogonal', () => {
    const scene = buildRoomaboutsRenderScene(makePresentation({
        tracks: [makeTrack('tentative', 'observed', {
            position: { x: 120, y: 50, coordinateSpace: 'map-layout' },
            uncertainty: ['source-unverified', 'source-not-currently-observed', 'unknown-value'],
            posture: 'suspected_fall',
        })],
    }));
    assertEquals(scene.tracks[0].postureText, 'Suspected posture', 'neutral posture wording');
    assertEquals(scene.tracks[0].uncertaintyText, ['Source unverified', 'Source not currently observed'], 'bounded uncertainty');
    assert(scene.tracks[0].outsideField, 'outside-field fact');
    const semantic = scene.tracks[0].semanticText;
    assert(semantic.includes('Unconfirmed'), 'lifecycle remains present');
    assert(semantic.includes('Position basis: observed'), 'position basis remains present');
    assert(semantic.includes('Outside field'), 'outside wording remains semantic');
    assert(!/alarm|emergency|🚨|⚠/iu.test(semantic), 'no alarm or emoji copy');
});

Deno.test('station join is anonymous, boundary-inclusive, and conservatively summarized', () => {
    const inheritedLayout = Object.create({ origin_x: 50, origin_y: 50 });
    const radars = [
        { sensorId: 'source-a', paused: false, layout: { origin_x: 0, origin_y: 100 } },
        { sensorId: 'source-b', paused: true, layout: { origin_x: 100.000001, origin_y: 50 } },
        { sensorId: 'source-c', paused: false, layout: { origin_x: 50 } },
        { sensorId: 'source-d', paused: true, layout: { origin_x: 25, origin_y: 25 } },
        { sensorId: 'source-e', paused: false, layout: inheritedLayout },
    ];
    const sourceHealth = [
        { sensorId: 'source-a', status: 'online', reason: 'available' },
        { sensorId: 'source-b', status: 'degraded', reason: 'partial-sample' },
        { sensorId: 'source-x', status: 'offline', reason: 'unavailable' },
    ];
    const scene = buildRoomaboutsRenderScene(makePresentation({ radars, sourceHealth }));
    assertEquals(scene.stations.map((station) => [station.label, station.status, station.stateText]), [
        ['Station 1', 'online', 'Online'],
        ['Station 4', 'unknown', 'Paused — Health unknown'],
    ], 'placed stations use radar order and exact status');
    assertEquals(
        scene.sourceSummary,
        'Unplaced or off-field stations: 3; Unmatched source health: 1',
        'combined source summary',
    );
    assertEquals(scene.stations[0].semanticText, 'Station 1: Survey station — Online', 'station wording');
    const serialized = JSON.stringify(scene);
    for (const opaque of ['source-a', 'source-b', 'source-c', 'source-d', 'source-x']) {
        assert(!serialized.includes(opaque), `scene must not expose ${opaque}`);
    }
});

Deno.test('station health shapes and paused qualifiers remain separate from track state', () => {
    const radars = ['online', 'degraded', 'offline', 'missing'].map((name, index) => ({
        sensorId: `source-${name}`,
        paused: true,
        layout: { origin_x: 10 + index * 20, origin_y: 50 },
    }));
    const sourceHealth = ['online', 'degraded', 'offline'].map((status) => ({
        sensorId: `source-${status}`,
        status,
        reason: 'available',
    }));
    const scene = buildRoomaboutsRenderScene(makePresentation({ radars, sourceHealth }));
    assertEquals(scene.stations.map(({ status, stateText }) => [status, stateText]), [
        ['online', 'Paused — Online'],
        ['degraded', 'Paused — Degraded'],
        ['offline', 'Paused — Offline'],
        ['unknown', 'Paused — Health unknown'],
    ], 'health and pause facts');
});

Deno.test('regions preserve hostile names as literal semantic text without interpreting markup', () => {
    const zones = makeZoneGroups();
    const hostile = '<img src=x onerror=alert(1)> url(https://invalid.example)';
    zones.include_zones.push({ name: hostile, points: [[10, 10], [20, 10], [20, 20], [10, 20]] });
    zones.exclude_zones.push({ points: [[120, 10], [130, 10], [130, 20], [120, 20]] });
    const scene = buildRoomaboutsRenderScene(makePresentation({ zones }));
    assertEquals(
        scene.regions[0].semanticText,
        `Included region: ${hostile} — Inside field`,
        'literal hostile name and exact status wording are preserved without array indices',
    );
    assertEquals(
        scene.regions[1].semanticText,
        'Excluded region — Outside field — not shown',
        'outside unnamed region remains semantic',
    );
});

Deno.test('semantic ordering and exact 705-item bound are deterministic', () => {
    assertEquals(ROOMABOUTS_SEMANTIC_LIMIT, 705, 'frozen semantic maximum');
    const zones = makeZoneGroups();
    for (const group of Object.keys(zones)) {
        for (let index = 0; index < 128; index += 1) {
            zones[group].push({
                name: `${group}-${index}`,
                points: [[10, 10], [20, 10], [20, 20], [10, 20]],
            });
        }
    }
    const radars = Array.from({ length: 64 }, (_, index) => ({
        sensorId: `source-${index}`,
        paused: false,
        layout: { origin_x: index, origin_y: 50 },
    }));
    const sourceHealth = Array.from({ length: 63 }, (_, index) => ({
        sensorId: `source-${index}`,
        status: 'online',
        reason: 'available',
    }));
    sourceHealth.push({ sensorId: 'source-unmatched', status: 'offline', reason: 'unavailable' });
    const tracks = Array.from({ length: 128 }, (_, index) => makeTrack('confirmed', 'observed', {
        trackId: `track-${index}`,
        anonymousAlias: `Wayfarer-${String(index).padStart(6, '0')}`,
    }));
    const scene = buildRoomaboutsRenderScene(makePresentation({ zones, radars, tracks, sourceHealth }));
    assertEquals(scene.semanticItems.length, 705, 'exact semantic maximum');
    assert(scene.semanticItems[0].startsWith('Included region'), 'regions are first');
    assert(scene.semanticItems[512].startsWith('Station 1'), 'stations follow regions');
    assert(scene.semanticItems[576].startsWith('Wayfarer-'), 'tracks follow stations');
    assert(scene.semanticItems[704].startsWith('Unmatched source health'), 'summary is last');

    const tooMany = makePresentation({ zones, radars, sourceHealth, tracks: [...tracks, makeTrack('confirmed', 'observed', {
        trackId: 'track-overflow',
        anonymousAlias: 'Wayfarer-ffffff',
    })] });
    assertEquals(buildRoomaboutsRenderScene(tooMany), null, 'overflow fails closed instead of truncating');
});

class FakeElement {
    constructor(tagName, ownerDocument) {
        this.tagName = tagName;
        this.ownerDocument = ownerDocument;
        this.children = [];
        this.parentNode = null;
        this.attributes = new Map();
        this.style = {};
        this.dataset = {};
        this.id = '';
        this.className = '';
        this.textContent = '';
        this.width = 400;
        this.height = 200;
        this.clientWidth = 400;
        this.clientHeight = 200;
    }
    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }
    removeChild(child) {
        const index = this.children.indexOf(child);
        if (index >= 0) this.children.splice(index, 1);
        child.parentNode = null;
        return child;
    }
    replaceChildren(...children) {
        for (const child of this.children) child.parentNode = null;
        this.children = [];
        for (const child of children) this.appendChild(child);
    }
    setAttribute(name, value) {
        this.attributes.set(name, String(value));
        if (name === 'id') this.id = String(value);
        if (name === 'class') this.className = String(value);
    }
    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }
    removeAttribute(name) {
        this.attributes.delete(name);
    }
    get firstChild() {
        return this.children[0] || null;
    }
    getBoundingClientRect() {
        return { width: 400, height: 200 };
    }
}

const walk = (node, callback) => {
    callback(node);
    for (const child of node.children || []) walk(child, callback);
};

const treeContainsLiteral = (root, literal) => {
    let found = false;
    walk(root, (node) => {
        if (found) return;
        const values = [
            node.textContent,
            ...[...(node.attributes?.values?.() || [])],
            ...Object.values(node.style || {}),
        ];
        found = values.some((value) => String(value).includes(literal));
    });
    return found;
};

const makeDomHarness = () => {
    const contextCalls = [];
    const context = new Proxy({}, {
        get(_target, property) {
            if (property === 'measureText') return (text) => ({ width: String(text).length * 6 });
            return (...args) => contextCalls.push([String(property), ...args]);
        },
        set(_target, property, value) {
            contextCalls.push([`set:${String(property)}`, value]);
            return true;
        },
    });
    const document = {
        createElement(tag) {
            const element = new FakeElement(tag, document);
            if (tag === 'canvas') element.getContext = () => context;
            return element;
        },
        createElementNS(_namespace, tag) {
            return new FakeElement(tag, document);
        },
    };
    const rootElement = new FakeElement('div', document);
    rootElement.id = 'root';
    const svg = new FakeElement('svg', document);
    svg.id = 'svg-canvas';
    const canvas = new FakeElement('canvas', document);
    canvas.id = 'rmm-canvas';
    canvas.getContext = () => context;
    const dots = new FakeElement('div', document);
    dots.id = 'dots-layer';
    rootElement.appendChild(svg);
    rootElement.appendChild(canvas);
    rootElement.appendChild(dots);
    const root = {
        ownerDocument: document,
        getElementById(id) {
            let found = null;
            walk(rootElement, (node) => {
                if (!found && node.id === id) found = node;
            });
            return found;
        },
    };
    return { root, rootElement, svg, canvas, dots, contextCalls };
};

Deno.test('read-only map uses original finite geometry and bounded safe HTML labels', () => {
    const harness = makeDomHarness();
    const renderer = new RadarRenderer({}, harness.root, {
        setTimeout: () => 1,
        clearTimeout: () => {},
    });
    const zones = makeZoneGroups();
    zones.include_zones.push({
        name: '<svg onload=alert(1)>',
        points: [[-10, 20], [40, 20], [40, 80], [-10, 80]],
    });
    zones.exclude_zones.push({ points: [[10, 10], [30, 10], [30, 30], [10, 30]] });
    zones.stationary_zones.push({ points: [[60, 60], [90, 60], [90, 90], [60, 90]] });
    const scene = buildRoomaboutsRenderScene(makePresentation({ zones }));
    assert(renderer.drawRoomaboutsMap(scene, harness.svg), 'map draw succeeds');
    assert(renderer._renderRoomaboutsDom(scene, 'css'), 'HTML label draw succeeds');

    const polygons = [];
    const hatch = [];
    const stipple = [];
    const svgLabels = [];
    walk(harness.svg, (node) => {
        if (node.className === 'roomabouts-zone') polygons.push(node);
        if (node.className === 'roomabouts-zone-hatch-line') hatch.push(node);
        if (node.className === 'roomabouts-zone-stipple-mark') stipple.push(node);
        if (node.className === 'roomabouts-zone-label') svgLabels.push(node);
    });
    assertEquals(polygons.length, 3, 'one polygon per visible valid region');
    assert(polygons[0].getAttribute('points').includes('-10,20'), 'source geometry is not clamped');
    assertEquals(polygons.map((node) => node.getAttribute('data-region-kind')), [
        'include', 'exclude', 'stationary',
    ], 'typed region selectors');
    assert(hatch.length > 0 && stipple.length > 0, 'procedural treatments are explicit primitives');
    assertEquals(svgLabels.length, 0, 'labels are not scaled inside the 0..100 SVG viewBox');
    const visual = harness.root.getElementById('roomabouts-visual-layer');
    const htmlLabels = visual.children.filter((node) => node.className === 'roomabouts-zone-label');
    assertEquals(htmlLabels.length, 3, 'one bounded HTML label per visible labeled region');
    assert(htmlLabels.some((label) => label.textContent === '<svg onload=alert(1)>'), 'hostile label is literal text');
    assert(htmlLabels.every((label) => label.children.length === 0), 'labels contain text only');
    assert(!treeContainsLiteral(harness.svg, 'url('), 'no URL-bearing SVG primitive');
    assert(!treeContainsLiteral(visual, 'url('), 'no URL-bearing HTML primitive');
    assertEquals(harness.svg.getAttribute('aria-hidden'), 'true', 'visual SVG is hidden from accessibility');
});

Deno.test('renderer owns safe dedicated layers and synchronizes semantics only on acceptance', () => {
    const harness = makeDomHarness();
    const renderer = new RadarRenderer({}, harness.root, {
        setTimeout: () => 1,
        clearTimeout: () => {},
    });
    const zones = makeZoneGroups();
    zones.include_zones.push({
        name: '<img onerror=alert(1)>',
        points: [[10, 10], [90, 10], [90, 90], [10, 90]],
    });
    const presentation = makePresentation({
        zones,
        tracks: [makeTrack('confirmed', 'observed')],
    });
    assert(renderer.acceptRoomaboutsPresentation(presentation), 'accepted scene');
    const semantic = harness.root.getElementById('roomabouts-semantic-layer');
    const visual = harness.root.getElementById('roomabouts-visual-layer');
    assert(semantic && visual, 'dedicated layers exist');
    assertEquals(semantic.getAttribute('role'), 'list', 'semantic list role');
    assertEquals(semantic.children.length, 2, 'one region and one track semantic item');
    assert(semantic.children[0].textContent.includes('<img onerror=alert(1)>'), 'hostile name remains literal text');
    assert(semantic.children.every((item) => item.getAttribute('role') === 'listitem'), 'list item roles');

    const originalItems = [...semantic.children];
    renderer.setRoomaboutsTrailRecords([]);
    assert(semantic.children.length === originalItems.length, 'semantic item count remains stable');
    assert(semantic.children.every((item, index) => item === originalItems[index]), 'trail refresh does not rebuild semantics');
});

Deno.test('Field Ledger draw bypasses inherited renderer paths in CSS and Canvas modes', () => {
    const harness = makeDomHarness();
    const renderer = new RadarRenderer({}, harness.root, {
        setTimeout: () => 1,
        clearTimeout: () => {},
    });
    renderer.initCanvasEngine = () => {
        renderer.canvas = harness.canvas;
        renderer.ctx = harness.canvas.getContext('2d');
    };
    renderer.drawZones = () => { throw new Error('legacy zones must not run'); };
    renderer.drawTargets = () => { throw new Error('legacy targets must not run'); };
    renderer.targetFilter.step = () => { throw new Error('TargetFilter must not run'); };

    const presentation = makePresentation({
        radars: [{ sensorId: 'source-a', paused: false, layout: { origin_x: 20, origin_y: 30 } }],
        sourceHealth: [{ sensorId: 'source-a', status: 'online', reason: 'available' }],
        tracks: [makeTrack('confirmed', 'observed')],
    });
    renderer.acceptRoomaboutsPresentation(presentation);
    renderer.setRoomaboutsTrailRecords([Object.freeze({
        ownerId: 'owner-private',
        x: 40,
        y: 50,
        rotationDeg: 90,
        side: 'left',
        createdAtMs: 0,
        expiresAtMs: 6000,
        ordinal: 0,
    })]);
    const state = { editing: false };
    const hass = { states: {} };
    renderer.draw(state, { read_only: true, target_render_mode: 'css' }, hass);
    const visual = harness.root.getElementById('roomabouts-visual-layer');
    assert(visual.children.some((child) => child.className === 'roomabouts-track'), 'CSS track');
    assert(visual.children.some((child) => child.className === 'roomabouts-step'), 'CSS step');
    assert(visual.children.some((child) => child.className === 'roomabouts-station'), 'common station');
    assert(!treeContainsLiteral(visual, 'owner-private'), 'private footprint owner never enters DOM');

    renderer.draw(state, { read_only: true, target_render_mode: 'canvas' }, hass);
    assert(!visual.children.some((child) => child.className === 'roomabouts-track'), 'Canvas has no DOM track duplicate');
    assert(!visual.children.some((child) => child.className === 'roomabouts-step'), 'Canvas has no DOM step duplicate');
    assert(visual.children.some((child) => child.className === 'roomabouts-station'), 'station remains visible');
    assert(harness.contextCalls.some(([name]) => name === 'arc' || name === 'ellipse'), 'Canvas primitives drawn');

    harness.contextCalls.length = 0;
    renderer._drawRoomaboutsCanvasStep(renderer.ctx, {
        x: 40, y: 50, rotationDeg: 90, side: 'left',
    }, 400, 200);
    const leftCalls = [...harness.contextCalls];
    assert(leftCalls.some((call) => JSON.stringify(call) === JSON.stringify(['translate', -3.5, -6.5])), '13px footprint is centered');
    assert(leftCalls.some((call) => JSON.stringify(call) === JSON.stringify(['fillRect', 1, 9, 4, 4])), 'heel is offset and four pixels tall');
    assert(leftCalls.some(([name]) => name === 'lineTo'), 'forefoot has a notched polygon');
    assert(!leftCalls.some(([name]) => name === 'ellipse'), 'forefoot is not a symmetric ellipse');

    harness.contextCalls.length = 0;
    renderer._drawRoomaboutsCanvasStep(renderer.ctx, {
        x: 40, y: 50, rotationDeg: 90, side: 'right',
    }, 400, 200);
    assert(
        harness.contextCalls.some((call) => JSON.stringify(call) === JSON.stringify(['scale', -1, 1])),
        'right footprint mirrors the asymmetric notch and heel',
    );
});

Deno.test('renderer cleanup removes every Roomabouts visual, semantic, and cached coordinate', () => {
    const harness = makeDomHarness();
    const renderer = new RadarRenderer({}, harness.root, {
        setTimeout: () => 1,
        clearTimeout: () => {},
    });
    renderer.acceptRoomaboutsPresentation(makePresentation({ tracks: [makeTrack('confirmed', 'observed')] }));
    renderer.setRoomaboutsTrailRecords([Object.freeze({
        ownerId: 'owner-private', x: 4, y: 4, rotationDeg: 90, side: 'left',
        createdAtMs: 0, expiresAtMs: 6000, ordinal: 0,
    })]);
    renderer.drawRoomaboutsMap(renderer._roomaboutsScene, harness.svg);
    renderer._renderRoomaboutsDom(renderer._roomaboutsScene, 'css');
    assert(harness.svg.children.length > 0, 'precondition: SVG contains geometry');
    assert(harness.root.getElementById('roomabouts-visual-layer').children.length > 0, 'precondition: visual layer contains coordinates');
    renderer.clearRoomaboutsPresentation();
    assertEquals(harness.svg.children, [], 'public clear removes SVG geometry');
    assertEquals(harness.root.getElementById('roomabouts-visual-layer').children, [], 'visual cleanup');
    assertEquals(harness.root.getElementById('roomabouts-semantic-layer').children, [], 'semantic cleanup');
    assertEquals(renderer._roomaboutsTrailRecords, [], 'private footprint cleanup');
    assertEquals(renderer._roomaboutsScene, null, 'scene cleanup');
});
