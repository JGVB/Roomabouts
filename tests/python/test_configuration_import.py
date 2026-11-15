"""Tests for bounded, allowlisted configuration import."""

from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[2]


def _load_module(name: str, relative_path: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {relative_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


configuration = _load_module(
    "roomabouts_configuration_test_module",
    "custom_components/radar_map_manager/configuration.py",
)


def _valid_configuration() -> dict:
    zone = {
        "name": "Living area",
        "points": [[0, 0], [100, 0], [100, 100], [0, 100]],
        "delay": 2,
    }
    return {
        "version": 1,
        "maps": {
            "default": {
                "zones": {
                    "include_zones": [zone],
                    "exclude_zones": [],
                    "entrance_zones": [],
                    "stationary_zones": [],
                },
                "config": {
                    "update_interval": 0.2,
                    "merge_distance": 0.8,
                    "target_height": 1.5,
                    "fused_color": "#FFD700",
                    "zone_stroke": 0.8,
                    "enable_tracking": True,
                    "target_render_mode": "canvas",
                },
            }
        },
        "radars": {
            "living_room_radar": {
                "map_group": "default",
                "paused": False,
                "layout": {
                    "origin_x": 50,
                    "origin_y": 50,
                    "scale_x": 5,
                    "scale_y": 5,
                    "rotation": 0,
                    "mirror_x": False,
                    "radar_type": 2,
                },
                "monitor_zones": [zone],
                "hw_detect_zones": [],
                "hw_block_zones": [],
                "hw_stay_zones": [],
            }
        },
    }


class ConfigurationImportTests(unittest.TestCase):
    def assertRejected(self, value) -> None:  # noqa: N802 - unittest convention
        with self.assertRaises(configuration.ConfigurationImportError):
            if isinstance(value, str):
                configuration.parse_configuration_import(value)
            else:
                configuration.validate_configuration(value)

    def test_valid_configuration_is_normalized_and_detached(self) -> None:
        original = _valid_configuration()

        result = configuration.parse_configuration_import(json.dumps(original))

        self.assertEqual(result["version"], 1)
        self.assertEqual(result["radars"]["living_room_radar"]["map_group"], "default")
        self.assertEqual(
            result["maps"]["default"]["zones"]["include_zones"][0]["points"][1],
            [100.0, 0.0],
        )
        result["maps"]["default"]["config"]["update_interval"] = 1.0
        self.assertEqual(original["maps"]["default"]["config"]["update_interval"], 0.2)

    def test_rejects_credentials_and_authentication_state(self) -> None:
        for key, value in (
            ("device_pin", "CANARY-PIN-NOT-A-REAL-CREDENTIAL"),
            ("token", "canary-token"),
            ("password", "canary-password"),
            ("auth_passed", True),
            ("api_key", "canary-key"),
        ):
            with self.subTest(key=key):
                candidate = _valid_configuration()
                candidate["radars"]["living_room_radar"][key] = value
                self.assertRejected(candidate)

    def test_rejection_message_does_not_echo_untrusted_keys_or_values(self) -> None:
        canary = "CANARY-CREDENTIAL-MUST-NOT-LEAK"
        candidate = _valid_configuration()
        candidate["radars"]["living_room_radar"][f"unknown_{canary}"] = canary

        with self.assertRaises(configuration.ConfigurationImportError) as raised:
            configuration.validate_configuration(candidate)

        self.assertNotIn(canary, str(raised.exception))

    def test_rejects_network_destinations_and_transport_settings(self) -> None:
        for key, value in (
            ("radar_ip", "192.0.2.10"),
            ("url", "ws://192.0.2.10:81"),
            ("host", "radar.local"),
            ("udp_port", 18888),
            ("stream_mode", "mqtt"),
        ):
            with self.subTest(key=key):
                candidate = _valid_configuration()
                candidate["radars"]["living_room_radar"][key] = value
                self.assertRejected(candidate)

    def test_rejects_runtime_and_coordinate_snapshot_fields(self) -> None:
        candidates = []
        for key in ("targets", "tracks", "sources", "source_health", "live_data"):
            candidate = _valid_configuration()
            candidate["maps"]["default"][key] = []
            candidates.append((key, candidate))
        for key, candidate in candidates:
            with self.subTest(key=key):
                self.assertRejected(candidate)

    def test_rejects_unknown_and_legacy_broad_shapes(self) -> None:
        candidate = _valid_configuration()
        candidate["unexpected"] = {}
        self.assertRejected(candidate)

        self.assertRejected(
            {
                "global_config": {"update_interval": 0.1},
                "living_room_radar": {"map_group": "default"},
            }
        )

    def test_rejects_oversized_json(self) -> None:
        oversized = " " * (configuration.MAX_CONFIG_JSON_BYTES + 1)
        self.assertRejected(oversized)

    def test_rejects_excessive_nesting_and_collection_size(self) -> None:
        nested: object = 0
        for _ in range(configuration.MAX_NESTING_DEPTH + 2):
            nested = {"wrapper": nested}
        self.assertRejected(nested)

        candidate = _valid_configuration()
        candidate["maps"]["default"]["zones"]["include_zones"] = [
            {"points": [[0, 0], [1, 0], [0, 1]]}
        ] * (configuration.MAX_ZONES_PER_KIND + 1)
        self.assertRejected(candidate)

    def test_rejects_non_finite_and_out_of_range_numbers(self) -> None:
        self.assertRejected(
            '{"version":1,"maps":{"default":{"config":{"update_interval":NaN}}},"radars":{}}'
        )

        candidate = _valid_configuration()
        candidate["maps"]["default"]["config"]["update_interval"] = math.inf
        self.assertRejected(candidate)

        candidate = _valid_configuration()
        candidate["maps"]["default"]["config"]["panel_opacity"] = 1.1
        self.assertRejected(candidate)

        candidate = _valid_configuration()
        candidate["radars"]["living_room_radar"]["layout"]["scale_x"] = 0
        self.assertRejected(candidate)

        candidate = _valid_configuration()
        candidate["maps"]["default"]["zones"]["include_zones"][0]["points"][0][0] = 100_001
        self.assertRejected(candidate)

    def test_rejects_duplicate_json_keys(self) -> None:
        self.assertRejected(
            '{"version":1,"version":2,"maps":{"default":{}},"radars":{}}'
        )

    def test_rejects_radar_reference_to_unknown_map(self) -> None:
        candidate = _valid_configuration()
        candidate["radars"]["living_room_radar"]["map_group"] = "missing"
        self.assertRejected(candidate)

    def test_rejects_invalid_zone_and_layout_keys(self) -> None:
        candidate = _valid_configuration()
        candidate["maps"]["default"]["zones"]["include_zones"][0]["script"] = "x"
        self.assertRejected(candidate)

        candidate = _valid_configuration()
        candidate["maps"]["default"]["zones"]["include_zones"][0]["name"] = (
            "<img src=x onerror=alert(1)>"
        )
        self.assertRejected(candidate)

        candidate = _valid_configuration()
        candidate["radars"]["living_room_radar"]["layout"]["radar_ip"] = "192.0.2.1"
        self.assertRejected(candidate)


if __name__ == "__main__":
    unittest.main()
