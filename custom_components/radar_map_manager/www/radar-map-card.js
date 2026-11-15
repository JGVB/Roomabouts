import { RadarMath } from './radar-math.js?v=1.4.0';
import { RadarUI } from './radar-ui.js?v=1.4.0';
import { RadarRenderer } from './radar-renderer.js?v=1.4.0';
import { RadarEditor } from './radar-editor.js?v=1.4.0';
import { RoomaboutsPresentationAdapter } from './roomabouts-presentation.js?v=1.4.0';
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
        this._isDisconnected = false;
        this.resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                const { width, height } = entry.contentRect;
                if (width > 0 && height > 0) {
                    this.state.aspectRatio = width / height;
                    this._queueRender();
                }
            }
        });
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
        if (!this.isCreated) return;
        const root = this.shadowRoot.getElementById('root');
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
        this.resizeObserver.disconnect();
        if (this.retryTimer) clearInterval(this.retryTimer);
        this.retryTimer = null;
        if (this._renderFrameId !== null) cancelAnimationFrame(this._renderFrameId);
        this._renderFrameId = null;
        this.isRendering = false;
        this._teardownStream();
        this._clearPresentation('disconnect', { destroyRenderer: true, redraw: false });
    }
    static getStubConfig() {
        return { type: "custom:radar-map-card", map_group: "default" };
    }
    getCardSize() {
        return 5;
    }
    setConfig(config) {
        this.config = { ...config, read_only: true };
        this.state.mapGroup = this.config.map_group || "default";
        this.state.editing = false;
        if (this.isCreated) return;
        this.ui.render(this.state, this.config);
        this.isCreated = true;
        const root = this.shadowRoot.getElementById('root');
        if (root) this.resizeObserver.observe(root);
        if (!this.config.read_only) this.initLogic();
        this.startHeartbeat();
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
            if (this.state.editMode === 'layout' && !this.state.dragState.isDragging) {
                this.ui.updateLayoutInputs(this.state, sanitizedHass);
            }
            if (this.state.editMode === 'settings') {
                this.ui.updateSettingsInputs(this.state);
            }
            this._queueRender();
            if (!this.isRendering && !this.state.dragState.isDragging) {
                this.ui.updateStatus(this.state, this.config);
            }
        }
    }
    _queueRender() {
        if (this._isDisconnected || !this.isCreated || !this.state.hass || this._renderFrameId !== null) return;
        this.isRendering = true;
        this._renderFrameId = requestAnimationFrame(() => {
            this._renderFrameId = null;
            if (!this._isDisconnected) {
                this.renderer.draw(this.state, this.config, this.state.hass);
            }
            this.isRendering = false;
        });
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
        if (!connection || this._streamUnsubscribe || this._streamSubscribing || this._isDisconnected) return;
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
        if (!presentation.accepted) return;
        if (presentation.reset) {
            this._clearPresentation(presentation.resetReason, {
                resetAdapter: false,
                redraw: false,
            });
        }
        if (this.ignoreUpdatesUntil > 0 && Date.now() < this.ignoreUpdatesUntil) return;
        const isFrozen = this.state.calibration && this.state.calibration.active;
        if (!this.state.hasUnsavedChanges && !isFrozen) {
            this.state.mapGroup = presentation.map.mapId;
            this.state.data = this._toInheritedMapState(presentation.map);
            this.state.fused_targets = presentation.tracks.map(track => this._toFusedTarget(track));
            this.state.sourceHealth = presentation.sourceHealth;
            this.state.historyStack = [];
            const renderMode = this.state.data?.global_config?.target_render_mode || this.config.target_render_mode || 'css';
            if (renderMode === 'canvas' && (this.state.editMode === 'zone' || this.state.editMode === 'settings' || !this.state.editing)) {
                this.renderer.updateFusedTargets(this.state.fused_targets || []);
            }
            this.state.hass = this.getMockHass(this.state.rawHass);
            this.renderer.draw(this.state, this.config, this.state.hass);
            this.ui.updateStatus(this.state, this.config);
        }
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
        destroyRenderer = false,
        redraw = true,
    } = {}) {
        if (resetAdapter) {
            if (reason === 'disconnect') this.presentationAdapter.disconnect();
            else this.presentationAdapter.reset(reason);
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
        if (this.isCreated) this.ui.updateStatus(this.state, this.config);
        if (redraw) this._queueRender();
    }
    getMockHass(h) {
        if (!h) return null;
        return { ...h, states: {} };
    }
    initLogic() {
        const that = this;
        const callbacks = {
            onModeChange: (mode) => {
                that.state.editMode = mode;
                that.state.points = [];
                that.state.fov_edit_mode = false; 
                that.state.calibration = { active: false, raw: null, map: null }; 
                that.resetSelection(); 
                setTimeout(() => {
                    that.ui.updateStatus(that.state, that.config);
                    if(mode === 'layout') {
                        that.ui.updateRadarList(that.state, that.config);
                        setTimeout(() => {
                            that.ui.updateLayoutInputs(that.state, that._hass);
                            that.renderer.draw(that.state, that.config, that._hass);
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
                that.ui.updateStatus(that.state, that.config);
                that.renderer.draw(that.state, that.config, that._hass);
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
                        that.renderer.draw(that.state, that.config, that._hass);
                        that.ui.updateStatus(that.state, that.config);
                    }
                }
            },
            onSaveZoneConfig: async () => {
                that.state.isAddingNew = false;
                that.state.selectedPointIndex = null;
                try {
                    await that.saveZoneToBackend();
                    that.ui.updateStatus(that.state, that.config);
                    that.renderer.draw(that.state, that.config, that._hass);
                    alert(that.editor.t("zone_saved"));
                } catch (err) {
                    console.error("Roomabouts: onSaveZoneConfig failed:", err);
                    alert(that.editor.t("ha_reject") + (err.message || err));
                }
            },
            onToggleFOV: () => { 
                that.state.fov_edit_mode = !that.state.fov_edit_mode; 
                that.ui.updateStatus(that.state, that.config); 
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
                that.renderer.draw(that.state, that.config, that._hass); 
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
                that.ui.updateStatus(that.state, that.config);
                that.renderer.draw(that.state, that.config, that._hass);
            }
        };
        this.editor.bindEvents(this.state, this.config, callbacks);
    }
    resetSelection() {
        this.state.selectedIndex = null;
        this.state.selectedPointIndex = null;
        this.state.isAddingNew = false;
        this.ui.updateStatus(this.state, this.config);
            this.renderer.draw(this.state, this.config, this.state.hass);
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
            this.ui.updateStatus(this.state, this.config);
            return false;
        }
        this.state.editing = true;
        this.ui.updateRadarList(this.state, this.config);
        this.state.points = [];
        this.state.dragState = { isDragging: false };
        this.ui.updateStatus(this.state, this.config);
        setTimeout(() => this.ui.updateLayoutInputs(this.state, h), 50);
        this.renderer.draw(this.state, this.config, h);
        return true;
    }
    exitEditMode() {
        this.state.editing = false;
        this.state.points = [];
        this.resetSelection();
        this.ui.updateStatus(this.state, this.config);
        this.renderer.draw(this.state, this.config, this.state.hass);
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
        if (this.isCreated) this.ui.updateStatus(this.state, this.config);
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
