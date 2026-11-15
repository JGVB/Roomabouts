from __future__ import annotations

import asyncio
from copy import deepcopy
import importlib
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[2]
PACKAGE_PATH = ROOT / "custom_components/radar_map_manager"


def install_package():
    custom_components = sys.modules.setdefault("custom_components", types.ModuleType("custom_components"))
    custom_components.__path__ = [str(ROOT / "custom_components")]
    package = sys.modules.setdefault(
        "custom_components.radar_map_manager",
        types.ModuleType("custom_components.radar_map_manager"),
    )
    package.__path__ = [str(PACKAGE_PATH)]


install_package()
runtime_state = importlib.import_module("custom_components.radar_map_manager.runtime_state")


def load_coordinator_module():
    storage_module = types.ModuleType("homeassistant.helpers.storage")

    class DummyStore:
        def __init__(self, *args, **kwargs):
            pass

    storage_module.Store = DummyStore
    sys.modules.setdefault("homeassistant", types.ModuleType("homeassistant"))
    helpers = sys.modules.setdefault("homeassistant.helpers", types.ModuleType("homeassistant.helpers"))
    helpers.__path__ = []
    sys.modules["homeassistant.helpers.storage"] = storage_module
    sys.modules.pop("custom_components.radar_map_manager.coordinator", None)
    return importlib.import_module("custom_components.radar_map_manager.coordinator")


