import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CARD_PATH = (
    ROOT
    / "custom_components"
    / "radar_map_manager"
    / "www"
    / "radar-map-card.js"
)


class Phase3CardIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.card = CARD_PATH.read_text(encoding="utf-8")

    def method(self, signature, next_signature):
        start = self.card.index(signature)
        end = self.card.index(next_signature, start)
        return self.card[start:end]

    def test_set_config_sanitizes_before_live_assignment_or_sink(self):
        method = self.method("    setConfig(config) {", "\n    set hass(h) {")
        sanitize = method.index("sanitizeRoomaboutsReadOnlyConfig(config)")
        assignment = method.index("this.config = nextConfig")
        activation = method.index("this._activateRoomaboutsView()")

        self.assertLess(sanitize, assignment)
        self.assertLess(assignment, activation)
        self.assertNotIn("...config", method)
        self.assertNotIn("this.ui.render", method)
        self.assertNotIn("this.initLogic", method)

    def test_field_shell_bypasses_inherited_ui_render_and_uses_safe_dom(self):
        method = self.method(
            "    _createRoomaboutsShell() {",
            "\n    _activateRoomaboutsView() {",
        )
        self.assertIn("this.ui.injectStyles()", method)
        self.assertIn("document.createElement('div')", method)
        self.assertIn("document.createElementNS", method)
        self.assertIn("style.textContent = ROOMABOUTS_FIELD_LEDGER_CSS", method)
        for prohibited in (
            "innerHTML",
            "outerHTML",
            "insertAdjacentHTML",
            "new Image",
            "bg_image",
            "config.style",
        ):
            with self.subTest(prohibited=prohibited):
                self.assertNotIn(prohibited, method)

    def test_field_shell_owns_region_theme_and_visual_aria_contract(self):
        method = self.method(
            "    _createRoomaboutsShell() {",
            "\n    _activateRoomaboutsView() {",
        )
        for literal in (
            "root.classList.add('roomabouts-readonly')",
            "root.setAttribute('role', 'region')",
            "root.setAttribute('aria-label', 'Roomabouts field view')",
            "visual.setAttribute('aria-hidden', 'true')",
            "'map-container'",
            "mapContainer.style.zIndex = '4'",
            "'svg-canvas'",
            "'rmm-canvas'",
            "'dots-layer'",
            "'click-layer'",
            "'roomabouts-field-ledger-styles'",
            "viewBox",
            "preserveAspectRatio",
        ):
            with self.subTest(literal=literal):
                self.assertIn(literal, method)
        self.assertIn(
            "const visuals = [svg, canvas, dotsLayer, clickLayer]",
            method,
        )
        self.assertNotIn(
            "const visuals = [mapContainer",
            method,
            "the semantic list shares map-container and must not inherit aria-hidden",
        )

        deactivate = self.method(
            "    _deactivateRoomaboutsView() {",
            "\n    _attachRoomaboutsResumeListeners() {",
        )
        self.assertIn("themeStyle.remove()", deactivate)
        self.assertIn("root.remove()", deactivate)
        self.assertIn("this.isCreated = false", deactivate)

    def test_trail_store_has_one_construction_site_and_injected_runtime(self):
        self.assertEqual(self.card.count("new RoomaboutsTrailStore("), 1)
        method = self.method(
            "    _createRoomaboutsTrailStore() {",
            "\n    _ensureRoomaboutsTrailStore() {",
        )
        for literal in (
            "clock: () => performance.now()",
            "setTimeout: (callback, delay) => window.setTimeout(callback, delay)",
            "clearTimeout: (handle) => window.clearTimeout(handle)",
            "onChange: () => this._handleRoomaboutsTrailStoreChange()",
        ):
            with self.subTest(literal=literal):
                self.assertIn(literal, method)

    def test_accepted_result_is_observed_once_before_renderer_acceptance(self):
        self.assertEqual(self.card.count(".observeAccepted(presentation)"), 1)
        method = self.method(
            "    _acceptRoomaboutsPresentation(presentation) {",
            "\n    _toInheritedMapState(map) {",
        )
        observe = method.index(".observeAccepted(presentation)")
        reset = method.index("if (presentation.reset)")
        detached = method.index("this._roomaboutsPresentation = presentation")
        accept = method.index("this.renderer.acceptRoomaboutsPresentation(presentation)")
        render = method.index("this._drawCurrentView(this.state.hass)", accept)
        self.assertLess(observe, reset)
        self.assertLess(reset, detached)
        self.assertLess(detached, accept)
        self.assertLess(accept, render)
        self.assertIn("this._roomaboutsAcceptingPresentation = true", method)
        self.assertIn("this._roomaboutsAcceptingPresentation = false", method)

        handle = self.method("    handleNewData(rawData) {", "\n    _acceptRoomaboutsPresentation")
        self.assertLess(
            handle.index("if (!presentation.accepted)"),
            handle.index("this._acceptRoomaboutsPresentation(presentation)"),
        )

    def test_rejected_result_policy_is_frozen_and_never_observed(self):
        for reason in (
            "'invalid-snapshot'",
            "'logical-time-regression'",
            "'alias-binding-conflict'",
            "'track-lifetime-limit'",
        ):
            with self.subTest(reason=reason):
                self.assertIn(reason, self.card)

        handle = self.method("    handleNewData(rawData) {", "\n    _acceptRoomaboutsPresentation")
        rejected = handle[
            handle.index("if (!presentation.accepted)") :
            handle.index("if (this._isRoomaboutsFieldView())")
        ]
        self.assertIn("ROOMABOUTS_RESETTING_REJECTION_REASONS.has(presentation.reason)", rejected)
        self.assertIn("resetAdapter: false", rejected)
        self.assertIn("return", rejected)
        self.assertNotIn("observeAccepted", rejected)
        self.assertNotIn("acceptRoomaboutsPresentation", rejected)
        self.assertNotIn("'duplicate-sequence'", self.card.split("const ROOMABOUTS_RESETTING_REJECTION_REASONS", 1)[1].split("]);", 1)[0])
        self.assertNotIn("'out-of-order-sequence'", self.card.split("const ROOMABOUTS_RESETTING_REJECTION_REASONS", 1)[1].split("]);", 1)[0])

    def test_accepted_reset_preserves_the_already_observed_store(self):
        method = self.method(
            "    _acceptRoomaboutsPresentation(presentation) {",
            "\n    _toInheritedMapState(map) {",
        )
        reset_block = method[method.index("if (presentation.reset)") :]
        self.assertIn("resetTrailStore: false", reset_block)
        self.assertIn("resetAdapter: false", reset_block)
        self.assertLess(
            method.index(".observeAccepted(presentation)"),
            method.index("this._clearPresentation(presentation.resetReason"),
        )

    def test_final_empty_remains_an_accepted_renderer_update(self):
        method = self.method(
            "    _acceptRoomaboutsPresentation(presentation) {",
            "\n    _toInheritedMapState(map) {",
        )
        self.assertNotIn("presentation.tracks.length", method)
        self.assertNotIn("presentation.tracks.length === 0", self.card)
        self.assertIn("this.renderer.acceptRoomaboutsPresentation(presentation)", method)

    def test_render_paths_use_visible_only_and_card_mode_is_authoritative(self):
        self.assertEqual(self.card.count(".visible()"), 1)
        draw = self.method("    _drawCurrentView(hass) {", "\n    _once(unsubscribe) {")
        visible = draw.index(".visible()")
        records = draw.index("this.renderer.setRoomaboutsTrailRecords(visible.records)")
        renderer = draw.index("this.renderer.draw(this.state, this.config, hass)")
        self.assertLess(visible, records)
        self.assertLess(records, renderer)
        self.assertIn("this.renderer.setRoomaboutsTrailRecords(EMPTY_ROOMABOUTS_TRAIL_RECORDS)", draw)
        self.assertIn("this._roomaboutsTrailStore.reset(visible.reason)", draw)
        self.assertNotIn("observeAccepted", draw)

        queued = self.method("    _queueRender() {", "\n    _drawCurrentView(hass) {")
        self.assertIn("this._drawCurrentView(this.state.hass)", queued)
        self.assertNotIn("renderer.draw", queued)
        self.assertNotIn("observeAccepted", queued)

        self.assertNotIn("global_config?.target_render_mode", self.card)
        self.assertNotIn("global_config.target_render_mode", self.card)
        self.assertNotIn("presentation.map.config.target_render_mode", self.card)
        self.assertIn("this.config.target_render_mode", self.card)

    def test_resume_hooks_expire_and_fail_closed(self):
        method = self.method(
            "    _expireRoomaboutsTrails() {",
            "\n    _updateInheritedStatus() {",
        )
        self.assertEqual(method.count(".expire()"), 1)
        self.assertIn("if (!result.ok)", method)
        self.assertIn("setRoomaboutsTrailRecords(EMPTY_ROOMABOUTS_TRAIL_RECORDS)", method)
        self.assertIn("this._roomaboutsTrailStore.reset(result.reason)", method)
        self.assertIn("this._queueRender()", method)

        visibility = self.method(
            "    _handleRoomaboutsVisibilityChange() {",
            "\n    _handleRoomaboutsPageShow() {",
        )
        self.assertIn("document.visibilityState === 'visible'", visibility)
        self.assertIn("this._expireRoomaboutsTrails()", visibility)
        pageshow = self.method(
            "    _handleRoomaboutsPageShow() {",
            "\n    _expireRoomaboutsTrails() {",
        )
        self.assertIn("this._expireRoomaboutsTrails()", pageshow)

    def test_disconnect_destroy_and_remount_recreate_bounded_state(self):
        connected = self.method("    connectedCallback() {", "\n    disconnectedCallback() {")
        disconnected = self.method("    disconnectedCallback() {", "\n    static getStubConfig() {")
        clear = self.method("    _clearPresentation(reason, {", "\n    getMockHass(h) {")

        self.assertIn("this._ensureRoomaboutsTrailStore()", connected)
        self.assertIn("this._activateRoomaboutsView()", connected)
        self.assertIn("destroyTrailStore: true", disconnected)
        self.assertIn("this._deactivateRoomaboutsView()", disconnected)
        self.assertIn("this._roomaboutsTrailStore.destroy()", clear)
        self.assertIn("this._roomaboutsTrailStore = null", clear)
        self.assertIn("this._roomaboutsPresentation = null", clear)
        self.assertIn("this._roomaboutsTrailStore.reset(reason)", clear)

    def test_listener_symmetry_and_stream_contract_remain_unchanged(self):
        attach = self.method(
            "    _attachRoomaboutsResumeListeners() {",
            "\n    _detachRoomaboutsResumeListeners() {",
        )
        detach = self.method(
            "    _detachRoomaboutsResumeListeners() {",
            "\n    _handleRoomaboutsVisibilityChange() {",
        )
        self.assertIn("document.addEventListener('visibilitychange'", attach)
        self.assertIn("window.addEventListener('pageshow'", attach)
        self.assertIn("document.removeEventListener('visibilitychange'", detach)
        self.assertIn("window.removeEventListener('pageshow'", detach)
        self.assertNotIn("preventDefault", attach + detach)
        self.assertNotIn("setPointerCapture", attach + detach)
        self.assertEqual(self.card.count("{ type: 'rmm/stream' }"), 1)
        self.assertEqual(self.card.count("connection.subscribeMessage("), 1)

    def test_stream_requires_a_mounted_configured_field_view_in_any_setup_order(self):
        constructor = self.method("    constructor() {", "\n    _createRoomaboutsTrailStore() {")
        subscribe = self.method(
            "    _ensureStreamSubscription(hass) {",
            "\n    fetchData(force = false) {",
        )
        set_config = self.method("    setConfig(config) {", "\n    set hass(h) {")

        self.assertIn("this._isDisconnected = true", constructor)
        self.assertIn("!this.isConnected", subscribe)
        self.assertIn("!this.config", subscribe)
        self.assertIn("!this._isRoomaboutsFieldView()", subscribe)
        self.assertIn("this._ensureStreamSubscription(this.state.rawHass)", set_config)

    def test_field_path_skips_inherited_status_editor_and_target_filter(self):
        status = self.method(
            "    _updateInheritedStatus() {",
            "\n    set layout(val) {",
        )
        self.assertIn("if (this._isRoomaboutsFieldView()) return", status)

        init_logic = self.method("    initLogic() {", "\n    resetSelection() {")
        self.assertIn("if (this._isRoomaboutsFieldView()) return", init_logic)

        accepted = self.method(
            "    _acceptRoomaboutsPresentation(presentation) {",
            "\n    _toInheritedMapState(map) {",
        )
        for prohibited in (
            "ui.updateStatus",
            "ui.render",
            "initLogic",
            "updateFusedTargets",
            "_toInheritedMapState",
            "_toFusedTarget",
        ):
            with self.subTest(prohibited=prohibited):
                self.assertNotIn(prohibited, accepted)


if __name__ == "__main__":
    unittest.main()
