"""Tests for bounded, allowlisted configuration import."""

from __future__ import annotations

import copy
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

    def test_full_import_normalizes_only_absent_map_groups_to_default(self) -> None:
        for missing_value in ("missing", None, ""):
            with self.subTest(missing_value=missing_value):
                candidate = _valid_configuration()
                radar = candidate["radars"]["living_room_radar"]
                if missing_value == "missing":
                    radar.pop("map_group")
                else:
                    radar["map_group"] = missing_value

                plan = configuration.plan_configuration_import(json.dumps(candidate))
                result = plan.configuration

                self.assertTrue(plan.replace)
                self.assertEqual(
                    result["radars"]["living_room_radar"]["map_group"],
                    "default",
                )

        candidate = _valid_configuration()
        candidate["maps"] = {"floor_2": candidate["maps"].pop("default")}
        candidate["radars"]["living_room_radar"].pop("map_group")
        with self.assertRaises(configuration.ConfigurationImportError):
            configuration.plan_configuration_import(json.dumps(candidate))

        for invalid_value in ("../unsafe", " ", [], {}):
            with self.subTest(invalid_value=invalid_value):
                candidate = _valid_configuration()
                candidate["radars"]["living_room_radar"][
                    "map_group"
                ] = invalid_value
                with self.assertRaises(configuration.ConfigurationImportError):
                    configuration.plan_configuration_import(json.dumps(candidate))

        candidate = _valid_configuration()
        candidate["maps"]["default"]["config"]["update_interval"] = None
        with self.assertRaises(configuration.ConfigurationImportError):
            configuration.plan_configuration_import(json.dumps(candidate))

    def test_full_import_plan_replaces_the_existing_store(self) -> None:
        plan = configuration.plan_configuration_import(
            json.dumps(_valid_configuration()), map_group="ignored_map"
        )
        existing = {
            "version": 2,
            "maps": {"unrelated": {"zones": {}, "config": {}}},
            "radars": {"unrelated_radar": {"map_group": "unrelated"}},
        }

        result = configuration.apply_configuration_import(existing, plan)

        self.assertTrue(plan.replace)
        self.assertIsNone(plan.map_group)
        self.assertNotIn("unrelated", result["maps"])
        self.assertNotIn("unrelated_radar", result["radars"])

        with self.assertRaises(configuration.ConfigurationImportError):
            configuration.plan_configuration_import(
                json.dumps(_valid_configuration()), map_group="../unsafe"
            )

    def test_legacy_single_floor_import_merges_only_its_target_map(self) -> None:
        zone = {"name": "Imported", "points": [[0, 0], [10, 0], [0, 10]]}
        legacy = {
            "global_zones": {
                "include_zones": [zone],
                "exclude_zones": [],
            },
            "global_config": {"update_interval": 0.5},
            "legacy_radar": {
                "map_group": "old_map",
                "paused": False,
                "layout": {"origin_x": 20, "origin_y": 30},
                "monitor_zones": [zone],
            },
        }
        existing = {
            "version": 2,
            "maps": {
                "default": {"zones": {}, "config": {"update_interval": 0.1}},
                "floor_2": {
                    "zones": {"include_zones": []},
                    "config": {"show_labels": True, "update_interval": 0.1},
                },
            },
            "radars": {
                "existing_radar": {"map_group": "default", "paused": False}
            },
        }
        untouched = copy.deepcopy(existing)

        plan = configuration.plan_configuration_import(
            json.dumps(legacy), map_group="floor_2"
        )
        result = configuration.apply_configuration_import(existing, plan)

        self.assertFalse(plan.replace)
        self.assertEqual(plan.map_group, "floor_2")
        self.assertEqual(existing, untouched)
        self.assertEqual(result["maps"]["default"], existing["maps"]["default"])
        self.assertTrue(result["maps"]["floor_2"]["config"]["show_labels"])
        self.assertEqual(result["maps"]["floor_2"]["config"]["update_interval"], 0.5)
        self.assertEqual(
            result["maps"]["floor_2"]["zones"]["include_zones"][0]["name"],
            "Imported",
        )
        self.assertIn("existing_radar", result["radars"])
        self.assertEqual(result["radars"]["legacy_radar"]["map_group"], "floor_2")

    def test_legacy_merge_rejects_aggregate_map_and_radar_growth(self) -> None:
        scenarios = (
            (
                {
                    "version": 2,
                    "maps": {
                        f"map_{index}": {} for index in range(configuration.MAX_MAPS)
                    },
                    "radars": {},
                },
                {"global_config": {}},
                "new_map",
            ),
            (
                {
                    "version": 2,
                    "maps": {"default": {}},
                    "radars": {
                        f"radar_{index}": {"map_group": "default"}
                        for index in range(configuration.MAX_RADARS)
                    },
                },
                {"new_radar": {}},
                "default",
            ),
        )
        for existing, legacy, map_group in scenarios:
            with self.subTest(map_group=map_group, legacy=legacy):
                untouched = copy.deepcopy(existing)
                plan = configuration.plan_configuration_import(
                    json.dumps(legacy), map_group=map_group
                )

                with self.assertRaises(configuration.ConfigurationImportError):
                    configuration.apply_configuration_import(existing, plan)

                self.assertEqual(existing, untouched)

    def test_legacy_merge_rejects_oversized_final_tree_without_mutation(self) -> None:
        point = [0, 0]
        zone = {"points": [point] * configuration.MAX_POINTS_PER_ZONE}
        existing = {
            "version": 2,
            "maps": {
                "default": {
                    "zones": {"include_zones": [zone] * 103},
                    "config": {},
                }
            },
            "radars": {},
        }
        configuration.validate_aggregate_configuration_bounds(existing)
        untouched = copy.deepcopy(existing)
        plan = configuration.plan_configuration_import(
            json.dumps({"new_radar": {"monitor_zones": [zone]}}),
            map_group="default",
        )

        with self.assertRaises(configuration.ConfigurationImportError):
            configuration.apply_configuration_import(existing, plan)

        self.assertEqual(existing, untouched)

    def test_legacy_import_rejects_secrets_network_and_runtime_fields(self) -> None:
        for key, value in (
            ("device_pin", "CANARY-PIN-NOT-A-REAL-CREDENTIAL"),
            ("radar_ip", "192.0.2.10"),
            ("targets", [{"x": 1, "y": 2}]),
        ):
            with self.subTest(key=key):
                legacy = {"legacy_radar": {key: value}}
                with self.assertRaises(configuration.ConfigurationImportError):
                    configuration.plan_configuration_import(
                        json.dumps(legacy), map_group="default"
                    )

    def test_legacy_import_rejects_invalid_target_or_mixed_format(self) -> None:
        with self.assertRaises(configuration.ConfigurationImportError):
            configuration.plan_configuration_import(
                json.dumps({"global_config": {"update_interval": 0.5}}),
                map_group="../unsafe",
            )

        with self.assertRaises(configuration.ConfigurationImportError):
            configuration.plan_configuration_import(
                json.dumps(
                    {
                        "version": 1,
                        "global_config": {"update_interval": 0.5},
                    }
                ),
                map_group="default",
            )

    def test_legacy_import_applies_tree_bounds_before_normalization(self) -> None:
        nested: object = 0
        for _ in range(configuration.MAX_NESTING_DEPTH + 2):
            nested = {"wrapper": nested}

        with self.assertRaisesRegex(
            configuration.ConfigurationImportError, "nesting exceeds"
        ):
            configuration.plan_configuration_import(
                json.dumps({"legacy_radar": {"layout": nested}}),
                map_group="default",
            )

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
