from __future__ import annotations

from datetime import UTC, datetime, timedelta
import importlib
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


adapter_module = load_module("ha_entity_adapter")


def targets(values):
    return [value for value in values if value["kind"] == "target-observation"]


class FakeState:
    def __init__(self, state, unit="m", updated=None):
        self.state = state
        self.attributes = {"unit_of_measurement": unit}
        self.last_updated = updated or datetime(2026, 1, 1, tzinfo=UTC)


class FakeStates:
    def __init__(self, values):
        self.values = values

    def get(self, entity_id):
        return self.values.get(entity_id)


class FakeHass:
    def __init__(self, values):
        self.states = FakeStates(values)


class HAEntityAdapterTests(unittest.TestCase):
    def make_adapter(self, **overrides):
        options = {
            "clock_ms": lambda: 0,
            "generation_factory": lambda sensor, index: f"{sensor}-g{index}",
            "inactive_radius_m": 0,
        }
        options.update(overrides)
        return adapter_module.HAEntityAdapter(
            **options,
        )

    def test_x_before_y_and_y_before_x_emit_only_complete_pairs(self):
        for order in (("x", "y"), ("y", "x")):
            with self.subTest(order=order):
                adapter = self.make_adapter()
                emitted = []
                emitted.extend(adapter.ingest_component("radar", 1, order[0], 100, "cm", logical_time_ms=10))
                self.assertEqual(targets(emitted), [])
                emitted.extend(adapter.ingest_component("radar", 1, order[1], 2, "m", logical_time_ms=20))
                point = targets(emitted)[0]
                expected = {order[0]: 1.0, order[1]: 2.0}
                self.assertEqual(point["positionMeters"], expected)

    def test_unchanged_axis_can_pair_while_it_is_still_fresh(self):
        adapter = self.make_adapter(max_pair_skew_ms=200, max_sample_age_ms=200)
        adapter.ingest_component("radar", 1, "x", 1, "m", logical_time_ms=0, token="x1")
        initial = adapter.ingest_component("radar", 1, "y", 2, "m", logical_time_ms=10, token="y1")
        changed = adapter.ingest_component("radar", 1, "x", 1.5, "m", logical_time_ms=100, token="x2")

        self.assertEqual(targets(initial)[0]["positionMeters"], {"x": 1.0, "y": 2.0})
        self.assertEqual(targets(changed)[0]["positionMeters"], {"x": 1.5, "y": 2.0})

    def test_stale_half_clears_active_slot_and_never_emits_cached_position(self):
        adapter = self.make_adapter(max_pair_skew_ms=50, max_sample_age_ms=100)
        adapter.ingest_component("radar", 1, "x", 1, "m", logical_time_ms=0)
        adapter.ingest_component("radar", 1, "y", 2, "m", logical_time_ms=10)
        stale = adapter.ingest_component("radar", 1, "x", 3, "m", logical_time_ms=500)

        self.assertEqual(targets(stale), [])
        inactive = [value for value in stale if value["kind"] == "target-inactive"]
        self.assertEqual(len(inactive), 1)
        self.assertNotIn("positionMeters", inactive[0])
        self.assertTrue(any(value["kind"] == "source-status" and value["reason"] == "stale-sample" for value in stale))

    def test_unavailable_is_idempotent_and_position_free(self):
        adapter = self.make_adapter()
        adapter.ingest_component("radar", "A", "x", 1, "m", logical_time_ms=0)
        adapter.ingest_component("radar", "A", "y", 2, "m", logical_time_ms=1)

        first = adapter.mark_unavailable("radar", "A", logical_time_ms=2)
        second = adapter.mark_unavailable("radar", "A", logical_time_ms=3)

        self.assertEqual([item["kind"] for item in first], ["target-inactive"])
        self.assertNotIn("positionMeters", first[0])
        self.assertEqual(second, [])

    def test_inactive_coordinates_keep_available_source_online_without_a_position(self):
        adapter = self.make_adapter(inactive_radius_m=0.1)
        adapter.ingest_component("radar", 1, "x", 0, "m", logical_time_ms=0)
        emitted = adapter.ingest_component("radar", 1, "y", 0, "m", logical_time_ms=1)

        self.assertEqual(targets(emitted), [])
        self.assertEqual([item["kind"] for item in emitted], ["source-status"])
        self.assertEqual(emitted[0]["status"], "online")

    def test_units_non_finite_and_unsupported_units(self):
        adapter = self.make_adapter()
        adapter.ingest_component("radar", 1, "x", 2500, "mm", logical_time_ms=0)
        converted = adapter.ingest_component("radar", 1, "y", 250, "cm", logical_time_ms=1)
        self.assertEqual(targets(converted)[0]["positionMeters"], {"x": 2.5, "y": 2.5})

        malformed = adapter.ingest_component("radar", 1, "x", "nan", "m", logical_time_ms=2)
        unsupported = adapter.ingest_component("radar", 1, "x", 1, "inch", logical_time_ms=3)
        self.assertEqual(targets(malformed), [])
        self.assertEqual(targets(unsupported), [])
        self.assertTrue(any(item.get("reason") == "malformed" for item in malformed))
        self.assertTrue(any(item.get("reason") == "unsupported-unit" for item in unsupported))

    def test_duplicate_component_token_does_not_reemit(self):
        adapter = self.make_adapter()
        adapter.ingest_component("radar", 1, "x", 1, "m", logical_time_ms=0, token="x")
        adapter.ingest_component("radar", 1, "y", 2, "m", logical_time_ms=1, token="y")
        duplicate = adapter.ingest_component("radar", 1, "y", 2, "m", logical_time_ms=2, token="y")
        self.assertEqual(duplicate, [])

    def test_restart_changes_generation_and_resets_sequence(self):
        adapter = self.make_adapter()
        adapter.ingest_component("radar", 1, "x", 1, "m", logical_time_ms=0)
        before = adapter.ingest_component("radar", 1, "y", 2, "m", logical_time_ms=1)[-1]
        reset = adapter.reset_source("radar", logical_time_ms=2)

        self.assertNotEqual(before["generationId"], reset["generationId"])
        self.assertEqual(reset["sequence"], 0)
        self.assertEqual(reset["kind"], "generation-reset")

    def test_collect_owns_entity_naming_and_changed_state_detection(self):
        stamp = datetime(2026, 1, 1, tzinfo=UTC)
        states = {
            "sensor.living_room_radar_target_1_x": FakeState("100", "cm", stamp),
            "sensor.living_room_radar_target_1_y": FakeState("2", "m", stamp),
        }
        hass = FakeHass(states)
        adapter = self.make_adapter()
        radars = {"Living-Room Radar": {"target_count": 1, "layout": {"pose_revision": "p7"}}}

        first = adapter.collect(hass, radars, logical_time_ms=10)
        duplicate = adapter.collect(hass, radars, logical_time_ms=20)
        states["sensor.living_room_radar_target_1_x"].last_updated = stamp + timedelta(milliseconds=50)
        states["sensor.living_room_radar_target_1_x"].state = "150"
        changed = adapter.collect(hass, radars, logical_time_ms=50)

        self.assertEqual(targets(first)[0]["positionMeters"], {"x": 1.0, "y": 2.0})
        self.assertEqual(duplicate, [])
        self.assertEqual(targets(changed)[0]["positionMeters"], {"x": 1.5, "y": 2.0})
        self.assertEqual(targets(changed)[0]["poseRevision"], "p7")

    def test_collect_stages_both_changed_axes_and_emits_one_coherent_pair(self):
        stamp = datetime(2026, 1, 1, tzinfo=UTC)
        states = {
            "sensor.radar_target_1_x": FakeState("1", "m", stamp),
            "sensor.radar_target_1_y": FakeState("2", "m", stamp),
        }
        adapter = self.make_adapter(max_pair_skew_ms=250, max_sample_age_ms=500)
        hass = FakeHass(states)
        radars = {"radar": {"target_count": 1}}
        adapter.collect(hass, radars, logical_time_ms=0)

        states["sensor.radar_target_1_x"].state = "3"
        states["sensor.radar_target_1_y"].state = "4"
        states["sensor.radar_target_1_x"].last_updated = stamp + timedelta(milliseconds=100)
        states["sensor.radar_target_1_y"].last_updated = stamp + timedelta(milliseconds=110)
        changed = adapter.collect(hass, radars, logical_time_ms=100)

        changed_targets = targets(changed)
        self.assertEqual(len(changed_targets), 1)
        self.assertEqual(changed_targets[0]["positionMeters"], {"x": 3.0, "y": 4.0})

    def test_collect_missing_required_half_degrades_even_when_z_exists(self):
        states = {
            "sensor.radar_target_1_x": FakeState("1", "m"),
            "sensor.radar_target_1_z": FakeState("1.2", "m"),
        }
        adapter = self.make_adapter()

        emitted = adapter.collect(
            FakeHass(states),
            {"radar": {"target_count": 1}},
            logical_time_ms=10,
        )

        self.assertEqual(targets(emitted), [])
        statuses = [item for item in emitted if item["kind"] == "source-status"]
        self.assertEqual(statuses[-1]["status"], "degraded")
        self.assertEqual(statuses[-1]["reason"], "partial-sample")

    def test_unchanged_frozen_entities_age_out_once_and_do_not_revive(self):
        states = {
            "sensor.radar_target_1_x": FakeState("1", "m"),
            "sensor.radar_target_1_y": FakeState("2", "m"),
        }
        adapter = self.make_adapter(max_pair_skew_ms=50, max_sample_age_ms=100)
        hass = FakeHass(states)
        radars = {"radar": {"target_count": 1}}
        adapter.collect(hass, radars, logical_time_ms=0)

        expired = adapter.collect(hass, radars, logical_time_ms=101)
        still_frozen = adapter.collect(hass, radars, logical_time_ms=200)

        self.assertEqual(
            [item["kind"] for item in expired],
            ["target-inactive", "source-status"],
        )
        self.assertEqual(expired[-1]["reason"], "stale-sample")
        self.assertEqual(still_frozen, [])

    def test_restart_reingests_current_entities_into_new_source_generation(self):
        states = {
            "sensor.radar_target_1_x": FakeState("1", "m"),
            "sensor.radar_target_1_y": FakeState("2", "m"),
        }
        adapter = self.make_adapter()
        hass = FakeHass(states)
        radars = {"radar": {"target_count": 1}}
        first = targets(adapter.collect(hass, radars, logical_time_ms=0))[0]
        reset = adapter.reset_source("radar", logical_time_ms=10)

        after = targets(adapter.collect(hass, radars, logical_time_ms=11))[0]

        self.assertNotEqual(first["generationId"], reset["generationId"])
        self.assertEqual(after["generationId"], reset["generationId"])
        self.assertEqual(after["positionMeters"], {"x": 1.0, "y": 2.0})

    def test_unpause_immediately_reingests_unchanged_entity_states(self):
        states = {
            "sensor.radar_target_1_x": FakeState("1", "m"),
            "sensor.radar_target_1_y": FakeState("2", "m"),
        }
        adapter = self.make_adapter()
        hass = FakeHass(states)

        first = adapter.collect(
            hass,
            {"radar": {"target_count": 1, "paused": False}},
            logical_time_ms=0,
        )
        paused = adapter.collect(
            hass,
            {"radar": {"target_count": 1, "paused": True}},
            logical_time_ms=10,
        )
        resumed = adapter.collect(
            hass,
            {"radar": {"target_count": 1, "paused": False}},
            logical_time_ms=20,
        )

        self.assertEqual(targets(first)[0]["positionMeters"], {"x": 1.0, "y": 2.0})
        self.assertTrue(any(item["kind"] == "target-inactive" for item in paused))
        self.assertTrue(
            any(
                item["kind"] == "source-status" and item["status"] == "offline"
                for item in paused
            )
        )
        self.assertEqual(targets(resumed)[0]["positionMeters"], {"x": 1.0, "y": 2.0})
        self.assertTrue(
            any(
                item["kind"] == "source-status" and item["status"] == "online"
                for item in resumed
            )
        )


if __name__ == "__main__":
    unittest.main()
