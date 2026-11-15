"""Pure allowlisted RoomaboutsSnapshotV1 presentation boundary."""

from __future__ import annotations

from hashlib import sha256
import math
import re
from typing import Any, Mapping, Sequence


SNAPSHOT_SCHEMA_VERSION = 1
LIFECYCLES = frozenset({"tentative", "confirmed", "coasting", "fading"})
POSITION_BASES = frozenset({"observed", "interpolated", "held", "last-seen"})
RESET_REASONS = frozenset(
    {"explicit-reset", "integration-load", "map-replaced", "privacy-clear", "source-restart"}
)
SOURCE_HEALTH_REASONS = frozenset(
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
UNCERTAINTY_REASONS = frozenset(
    {"held-in-stationary-zone", "source-not-currently-observed", "source-unverified"}
)
POSTURES = frozenset(
    {"fallen", "resting", "sitting", "standing", "suspected_fall", "unknown"}
)

_MAP_CONFIG_KEYS = frozenset(
    {
        "ema_smoothing_level",
        "enable_tracking",
        "enable_verify_rule",
        "fall_alert_enabled",
        "fall_duration",
        "fall_threshold_h",
        "fused_color",
        "hibernation_ttl",
        "map_scale_x",
        "map_scale_y",
        "max_jump_base",
        "max_jump_speed",
        "merge_distance",
        "panel_opacity",
        "radar_radius",
        "show_heading",
        "show_labels",
        "show_trails",
        "stationary_max_hold",
        "target_height",
        "target_render_mode",
        "update_interval",
        "verify_delay",
        "zone_stroke",
    }
)
_LAYOUT_KEYS = frozenset(
    {
        "ceiling_mount",
        "enable_3d",
        "mirror_x",
        "mount_height",
        "origin_x",
        "origin_y",
        "pose_revision",
        "radar_type",
        "rotation",
        "scale_x",
        "scale_y",
        "z_max",
        "z_min",
    }
)
_ZONE_GROUPS = (
    "include_zones",
    "exclude_zones",
    "entrance_zones",
    "stationary_zones",
)
_RADAR_ZONE_GROUPS = (
    "monitor_zones",
    "hw_detect_zones",
    "hw_block_zones",
    "hw_stay_zones",
)
_BOOLEAN_CONFIG_KEYS = frozenset(
    {
        "enable_tracking",
        "enable_verify_rule",
        "fall_alert_enabled",
        "show_heading",
        "show_labels",
        "show_trails",
    }
)


class SnapshotValidationError(ValueError):
    """Raised for a malformed RoomaboutsSnapshotV1."""


def _finite_number(value: object) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
        return float(value)
    return None


def _safe_string(value: object, *, max_length: int = 128) -> str | None:
    if not isinstance(value, str) or not value.strip() or len(value) > max_length:
        return None
    return value


def _public_source_id(value: object) -> str | None:
    """Return a stable opaque diagnostic ID, never a configured address/name."""

    source_id = _safe_string(str(value), max_length=256) if value is not None else None
    if source_id is None:
        return None
    return f"source-{sha256(source_id.encode('utf-8')).hexdigest()[:12]}"


def _allow_scalar(value: object) -> str | bool | float | int | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float) and math.isfinite(value):
        return value
    if isinstance(value, str) and len(value) <= 128:
        return value
    return None


