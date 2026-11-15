"""Versioned, vendor-neutral observations consumed by Roomabouts fusion.

This module deliberately depends only on the Python standard library.  Live Home
Assistant entities, synthetic inputs, and replay fixtures all have to pass this
same boundary before coordinates reach the fusion engine.
"""

from __future__ import annotations

from copy import deepcopy
import json
import math
from typing import Any, Mapping


OBSERVATION_SCHEMA_VERSION = 1

TARGET_OBSERVATION = "target-observation"
TARGET_INACTIVE = "target-inactive"
SOURCE_STATUS = "source-status"
GENERATION_RESET = "generation-reset"

OBSERVATION_KINDS = frozenset(
    {TARGET_OBSERVATION, TARGET_INACTIVE, SOURCE_STATUS, GENERATION_RESET}
)
SOURCE_STATUSES = frozenset({"online", "degraded", "offline"})
TARGET_INACTIVE_REASONS = frozenset(
    {
        "inactive",
        "malformed",
        "paused",
        "source-restart",
        "stale-sample",
        "unavailable",
        "unsupported-unit",
    }
)
SOURCE_STATUS_REASONS = frozenset(
    {
        "available",
        "initialized",
        "malformed",
        "partial-sample",
        "restart",
        "stale-sample",
        "unknown-sensor",
        "unsupported-unit",
        "unavailable",
    }
)
RESET_REASONS = frozenset(
    {
        "explicit-reset",
        "integration-load",
        "map-replaced",
        "privacy-clear",
        "source-restart",
    }
)

_COMMON_KEYS = frozenset(
    {
        "schemaVersion",
        "kind",
        "generationId",
        "sequence",
        "logicalTimeMs",
        "sensorId",
        "sourceSlot",
        "poseRevision",
    }
)
_KIND_KEYS = {
    TARGET_OBSERVATION: frozenset({"positionMeters", "reportedVelocity"}),
    TARGET_INACTIVE: frozenset({"reason"}),
    SOURCE_STATUS: frozenset({"status", "reason"}),
    GENERATION_RESET: frozenset({"reason"}),
}


class ObservationValidationError(ValueError):
    """Raised when a value does not conform to RoomaboutsObservationV1."""


def _is_finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _require_non_empty_string(value: object, field: str, *, max_length: int = 256) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ObservationValidationError(f"{field} must be a non-empty string")
    if len(value) > max_length:
        raise ObservationValidationError(f"{field} exceeds {max_length} characters")
    return value


def _validate_position(value: object) -> dict[str, float]:
    if not isinstance(value, Mapping):
        raise ObservationValidationError("positionMeters must be an object")
    if set(value) - {"x", "y", "z"}:
        raise ObservationValidationError("positionMeters contains unsupported fields")
    if "x" not in value or "y" not in value:
        raise ObservationValidationError("positionMeters requires x and y")
    result: dict[str, float] = {}
    for axis in ("x", "y", "z"):
        if axis not in value:
            continue
        component = value[axis]
        if not _is_finite_number(component):
            raise ObservationValidationError(f"positionMeters.{axis} must be finite")
        result[axis] = float(component)
    return result


