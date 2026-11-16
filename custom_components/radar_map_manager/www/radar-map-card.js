import { RadarMath } from './radar-math.js?v=1.5.0';
import { RadarUI } from './radar-ui.js?v=1.5.0';
import { RadarRenderer } from './radar-renderer.js?v=1.5.0';
import { RadarEditor } from './radar-editor.js?v=1.5.0';
import { RoomaboutsPresentationAdapter } from './roomabouts-presentation.js?v=1.5.0';
import {
    ROOMABOUTS_FIELD_LEDGER_CSS,
    isRoomaboutsReadOnly,
    sanitizeRoomaboutsReadOnlyConfig,
} from './roomabouts-theme.js?v=1.5.0';
import { RoomaboutsTrailStore } from './roomabouts-trails.js?v=1.5.0';

const EMPTY_HASS_STATES = Object.freeze({});
const EMPTY_ROOMABOUTS_TRAIL_RECORDS = Object.freeze([]);
const LANGUAGE_TAG = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const ROOMABOUTS_RESETTING_REJECTION_REASONS = new Set([
    'invalid-snapshot',
    'logical-time-regression',
    'alias-binding-conflict',
    'track-lifetime-limit',
]);

class RadarMapCardNative extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.math = new RadarMath();
        this.ui = new RadarUI(this.shadowRoot);
        this.renderer = new RadarRenderer(this.math, this.shadowRoot);
        this.editor = new RadarEditor(this, this.shadowRoot, this.math, this.ui, this.renderer);
        this.presentationAdapter = new RoomaboutsPresentationAdapter();
        this.state = {
            editMode: 'zone',
            editing: false,
            radar: null,
            type: 'include_zones',
            fov_edit_mode: false,
            points: [],
            data: {},
            ts: 0,
            selectedIndex: null,
            selectedPointIndex: null,
            hasUnsavedChanges: false,
            historyStack: [],
            dragState: { isDragging: false },
            layoutChanges: {},
            calibration: { active: false, raw: null, map: null },
            isConnected: true,
            hass: null,
            sourceHealth: [],
            aspectRatio: 1.0,
            mapGroup: "default",
            isAddingNew: false,
            mousePos: null
        };
        this.ignoreUpdatesUntil = 0;
        this.isCreated = false;
        this.retryTimer = null;
        this.isRendering = false;
        this._renderFrameId = null;
        this._streamUnsubscribe = null;
        this._streamSubscribing = false;
        this._subscriptionEpoch = 0;
        this._isDisconnected = true;
        this._roomaboutsPresentation = null;
        this._roomaboutsTrailStore = null;
        this._roomaboutsAcceptingPresentation = false;
        this._roomaboutsResumeListenersAttached = false;
        this._boundRoomaboutsVisibilityChange = this._handleRoomaboutsVisibilityChange.bind(this);
        this._boundRoomaboutsPageShow = this._handleRoomaboutsPageShow.bind(this);
        this.resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    this.state.aspectRatio = width / height;
                    this._queueRender();
                }
            }
        });
        this._ensureRoomaboutsTrailStore();
    }
    _createRoomaboutsTrailStore() {
        return new RoomaboutsTrailStore({
            clock: () => performance.now(),
            setTimeout: (callback, delay) => window.setTimeout(callback, delay),
            clearTimeout: (handle) => window.clearTimeout(handle),
            onChange: () => this._handleRoomaboutsTrailStoreChange(),
        });
    }
    _ensureRoomaboutsTrailStore() {
        if (!this._roomaboutsTrailStore) {
            this._roomaboutsTrailStore = this._createRoomaboutsTrailStore();
        }
        return this._roomaboutsTrailStore;
    }
    _handleRoomaboutsTrailStoreChange() {
        if (this._roomaboutsAcceptingPresentation
            || this._isDisconnected
            || !this.isCreated
            || !this.state.hass
            || !this._isRoomaboutsFieldView()) return;
        this._drawCurrentView(this.state.hass);
    }
    _isRoomaboutsFieldView() {
        return isRoomaboutsReadOnly(this.config, this.state);
    }
    _createRoomaboutsShell() {
        this.ui.injectStyles();

        let style = this.shadowRoot.getElementById('roomabouts-field-ledger-styles');
        if (!style) {
            style = document.createElement('style');
            style.id = 'roomabouts-field-ledger-styles';
            this.shadowRoot.appendChild(style);
        }
        style.textContent = ROOMABOUTS_FIELD_LEDGER_CSS;

        const root = document.createElement('div');
        root.id = 'root';
        root.classList.add('roomabouts-readonly');
        root.setAttribute('role', 'region');
        root.setAttribute('aria-label', 'Roomabouts field view');

        const mapContainer = document.createElement('div');
        mapContainer.id = 'map-container';
        mapContainer.style.zIndex = '4';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'svg-canvas';
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');

        const canvas = document.createElement('canvas');
        canvas.id = 'rmm-canvas';

        const dotsLayer = document.createElement('div');
        dotsLayer.id = 'dots-layer';

        const clickLayer = document.createElement('div');
        clickLayer.id = 'click-layer';

        root.appendChild(mapContainer);
        const visuals = [svg, canvas, dotsLayer, clickLayer];
        for (const visual of visuals) {
            visual.setAttribute('aria-hidden', 'true');
            root.appendChild(visual);
        }
        this.shadowRoot.appendChild(root);
        return root;
    }
    _activateRoomaboutsView() {
        if (!this._isRoomaboutsFieldView()) return null;
        let root = this.shadowRoot.getElementById('root');
        if (!root) root = this._createRoomaboutsShell();
        root.classList.add('roomabouts-readonly');
        root.setAttribute('role', 'region');
        root.setAttribute('aria-label', 'Roomabouts field view');
        this.isCreated = true;
        return root;
    }
    _deactivateRoomaboutsView() {
        this._detachRoomaboutsResumeListeners();
        const root = this.shadowRoot.getElementById('root');
        const themeStyle = this.shadowRoot.getElementById('roomabouts-field-ledger-styles');
        if (themeStyle) themeStyle.remove();
        if (root) root.remove();
        this.isCreated = false;
    }
    _attachRoomaboutsResumeListeners() {
        if (this._roomaboutsResumeListenersAttached
            || !this.isConnected
            || !this._isRoomaboutsFieldView()) return;
        document.addEventListener('visibilitychange', this._boundRoomaboutsVisibilityChange);
        window.addEventListener('pageshow', this._boundRoomaboutsPageShow);
        this._roomaboutsResumeListenersAttached = true;
    }
    _detachRoomaboutsResumeListeners() {
        if (!this._roomaboutsResumeListenersAttached) return;
        document.removeEventListener('visibilitychange', this._boundRoomaboutsVisibilityChange);
        window.removeEventListener('pageshow', this._boundRoomaboutsPageShow);
        this._roomaboutsResumeListenersAttached = false;
    }
    _handleRoomaboutsVisibilityChange() {
        if (document.visibilityState === 'visible') this._expireRoomaboutsTrails();
    }
    _handleRoomaboutsPageShow() {
        this._expireRoomaboutsTrails();
    }
    _expireRoomaboutsTrails() {
        if (!this._isRoomaboutsFieldView() || !this._roomaboutsTrailStore) return;
        const result = this._roomaboutsTrailStore.expire();
        if (!result.ok) {
            this.renderer.setRoomaboutsTrailRecords(EMPTY_ROOMABOUTS_TRAIL_RECORDS);
            this._roomaboutsTrailStore.reset(result.reason);
        }
        this._queueRender();
    }
    _updateInheritedStatus() {
        if (this._isRoomaboutsFieldView()) return;
        this.ui.updateStatus(this.state, this.config);
    }
    set layout(val) {
        this._ha_layout = val;
    }
    get layout() {
        return this._ha_layout;
    }
    getGridOptions() {
        return { columns: 12, rows: "auto" };
    }
    connectedCallback() {
        this._isDisconnected = false;
        if (!this.config) return;
        this._ensureRoomaboutsTrailStore();
        const root = this._activateRoomaboutsView();
        if (!root) return;
        this._attachRoomaboutsResumeListeners();
        if (root) this.resizeObserver.observe(root);
        this.startHeartbeat();
        const connection = this.state.rawHass?.connection;
        const isConnected = !!(connection && connection.connected !== false);
        this._setConnectionState(isConnected);
        if (isConnected) this._ensureStreamSubscription(this.state.rawHass);
        this._queueRender();
    }
    disconnectedCallback() {
        this._isDisconnected = true;
        this._detachRoomaboutsResumeListeners();
        this.resizeObserver.disconnect();
        if (this.retryTimer) clearInterval(this.retryTimer);
        this.retryTimer = null;
        if (this._renderFrameId !== null) cancelAnimationFrame(this._renderFrameId);
        this._renderFrameId = null;
        this.isRendering = false;
        this._teardownStream();
        this._clearPresentation('disconnect', {
            destroyRenderer: true,
            destroyTrailStore: true,
            redraw: false,
        });
        this._deactivateRoomaboutsView();
    }
    static getStubConfig() {
        return { type: "custom:radar-map-card", map_group: "default" };
    }
    getCardSize() {
        return 5;
    }
    setConfig(config) {
        const nextConfig = sanitizeRoomaboutsReadOnlyConfig(config);
        const previousMapGroup = this.config?.map_group;
        const mapGroupChanged = previousMapGroup !== undefined
            && previousMapGroup !== nextConfig.map_group;
        this.config = nextConfig;
        this.state.mapGroup = nextConfig.map_group;
        this.state.editing = false;
        if (mapGroupChanged) {
            this._clearPresentation('map-change', { redraw: false });
        }
        this._ensureRoomaboutsTrailStore();
        const root = this._activateRoomaboutsView();
        if (!root) return;
        if (this.isConnected) {
            this._attachRoomaboutsResumeListeners();
            this.resizeObserver.observe(root);
            this.startHeartbeat();
            const connection = this.state.rawHass?.connection;
            if (connection && connection.connected !== false) {
                this._ensureStreamSubscription(this.state.rawHass);
            }
        }
        this._queueRender();
    }
    set hass(h) {
        const sanitizedHass = this.getMockHass(h);
        const previousConnection = this.state.rawHass?.connection;
        const nextConnection = sanitizedHass?.connection;
        if (previousConnection && previousConnection !== nextConnection) {
            console.log("[Roomabouts] HA Connection changed (wake from sleep). Resubscribing...");
            this._teardownStream();
            this._clearPresentation('disconnect', { redraw: false });
        }
        this._hass = sanitizedHass;
        this.state.rawHass = sanitizedHass;
        this.state.hass = sanitizedHass;
        const isConnected = !!(nextConnection && nextConnection.connected !== false);
        this._setConnectionState(isConnected);
        if (isConnected) this._ensureStreamSubscription(sanitizedHass);
        if (this.isCreated) {
            if (!this._isRoomaboutsFieldView()) {
                if (this.state.editMode === 'layout' && !this.state.dragState.isDragging) {
                    this.ui.updateLayoutInputs(this.state, sanitizedHass);
                }
                if (this.state.editMode === 'settings') {
                    this.ui.updateSettingsInputs(this.state);
                }
            }
            this._queueRender();
            if (!this.isRendering && !this.state.dragState.isDragging) {
                this._updateInheritedStatus();
            }
        }
    }
    _queueRender() {
        if (this._isDisconnected || !this.isCreated || !this.state.hass || this._renderFrameId !== null) return;
        this.isRendering = true;
        this._renderFrameId = requestAnimationFrame(() => {
            this._renderFrameId = null;
            if (!this._isDisconnected) {
                this._drawCurrentView(this.state.hass);
            }
            this.isRendering = false;
        });
    }
    _drawCurrentView(hass) {
        if (this._isRoomaboutsFieldView()) {
            if (!this._roomaboutsTrailStore) {
                this.renderer.setRoomaboutsTrailRecords(EMPTY_ROOMABOUTS_TRAIL_RECORDS);
            } else {
                const visible = this._roomaboutsTrailStore.visible();
                if (visible.ok) {
                    this.renderer.setRoomaboutsTrailRecords(visible.records);
                } else {
                    this.renderer.setRoomaboutsTrailRecords(EMPTY_ROOMABOUTS_TRAIL_RECORDS);
                    this._roomaboutsTrailStore.reset(visible.reason);
                }
            }
        }
        this.renderer.draw(this.state, this.config, hass);
    }
    _once(unsubscribe) {
        let called = false;
        return () => {
            if (called) return;
            called = true;
            if (typeof unsubscribe === 'function') {
                try {
                    return unsubscribe();
                } catch (_error) {
                    return undefined;
                }
            }
        };
    }
    _teardownStream() {
        this._subscriptionEpoch += 1;
        this._streamSubscribing = false;
        const unsubscribe = this._streamUnsubscribe;
        this._streamUnsubscribe = null;
        if (unsubscribe) unsubscribe();
    }
    _ensureStreamSubscription(hass) {
        const connection = hass?.connection;
        if (!connection
            || !this.isConnected
            || !this.config
            || !this._isRoomaboutsFieldView()
            || this._streamUnsubscribe
            || this._streamSubscribing
            || this._isDisconnected) return;
        const epoch = ++this._subscriptionEpoch;
        this._streamSubscribing = true;
        let pending;
        try {
            pending = connection.subscribeMessage(
                (message) => {
                    if (epoch !== this._subscriptionEpoch || connection !== this.state.rawHass?.connection) return;
                    this.handleNewData(message?.data);
                },
                { type: 'rmm/stream' }
            );
        } catch (_error) {
            if (epoch === this._subscriptionEpoch) this._streamSubscribing = false;
            return;
        }
        Promise.resolve(pending).then(unsubscribe => {
            const safeUnsubscribe = this._once(unsubscribe);
            if (epoch !== this._subscriptionEpoch
                || connection !== this.state.rawHass?.connection
                || this._isDisconnected) {
                safeUnsubscribe();
                return;
            }
            this._streamUnsubscribe = safeUnsubscribe;
            this._streamSubscribing = false;
        }).catch(() => {
            if (epoch === this._subscriptionEpoch) this._streamSubscribing = false;
        });
    }
    fetchData(force = false) {
        if (force) {
            this.state.hasUnsavedChanges = false;
            this.ignoreUpdatesUntil = 0;
        }
    }
    handleNewData(rawData) {
        const presentation = this.presentationAdapter.ingest(rawData);
        if (!presentation.accepted) {
            if (ROOMABOUTS_RESETTING_REJECTION_REASONS.has(presentation.reason)) {
                this._clearPresentation(presentation.reason, {
                    resetAdapter: false,
                });
            }
            return;
        }
        if (this._isRoomaboutsFieldView()) {
            this._acceptRoomaboutsPresentation(presentation);
            return;
        }
        if (this.ignoreUpdatesUntil > 0 && Date.now() < this.ignoreUpdatesUntil) return;
        const isFrozen = this.state.calibration && this.state.calibration.active;
        if (!this.state.hasUnsavedChanges && !isFrozen) {
            this.state.mapGroup = presentation.map.mapId;
            this.state.data = this._toInheritedMapState(presentation.map);
            this.state.fused_targets = presentation.tracks.map(track => this._toFusedTarget(track));
            this.state.sourceHealth = presentation.sourceHealth;
            this.state.historyStack = [];
            const renderMode = this.config.target_render_mode || 'css';
            if (renderMode === 'canvas' && (this.state.editMode === 'zone' || this.state.editMode === 'settings' || !this.state.editing)) {
                this.renderer.updateFusedTargets(this.state.fused_targets || []);
            }
            this.state.hass = this.getMockHass(this.state.rawHass);
            this._drawCurrentView(this.state.hass);
            this._updateInheritedStatus();
        }
    }
    _acceptRoomaboutsPresentation(presentation) {
        const trailStore = this._ensureRoomaboutsTrailStore();
        this._roomaboutsAcceptingPresentation = true;
        try {
            const trailResult = trailStore.observeAccepted(presentation);
            if (!trailResult.ok) {
                this.renderer.setRoomaboutsTrailRecords(EMPTY_ROOMABOUTS_TRAIL_RECORDS);
                trailStore.reset(trailResult.reason);
            }
            if (presentation.reset) {
                this._clearPresentation(presentation.resetReason, {
                    resetAdapter: false,
                    resetTrailStore: false,
                    redraw: false,
                });
            }
        } finally {
            this._roomaboutsAcceptingPresentation = false;
        }
        this._roomaboutsPresentation = presentation;
        this.renderer.acceptRoomaboutsPresentation(presentation);
        this.state.hass = this.getMockHass(this.state.rawHass);
        this._drawCurrentView(this.state.hass);
    }
    _toInheritedMapState(map) {
        const data = {
            global_zones: map.zones,
            global_config: map.config,
        };
        for (const radar of map.radars) {
            data[radar.sensorId] = {
                map_group: radar.mapGroup,
                paused: radar.paused,
                layout: radar.layout,
                monitor_zones: radar.monitor_zones,
                hw_detect_zones: radar.hw_detect_zones,
                hw_block_zones: radar.hw_block_zones,
                hw_stay_zones: radar.hw_stay_zones,
            };
        }
        return data;
    }
    _toFusedTarget(track) {
        return {
            id: track.trackId,
            x: track.position.x,
            y: track.position.y,
            lifecycle: track.lifecycle,
            positionBasis: track.positionBasis,
            anonymousAlias: track.anonymousAlias,
            emitFootprint: track.emitFootprint,
            sourceRefs: track.sourceRefs,
            observedAt: track.observedAt,
            lastObservedAgeMs: track.lastObservedAgeMs,
            uncertainty: track.uncertainty || [],
            posture: track.posture || 'unknown',
        };
    }
    _emptyPresentationData() {
        return {
            global_zones: {
                include_zones: [],
                exclude_zones: [],
                entrance_zones: [],
                stationary_zones: [],
            },
            global_config: {},
        };
    }
    _clearPresentation(reason, {
        resetAdapter = true,
        resetTrailStore = true,
        destroyTrailStore = false,
        destroyRenderer = false,
        redraw = true,
    } = {}) {
        if (resetAdapter) {
            if (reason === 'disconnect') this.presentationAdapter.disconnect();
            else this.presentationAdapter.reset(reason);
        }
        this._roomaboutsPresentation = null;
        if (destroyTrailStore && this._roomaboutsTrailStore) {
            this._roomaboutsTrailStore.destroy();
            this._roomaboutsTrailStore = null;
        } else if (resetTrailStore && this._roomaboutsTrailStore) {
            this._roomaboutsTrailStore.reset(reason);
        }
        this.state.data = this._emptyPresentationData();
        this.state.fused_targets = [];
        this.state.sourceHealth = [];
        this.state.historyStack = [];
        this.state.points = [];
        this.state.calibration = { active: false, raw: null, map: null };
        this.state.hasUnsavedChanges = false;
        this.state.editing = false;
        if (destroyRenderer) this.renderer.destroy();
        else this.renderer.clearRuntime();
        if (this.isCreated) this._updateInheritedStatus();
        if (redraw) this._queueRender();
    }
    getMockHass(h) {
        if (!h) return null;
        const language = typeof h.language === 'string'
            && h.language.length <= 35
            && LANGUAGE_TAG.test(h.language)
            ? h.language
            : '';
        return Object.freeze({
            connection: h.connection,
            language,
            states: EMPTY_HASS_STATES,
        });
    }
    initLogic() {
        if (this._isRoomaboutsFieldView()) return;
        const that = this;
        const callbacks = {
            onModeChange: (mode) => {
                that.state.editMode = mode;
                that.state.points = [];
                that.state.fov_edit_mode = false; 
                that.state.calibration = { active: false, raw: null, map: null }; 
                that.resetSelection(); 
                setTimeout(() => {
                    that._updateInheritedStatus();
                    if(mode === 'layout') {
                        that.ui.updateRadarList(that.state, that.config);
                        setTimeout(() => {
                            that.ui.updateLayoutInputs(that.state, that._hass);
                            that._drawCurrentView(that._hass);
                        }, 20); 
                    }
                }, 50);
            },
            onToggleEditMode: () => {
                if (that.config?.read_only) {
                    that.exitEditMode();
                    return;
                }
                if (that.state.editing) that.exitEditMode(); 
                else that.enterEditMode(that._hass);
            },
            selectZone: (i, j, z) => {
                that.state.selectedIndex = i;
                that.state.selectedPointIndex = j;
                that._updateInheritedStatus();
                that._drawCurrentView(that._hass);
            },
            resetSelection: () => that.resetSelection(),
            deletePoint: (polyIdx, ptIdx) => {
                const list = that._getTargetList(that.state);
                if (list[polyIdx]) {
                    const z = list[polyIdx];
                    const pts = Array.isArray(z) ? z : z.points;
                    if (pts) {
                        pts.splice(ptIdx, 1);
                        that.state.hasUnsavedChanges = true;
                        that._drawCurrentView(that._hass);
                        that._updateInheritedStatus();
                    }
                }
            },
            onSaveZoneConfig: async () => {
                that.state.isAddingNew = false;
                that.state.selectedPointIndex = null;
                try {
                    await that.saveZoneToBackend();
                    that._updateInheritedStatus();
                    that._drawCurrentView(that._hass);
                    alert(that.editor.t("zone_saved"));
                } catch (err) {
                    console.error("Roomabouts: onSaveZoneConfig failed:", err);
                    alert(that.editor.t("ha_reject") + (err.message || err));
                }
            },
            onToggleFOV: () => { 
                that.state.fov_edit_mode = !that.state.fov_edit_mode; 
                that._updateInheritedStatus();
            },
            onDiscardConfig: () => { 
                that.fetchData(true); 
            },
            onTypeChange: (val) => { that.state.type = val; that.resetSelection(); },
            onRadarChange: (val) => { 
                that.state.radar = val; 
                that.resetSelection(); 
                that.ui.updateRadarList(that.state, that.config); 
            },
            onLayoutParamChange: (k, v) => { 
                if(!that.state.layoutChanges) that.state.layoutChanges = {};
                that.state.layoutChanges[k] = v; 
                that.state.hasUnsavedChanges = true;
                that._drawCurrentView(that._hass);
            },
            onSaveLayout: async () => {
                if (that.config?.read_only) return;
                if(!that.state.radar) return;
                const r = that.state.data[that.state.radar];
                const newLayout = { ...(r.layout || {}), ...that.state.layoutChanges };
                try {
                    const svcPayload = {
                        radar_name: that.state.radar,
                        layout: newLayout,
                        map_group: that.state.mapGroup
                    };
                    await that._hass.callService('radar_map_manager', 'update_radar_layout', svcPayload);
                    that.state.layoutChanges = {};
                    that.state.hasUnsavedChanges = false;
                    that.fetchData(true);
                    alert(that.editor.t("layout_saved"));
                } catch (err) {
                    console.error("Roomabouts: onSaveLayout failed:", err);
                    alert(that.editor.t("ha_reject") + (err.message || err));
                }
            },
            onCalibrationToggle: () => {
                if (that.state.calibration.active) {
                    that.state.calibration = { active: false, raw: null, map: null };
                } else {
                    if (!that.state.radar) return alert(that.editor.t("sel_radar"));
                    const rName = that.state.radar.toLowerCase();
                    const xEnt = that.state.hass.states[`sensor.${rName}_target_1_x`]; 
                    const yEnt = that.state.hass.states[`sensor.${rName}_target_1_y`]; 
                    let rx = 0, ry = 0;
                    if (xEnt && yEnt && xEnt.state !== 'unavailable' && yEnt.state !== 'unavailable') {
                        rx = parseFloat(xEnt.state); ry = parseFloat(yEnt.state);
                        const unit = xEnt.attributes.unit_of_measurement;
                        if (unit === 'm') { rx *= 1000; ry *= 1000; }
                        else if (unit === 'cm') { rx *= 10; ry *= 10; }
                    } 
                    else {
                        const dEnt = that.state.hass.states[`sensor.${rName}_distance`]; 
                        if (dEnt && dEnt.state !== 'unavailable' && dEnt.state !== 'unknown') {
                            rx = 0; ry = parseFloat(dEnt.state);
                            const unit = dEnt.attributes.unit_of_measurement;
                            if (unit === 'm') ry *= 1000; else if (unit === 'cm') ry *= 10;
                        } else {
                            return alert(that.editor.t("no_t1"));
                        }
                    }
                    const layoutCfg = that.renderer.getRadarConfig(that.state, that.state.radar, that.state.hass); 
                    const currentMapPos = that.math.calculate(layoutCfg, { x: rx, y: ry, z: 0 });
                    that.state.calibration = {
                        active: true, raw: { x: rx, y: ry }, map: { x: currentMapPos.left, y: currentMapPos.top } 
                    };
                }
                that._updateInheritedStatus();
                that._drawCurrentView(that._hass);
            }
        };
        this.editor.bindEvents(this.state, this.config, callbacks);
    }
    resetSelection() {
        this.state.selectedIndex = null;
        this.state.selectedPointIndex = null;
        this.state.isAddingNew = false;
        this._updateInheritedStatus();
        this._drawCurrentView(this.state.hass);
    }
    _getTargetList(state) {
        if (state.editMode === 'layout') {
            if (!state.radar) return [];
            if (!state.data[state.radar]) state.data[state.radar] = {};
            const type = state.radar_zone_type || 'monitor_zones';
            if (!Array.isArray(state.data[state.radar][type])) {
                state.data[state.radar][type] = [];
            }
            return state.data[state.radar][type];
        } else {
            const type = state.type || 'include_zones';
            if (!state.data.global_zones) state.data.global_zones = { include_zones: [], exclude_zones: [] };
            if (!Array.isArray(state.data.global_zones[type])) {
                state.data.global_zones[type] = [];
            }
            return state.data.global_zones[type];
        }
    }
    async saveZoneToBackend() {
        if (this.config?.read_only) throw new Error('Roomabouts is read-only in Phase 2');
        const isRadarZone = this.state.editMode === 'layout';
        const zoneType = isRadarZone ? 'monitor_zones' : this.state.type;
        const zones = isRadarZone
            ? this.state.data[this.state.radar]?.monitor_zones
            : this.state.data.global_zones?.[zoneType];
        const payload = {
            zone_type: zoneType,
            points: JSON.parse(JSON.stringify(zones || [])),
            map_group: this.state.mapGroup
        };
        if (isRadarZone) payload.radar_name = this.state.radar;

        try {
            await this._hass.callService('radar_map_manager', 'update_radar_zone', payload);
            this.state.hasUnsavedChanges = false;
        } catch (err) {
            console.error("Roomabouts: zone save failed:", err);
            throw err;
        }
    }
    enterEditMode(h) {
        if (this.config?.read_only) {
            this.state.editing = false;
            this._updateInheritedStatus();
            return false;
        }
        this.state.editing = true;
        this.ui.updateRadarList(this.state, this.config);
        this.state.points = [];
        this.state.dragState = { isDragging: false };
        this._updateInheritedStatus();
        setTimeout(() => this.ui.updateLayoutInputs(this.state, h), 50);
        this._drawCurrentView(h);
        return true;
    }
    exitEditMode() {
        this.state.editing = false;
        this.state.points = [];
        this.resetSelection();
        this._updateInheritedStatus();
        this._drawCurrentView(this.state.hass);
    }
    startHeartbeat() { 
        if (this.retryTimer) clearInterval(this.retryTimer);
        this.retryTimer = setInterval(() => this.checkConnection(), 5000); 
    }
    checkConnection() {
        if (!this._hass) return;
        const isOk = !!(this._hass.connection && this._hass.connection.connected !== false);
        this._setConnectionState(isOk);
        if (isOk) this._ensureStreamSubscription(this._hass);
    }
    _setConnectionState(isConnected) {
        if (this.state.isConnected === isConnected) return;
        this.state.isConnected = isConnected;
        if (!isConnected) {
            this._teardownStream();
            this._clearPresentation('disconnect');
        }
        if (this.isCreated) this._updateInheritedStatus();
    }
}
function registerCard() {
    if (!customElements.get('radar-map-card')) {
        customElements.define('radar-map-card', RadarMapCardNative);
        console.info(
            '%c ROOMABOUTS %c Loaded ',
            'color: white; background: #03a9f4; font-weight: 700; padding: 2px 4px; border-radius: 3px 0 0 3px;',
            'color: #03a9f4; background: #e1f5fe; font-weight: 700; padding: 2px 4px; border-radius: 0 3px 3px 0;'
        );
    }
    window.customCards = window.customCards || [];
    const cardDef = {
        type: "radar-map-card",
        name: "Roomabouts Map",
        preview: false, 
        description: "Read-only Home Assistant room map with sensor-backed presence."
    };
    const cardIndex = window.customCards.findIndex(c => c.type === 'radar-map-card');
    if (cardIndex >= 0) {
        window.customCards[cardIndex] = cardDef;
    } else {
        window.customCards.push(cardDef);
    }
}
registerCard();