def _sanitize_config_value(key: str, value: object) -> str | bool | float | int | None:
    if key == "fused_color":
        if isinstance(value, str) and re.fullmatch(r"#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?", value):
            return value
        return None
    if key == "target_render_mode":
        return value if value in {"css", "canvas"} else None
    if key in _BOOLEAN_CONFIG_KEYS:
        return value if isinstance(value, bool) else None
    return _allow_scalar(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _sanitize_points(value: object) -> list[list[float]]:
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        return []
    points: list[list[float]] = []
    for raw in list(value)[:256]:
        if isinstance(raw, Mapping):
            x = _finite_number(raw.get("x"))
            y = _finite_number(raw.get("y"))
        elif isinstance(raw, Sequence) and not isinstance(raw, (str, bytes)) and len(raw) >= 2:
            x = _finite_number(raw[0])
            y = _finite_number(raw[1])
        else:
            continue
        if x is not None and y is not None:
            points.append([x, y])
    return points


def _sanitize_zone(raw: object, index: int) -> dict[str, Any] | None:
    if isinstance(raw, Mapping):
        points = _sanitize_points(raw.get("points", []))
        zone: dict[str, Any] = {"points": points}
        name = _safe_string(raw.get("name"), max_length=96)
        if name is not None:
            zone["name"] = name
        delay = _finite_number(raw.get("delay"))
        if delay is not None and delay >= 0:
            zone["delay"] = delay
        color = _safe_string(raw.get("color"), max_length=32)
        if color is not None and re.fullmatch(r"#[0-9A-Fa-f]{6}", color):
            zone["color"] = color
        return zone
    points = _sanitize_points(raw)
    if points:
        return {"name": f"zone_{index}", "points": points}
    return None


def _sanitize_zone_list(raw: object) -> list[dict[str, Any]]:
    if not isinstance(raw, Sequence) or isinstance(raw, (str, bytes)):
        return []
    zones: list[dict[str, Any]] = []
    for index, item in enumerate(list(raw)[:128]):
        zone = _sanitize_zone(item, index)
        if zone is not None:
            zones.append(zone)
    return zones


def _sanitize_map(
    configuration: Mapping[str, Any],
    map_id: str,
) -> dict[str, Any]:
    maps = configuration.get("maps", {})
    raw_map = maps.get(map_id, {}) if isinstance(maps, Mapping) else {}
    raw_config = raw_map.get("config", {}) if isinstance(raw_map, Mapping) else {}
    config: dict[str, Any] = {}
    if isinstance(raw_config, Mapping):
        for key in sorted(_MAP_CONFIG_KEYS):
            if key not in raw_config:
                continue
            value = _sanitize_config_value(key, raw_config[key])
            if value is not None:
                config[key] = value

    raw_zones = raw_map.get("zones", {}) if isinstance(raw_map, Mapping) else {}
    zones = {
        group: _sanitize_zone_list(raw_zones.get(group, []))
        for group in _ZONE_GROUPS
    }

    radars: list[dict[str, Any]] = []
    raw_radars = configuration.get("radars", {})
    if isinstance(raw_radars, Mapping):
        for sensor_id in sorted(raw_radars, key=str):
            radar = raw_radars[sensor_id]
            if not isinstance(radar, Mapping) or radar.get("map_group", "default") != map_id:
                continue
            safe_id = _public_source_id(sensor_id)
            if safe_id is None:
                continue
            item: dict[str, Any] = {
                "sensorId": safe_id,
                "mapGroup": map_id,
                "paused": bool(radar.get("paused", False)),
            }
            layout: dict[str, Any] = {}
            raw_layout = radar.get("layout", {})
            if isinstance(raw_layout, Mapping):
                for key in sorted(_LAYOUT_KEYS):
                    if key not in raw_layout:
                        continue
                    if key == "pose_revision":
                        raw_revision = _safe_string(str(raw_layout[key]), max_length=256)
                        value = (
                            f"pose-{sha256(raw_revision.encode('utf-8')).hexdigest()[:12]}"
                            if raw_revision is not None
                            else None
                        )
                    elif key in {"ceiling_mount", "enable_3d", "mirror_x"}:
                        value = raw_layout[key] if isinstance(raw_layout[key], bool) else None
                    else:
                        value = (
                            _allow_scalar(raw_layout[key])
                            if isinstance(raw_layout[key], (int, float))
                            and not isinstance(raw_layout[key], bool)
                            else None
                        )
                    if value is not None:
                        layout[key] = value
            item["layout"] = layout
            for group in _RADAR_ZONE_GROUPS:
                item[group] = _sanitize_zone_list(radar.get(group, []))
            radars.append(item)

    return {
        "mapId": map_id,
        "config": config,
        "zones": zones,
        "radars": radars,
    }


def _choose_map_id(configuration: Mapping[str, Any], requested: str | None) -> str:
    maps = configuration.get("maps", {})
    if not isinstance(maps, Mapping) or not maps:
        return requested or "default"
    if requested in maps:
        return str(requested)
    if "default" in maps:
        return "default"
    return str(sorted(maps, key=str)[0])


def _lifecycle_for(raw: Mapping[str, Any]) -> tuple[str, str, list[str]]:
    lifecycle = raw.get("lifecycle")
    basis = raw.get("positionBasis")
    uncertainty = raw.get("uncertainty")
    if lifecycle in LIFECYCLES and basis in POSITION_BASES:
        reasons = [
            reason
            for reason in (uncertainty if isinstance(uncertainty, list) else [])
            if reason in UNCERTAINTY_REASONS
        ][:16]
        return lifecycle, basis, reasons

    sources = raw.get("sources", [])
    source_set = set(sources) if isinstance(sources, list) else set()
    if "unverified" in source_set:
        return "tentative", "observed", ["source-unverified"]
    if "hold" in source_set:
        return "coasting", "held", ["held-in-stationary-zone"]
    if "hibernating" in source_set:
        return "fading", "last-seen", ["source-not-currently-observed"]
    return "confirmed", "observed", []


def _anonymous_alias(generation_id: str, track_id: str) -> str:
    digest = sha256(f"{generation_id}\0{track_id}".encode("utf-8")).hexdigest()[:6]
    return f"Wayfarer-{digest}"


def _public_track_id(generation_id: str, track_id: str) -> str:
    digest = sha256(f"{generation_id}\0{track_id}".encode("utf-8")).hexdigest()[:12]
    return f"track-{digest}"


def _sanitize_track(
    raw: object,
    generation_id: str,
    logical_time_ms: float,
) -> dict[str, Any] | None:
    if not isinstance(raw, Mapping):
        return None
    internal_track_id = _safe_string(raw.get("trackId", raw.get("id")), max_length=128)
    x = _finite_number(raw.get("x"))
    y = _finite_number(raw.get("y"))
    if internal_track_id is None or x is None or y is None:
        return None
    track_id = _public_track_id(generation_id, internal_track_id)
    lifecycle, basis, uncertainty = _lifecycle_for(raw)
    observed_at = _finite_number(raw.get("observedAt"))
    if observed_at is None:
        observed_at = logical_time_ms if basis == "observed" else logical_time_ms
    observed_at = max(0.0, min(observed_at, logical_time_ms))

    raw_sources = raw.get("sourceRefs", raw.get("sources", []))
    source_refs: list[str] = []
    if isinstance(raw_sources, list):
        for source in raw_sources:
            if (
                isinstance(source, str)
                and source not in {"hold", "hibernating", "unverified"}
                and 0 < len(source) <= 128
            ):
                if ":" in source:
                    source_id, slot = source.rsplit(":", 1)
                    public_id = _public_source_id(source_id)
                    if public_id is not None and slot:
                        slot_id = sha256(slot.encode("utf-8")).hexdigest()[:6]
                        source_refs.append(f"{public_id}:slot-{slot_id}")
                else:
                    public_id = _public_source_id(source)
                    if public_id is not None:
                        source_refs.append(public_id)

    track: dict[str, Any] = {
        "trackId": track_id,
        "position": {"x": x, "y": y, "coordinateSpace": "map-layout"},
        "positionBasis": basis,
        "lifecycle": lifecycle,
        "anonymousAlias": _anonymous_alias(generation_id, track_id),
        "sourceRefs": source_refs[:32],
        "observedAt": observed_at,
        "lastObservedAgeMs": max(0.0, logical_time_ms - observed_at),
    }
    if uncertainty:
        track["uncertainty"] = uncertainty
    posture = _safe_string(raw.get("posture"), max_length=32)
    if posture in POSTURES:
        track["posture"] = posture
    return track


def _sanitize_source_health(raw: object) -> list[dict[str, Any]]:
    if not isinstance(raw, Mapping):
        return []
    health: list[dict[str, Any]] = []
    for sensor_id in sorted(raw, key=str):
        item = raw[sensor_id]
        if not isinstance(item, Mapping):
            continue
        safe_id = _public_source_id(sensor_id)
        status = item.get("status")
        reason = _safe_string(item.get("reason"), max_length=64)
        updated_at = _finite_number(item.get("updatedAt"))
        if (
            safe_id is None
            or status not in {"online", "degraded", "offline"}
            or reason not in SOURCE_HEALTH_REASONS
        ):
            continue
        result: dict[str, Any] = {
            "sensorId": safe_id,
            "status": status,
            "reason": reason,
        }
        if updated_at is not None and updated_at >= 0:
            result["updatedAt"] = updated_at
        health.append(result)
    return health


def present_snapshot(
    configuration: Mapping[str, Any],
    runtime_view: Mapping[str, Any],
    context: Mapping[str, Any],
    *,
    map_id: str | None = None,
) -> dict[str, Any]:
    """Build an allowlisted RoomaboutsSnapshotV1 without mutating its inputs."""

    generation_id = _safe_string(context.get("generationId"), max_length=256)
    sequence = context.get("sequence")
    logical_time_ms = _finite_number(context.get("logicalTimeMs"))
    if generation_id is None:
        raise SnapshotValidationError("generationId must be a non-empty string")
    if not isinstance(sequence, int) or isinstance(sequence, bool) or sequence < 0:
        raise SnapshotValidationError("sequence must be a non-negative integer")
    if logical_time_ms is None or logical_time_ms < 0:
        raise SnapshotValidationError("logicalTimeMs must be finite and non-negative")

    selected_map = _choose_map_id(configuration, map_id)
    map_targets = runtime_view.get("mapTargets", {})
    raw_tracks = map_targets.get(selected_map, []) if isinstance(map_targets, Mapping) else []
    tracks = [
        track
        for track in (
            _sanitize_track(raw, generation_id, logical_time_ms)
            for raw in (raw_tracks if isinstance(raw_tracks, list) else [])
        )
        if track is not None
    ]
    tracks.sort(key=lambda track: track["trackId"])

    snapshot: dict[str, Any] = {
        "schemaVersion": SNAPSHOT_SCHEMA_VERSION,
        "generationId": generation_id,
        "sequence": sequence,
        "logicalTimeMs": logical_time_ms,
        "map": _sanitize_map(configuration, selected_map),
        "tracks": tracks,
        "sourceHealth": _sanitize_source_health(runtime_view.get("sourceHealth", {})),
    }
    reset_reason = _safe_string(context.get("resetReason"), max_length=64)
    if reset_reason in RESET_REASONS:
        snapshot["resetReason"] = reset_reason
    elif context.get("resetReason") is not None:
        raise SnapshotValidationError("resetReason is not allowlisted")
    return validate_snapshot(snapshot)


def validate_snapshot(value: object) -> dict[str, Any]:
    """Validate the frozen top-level snapshot and essential track semantics."""

    if not isinstance(value, dict):
        raise SnapshotValidationError("snapshot must be an object")
    allowed = {
        "schemaVersion",
        "generationId",
        "sequence",
        "logicalTimeMs",
        "resetReason",
        "map",
        "tracks",
        "sourceHealth",
    }
    if set(value) - allowed:
        raise SnapshotValidationError("snapshot contains unsupported top-level fields")
    if value.get("schemaVersion") != SNAPSHOT_SCHEMA_VERSION:
        raise SnapshotValidationError("schemaVersion must be exactly 1")
    if _safe_string(value.get("generationId"), max_length=256) is None:
        raise SnapshotValidationError("generationId must be a non-empty string")
    sequence = value.get("sequence")
    if not isinstance(sequence, int) or isinstance(sequence, bool) or sequence < 0:
        raise SnapshotValidationError("sequence must be a non-negative integer")
    logical_time_ms = _finite_number(value.get("logicalTimeMs"))
    if logical_time_ms is None or logical_time_ms < 0:
        raise SnapshotValidationError("logicalTimeMs must be finite and non-negative")
    if "resetReason" in value and value["resetReason"] not in RESET_REASONS:
        raise SnapshotValidationError("resetReason is not allowlisted")
    map_value = value.get("map")
    if not isinstance(map_value, dict):
        raise SnapshotValidationError("map must be an object")
    if set(map_value) != {"mapId", "config", "zones", "radars"}:
        raise SnapshotValidationError("map fields do not match RoomaboutsSnapshotV1")
    if not isinstance(map_value.get("mapId"), str):
        raise SnapshotValidationError("mapId must be a string")
    if not isinstance(map_value.get("config"), dict) or not isinstance(map_value.get("zones"), dict):
        raise SnapshotValidationError("map config and zones must be objects")
    if not isinstance(map_value.get("radars"), list):
        raise SnapshotValidationError("map radars must be an array")
    tracks = value.get("tracks")
    if not isinstance(tracks, list):
        raise SnapshotValidationError("tracks must be an array")
    for track in tracks:
        if not isinstance(track, dict):
            raise SnapshotValidationError("track must be an object")
        allowed_track_keys = {
            "trackId",
            "position",
            "positionBasis",
            "lifecycle",
            "anonymousAlias",
            "sourceRefs",
            "observedAt",
            "lastObservedAgeMs",
            "uncertainty",
            "posture",
        }
        if set(track) - allowed_track_keys:
            raise SnapshotValidationError("track contains unsupported fields")
        if not isinstance(track.get("trackId"), str) or not re.fullmatch(
            r"track-[0-9a-f]{12}", track["trackId"]
        ):
            raise SnapshotValidationError("trackId must be generation-scoped and opaque")
        if track.get("lifecycle") not in LIFECYCLES:
            raise SnapshotValidationError("track lifecycle is invalid")
        if track.get("positionBasis") not in POSITION_BASES:
            raise SnapshotValidationError("track position basis is invalid")
        position = track.get("position")
        if not isinstance(position, dict):
            raise SnapshotValidationError("track position must be an object")
        if set(position) != {"x", "y", "coordinateSpace"}:
            raise SnapshotValidationError("track position fields are invalid")
        if position.get("coordinateSpace") != "map-layout":
            raise SnapshotValidationError("track coordinate space is invalid")
        if _finite_number(position.get("x")) is None or _finite_number(position.get("y")) is None:
            raise SnapshotValidationError("track position must be finite")
        observed_at = _finite_number(track.get("observedAt"))
        age = _finite_number(track.get("lastObservedAgeMs"))
        if observed_at is None or observed_at < 0 or age is None or age < 0:
            raise SnapshotValidationError("track observation times must be finite and non-negative")
        if not isinstance(track.get("sourceRefs"), list):
            raise SnapshotValidationError("track sourceRefs must be an array")
        if "uncertainty" in track and (
            not isinstance(track["uncertainty"], list)
            or any(reason not in UNCERTAINTY_REASONS for reason in track["uncertainty"])
        ):
            raise SnapshotValidationError("track uncertainty is invalid")
        if "posture" in track and track["posture"] not in POSTURES:
            raise SnapshotValidationError("track posture is invalid")
    source_health = value.get("sourceHealth")
    if not isinstance(source_health, list):
        raise SnapshotValidationError("sourceHealth must be an array")
    for item in source_health:
        if not isinstance(item, dict) or set(item) - {"sensorId", "status", "reason", "updatedAt"}:
            raise SnapshotValidationError("source health contains unsupported fields")
        if item.get("status") not in {"online", "degraded", "offline"}:
            raise SnapshotValidationError("source health status is invalid")
        if item.get("reason") not in SOURCE_HEALTH_REASONS:
            raise SnapshotValidationError("source health reason is invalid")
    return value


class SnapshotPresenter:
    """Small compatibility wrapper around the pure presentation function."""

    def present(
        self,
        configuration: Mapping[str, Any],
        runtime_view: Mapping[str, Any],
        context: Mapping[str, Any],
        *,
        map_id: str | None = None,
    ) -> dict[str, Any]:
        return present_snapshot(configuration, runtime_view, context, map_id=map_id)
