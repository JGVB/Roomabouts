from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
import importlib
import json
import math
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).resolve().parents[2]
PACKAGE_PATH = ROOT / "custom_components/radar_map_manager"


def load_module(name):
    custom_components = sys.modules.setdefault("custom_components", types.ModuleType("custom_components"))
    custom_components.__path__ = [str(ROOT / "custom_components")]
    package = sys.modules.setdefault(
        "custom_components.radar_map_manager",
        types.ModuleType("custom_components.radar_map_manager"),
    )
    package.__path__ = [str(PACKAGE_PATH)]
    return importlib.import_module(f"custom_components.radar_map_manager.{name}")


fusion_module = load_module("fusion_engine")
observation = load_module("observation")
presentation = load_module("presentation")
runtime_module = load_module("runtime_state")


class FakeCoordinator:
    def __init__(self, data):
        self.data = data


def configuration(radars=("radar-a",)):
    return {
        "version": 2,
        "maps": {
            "default": {
                "zones": {
                    "include_zones": [],
                    "exclude_zones": [],
                    "entrance_zones": [],
                    "stationary_zones": [],
                },
                "config": {
                    "merge_distance": 0.8,
                    "ema_smoothing_level": 7,
                    "update_interval": 0.1,
                    "verify_delay": 0,
                    "hibernation_ttl": 1,
                    "enable_verify_rule": True,
                    "enable_tracking": True,
                    "max_jump_base": 1,
                    "max_jump_speed": 2.5,
                    "stationary_max_hold": 300,
                    "target_height": 1.5,
                },
            }
        },
        "radars": {
            radar: {
                "map_group": "default",
                "paused": False,
                "layout": {
                    "origin_x": 50,
                    "origin_y": 50,
                    "scale_x": 5,
                    "scale_y": 5,
                    "rotation": 0,
                    "radar_type": 2,
                },
                "monitor_zones": [],
            }
            for radar in radars
        },
    }


def target(sensor="radar-a", sequence=0, slot=1, x=1, y=2, generation="source-g1", time_ms=0):
    return observation.make_observation(
        "target-observation",
        generation_id=generation,
        sequence=sequence,
        logical_time_ms=time_ms,
        sensor_id=sensor,
        source_slot=slot,
        pose_revision="pose-1",
        positionMeters={"x": x, "y": y},
    )


def inactive(sensor="radar-a", sequence=1, slot=1, generation="source-g1", time_ms=100):
    return observation.make_observation(
        "target-inactive",
        generation_id=generation,
        sequence=sequence,
        logical_time_ms=time_ms,
        sensor_id=sensor,
        source_slot=slot,
        pose_revision="pose-1",
        reason="inactive",
    )


def source_status(
    status,
    reason,
    *,
    sequence,
    sensor="radar-a",
    generation="source-g1",
    time_ms=0,
):
    return observation.make_observation(
        "source-status",
        generation_id=generation,
        sequence=sequence,
        logical_time_ms=time_ms,
        sensor_id=sensor,
        pose_revision="pose-1",
        status=status,
        reason=reason,
    )


def generation_reset(
    *,
    sequence=0,
    sensor="radar-a",
    generation="source-g2",
    time_ms=100,
):
    return observation.make_observation(
        "generation-reset",
        generation_id=generation,
        sequence=sequence,
        logical_time_ms=time_ms,
        sensor_id=sensor,
        pose_revision="pose-1",
        reason="source-restart",
    )


