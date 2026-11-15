import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
COMPONENT = ROOT / "custom_components" / "radar_map_manager"
WWW = COMPONENT / "www"


class Phase2CardIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.card = (WWW / "radar-map-card.js").read_text(encoding="utf-8")
        cls.renderer = (WWW / "radar-renderer.js").read_text(encoding="utf-8")
        cls.math = (WWW / "radar-math.js").read_text(encoding="utf-8")
        cls.ui = (WWW / "radar-ui.js").read_text(encoding="utf-8")

    def test_card_has_one_validated_presentation_adapter_before_draft_gates(self):
        self.assertEqual(
            self.card.count("import { RoomaboutsPresentationAdapter }"),
            1,
        )
        self.assertEqual(
            self.card.count("new RoomaboutsPresentationAdapter()"),
            1,
        )
        ingest = self.card.index("this.presentationAdapter.ingest(rawData)")
        ignore_gate = self.card.index("this.ignoreUpdatesUntil > 0", ingest)
        draft_gate = self.card.index("if (!this.state.hasUnsavedChanges", ingest)
        calibration_gate = self.card.index("const isFrozen", ingest)
        self.assertLess(ingest, ignore_gate)
        self.assertLess(ingest, draft_gate)
        self.assertLess(ingest, calibration_gate)

        for obsolete in (
            "_adaptV2ToV1",
            "fullRawData",
            "JSON.parse(JSON.stringify(rawData))",
        ):
            with self.subTest(obsolete=obsolete):
                self.assertNotIn(obsolete, self.card)

    def test_validated_map_and_tracks_keep_explicit_roomabouts_semantics(self):
        for literal in (
            "map.zones",
            "map.config",
            "map.radars",
            "track.lifecycle",
            "track.positionBasis",
            "track.anonymousAlias",
            "track.emitFootprint",
        ):
            with self.subTest(literal=literal):
                self.assertIn(literal, self.card)

        presentation_sources = self.card + self.renderer + self.ui
        self.assertNotIn("sources.includes", presentation_sources)
        self.assertNotIn("replace('target_'", presentation_sources)
        self.assertNotIn('replace("target_"', presentation_sources)
        self.assertNotIn("Fused ID", presentation_sources)
        self.assertIn("t.anonymousAlias", self.renderer)
        self.assertIn("fallenTarget.anonymousAlias", self.ui)

    def test_phase2_card_is_forced_read_only_and_edit_entry_fails_closed(self):
        self.assertIn("this.config = { ...config, read_only: true }", self.card)
        self.assertIn("if (!this.config.read_only) this.initLogic()", self.card)
        self.assertIn("return { ...h, states: {} }", self.card)
        self.assertIn("const sanitizedHass = this.getMockHass(h)", self.card)
        self.assertIn("this.state.rawHass = sanitizedHass", self.card)
        self.assertNotIn("this._hass = h", self.card)
        self.assertNotIn("this.state.rawHass = h", self.card)
        self.assertIn("if (this.config?.read_only)", self.card)
        guard = self.card.index("if (this.config?.read_only)", self.card.index("enterEditMode"))
        edit_enable = self.card.index("this.state.editing = true", guard)
        self.assertLess(guard, edit_enable)
        self.assertIn("this.state.editing = false", self.card[guard:edit_enable])

    def test_reset_and_connection_boundaries_share_one_clear_path(self):
        self.assertIn("if (presentation.reset)", self.card)
        self.assertIn("this._clearPresentation(presentation.resetReason", self.card)
        self.assertGreaterEqual(self.card.count("this._clearPresentation('disconnect'"), 3)
        self.assertEqual(self.card.count("_clearPresentation(reason, {"), 1)
        for cleared_state in (
            "this.state.fused_targets = []",
            "this.state.sourceHealth = []",
            "this.state.historyStack = []",
            "this.renderer.clearRuntime()",
            "this.renderer.destroy()",
        ):
            with self.subTest(cleared_state=cleared_state):
                self.assertIn(cleared_state, self.card)

    def test_subscription_epoch_and_renderer_teardown_are_wired(self):
        for literal in (
            "this._subscriptionEpoch += 1",
            "const epoch = ++this._subscriptionEpoch",
            "epoch !== this._subscriptionEpoch",
            "const safeUnsubscribe = this._once(unsubscribe)",
            "safeUnsubscribe()",
        ):
            with self.subTest(literal=literal):
                self.assertIn(literal, self.card)

        for literal in (
            "clearRuntime()",
            "destroy()",
            "cancelAnimationFrame(this.animFrameId)",
            "this.targetFilter.clear()",
            "clearTimeout(timerId)",
            "this._ro.disconnect()",
            "window.removeEventListener('resize', this._resizeHandler)",
        ):
            with self.subTest(literal=literal):
                self.assertIn(literal, self.renderer)

        self.assertIn("this.lastFrameTime = this._clock()", self.math)

    def test_six_frontend_modules_share_the_numeric_manifest_version(self):
        manifest = json.loads((COMPONENT / "manifest.json").read_text(encoding="utf-8"))
        modules = tuple(sorted(WWW.glob("*.js")))
        self.assertEqual(len(modules), 6)
        self.assertEqual(manifest["version"], "1.4.0")
        self.assertIn("./roomabouts-presentation.js?v=1.4.0", self.card)
        for source in modules:
            text = source.read_text(encoding="utf-8")
            self.assertNotIn("?v=1.3.12", text, source.name)


if __name__ == "__main__":
    unittest.main()
