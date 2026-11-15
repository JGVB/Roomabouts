from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "custom_components/radar_map_manager/observation.py"
SPEC = importlib.util.spec_from_file_location("roomabouts_observation", MODULE_PATH)
observation = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(observation)


def valid_target(**overrides):
    value = {
        "schemaVersion": 1,
        "kind": "target-observation",
        "generationId": "source-generation-1",
        "sequence": 4,
        "logicalTimeMs": 1250,
        "sensorId": "living-room-radar",
        "sourceSlot": 2,
        "poseRevision": "pose-3",
        "positionMeters": {"x": 1.25, "y": -0.5, "z": 1.1},
    }
    value.update(overrides)
    return value


class ObservationContractTests(unittest.TestCase):
    def test_target_observation_normalizes_numbers(self):
        result = observation.validate_observation(valid_target())

        self.assertEqual(result["kind"], observation.TARGET_OBSERVATION)
        self.assertEqual(result["positionMeters"], {"x": 1.25, "y": -0.5, "z": 1.1})
        self.assertEqual(result["sourceSlot"], 2)

    def test_non_position_variants_never_accept_cached_position(self):
        common = {
            "schemaVersion": 1,
            "generationId": "g1",
            "sequence": 0,
            "logicalTimeMs": 0,
            "sensorId": "radar",
            "poseRevision": "p1",
        }
        variants = [
            {**common, "kind": "target-inactive", "sourceSlot": 1, "reason": "unavailable"},
            {**common, "kind": "source-status", "status": "offline", "reason": "unavailable"},
            {**common, "kind": "generation-reset", "reason": "source-restart"},
        ]

        for value in variants:
            with self.subTest(kind=value["kind"]):
                result = observation.validate_observation(value)
                self.assertNotIn("positionMeters", result)
                with self.assertRaises(observation.ObservationValidationError):
                    observation.validate_observation({**value, "positionMeters": {"x": 1, "y": 2}})

    def test_rejects_unknown_fields_malformed_and_non_finite_values(self):
        invalid = [
            valid_target(schemaVersion=2),
            valid_target(sequence=-1),
            valid_target(sourceSlot=-1),
            valid_target(positionMeters={"x": math.nan, "y": 1}),
            valid_target(positionMeters={"x": 1}),
            valid_target(vendorPayload={"secret": "must-not-cross"}),
        ]
        for value in invalid:
            with self.subTest(value=value):
                with self.assertRaises(observation.ObservationValidationError):
                    observation.validate_observation(value)

        with self.assertRaises(observation.ObservationValidationError):
            observation.validate_observation(
                {
                    "schemaVersion": 1,
                    "kind": "target-inactive",
                    "generationId": "g1",
                    "sequence": 0,
                    "logicalTimeMs": 0,
                    "sensorId": "radar",
                    "sourceSlot": 1,
                    "poseRevision": "p1",
                    "reason": "arbitrary-vendor-diagnostic",
                }
            )

    def test_sequence_guard_rejects_duplicate_and_out_of_order_per_generation(self):
        guard = observation.ObservationSequenceGuard()
        first = valid_target(sequence=5)
        self.assertIsNotNone(guard.accept(first))
        self.assertIsNone(guard.accept(first))
        self.assertIsNone(guard.accept(valid_target(sequence=4)))
        self.assertIsNotNone(guard.accept(valid_target(sequence=6)))
        self.assertIsNotNone(guard.accept(valid_target(sequence=0, generationId="g2")))

    def test_sequence_guard_rejects_time_regression_and_clear_resets_both_guards(self):
        guard = observation.ObservationSequenceGuard()
        self.assertIsNotNone(guard.accept(valid_target(sequence=5, logicalTimeMs=100)))
        self.assertIsNone(guard.accept(valid_target(sequence=6, logicalTimeMs=99)))
        self.assertIsNotNone(guard.accept(valid_target(sequence=6, logicalTimeMs=100)))
        self.assertIsNotNone(guard.accept(valid_target(sequence=7, logicalTimeMs=100)))

        other = valid_target(
            sensorId="other-radar",
            generationId="other-generation",
            sequence=8,
            logicalTimeMs=800,
        )
        self.assertIsNotNone(guard.accept(other))
        guard.clear("living-room-radar")
        self.assertIsNotNone(guard.accept(valid_target(sequence=0, logicalTimeMs=0)))
        self.assertIsNone(guard.accept({**other, "sequence": 7, "logicalTimeMs": 700}))

        guard.clear()
        self.assertIsNotNone(guard.accept({**other, "sequence": 0, "logicalTimeMs": 0}))

    def test_source_slot_is_diagnostic_not_an_identity_field(self):
        one = observation.validate_observation(valid_target(sourceSlot=1))
        relabelled = observation.validate_observation(valid_target(sourceSlot=9, sequence=5))

        self.assertEqual(one["sensorId"], relabelled["sensorId"])
        self.assertNotIn("personId", one)
        self.assertNotIn("identity", relabelled)

    def test_canonical_json_is_sorted_finite_and_has_trailing_newline(self):
        value = {"z": 1, "a": {"y": 2, "x": 1}, "array": [{"b": 2, "a": 1}]}
        encoded = observation.canonical_json(value)

        self.assertEqual(encoded, '{"a":{"x":1,"y":2},"array":[{"a":1,"b":2}],"z":1}\n')
        self.assertEqual(observation.canonical_json_bytes(value), encoded.encode("utf-8"))
        with self.assertRaises(ValueError):
            observation.canonical_json({"bad": math.inf})

    def test_synthetic_replay_observations_conform(self):
        fixture_path = ROOT / "tests/fixtures/replays/one-person-synthetic.json"
        fixture = json.loads(fixture_path.read_text(encoding="utf-8"))

        for frame in fixture["frames"]:
            for value in frame["observations"]:
                with self.subTest(sequence=value["sequence"]):
                    observation.validate_observation(value)


if __name__ == "__main__":
    unittest.main()