class FusionEngineTests(unittest.TestCase):
    def make_engine(self, config=None, ids=("snapshot-g1", "snapshot-g2", "snapshot-g3")):
        generation_ids = iter(ids)
        runtime = runtime_module.RuntimeState(generation_factory=lambda: next(generation_ids))
        coordinator = FakeCoordinator(config or configuration())
        engine = fusion_module.FusionEngine(
            None,
            coordinator,
            runtime_state=runtime,
            clock=lambda: 0,
        )
        return engine, runtime, coordinator

    def test_fusion_consumes_observations_without_mutating_persistent_config(self):
        engine, runtime, coordinator = self.make_engine()

        result = engine.update([target()], logical_time_ms=0)

        self.assertEqual(len(result["default"]), 1)
        self.assertEqual(result["default"][0]["x"], 55.0)
        self.assertEqual(result["default"][0]["y"], 40.0)
        self.assertEqual(result["default"][0]["lifecycle"], "confirmed")
        self.assertNotIn("targets", coordinator.data["maps"]["default"])
        self.assertNotIn("targets", coordinator.data["radars"]["radar-a"])
        self.assertEqual(len(runtime.radar_targets["radar-a"]), 1)

    def test_transform_rotations_mirror_and_zero_origin_are_deterministic(self):
        engine, _, _ = self.make_engine()
        point = {"x": 1000, "y": 2000, "z": 0}

        def transformed(rotation, mirror=False):
            return engine._calculate_standard_coord(
                {
                    "origin_x": 0,
                    "origin_y": 0,
                    "scale_x": 1,
                    "scale_y": 1,
                    "rotation": rotation,
                    "mirror_x": mirror,
                },
                point,
                radar_type=2,
            )

        expected = {
            0: (1.0, -2.0),
            90: (2.0, 1.0),
            180: (-1.0, 2.0),
            45: (3 * math.sqrt(0.5), -math.sqrt(0.5)),
        }
        for rotation, (expected_x, expected_y) in expected.items():
            with self.subTest(rotation=rotation):
                result = transformed(rotation)
                self.assertAlmostEqual(result["left"], expected_x, places=9)
                self.assertAlmostEqual(result["top"], expected_y, places=9)
        mirrored = transformed(0, mirror=True)
        self.assertAlmostEqual(mirrored["left"], -1.0, places=9)
        self.assertAlmostEqual(mirrored["top"], -2.0, places=9)

    def test_python_transform_matches_shared_javascript_coordinate_fixture(self):
        fixture = json.loads(
            (ROOT / "tests/fixtures/coordinate-cases.json").read_text(
                encoding="utf-8"
            )
        )
        engine, _, _ = self.make_engine()

        for coordinate_case in fixture["cases"]:
            with self.subTest(case=coordinate_case["name"]):
                point = {**coordinate_case["point_mm"], "z": 0}
                transformed = engine._calculate_standard_coord(
                    coordinate_case["config"],
                    point,
                    radar_type=2,
                )
                expected = coordinate_case["expected_canvas"]
                self.assertIsNotNone(transformed)
                self.assertAlmostEqual(
                    transformed["left"],
                    expected["left"],
                    delta=fixture["calculate_tolerance"],
                )
                self.assertAlmostEqual(
                    transformed["top"],
                    expected["top"],
                    delta=fixture["calculate_tolerance"],
                )

    def test_empty_fresh_state_is_deterministically_empty(self):
        engine, runtime, _ = self.make_engine()

        result = engine.update([], logical_time_ms=0)

        self.assertEqual(result, {"default": []})
        self.assertEqual(runtime.map_targets, {"default": []})

    def test_entrance_zone_confirms_new_track_without_waiting(self):
        config = configuration()
        config["maps"]["default"]["config"]["verify_delay"] = 30
        config["maps"]["default"]["zones"]["entrance_zones"] = [
            {"points": [[50, 35], [60, 35], [60, 45], [50, 45]]}
        ]
        engine, _, _ = self.make_engine(config)

        result = engine.update([target()], logical_time_ms=0)["default"]

        self.assertEqual(result[0]["lifecycle"], "confirmed")
        self.assertNotIn("unverified", result[0]["sources"])

    def test_exclusion_zone_drops_point_and_history(self):
        config = configuration()
        config["maps"]["default"]["zones"]["exclude_zones"] = [
            {"points": [[50, 35], [60, 35], [60, 45], [50, 45]]}
        ]
        engine, runtime, _ = self.make_engine(config)

        result = engine.update([target()], logical_time_ms=0)["default"]

        self.assertEqual(result, [])
        self.assertEqual(runtime.map_targets["default"], [])
        self.assertEqual(engine._history["default"], {})

    def test_stationary_zone_holds_unmatched_verified_track(self):
        config = configuration()
        config["maps"]["default"]["zones"]["stationary_zones"] = [
            {"points": [[50, 35], [60, 35], [60, 45], [50, 45]], "delay": 10}
        ]
        engine, _, _ = self.make_engine(config)
        engine.update(
            [target(sequence=0, slot=1, x=1), target(sequence=1, slot=2, x=5)],
            logical_time_ms=0,
        )

        result = engine.update(
            [
                inactive(sequence=2, slot=1, time_ms=100),
                target(sequence=3, slot=2, x=5.1, time_ms=100),
            ],
            logical_time_ms=100,
        )["default"]

        held = [track for track in result if track["positionBasis"] == "held"]
        self.assertEqual(len(held), 1)
        self.assertEqual(held[0]["lifecycle"], "coasting")

    def test_impossible_jump_spawns_new_track_and_fades_old_one(self):
        engine, _, _ = self.make_engine()
        engine.update([target(sequence=0, x=1)], logical_time_ms=0)

        result = engine.update(
            [target(sequence=1, x=20, time_ms=100)],
            logical_time_ms=100,
        )["default"]

        self.assertEqual({track["id"] for track in result}, {"target_1", "target_2"})
        self.assertEqual(
            {track["lifecycle"] for track in result},
            {"confirmed", "fading"},
        )

    def test_cross_radar_points_cluster_without_using_slots_as_identity(self):
        engine, runtime, _ = self.make_engine(configuration(("radar-a", "radar-b")))
        observations = [
            target(sensor="radar-a", slot=1, x=1, y=2),
            target(sensor="radar-b", slot=7, x=1.05, y=2),
        ]

        result = engine.update(observations, logical_time_ms=0)["default"]

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["count"], 2)
        self.assertEqual(set(result[0]["sources"]), {"radar-a:1", "radar-b:7"})

    def test_duplicate_and_out_of_order_observations_do_not_move_track(self):
        engine, _, _ = self.make_engine()
        first = engine.update([target(sequence=2, x=1)], logical_time_ms=0)["default"][0]
        duplicate = engine.update([target(sequence=2, x=9, time_ms=10)], logical_time_ms=10)["default"][0]
        older = engine.update([target(sequence=1, x=8, time_ms=20)], logical_time_ms=20)["default"][0]

        self.assertEqual(first["x"], duplicate["x"])
        self.assertEqual(first["x"], older["x"])

    def test_slot_relabel_replaces_diagnostic_sample_without_duplicating_person(self):
        engine, runtime, _ = self.make_engine()
        engine.update([target(slot=1, sequence=0)], logical_time_ms=0)

        result = engine.update([target(slot=9, sequence=1, time_ms=10)], logical_time_ms=10)

        self.assertEqual(len(runtime.radar_targets["radar-a"]), 1)
        self.assertEqual(runtime.radar_targets["radar-a"][0]["sourceSlot"], 9)
        self.assertEqual(len(result["default"]), 1)

    def test_inactive_observation_transitions_track_to_explicit_last_seen(self):
        engine, _, _ = self.make_engine()
        engine.update([target()], logical_time_ms=0)

        result = engine.update([inactive()], logical_time_ms=100)["default"]

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["lifecycle"], "fading")
        self.assertEqual(result[0]["positionBasis"], "last-seen")
        self.assertEqual(result[0]["observedAt"], 0)

    def test_source_generation_change_starts_new_snapshot_generation(self):
        engine, runtime, _ = self.make_engine()
        engine.update([target(generation="source-g1")], logical_time_ms=0)
        old_generation = runtime.generation_id

        engine.update(
            [target(generation="source-g2", sequence=0, x=2, time_ms=100)],
            logical_time_ms=100,
        )
        context = runtime.next_snapshot_context(100)

        self.assertNotEqual(runtime.generation_id, old_generation)
        self.assertEqual(context["sequence"], 0)
        self.assertEqual(context["resetReason"], "source-restart")

    def test_disconnect_ends_alias_and_track_id_lifetime(self):
        engine, runtime, coordinator = self.make_engine()
        engine.update([target(sequence=0)], logical_time_ms=0)
        before = presentation.present_snapshot(
            coordinator.data,
            runtime.view(),
            runtime.next_snapshot_context(0),
        )
        old_track = before["tracks"][0]

        engine.update(
            [source_status("offline", "unavailable", sequence=1, time_ms=100)],
            logical_time_ms=100,
        )
        disconnected_context = runtime.next_snapshot_context(100)
        self.assertEqual(disconnected_context["resetReason"], "source-restart")
        self.assertEqual(runtime.map_targets["default"], [])

        engine.update(
            [
                source_status("online", "available", sequence=2, time_ms=200),
                target(sequence=3, time_ms=200),
            ],
            logical_time_ms=200,
        )
        after = presentation.present_snapshot(
            coordinator.data,
            runtime.view(),
            runtime.next_snapshot_context(200),
        )
        new_track = after["tracks"][0]

        self.assertNotEqual(old_track["trackId"], new_track["trackId"])
        self.assertNotEqual(old_track["anonymousAlias"], new_track["anonymousAlias"])

    def test_duplicate_generation_reset_does_not_reset_snapshot_generation_twice(self):
        engine, runtime, _ = self.make_engine()
        engine.update([target()], logical_time_ms=0)
        reset = generation_reset()

        engine.update([reset], logical_time_ms=100)
        once = runtime.generation_id
        engine.update([reset], logical_time_ms=100)

        self.assertEqual(runtime.generation_id, once)
        self.assertEqual(once, "snapshot-g2")

    def test_non_privacy_reset_preserves_truthful_source_health(self):
        engine, runtime, _ = self.make_engine()
        runtime.set_source_health("offline-radar", "offline", "unavailable", 10)
        runtime.set_source_health("degraded-radar", "degraded", "partial-sample", 11)
        expected_health = deepcopy(runtime.source_health)

        engine.reset("explicit-reset", logical_time_ms=20)

        self.assertEqual(runtime.source_health, expected_health)

        engine.reset("privacy-clear", logical_time_ms=30)
        self.assertEqual(runtime.source_health, {})

    def test_multiple_offline_and_reset_statuses_survive_batch_resets(self):
        engine, runtime, _ = self.make_engine(
            configuration(("radar-a", "radar-b")),
            ids=tuple(f"snapshot-g{index}" for index in range(1, 8)),
        )

        engine.update(
            [
                source_status(
                    "offline",
                    "unavailable",
                    sensor="radar-a",
                    sequence=0,
                    generation="a-g1",
                    time_ms=100,
                ),
                source_status(
                    "offline",
                    "unavailable",
                    sensor="radar-b",
                    sequence=0,
                    generation="b-g1",
                    time_ms=100,
                ),
            ],
            logical_time_ms=100,
        )

        self.assertEqual(runtime.source_health["radar-a"]["status"], "offline")
        self.assertEqual(runtime.source_health["radar-b"]["status"], "offline")

        engine.update(
            [
                generation_reset(
                    sensor="radar-a",
                    sequence=0,
                    generation="a-g2",
                    time_ms=200,
                ),
                generation_reset(
                    sensor="radar-b",
                    sequence=0,
                    generation="b-g2",
                    time_ms=200,
                ),
            ],
            logical_time_ms=200,
        )

        self.assertEqual(runtime.source_health["radar-a"]["status"], "degraded")
        self.assertEqual(runtime.source_health["radar-a"]["reason"], "restart")
        self.assertEqual(runtime.source_health["radar-b"]["status"], "degraded")
        self.assertEqual(runtime.source_health["radar-b"]["reason"], "restart")

    def test_processing_error_fails_closed_instead_of_streaming_stale_coordinates(self):
        engine, runtime, coordinator = self.make_engine()
        engine.update([target()], logical_time_ms=0)
        self.assertTrue(runtime.map_targets["default"])
        coordinator.data["maps"]["default"]["config"]["map_scale_x"] = "not-a-number"

        with self.assertLogs(fusion_module._LOGGER, level="ERROR"):
            result = engine.update(
                [target(sequence=1, x=2, time_ms=100)],
                logical_time_ms=100,
            )
        context = runtime.next_snapshot_context(100)

        self.assertEqual(result, {})
        self.assertEqual(runtime.map_targets, {})
        self.assertEqual(runtime.radar_targets, {})
        self.assertEqual(context["resetReason"], "privacy-clear")

    def test_fusion_source_has_no_ha_entity_naming_or_state_reads(self):
        source = (PACKAGE_PATH / "fusion_engine.py").read_text(encoding="utf-8")

        self.assertNotIn("HAEntityAdapter", source)
        self.assertNotIn("hass.states", source)
        self.assertNotIn("_get_radar_point", source)
        self.assertNotIn("sensor.", source)

    def test_same_replay_has_same_canonical_snapshot_hash(self):
        fixture = json.loads(
            (ROOT / "tests/fixtures/replays/one-person-synthetic.json").read_text(encoding="utf-8")
        )

        def run_once():
            engine, runtime, coordinator = self.make_engine(fixture["configuration"])
            encoded = bytearray()
            for frame in fixture["frames"]:
                engine.update(frame["observations"], logical_time_ms=frame["logicalTimeMs"])
                context = runtime.next_snapshot_context(frame["logicalTimeMs"])
                snapshot = presentation.present_snapshot(
                    coordinator.data,
                    runtime.view(),
                    context,
                )
                encoded.extend(observation.canonical_json_bytes(snapshot))
            return sha256(encoded).hexdigest()

        self.assertEqual(run_once(), run_once())


if __name__ == "__main__":
    unittest.main()
