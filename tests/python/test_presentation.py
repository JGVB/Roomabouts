from __future__ import annotations

import asyncio
from copy import deepcopy
import importlib
import importlib.util
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[2]
PRESENTATION_PATH = ROOT / "custom_components/radar_map_manager/presentation.py"
OBSERVATION_PATH = ROOT / "custom_components/radar_map_manager/observation.py"


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


presentation = load(PRESENTATION_PATH, "roomabouts_presentation")
observation = load(OBSERVATION_PATH, "roomabouts_observation_for_presentation")


class PresentationTests(unittest.TestCase):
    def configuration(self):
        return {
            "version": 2,
            "maps": {
                "default": {
                    "config": {
                        "merge_distance": 0.8,
                        "show_trails": True,
                        "device_pin": "PIN-CANARY-DO-NOT-STREAM",
                        "unknown_secret": "TOKEN-CANARY-DO-NOT-STREAM",
                    },
                    "zones": {
                        "include_zones": [
                            {
                                "name": "Living room",
                                "points": [[0, 0], [100, 0], [100, 100]],
                                "token": "ZONE-CANARY",
                            }
                        ]
                    },
                    "targets": [{"x": 999, "y": 998}],
                }
            },
            "radars": {
                "radar": {
                    "map_group": "default",
                    "layout": {"origin_x": 50, "origin_y": 50, "rotation": 0},
                    "device_pin": "RADAR-PIN-CANARY",
                    "radar_ip": "198.51.100.44",
                    "targets": [{"x": 997, "y": 996}],
                },
                "198.51.100.47": {
                    "map_group": "default",
                    "layout": {"origin_x": 10, "origin_y": 10},
                    "radar_ip": "198.51.100.47",
                }
            },
            "discovered_radars": {"198.51.100.45": "NETWORK-CANARY"},
        }

    def runtime(self):
        return {
            "mapTargets": {
                "default": [
                    {
                        "id": "target_1",
                        "x": 55.0,
                        "y": 40.0,
                        "sources": ["198.51.100.47:1"],
                        "posture": "standing",
                        "observedAt": 900,
                        "device_pin": "TRACK-PIN-CANARY",
                    },
                    {
                        "id": "target_2",
                        "x": 30.0,
                        "y": 25.0,
                        "sources": ["hibernating"],
                        "observedAt": 500,
                    },
                ]
            },
            "sourceHealth": {
                "radar": {
                    "status": "online",
                    "reason": "available",
                    "updatedAt": 950,
                    "token": "HEALTH-TOKEN-CANARY",
                    "ip": "198.51.100.46",
                },
                "198.51.100.47": {
                    "status": "online",
                    "reason": "available",
                    "updatedAt": 950,
                }
            },
        }

    def context(self, **overrides):
        value = {
            "generationId": "presentation-generation-a",
            "sequence": 0,
            "logicalTimeMs": 1000,
            "resetReason": "integration-load",
        }
        value.update(overrides)
        return value

    def test_allowlisted_snapshot_excludes_credentials_runtime_config_and_canaries(self):
        config = self.configuration()
        runtime = self.runtime()
        config_before = deepcopy(config)
        runtime_before = deepcopy(runtime)

        snapshot = presentation.present_snapshot(config, runtime, self.context())
        serialized = observation.canonical_json(snapshot)

        self.assertEqual(config, config_before)
        self.assertEqual(runtime, runtime_before)
        for canary in (
            "PIN-CANARY",
            "TOKEN-CANARY",
            "ZONE-CANARY",
            "198.51.100",
            "NETWORK-CANARY",
        ):
            self.assertNotIn(canary, serialized)
        self.assertEqual(snapshot["map"]["mapId"], "default")
        self.assertTrue(
            all(item["sensorId"].startswith("source-") for item in snapshot["map"]["radars"])
        )
        sourced_track = next(track for track in snapshot["tracks"] if track["sourceRefs"])
        self.assertTrue(sourced_track["sourceRefs"][0].startswith("source-"))

    def test_lifecycle_position_basis_and_age_are_explicit(self):
        snapshot = presentation.present_snapshot(
            self.configuration(),
            self.runtime(),
            self.context(),
        )
        confirmed = next(track for track in snapshot["tracks"] if track["lifecycle"] == "confirmed")
        fading = next(track for track in snapshot["tracks"] if track["lifecycle"] == "fading")

        self.assertTrue(confirmed["trackId"].startswith("track-"))
        self.assertEqual(confirmed["positionBasis"], "observed")
        self.assertEqual(confirmed["lastObservedAgeMs"], 100)
        self.assertEqual(fading["positionBasis"], "last-seen")
        self.assertIn("source-not-currently-observed", fading["uncertainty"])

    def test_reset_reason_is_optional_and_alias_is_generation_scoped(self):
        runtime = self.runtime()
        first = presentation.present_snapshot(self.configuration(), runtime, self.context())
        same_generation = presentation.present_snapshot(
            self.configuration(),
            runtime,
            self.context(sequence=1, logicalTimeMs=1100, resetReason=None),
        )
        next_generation = presentation.present_snapshot(
            self.configuration(),
            runtime,
            self.context(generationId="presentation-generation-b", sequence=0),
        )

        first_track = next(track for track in first["tracks"] if track["position"]["x"] == 55.0)
        same_track = next(track for track in same_generation["tracks"] if track["position"]["x"] == 55.0)
        next_track = next(track for track in next_generation["tracks"] if track["position"]["x"] == 55.0)
        self.assertEqual(first_track["anonymousAlias"], same_track["anonymousAlias"])
        self.assertEqual(first_track["trackId"], same_track["trackId"])
        self.assertNotEqual(first_track["anonymousAlias"], next_track["anonymousAlias"])
        self.assertNotEqual(first_track["trackId"], next_track["trackId"])
        self.assertNotIn("resetReason", same_generation)

    def test_semantically_equal_input_has_identical_canonical_bytes(self):
        one = presentation.present_snapshot(self.configuration(), self.runtime(), self.context())
        two = presentation.present_snapshot(self.configuration(), self.runtime(), self.context())

        self.assertEqual(observation.canonical_json_bytes(one), observation.canonical_json_bytes(two))

    def test_rejects_invalid_snapshot_sequence_and_non_finite_track(self):
        with self.assertRaises(presentation.SnapshotValidationError):
            presentation.present_snapshot(
                self.configuration(),
                self.runtime(),
                self.context(sequence=-1),
            )
        runtime = self.runtime()
        runtime["mapTargets"]["default"][0]["x"] = float("nan")
        snapshot = presentation.present_snapshot(self.configuration(), runtime, self.context())
        self.assertEqual(len(snapshot["tracks"]), 1)
        self.assertEqual(snapshot["tracks"][0]["lifecycle"], "fading")

    def test_master_output_is_coordinate_free_and_removed_on_stop(self):
        homeassistant = sys.modules.setdefault("homeassistant", types.ModuleType("homeassistant"))
        homeassistant.__path__ = []
        core = types.ModuleType("homeassistant.core")
        core.HomeAssistant = object
        dispatcher = types.ModuleType("homeassistant.helpers.dispatcher")
        dispatcher.async_dispatcher_send = lambda *args, **kwargs: None
        helpers = sys.modules.setdefault("homeassistant.helpers", types.ModuleType("homeassistant.helpers"))
        helpers.__path__ = []
        util = types.ModuleType("homeassistant.util")
        util.slugify = lambda value: str(value).lower().replace(" ", "_")
        sys.modules["homeassistant.core"] = core
        sys.modules["homeassistant.helpers.dispatcher"] = dispatcher
        sys.modules["homeassistant.util"] = util

        custom_components = sys.modules.setdefault("custom_components", types.ModuleType("custom_components"))
        custom_components.__path__ = [str(ROOT / "custom_components")]
        package = sys.modules.setdefault(
            "custom_components.radar_map_manager",
            types.ModuleType("custom_components.radar_map_manager"),
        )
        package.__path__ = [str(ROOT / "custom_components/radar_map_manager")]
        processor_module = importlib.import_module("custom_components.radar_map_manager.processor")

        class FakeStates:
            def __init__(self):
                self.set_calls = []
                self.removed = []

            def async_set(self, entity_id, state, attributes):
                self.set_calls.append((entity_id, state, attributes))

            def async_remove(self, entity_id):
                self.removed.append(entity_id)

        states = FakeStates()
        processor = object.__new__(processor_module.RadarProcessor)
        processor.hass = types.SimpleNamespace(states=states)
        processor._coordinator = types.SimpleNamespace(data={"maps": {"default": {}}})
        processor.runtime_state = types.SimpleNamespace(
            generation_id="g1",
            get_map_targets=lambda map_id: [],
        )
        processor._master_entity_ids = set()
        processor.current_snapshot = None
        processor._fusion_engine = types.SimpleNamespace(reset=lambda reason: None)

        processor._publish_coordinate_free_master(
            {
                "default": [
                    {
                        "id": "target_1",
                        "x": 55,
                        "y": 40,
                        "lifecycle": "confirmed",
                        "sources": ["radar:1"],
                    }
                ]
            }
        )
        entity_id, state, attributes = states.set_calls[0]
        self.assertEqual(entity_id, "sensor.rmm_default_master")
        self.assertEqual(state, "1")
        self.assertFalse({"targets", "x", "y"} & set(attributes))

        asyncio.run(processor.async_stop())
        self.assertEqual(states.removed, ["sensor.rmm_default_master"])

    def test_fall_entity_exposes_only_aggregate_coordinate_free_metadata(self):
        homeassistant = sys.modules.setdefault("homeassistant", types.ModuleType("homeassistant"))
        homeassistant.__path__ = []
        components = sys.modules.setdefault(
            "homeassistant.components", types.ModuleType("homeassistant.components")
        )
        components.__path__ = []
        binary_api = types.ModuleType("homeassistant.components.binary_sensor")

        class BinarySensorEntity:
            pass

        class BinarySensorDeviceClass:
            OCCUPANCY = "occupancy"
            PROBLEM = "problem"

        binary_api.BinarySensorEntity = BinarySensorEntity
        binary_api.BinarySensorDeviceClass = BinarySensorDeviceClass
        core = types.ModuleType("homeassistant.core")
        core.callback = lambda function: function
        update_coordinator = types.ModuleType("homeassistant.helpers.update_coordinator")

        class CoordinatorEntity:
            pass

        update_coordinator.CoordinatorEntity = CoordinatorEntity
        helpers = sys.modules.setdefault("homeassistant.helpers", types.ModuleType("homeassistant.helpers"))
        helpers.__path__ = []
        entity_registry = types.ModuleType("homeassistant.helpers.entity_registry")
        entity_registry.async_get = lambda hass: None
        helpers.entity_registry = entity_registry
        util = types.ModuleType("homeassistant.util")
        util.slugify = lambda value: str(value).lower().replace(" ", "_")
        sys.modules["homeassistant.components.binary_sensor"] = binary_api
        sys.modules["homeassistant.core"] = core
        sys.modules["homeassistant.helpers.update_coordinator"] = update_coordinator
        sys.modules["homeassistant.helpers.entity_registry"] = entity_registry
        sys.modules["homeassistant.util"] = util

        custom_components = sys.modules.setdefault("custom_components", types.ModuleType("custom_components"))
        custom_components.__path__ = [str(ROOT / "custom_components")]
        package = sys.modules.setdefault(
            "custom_components.radar_map_manager",
            types.ModuleType("custom_components.radar_map_manager"),
        )
        package.__path__ = [str(ROOT / "custom_components/radar_map_manager")]
        sys.modules.pop("custom_components.radar_map_manager.binary_sensor", None)
        binary_module = importlib.import_module("custom_components.radar_map_manager.binary_sensor")

        entity = object.__new__(binary_module.RadarFallSensor)
        entity._runtime_state = types.SimpleNamespace(
            get_map_targets=lambda map_id: [
                {
                    "id": "target-secret-id",
                    "x": 51,
                    "y": 49,
                    "posture": "fallen",
                    "abs_height": 0.2,
                    "fall_duration": 8,
                    "sources": ["private-radar:7"],
                }
            ]
        )
        entity._map_group = "default"
        entity._is_on = False
        entity._fall_status = "normal"
        entity._last_detected = None
        entity._affected_count = 0
        entity.async_write_ha_state = lambda: None

        entity._handle_coordinator_update()
        attributes = entity.extra_state_attributes

        self.assertEqual(
            set(attributes),
            {"map_group", "status", "affected_count", "last_detected"},
        )
        self.assertEqual(attributes["affected_count"], 1)
        self.assertNotIn("target-secret-id", str(attributes))
        self.assertNotIn("private-radar", str(attributes))

    def test_zone_count_entity_attributes_are_coordinate_free(self):
        homeassistant = sys.modules.setdefault("homeassistant", types.ModuleType("homeassistant"))
        homeassistant.__path__ = []
        components = sys.modules.setdefault(
            "homeassistant.components", types.ModuleType("homeassistant.components")
        )
        components.__path__ = []
        sensor_api = types.ModuleType("homeassistant.components.sensor")
        sensor_api.SensorEntity = type("SensorEntity", (), {})
        core = types.ModuleType("homeassistant.core")
        core.callback = lambda function: function
        update_coordinator = types.ModuleType("homeassistant.helpers.update_coordinator")
        update_coordinator.CoordinatorEntity = type("CoordinatorEntity", (), {})
        helpers = sys.modules.setdefault("homeassistant.helpers", types.ModuleType("homeassistant.helpers"))
        helpers.__path__ = []
        entity_registry = types.ModuleType("homeassistant.helpers.entity_registry")
        entity_registry.async_get = lambda hass: None
        helpers.entity_registry = entity_registry
        util = types.ModuleType("homeassistant.util")
        util.slugify = lambda value: str(value).lower().replace(" ", "_")
        sys.modules["homeassistant.components.sensor"] = sensor_api
        sys.modules["homeassistant.core"] = core
        sys.modules["homeassistant.helpers.update_coordinator"] = update_coordinator
        sys.modules["homeassistant.helpers.entity_registry"] = entity_registry
        sys.modules["homeassistant.util"] = util

        custom_components = sys.modules.setdefault("custom_components", types.ModuleType("custom_components"))
        custom_components.__path__ = [str(ROOT / "custom_components")]
        package = sys.modules.setdefault(
            "custom_components.radar_map_manager",
            types.ModuleType("custom_components.radar_map_manager"),
        )
        package.__path__ = [str(ROOT / "custom_components/radar_map_manager")]
        sys.modules.pop("custom_components.radar_map_manager.sensor", None)
        sensor_module = importlib.import_module("custom_components.radar_map_manager.sensor")

        entity = object.__new__(sensor_module.RadarZoneCountSensor)
        entity._map_group = "default"
        entity.config = {"zone_name": "Living room"}

        self.assertEqual(
            entity.extra_state_attributes,
            {"map_group": "default", "zone_name": "Living room"},
        )


if __name__ == "__main__":
    unittest.main()