def validate_observation(value: object) -> dict[str, Any]:
    """Validate and return a detached, normalized RoomaboutsObservationV1.

    Unknown fields are rejected.  This keeps diagnostics and accidental vendor
    payloads from silently becoming part of the replay or fusion contract.
    """

    if not isinstance(value, Mapping):
        raise ObservationValidationError("observation must be an object")

    kind = value.get("kind")
    if kind not in OBSERVATION_KINDS:
        raise ObservationValidationError("kind is not a RoomaboutsObservationV1 discriminator")

    allowed_keys = _COMMON_KEYS | _KIND_KEYS[kind]
    unexpected = set(value) - allowed_keys
    if unexpected:
        raise ObservationValidationError(
            f"observation contains unsupported fields: {', '.join(sorted(unexpected))}"
        )

    if value.get("schemaVersion") != OBSERVATION_SCHEMA_VERSION:
        raise ObservationValidationError("schemaVersion must be exactly 1")

    generation_id = _require_non_empty_string(value.get("generationId"), "generationId")
    sensor_id = _require_non_empty_string(value.get("sensorId"), "sensorId")
    pose_revision = _require_non_empty_string(value.get("poseRevision"), "poseRevision")

    sequence = value.get("sequence")
    if not isinstance(sequence, int) or isinstance(sequence, bool) or sequence < 0:
        raise ObservationValidationError("sequence must be a non-negative integer")

    logical_time_ms = value.get("logicalTimeMs")
    if not _is_finite_number(logical_time_ms) or logical_time_ms < 0:
        raise ObservationValidationError("logicalTimeMs must be a finite non-negative number")

    normalized: dict[str, Any] = {
        "schemaVersion": OBSERVATION_SCHEMA_VERSION,
        "kind": kind,
        "generationId": generation_id,
        "sequence": sequence,
        "logicalTimeMs": float(logical_time_ms),
        "sensorId": sensor_id,
        "poseRevision": pose_revision,
    }

    if "sourceSlot" in value:
        source_slot = value["sourceSlot"]
        if not isinstance(source_slot, (str, int)) or isinstance(source_slot, bool):
            raise ObservationValidationError("sourceSlot must be a string or integer")
        if isinstance(source_slot, str):
            source_slot = _require_non_empty_string(source_slot, "sourceSlot", max_length=64)
        elif source_slot < 0:
            raise ObservationValidationError("sourceSlot integer must be non-negative")
        normalized["sourceSlot"] = source_slot

    if kind == TARGET_OBSERVATION:
        normalized["positionMeters"] = _validate_position(value.get("positionMeters"))
        if "reportedVelocity" in value:
            velocity = value["reportedVelocity"]
            if not _is_finite_number(velocity):
                raise ObservationValidationError("reportedVelocity must be finite")
            normalized["reportedVelocity"] = float(velocity)
    elif kind == TARGET_INACTIVE:
        reason = value.get("reason", "unavailable")
        if reason not in TARGET_INACTIVE_REASONS:
            raise ObservationValidationError("target inactive reason is not allowlisted")
        normalized["reason"] = reason
    elif kind == SOURCE_STATUS:
        status = value.get("status")
        if status not in SOURCE_STATUSES:
            raise ObservationValidationError("source status must be online, degraded, or offline")
        reason = value.get("reason")
        if reason not in SOURCE_STATUS_REASONS:
            raise ObservationValidationError("source status reason is not allowlisted")
        normalized["status"] = status
        normalized["reason"] = reason
    else:
        reason = value.get("reason")
        if reason not in RESET_REASONS:
            raise ObservationValidationError("generation reset reason is not allowlisted")
        normalized["reason"] = reason

    return normalized


def make_observation(
    kind: str,
    *,
    generation_id: str,
    sequence: int,
    logical_time_ms: float,
    sensor_id: str,
    pose_revision: str,
    source_slot: str | int | None = None,
    **kind_fields: Any,
) -> dict[str, Any]:
    """Construct and validate one observation."""

    value: dict[str, Any] = {
        "schemaVersion": OBSERVATION_SCHEMA_VERSION,
        "kind": kind,
        "generationId": generation_id,
        "sequence": sequence,
        "logicalTimeMs": logical_time_ms,
        "sensorId": sensor_id,
        "poseRevision": pose_revision,
        **kind_fields,
    }
    if source_slot is not None:
        value["sourceSlot"] = source_slot
    return validate_observation(value)


class ObservationSequenceGuard:
    """Reject duplicate or out-of-order observations per source generation."""

    def __init__(self) -> None:
        self._last_sequence: dict[tuple[str, str], int] = {}

    def accept(self, value: object) -> dict[str, Any] | None:
        observation = validate_observation(value)
        key = (observation["sensorId"], observation["generationId"])
        previous = self._last_sequence.get(key)
        if previous is not None and observation["sequence"] <= previous:
            return None
        self._last_sequence[key] = observation["sequence"]
        return observation

    def clear(self, sensor_id: str | None = None) -> None:
        if sensor_id is None:
            self._last_sequence.clear()
            return
        self._last_sequence = {
            key: sequence
            for key, sequence in self._last_sequence.items()
            if key[0] != sensor_id
        }


def _assert_json_finite(value: object, path: str = "$") -> None:
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError(f"{path} contains a non-finite number")
    if isinstance(value, Mapping):
        for key, child in value.items():
            if not isinstance(key, str):
                raise ValueError(f"{path} contains a non-string object key")
            _assert_json_finite(child, f"{path}.{key}")
    elif isinstance(value, (list, tuple)):
        for index, child in enumerate(value):
            _assert_json_finite(child, f"{path}[{index}]")


def canonical_json(value: object) -> str:
    """Return canonical semantic JSON with a trailing newline."""

    _assert_json_finite(value)
    return json.dumps(
        deepcopy(value),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ) + "\n"


def canonical_json_bytes(value: object) -> bytes:
    """Return canonical semantic UTF-8 JSON bytes."""

    return canonical_json(value).encode("utf-8")