class StorageMigrationTests(unittest.TestCase):
    def legacy_store(self):
        return {
            "version": 1,
            "_force_reset_history": True,
            "enable_udp": True,
            "udpPort": 18888,
            "stream_mode": "mqtt",
            "mqttTopic": "rmm/#",
            "live_data": {"CANARY": [{"x": 99, "y": 98}]},
            "Targets": [{"x": 87, "y": 86}],
            "maps": {
                "default": {
                    "targets": [{"x": 91, "y": 92}],
                    "runtime_targets": [{"x": 93, "y": 94}],
                    "RuntimeTargets": [{"x": 89, "y": 88}],
                    "sourceHealth": {"radar": "online"},
                    "zones": {"include_zones": [{"name": "room", "points": [[0, 0], [1, 0], [1, 1]]}]},
                    "config": {"merge_distance": 0.8, "show_trails": True, "port": 7},
                }
            },
            "radars": {
                "radar": {
                    "map_group": "default",
                    "targets": [{"x": 95, "y": 96}],
                    "auth_passed": True,
                    "capabilities": {"z": True, "ip": "198.51.100.9"},
                    "device_pin": "PIN-CANARY-7419",
                    "radar_ip": "198.51.100.20",
                    "devicePin": "PIN-CANARY-CAMEL",
                    "radarIp": "198.51.100.21",
                    "apiKey": "API-CANARY-CAMEL",
                    "networkDestination": "wss://198.51.100.22/ws",
                    "port": 8080,
                    "websocket": "ws://198.51.100.23/live",
                    "mqttBroker": "198.51.100.24",
                    "liveData": [{"x": 85, "y": 84}],
                    "layout": {"origin_x": 50, "origin_y": 50},
                }
            },
        }

    def test_v1_to_v2_strips_runtime_coordinates_and_credentials(self):
        original = self.legacy_store()
        untouched = deepcopy(original)

        clean, removed = runtime_state.migrate_storage(original)

        self.assertEqual(original, untouched)
        self.assertEqual(clean["version"], 2)
        self.assertNotIn("targets", clean["maps"]["default"])
        self.assertNotIn("runtime_targets", clean["maps"]["default"])
        self.assertNotIn("RuntimeTargets", clean["maps"]["default"])
        self.assertNotIn("sourceHealth", clean["maps"]["default"])
        self.assertNotIn("targets", clean["radars"]["radar"])
        self.assertNotIn("auth_passed", clean["radars"]["radar"])
        self.assertNotIn("capabilities", clean["radars"]["radar"])
        self.assertNotIn("device_pin", clean["radars"]["radar"])
        self.assertNotIn("radar_ip", clean["radars"]["radar"])
        self.assertNotIn("devicePin", clean["radars"]["radar"])
        self.assertNotIn("radarIp", clean["radars"]["radar"])
        self.assertNotIn("apiKey", clean["radars"]["radar"])
        self.assertNotIn("networkDestination", clean["radars"]["radar"])
        self.assertNotIn("live_data", clean)
        self.assertNotIn("Targets", clean)
        self.assertNotIn("enable_udp", clean)
        self.assertNotIn("udpPort", clean)
        self.assertNotIn("stream_mode", clean)
        self.assertNotIn("mqttTopic", clean)
        self.assertIn("maps.default.targets", removed)
        self.assertEqual(clean["maps"]["default"]["config"]["merge_distance"], 0.8)
        self.assertEqual(clean["maps"]["default"]["config"]["port"], 7)
        self.assertEqual(clean["radars"]["radar"]["layout"]["origin_x"], 50)
        self.assertNotIn("port", clean["radars"]["radar"])
        self.assertNotIn("websocket", clean["radars"]["radar"])
        self.assertNotIn("mqttBroker", clean["radars"]["radar"])
        self.assertNotIn("liveData", clean["radars"]["radar"])

    def test_migration_is_idempotent_and_configuration_only(self):
        once, _ = runtime_state.migrate_storage(self.legacy_store())
        twice, removed = runtime_state.migrate_storage(once)

        self.assertEqual(once, twice)
        self.assertEqual(removed, ())
        self.assertTrue(runtime_state.storage_is_configuration_only(twice))

    def test_runtime_generation_reset_clears_coordinates_health_and_sequence(self):
        ids = iter(("generation-a", "generation-b"))
        runtime = runtime_state.RuntimeState(generation_factory=lambda: next(ids))
        runtime.set_map_targets("default", [{"x": 1, "y": 2}])
        runtime.set_radar_targets("radar", [{"positionMeters": {"x": 1, "y": 2}}])
        runtime.set_source_health("radar", "online", "available", 10)
        first = runtime.next_snapshot_context(10)

        runtime.begin_generation("privacy-clear", 20)
        reset = runtime.next_snapshot_context(20)
        following = runtime.next_snapshot_context(21)

        self.assertEqual(first["sequence"], 0)
        self.assertEqual(runtime.map_targets, {})
        self.assertEqual(runtime.radar_targets, {})
        self.assertEqual(runtime.source_health, {})
        self.assertEqual(reset["generationId"], "generation-b")
        self.assertEqual(reset["sequence"], 0)
        self.assertEqual(reset["resetReason"], "privacy-clear")
        self.assertNotIn("resetReason", following)

    def test_store_subclass_migration_hook_handles_v1_envelope(self):
        coordinator = load_coordinator_module()
        store = object.__new__(coordinator.RoomaboutsStore)

        migrated = asyncio.run(store._async_migrate_func(1, 1, self.legacy_store()))

        self.assertEqual(migrated["version"], 2)
        self.assertNotIn("targets", migrated["maps"]["default"])
        self.assertNotIn("device_pin", migrated["radars"]["radar"])

    def test_coordinator_save_sanitizes_and_new_radar_has_no_exclusive_auth_state(self):
        coordinator_module = load_coordinator_module()
        coordinator = coordinator_module.RadarCoordinator(None)

        class CaptureStore:
            def __init__(self):
                self.saved = None

            async def async_save(self, value):
                self.saved = deepcopy(value)

        capture = CaptureStore()
        coordinator._store = capture
        coordinator.data = coordinator._get_empty_data()
        coordinator.data["maps"]["default"]["targets"] = [{"x": 1, "y": 2}]
        with self.assertLogs(coordinator_module._LOGGER, level="WARNING"):
            asyncio.run(coordinator.async_add_radar("entity-radar"))

        radar = coordinator.data["radars"]["entity-radar"]
        self.assertNotIn("auth_passed", radar)
        self.assertNotIn("capabilities", radar)
        self.assertNotIn("targets", coordinator.data["maps"]["default"])
        self.assertNotIn("targets", capture.saved["maps"]["default"])


if __name__ == "__main__":
    unittest.main()
