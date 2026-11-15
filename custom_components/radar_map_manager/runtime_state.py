"""Ephemeral Roomabouts state and configuration-only storage migration helpers."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
import math
from typing import Any, Callable, Mapping
from uuid import uuid4


DOMAIN = "radar_map_manager"
DATA_VERSION = 2

_ROOT_RUNTIME_KEYS = frozenset(
    {
        "_force_reset_history",
        "discovered_radars",
        "generationId",
        "generation_id",
        "last_seen_udp",
        "live_data",
        "logicalTimeMs",
        "logical_time_ms",
        "map_targets",
        "pairing_session",
        "runtime",
        "runtime_state",
        "sequence",
        "sourceHealth",
        "source_health",
        "track_history",
    }
)
_ROOT_RUNTIME_COMPACT_KEYS = frozenset(
    "".join(character for character in key.lower() if character.isalnum())
    for key in _ROOT_RUNTIME_KEYS
)
_CONTAINER_RUNTIME_KEYS = frozenset(
    {
        "auth_passed",
        "capabilities",
        "fused_targets",
        "history",
        "runtime_targets",
        "target_history",
        "targets",
        "tracks",
    }
)
_CONTAINER_RUNTIME_COMPACT_KEYS = frozenset(
    "".join(character for character in key.lower() if character.isalnum())
    for key in _CONTAINER_RUNTIME_KEYS
)
_EXCLUSIVE_TRANSPORT_COMPACT_KEYS = frozenset(
    {
        "directradarwebsocket",
        "directwebsocket",
        "enableudp",
        "mqtt",
        "mqttbroker",
        "mqttpassword",
        "mqttprefix",
        "mqtttopic",
        "mqtttopics",
        "mqttusername",
        "streammode",
        "udpport",
        "websocket",
        "websocketurl",
        "wsurl",
    }
)
_SECRET_KEYS = frozenset(
    {
        "api_key",
        "device_pin",
        "password",
        "pin",
        "radar_ip",
        "secret",
        "token",
    }
)
_SECRET_OR_NETWORK_COMPACT_KEYS = frozenset(
    {
        "accesskey",
        "accesstoken",
        "address",
        "apikey",
        "apitoken",
        "clientsecret",
        "devicepin",
        "directwsurl",
        "endpoint",
        "host",
        "ip",
        "ipaddress",
        "networkdestination",
        "pairingpin",
        "password",
        "pin",
        "pincode",
        "radaraddress",
        "radarhost",
        "radarip",
        "secret",
        "token",
        "url",
        "websocketurl",
    }
)


def _copy_without_secrets(value: object, path: tuple[str, ...], removed: list[str]) -> object:
    if isinstance(value, Mapping):
        result: dict[str, Any] = {}
        for raw_key, child in value.items():
            key = str(raw_key)
            lower_key = key.lower()
            compact_key = "".join(character for character in lower_key if character.isalnum())
            child_path = (*path, key)
            should_strip = (
                lower_key in _SECRET_KEYS
                or compact_key in _SECRET_OR_NETWORK_COMPACT_KEYS
            )
            if len(path) == 0 and compact_key in (
                _ROOT_RUNTIME_COMPACT_KEYS | _CONTAINER_RUNTIME_COMPACT_KEYS
            ):
                should_strip = True
            top_level = path[0].lower() if path else ""
            if (
                path
                and top_level in {"maps", "radars"}
                and compact_key in (
                    _CONTAINER_RUNTIME_COMPACT_KEYS | _ROOT_RUNTIME_COMPACT_KEYS
                )
            ):
                should_strip = True
            if (
                compact_key in _EXCLUSIVE_TRANSPORT_COMPACT_KEYS
                or compact_key.startswith("mqtt")
                or compact_key.startswith("websocket")
            ):
                should_strip = True
            if top_level == "radars" and compact_key == "port":
                should_strip = True
            if should_strip:
                removed.append(".".join(child_path))
                continue
            result[key] = _copy_without_secrets(child, child_path, removed)
        return result
    if isinstance(value, list):
        return [
            _copy_without_secrets(child, (*path, str(index)), removed)
            for index, child in enumerate(value)
        ]
    if isinstance(value, tuple):
        return [
            _copy_without_secrets(child, (*path, str(index)), removed)
            for index, child in enumerate(value)
        ]
    return deepcopy(value)


def migrate_storage(value: object) -> tuple[dict[str, Any], tuple[str, ...]]:
    """Return stored-data version 2 and the paths removed during migration.

    The function is intentionally pure so migration can be characterized without
    importing Home Assistant.  It is also applied before every save, preventing a
    future caller from accidentally serializing ephemeral state.
    """

    if not isinstance(value, Mapping):
        value = {}
    removed: list[str] = []
    clean = _copy_without_secrets(value, (), removed)
    assert isinstance(clean, dict)
    clean["version"] = DATA_VERSION
    if not isinstance(clean.get("maps"), dict):
        clean["maps"] = {}
    if not isinstance(clean.get("radars"), dict):
        clean["radars"] = {}
    return clean, tuple(sorted(removed))


def storage_is_configuration_only(value: object) -> bool:
    """Return whether migrating a value would remove no fields."""

    if not isinstance(value, Mapping):
        return False
    clean, removed = migrate_storage(value)
    return not removed and clean == value and clean.get("version") == DATA_VERSION


@dataclass(slots=True)
class RuntimeState:
    """Coordinates and tracking state that must never enter persistent storage."""

    generation_factory: Callable[[], str] = lambda: uuid4().hex
    generation_id: str = field(init=False)
    sequence: int = field(init=False, default=-1)
    logical_time_ms: float = field(init=False, default=0.0)
    pending_reset_reason: str | None = field(init=False, default="integration-load")
    radar_targets: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    map_targets: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    source_health: dict[str, dict[str, Any]] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.generation_id = self._new_generation_id()

    def _new_generation_id(self) -> str:
        generation_id = self.generation_factory()
        if not isinstance(generation_id, str) or not generation_id:
            raise ValueError("generation_factory must return a non-empty string")
        return generation_id

    def begin_generation(
        self,
        reason: str,
        logical_time_ms: float,
        *,
        generation_id: str | None = None,
    ) -> str:
        if not isinstance(reason, str) or not reason:
            raise ValueError("generation reset reason must be a non-empty string")
        if not isinstance(logical_time_ms, (int, float)) or not math.isfinite(logical_time_ms):
            raise ValueError("logical_time_ms must be finite")
        new_id = generation_id if generation_id is not None else self._new_generation_id()
        if not isinstance(new_id, str) or not new_id:
            raise ValueError("generation_id must be a non-empty string")
        self.generation_id = new_id
        self.sequence = -1
        self.logical_time_ms = float(logical_time_ms)
        self.pending_reset_reason = reason
        self.radar_targets.clear()
        self.map_targets.clear()
        self.source_health.clear()
        return new_id

    def next_snapshot_context(self, logical_time_ms: float) -> dict[str, Any]:
        if not isinstance(logical_time_ms, (int, float)) or not math.isfinite(logical_time_ms):
            raise ValueError("logical_time_ms must be finite")
        if logical_time_ms < self.logical_time_ms:
            logical_time_ms = self.logical_time_ms
        self.logical_time_ms = float(logical_time_ms)
        self.sequence += 1
        context: dict[str, Any] = {
            "generationId": self.generation_id,
            "sequence": self.sequence,
            "logicalTimeMs": self.logical_time_ms,
        }
        if self.pending_reset_reason is not None:
            context["resetReason"] = self.pending_reset_reason
            self.pending_reset_reason = None
        return context

    def set_radar_targets(self, sensor_id: str, targets: list[dict[str, Any]]) -> None:
        self.radar_targets[sensor_id] = deepcopy(targets)

    def set_map_targets(self, map_id: str, targets: list[dict[str, Any]]) -> None:
        self.map_targets[map_id] = deepcopy(targets)

    def get_map_targets(self, map_id: str) -> list[dict[str, Any]]:
        exact = self.map_targets.get(map_id)
        if exact is not None:
            return deepcopy(exact)
        lowered = map_id.lower()
        for candidate, targets in self.map_targets.items():
            if candidate.lower() == lowered:
                return deepcopy(targets)
        return []

    def set_source_health(
        self,
        sensor_id: str,
        status: str,
        reason: str,
        logical_time_ms: float,
    ) -> None:
        self.source_health[sensor_id] = {
            "sensorId": sensor_id,
            "status": status,
            "reason": reason,
            "updatedAt": float(logical_time_ms),
        }

    def view(self) -> dict[str, Any]:
        return {
            "generationId": self.generation_id,
            "sequence": self.sequence,
            "logicalTimeMs": self.logical_time_ms,
            "radarTargets": deepcopy(self.radar_targets),
            "mapTargets": deepcopy(self.map_targets),
            "sourceHealth": deepcopy(self.source_health),
        }


def get_runtime_state(
    hass: object,
    *,
    domain: str = DOMAIN,
    generation_factory: Callable[[], str] | None = None,
) -> RuntimeState:
    """Create or return the integration's ephemeral runtime container."""

    data = getattr(hass, "data")
    domain_data = data.setdefault(domain, {})
    runtime = domain_data.get("runtime_state")
    if isinstance(runtime, RuntimeState):
        return runtime
    runtime = RuntimeState(
        generation_factory=generation_factory or (lambda: uuid4().hex)
    )
    domain_data["runtime_state"] = runtime
    return runtime
