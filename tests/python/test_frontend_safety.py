import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WWW = ROOT / "custom_components" / "radar_map_manager" / "www"
FRONTEND = tuple(sorted(WWW.glob("*.js")))

FORBIDDEN_LITERALS = (
    "mqtt",
    "rmm_radar/",
    "rmm/subscribe_stream",
    "rmm/start_pair_window",
    "rmm/cancel_pair_window",
    "rmm_pair_result",
    "rmm_auth_result",
    "rmm_hw_zone_confirmed",
    "device_pin",
    "radar_ip",
    "auth_passed",
    "discovered_radars",
    "configuration_url",
    "capabilities",
    "directTargets",
    "directFusedTargets",
    "activePointCloud",
    "show_pointcloud",
    "auto_block_duration",
    "btn-radar-web",
    "btn-radar-ota",
    "btn-auto-block",
    "btn-edit-radar",
    "row-point-cloud",
    "chk-eng-mode",
)

FORBIDDEN_ACTIONS = (
    "callWS(",
    "subscribeEvents(",
    "window.open(",
    "fetch(",
    "new WebSocket(",
    "new EventSource(",
    "sendBeacon(",
)

SERVICE_CALL = re.compile(r"callService\(\s*['\"](?P<domain>[^'\"]+)['\"]")
DIRECT_NETWORK_SINK = re.compile(
    r"\b(?:fetch|EventSource|sendBeacon)\s*\(|"
    r"\bnew\s+(?:window\.)?WebSocket\s*\("
)
ADD_PAYLOAD = re.compile(
    r"const\s+payload\s*=\s*(?P<payload>\{.*?\})\s*;\s*"
    r"state\.hass\.callService\(\s*['\"]radar_map_manager['\"]\s*,\s*"
    r"['\"]add_radar['\"]\s*,\s*payload\s*\)",
    re.DOTALL,
)
OBJECT_KEY = re.compile(r"(?:^|[{,])\s*(?P<key>[A-Za-z_][A-Za-z0-9_]*)\s*:")


class FrontendSafetyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sources = {path.name: path.read_text(encoding="utf-8") for path in FRONTEND}
        cls.bundle = "\n".join(cls.sources.values())

    def test_exclusive_transport_credentials_and_controls_are_absent(self):
        self.assertEqual(
            set(self.sources),
            {
                "radar-editor.js",
                "radar-map-card.js",
                "radar-math.js",
                "radar-renderer.js",
                "radar-ui.js",
                "roomabouts-presentation.js",
            },
        )
        lower_bundle = self.bundle.lower()

        for literal in FORBIDDEN_LITERALS:
            with self.subTest(literal=literal):
                self.assertNotIn(literal.lower(), lower_bundle)

        for action in FORBIDDEN_ACTIONS:
            with self.subTest(action=action):
                self.assertNotIn(action, self.bundle)

        self.assertNotRegex(self.bundle, DIRECT_NETWORK_SINK)

    def test_only_admin_snapshot_websocket_subscription_remains(self):
        card = self.sources["radar-map-card.js"]
        self.assertEqual(self.bundle.count("subscribeMessage("), 1)
        self.assertEqual(card.count("{ type: 'rmm/stream' }"), 1)

    def test_frontend_service_calls_use_only_roomabouts_domain(self):
        matches = [
            match
            for source in self.sources.values()
            for match in SERVICE_CALL.finditer(source)
        ]
        self.assertEqual(self.bundle.count("callService("), len(matches))
        domains = {match.group("domain") for match in matches}
        self.assertEqual(domains, {"radar_map_manager"})

    def test_snapshot_export_and_config_import_ui_are_unavailable(self):
        forbidden = (
            "btn-backup",
            "btn-restore",
            "file-upload",
            'type="file"',
            "confirm_restore",
            "restore_ok",
            "rmm_full_backup",
            "new Blob(",
            "createObjectURL",
            "revokeObjectURL",
            "FileReader",
            "readAsText(",
            "a.download",
            "import_config",
        )
        for literal in forbidden:
            with self.subTest(literal=literal):
                self.assertNotIn(literal, self.bundle)

    def test_background_image_sinks_use_only_normalized_asset_path(self):
        ui = self.sources["radar-ui.js"]
        self.assertEqual(ui.count("config.bg_image"), 1)
        self.assertIn(
            "normalizeSameOriginAssetUrl(config.bg_image, window.location.origin)",
            ui,
        )
        self.assertIn("rootEl.style.backgroundImage = `url(${JSON.stringify(safeAssetPath)})`", ui)
        self.assertIn("img.src = safeAssetPath", ui)
        self.assertNotRegex(
            ui,
            r"(?:backgroundImage|\.src)\s*=\s*[^;\n]*config\.bg_image",
        )
        self.assertNotRegex(ui, r"\.src\s*=\s*config(?:\.|\[)")
        self.assertNotRegex(
            ui,
            r"style\.(?:background|backgroundImage)\s*=\s*[^;\n]*config(?:\.|\[)",
        )
        self.assertNotRegex(ui, r"url\([^\n]*config(?:\.|\[)")

    def test_add_radar_payload_contains_no_network_or_secret_fields(self):
        editor = self.sources["radar-editor.js"]
        match = ADD_PAYLOAD.search(editor)
        self.assertIsNotNone(match)
        keys = {key.group("key") for key in OBJECT_KEY.finditer(match.group("payload"))}
        self.assertEqual(keys, {"radar_name", "map_group"})

    def test_catalog_uses_roomabouts_name_with_compatible_element_type(self):
        card = self.sources["radar-map-card.js"]
        self.assertIn("%c ROOMABOUTS %c Loaded ", card)
        self.assertIn('type: "radar-map-card"', card)
        self.assertIn('name: "Roomabouts Map"', card)
        self.assertNotIn("Radar Map Manager", self.bundle)


if __name__ == "__main__":
    unittest.main()
