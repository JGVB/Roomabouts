"""Home Assistant entity-state adapter for RoomaboutsObservationV1."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import math
import re
import time
from typing import Any, Callable, Mapping
from uuid import uuid4

from .observation import (
    GENERATION_RESET,
    SOURCE_STATUS,
    TARGET_INACTIVE,
    TARGET_OBSERVATION,
    make_observation,
)


_UNAVAILABLE_STATES = frozenset({"", "none", "unknown", "unavailable"})
_UNIT_FACTORS = {
    "m": 1.0,
    "meter": 1.0,
    "meters": 1.0,
    "metre": 1.0,
    "metres": 1.0,
    "cm": 0.01,
    "centimeter": 0.01,
    "centimeters": 0.01,
    "centimetre": 0.01,
    "centimetres": 0.01,
    "mm": 0.001,
    "millimeter": 0.001,
    "millimeters": 0.001,
    "millimetre": 0.001,
    "millimetres": 0.001,
}


class EntityAdapterError(ValueError):
    """Raised for malformed entity samples."""


def entity_slug(sensor_id: str) -> str:
    """Return the Home Assistant entity stem used by inherited RMM sensors."""

    slug = re.sub(r"[^a-z0-9_]+", "_", sensor_id.strip().lower().replace("-", "_"))
    return re.sub(r"_+", "_", slug).strip("_")


def value_in_meters(value: object, unit: object) -> float:
    """Convert a finite HA numeric state to meters."""

    try:
        numeric = float(value)
    except (TypeError, ValueError) as err:
        raise EntityAdapterError("entity value is not numeric") from err
    if not math.isfinite(numeric):
        raise EntityAdapterError("entity value is not finite")
    normalized_unit = str(unit or "m").strip().lower()
    factor = _UNIT_FACTORS.get(normalized_unit)
    if factor is None:
        raise EntityAdapterError(f"unsupported coordinate unit: {normalized_unit}")
    return numeric * factor


@dataclass(slots=True)
class _HalfSample:
    value_m: float
    logical_time_ms: float
    token: object


@dataclass(slots=True)
class _SourceSession:
    generation_id: str
    sequence: int = -1
    status: str | None = None
    reason: str | None = None


class HAEntityAdapter:
    """Assemble coherent HA X/Y entity halves into normalized observations.

    The pairing window is intentionally configurable and conservative.  Phase 5
    sensor evidence will replace the default with a device-qualified policy.
    """

    def __init__(
        self,
        *,
        clock_ms: Callable[[], float] | None = None,
        generation_factory: Callable[[str, int], str] | None = None,
        max_pair_skew_ms: float = 250.0,
        max_sample_age_ms: float = 500.0,
        inactive_radius_m: float = 0.1,
        max_abs_position_m: float = 100.0,
    ) -> None:
        if max_pair_skew_ms < 0 or max_sample_age_ms < 0:
            raise ValueError("pairing thresholds must be non-negative")
        self._clock_ms = clock_ms or (lambda: time.monotonic() * 1000.0)
        session_nonce = uuid4().hex
        self._generation_factory = generation_factory or (
            lambda sensor_id, index: f"{session_nonce}:{entity_slug(sensor_id)}:{index}"
        )
        self.max_pair_skew_ms = float(max_pair_skew_ms)
        self.max_sample_age_ms = float(max_sample_age_ms)
        self.inactive_radius_m = float(inactive_radius_m)
        self.max_abs_position_m = float(max_abs_position_m)
        self._sessions: dict[str, _SourceSession] = {}
        self._generation_indexes: dict[str, int] = {}
        self._halves: dict[tuple[str, str | int, str], _HalfSample] = {}
        self._last_emitted_tokens: dict[tuple[str, str | int], tuple[object, object, object | None]] = {}
        self._slot_active: set[tuple[str, str | int]] = set()
        self._entity_tokens: dict[str, object] = {}

    def _session(self, sensor_id: str) -> _SourceSession:
        session = self._sessions.get(sensor_id)
        if session is not None:
            return session
        index = self._generation_indexes.get(sensor_id, 0) + 1
        self._generation_indexes[sensor_id] = index
        generation_id = self._generation_factory(sensor_id, index)
        if not isinstance(generation_id, str) or not generation_id:
            raise ValueError("generation_factory must return a non-empty string")
        session = _SourceSession(generation_id=generation_id)
        self._sessions[sensor_id] = session
        return session

    def _next(
        self,
        sensor_id: str,
        kind: str,
        logical_time_ms: float,
        pose_revision: str,
        source_slot: str | int | None = None,
        **fields: Any,
    ) -> dict[str, Any]:
        session = self._session(sensor_id)
        session.sequence += 1
        return make_observation(
            kind,
            generation_id=session.generation_id,
            sequence=session.sequence,
            logical_time_ms=logical_time_ms,
            sensor_id=sensor_id,
            pose_revision=pose_revision,
            source_slot=source_slot,
            **fields,
        )

    def source_status(
        self,
        sensor_id: str,
        status: str,
        reason: str,
        *,
        logical_time_ms: float | None = None,
        pose_revision: str = "default",
        force: bool = False,
    ) -> list[dict[str, Any]]:
        now_ms = self._coerce_time(logical_time_ms)
        session = self._session(sensor_id)
        if not force and session.status == status and session.reason == reason:
            return []
        session.status = status
        session.reason = reason
        return [
            self._next(
                sensor_id,
                SOURCE_STATUS,
                now_ms,
                pose_revision,
                status=status,
                reason=reason,
            )
        ]

    def reset_source(
        self,
        sensor_id: str,
        *,
        reason: str = "source-restart",
        logical_time_ms: float | None = None,
        pose_revision: str = "default",
    ) -> dict[str, Any]:
        now_ms = self._coerce_time(logical_time_ms)
        for key in [key for key in self._halves if key[0] == sensor_id]:
            del self._halves[key]
        for key in [key for key in self._last_emitted_tokens if key[0] == sensor_id]:
            del self._last_emitted_tokens[key]
        self._slot_active = {key for key in self._slot_active if key[0] != sensor_id}
        self._clear_entity_token_cache(sensor_id)
        index = self._generation_indexes.get(sensor_id, 0) + 1
        self._generation_indexes[sensor_id] = index
        generation_id = self._generation_factory(sensor_id, index)
        self._sessions[sensor_id] = _SourceSession(generation_id=generation_id)
        return self._next(
            sensor_id,
            GENERATION_RESET,
            now_ms,
            pose_revision,
            reason=reason,
        )

    def ingest_component(
        self,
        sensor_id: str,
        source_slot: str | int,
        axis: str,
        value: object,
        unit: object,
        *,
        logical_time_ms: float | None = None,
        pose_revision: str = "default",
        token: object | None = None,
    ) -> list[dict[str, Any]]:
        """Ingest one changed component and emit zero or more observations."""

        if axis not in {"x", "y", "z"}:
            raise EntityAdapterError("axis must be x, y, or z")
        now_ms = self._coerce_time(logical_time_ms)
        try:
            meters = value_in_meters(value, unit)
        except EntityAdapterError as err:
            observations = self.mark_unavailable(
                sensor_id,
                source_slot,
                reason=("unsupported-unit" if "unit" in str(err) else "malformed"),
                logical_time_ms=now_ms,
                pose_revision=pose_revision,
            )
            observations.extend(
                self.source_status(
                    sensor_id,
                    "degraded",
                    "unsupported-unit" if "unit" in str(err) else "malformed",
                    logical_time_ms=now_ms,
                    pose_revision=pose_revision,
                )
            )
            return observations
        if abs(meters) > self.max_abs_position_m:
            return self.mark_unavailable(
                sensor_id,
                source_slot,
                reason="malformed",
                logical_time_ms=now_ms,
                pose_revision=pose_revision,
            ) + self.source_status(
                sensor_id,
                "degraded",
                "malformed",
                logical_time_ms=now_ms,
                pose_revision=pose_revision,
            )

        sample_token = token if token is not None else (now_ms, axis, meters)
        previous = self._halves.get((sensor_id, source_slot, axis))
        if previous is not None and previous.token == sample_token:
            return []
        self._halves[(sensor_id, source_slot, axis)] = _HalfSample(
            value_m=meters,
            logical_time_ms=now_ms,
            token=sample_token,
        )
        if axis == "z":
            return self._try_emit_pair(sensor_id, source_slot, now_ms, pose_revision)
        return self._try_emit_pair(sensor_id, source_slot, now_ms, pose_revision)

    def mark_unavailable(
        self,
        sensor_id: str,
        source_slot: str | int,
        *,
        reason: str = "unavailable",
        logical_time_ms: float | None = None,
        pose_revision: str = "default",
    ) -> list[dict[str, Any]]:
        """Invalidate a slot without ever re-emitting its cached coordinates."""

        now_ms = self._coerce_time(logical_time_ms)
        slot_key = (sensor_id, source_slot)
        for axis in ("x", "y", "z"):
            self._halves.pop((sensor_id, source_slot, axis), None)
        self._last_emitted_tokens.pop(slot_key, None)
        was_active = slot_key in self._slot_active
        self._slot_active.discard(slot_key)
        if not was_active:
            return []
        return [
            self._next(
                sensor_id,
                TARGET_INACTIVE,
                now_ms,
                pose_revision,
                source_slot,
                reason=reason,
            )
        ]

    def _try_emit_pair(
        self,
        sensor_id: str,
        source_slot: str | int,
        now_ms: float,
        pose_revision: str,
    ) -> list[dict[str, Any]]:
        slot_key = (sensor_id, source_slot)
        sample_x = self._halves.get((sensor_id, source_slot, "x"))
        sample_y = self._halves.get((sensor_id, source_slot, "y"))
        if sample_x is None or sample_y is None:
            return []
        ages = (now_ms - sample_x.logical_time_ms, now_ms - sample_y.logical_time_ms)
        skew = abs(sample_x.logical_time_ms - sample_y.logical_time_ms)
        if min(ages) < 0 or max(ages) > self.max_sample_age_ms or skew > self.max_pair_skew_ms:
            observations = self.mark_unavailable(
                sensor_id,
                source_slot,
                reason="stale-sample",
                logical_time_ms=now_ms,
                pose_revision=pose_revision,
            )
            observations.extend(
                self.source_status(
                    sensor_id,
                    "degraded",
                    "stale-sample",
                    logical_time_ms=now_ms,
                    pose_revision=pose_revision,
                )
            )
            return observations

        sample_z = self._halves.get((sensor_id, source_slot, "z"))
        if sample_z is not None and now_ms - sample_z.logical_time_ms > self.max_sample_age_ms:
            self._halves.pop((sensor_id, source_slot, "z"), None)
            sample_z = None
        token_tuple = (
            sample_x.token,
            sample_y.token,
            sample_z.token if sample_z is not None else None,
        )
        if self._last_emitted_tokens.get(slot_key) == token_tuple:
            return []
        self._last_emitted_tokens[slot_key] = token_tuple

        if math.hypot(sample_x.value_m, sample_y.value_m) < self.inactive_radius_m:
            was_active = slot_key in self._slot_active
            self._slot_active.discard(slot_key)
            observations = self.source_status(
                sensor_id,
                "online",
                "available",
                logical_time_ms=now_ms,
                pose_revision=pose_revision,
            )
            if was_active:
                observations.append(
                    self._next(
                        sensor_id,
                        TARGET_INACTIVE,
                        now_ms,
                        pose_revision,
                        source_slot,
                        reason="inactive",
                    )
                )
            return observations

        position = {"x": sample_x.value_m, "y": sample_y.value_m}
        if sample_z is not None:
            position["z"] = sample_z.value_m
        self._slot_active.add(slot_key)
        observations = self.source_status(
            sensor_id,
            "online",
            "available",
            logical_time_ms=now_ms,
            pose_revision=pose_revision,
        )
        observations.append(
            self._next(
                sensor_id,
                TARGET_OBSERVATION,
                now_ms,
                pose_revision,
                source_slot,
                positionMeters=position,
            )
        )
        return observations

    def collect(
        self,
        hass: object,
        radars: Mapping[str, Mapping[str, Any]],
        *,
        logical_time_ms: float | None = None,
    ) -> list[dict[str, Any]]:
        """Poll HA entities, staging one coherent X/Y pair per slot per poll."""

        now_ms = self._coerce_time(logical_time_ms)
        observations: list[dict[str, Any]] = []
        states = getattr(hass, "states", None)
        if states is None:
            return observations

        for sensor_id, radar_config in radars.items():
            if radar_config.get("paused", False):
                for slot_key in [key for key in self._slot_active if key[0] == sensor_id]:
                    observations.extend(
                        self.mark_unavailable(
                            sensor_id,
                            slot_key[1],
                            logical_time_ms=now_ms,
                            pose_revision=self._pose_revision(radar_config),
                        )
                    )
                observations.extend(
                    self.source_status(
                        sensor_id,
                        "offline",
                        "unavailable",
                        logical_time_ms=now_ms,
                        pose_revision=self._pose_revision(radar_config),
                    )
                )
                # A pause is a source boundary.  HA may retain unchanged entity
                # states while paused, so their tokens must be reconsidered as
                # fresh input immediately after unpausing.
                self._clear_entity_token_cache(sensor_id)
                continue

            pose_revision = self._pose_revision(radar_config)
            stem = entity_slug(sensor_id)
            slot_count = self._slot_count(radar_config)
            found_required_entity = False
            found_valid_pair = False
            degraded_reason = None
            for slot in range(1, slot_count + 1):
                required_present = 0
                required_valid = 0
                slot_reason = None
                staged: list[tuple[str, float, object]] = []
                z_became_unavailable = False
                for axis in ("x", "z", "y"):
                    entity_id = f"sensor.{stem}_target_{slot}_{axis}"
                    state = states.get(entity_id)
                    if state is None:
                        continue
                    if axis in {"x", "y"}:
                        found_required_entity = True
                        required_present += 1
                    raw_state = getattr(state, "state", None)
                    if str(raw_state).strip().lower() in _UNAVAILABLE_STATES:
                        if axis in {"x", "y"}:
                            slot_reason = "unavailable"
                        elif (sensor_id, slot, "z") in self._halves:
                            z_became_unavailable = True
                        continue
                    attributes = getattr(state, "attributes", {}) or {}
                    token = self._state_token(state, attributes)
                    if self._entity_tokens.get(entity_id) == token:
                        if axis in {"x", "y"}:
                            required_valid += 1
                        continue
                    try:
                        meters = value_in_meters(
                            raw_state,
                            attributes.get("unit_of_measurement", "m"),
                        )
                    except EntityAdapterError as err:
                        slot_reason = "unsupported-unit" if "unit" in str(err) else "malformed"
                        continue
                    if abs(meters) > self.max_abs_position_m:
                        slot_reason = "malformed"
                        continue
                    if axis in {"x", "y"}:
                        required_valid += 1
                    self._entity_tokens[entity_id] = token
                    staged.append((axis, meters, (entity_id, token)))

                if required_present == 0:
                    # Unconfigured higher slots are not a source-health failure,
                    # but a previously active entity that disappears is invalidated.
                    if (sensor_id, slot) in self._slot_active:
                        observations.extend(
                            self.mark_unavailable(
                                sensor_id,
                                slot,
                                logical_time_ms=now_ms,
                                pose_revision=pose_revision,
                            )
                        )
                        degraded_reason = degraded_reason or "unavailable"
                    continue
                if required_present < 2:
                    slot_reason = slot_reason or "partial-sample"
                elif required_valid < 2:
                    slot_reason = slot_reason or "unavailable"

                if slot_reason is not None:
                    observations.extend(
                        self.mark_unavailable(
                            sensor_id,
                            slot,
                            reason=(
                                slot_reason
                                if slot_reason in {"malformed", "unavailable", "unsupported-unit"}
                                else "unavailable"
                            ),
                            logical_time_ms=now_ms,
                            pose_revision=pose_revision,
                        )
                    )
                    if slot_reason == "partial-sample":
                        # Reconsider the present half when the missing entity first
                        # appears; until then no cached position crosses the boundary.
                        for axis in ("x", "y"):
                            self._entity_tokens.pop(
                                f"sensor.{stem}_target_{slot}_{axis}",
                                None,
                            )
                    degraded_reason = degraded_reason or slot_reason
                    continue

                found_valid_pair = True
                for axis, meters, token in staged:
                    self._halves[(sensor_id, slot, axis)] = _HalfSample(
                        value_m=meters,
                        logical_time_ms=now_ms,
                        token=token,
                    )
                if z_became_unavailable:
                    self._halves.pop((sensor_id, slot, "z"), None)
                observations.extend(
                    self._try_emit_pair(sensor_id, slot, now_ms, pose_revision)
                )

            if degraded_reason is not None:
                status = (
                    "offline"
                    if not found_valid_pair and degraded_reason == "unavailable"
                    else "degraded"
                )
                observations.extend(
                    self.source_status(
                        sensor_id,
                        status,
                        degraded_reason,
                        logical_time_ms=now_ms,
                        pose_revision=pose_revision,
                    )
                )
            elif not found_valid_pair:
                observations.extend(
                    self.source_status(
                        sensor_id,
                        "offline" if not found_required_entity else "degraded",
                        "unavailable" if not found_required_entity else "partial-sample",
                        logical_time_ms=now_ms,
                        pose_revision=pose_revision,
                    )
                )
        return observations

    def _clear_entity_token_cache(self, sensor_id: str) -> None:
        entity_prefix = f"sensor.{entity_slug(sensor_id)}_target_"
        for entity_id in [
            entity_id
            for entity_id in self._entity_tokens
            if entity_id.startswith(entity_prefix)
        ]:
            del self._entity_tokens[entity_id]

    @staticmethod
    def _pose_revision(radar_config: Mapping[str, Any]) -> str:
        layout = radar_config.get("layout", {})
        revision = layout.get("pose_revision", radar_config.get("pose_revision", "default"))
        return str(revision) if revision is not None else "default"

    @staticmethod
    def _slot_count(radar_config: Mapping[str, Any]) -> int:
        capabilities = radar_config.get("capabilities", {})
        raw = capabilities.get("max_targets", radar_config.get("target_count", 5))
        try:
            return max(1, min(32, int(raw)))
        except (TypeError, ValueError):
            return 5

    @staticmethod
    def _state_token(state: object, attributes: Mapping[str, Any]) -> object:
        updated = getattr(state, "last_reported", None) or getattr(state, "last_updated", None)
        if isinstance(updated, datetime):
            updated_token: object = updated.isoformat()
        elif updated is not None:
            updated_token = str(updated)
        else:
            updated_token = None
        return (
            updated_token,
            getattr(state, "state", None),
            attributes.get("unit_of_measurement"),
        )

    def _coerce_time(self, logical_time_ms: float | None) -> float:
        value = self._clock_ms() if logical_time_ms is None else logical_time_ms
        if not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ValueError("logical time must be a finite non-negative number")
        return float(value)
