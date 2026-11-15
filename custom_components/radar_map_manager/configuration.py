"""Bounded, allowlisted Roomabouts configuration import.

Only persistent map and radar configuration belongs in this format. Runtime
targets, credentials, and network destinations are rejected instead of being
silently copied into Home Assistant storage.
"""

from __future__ import annotations

import json
import math
import re
from typing import Any, Final


MAX_CONFIG_JSON_BYTES: Final = 256 * 1024
MAX_NESTING_DEPTH: Final = 10
MAX_TOTAL_NODES: Final = 20_000
MAX_COLLECTION_ITEMS: Final = 512
MAX_GENERIC_STRING_LENGTH: Final = 4_096
MAX_MAPS: Final = 16
MAX_RADARS: Final = 64
MAX_ZONES_PER_KIND: Final = 128
MAX_POINTS_PER_ZONE: Final = 64
CONFIG_IDENTIFIER_PATTERN: Final = (
    r"^[A-Za-z0-9](?:[A-Za-z0-9 _-]{0,62}[A-Za-z0-9])?$"
)

_IDENTIFIER_RE = re.compile(CONFIG_IDENTIFIER_PATTERN)
_COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$")

_FORBIDDEN_COMPACT_KEYS: Final = frozenset(
    {
        # Credentials and authentication state.
        "apikey",
        "auth",
        "authorization",
        "authpassed",
        "credential",
        "credentials",
        "devicepin",
        "password",
        "passwd",
        "pin",
        "privatekey",
        "secret",
        "signature",
        "token",
        # Network destinations and exclusive transport configuration.
        "address",
        "endpoint",
        "haip",
        "host",
        "hostname",
        "ip",
        "mqtt",
        "port",
        "radarip",
        "streammode",
        "udp",
        "udpport",
        "uri",
        "url",
        "websocket",
        "wsurl",
        # Runtime/presentation state.
        "discoveredradars",
        "forceresethistory",
        "fusedtargets",
        "generationid",
        "history",
        "lastseen",
        "livedata",
        "logicaltimems",
        "position",
        "runtime",
        "runtimestate",
        "sequence",
        "sourcehealth",
        "sourcerefs",
        "sources",
        "target",
        "targets",
        "tracks",
    }
)

_MAP_ZONE_KEYS: Final = frozenset(
    {"include_zones", "exclude_zones", "entrance_zones", "stationary_zones"}
)
_RADAR_ZONE_KEYS: Final = frozenset(
    {"monitor_zones", "hw_detect_zones", "hw_block_zones", "hw_stay_zones"}
)
_ZONE_KEYS: Final = frozenset(
    {"name", "points", "delay", "custom_z", "z_min", "z_max"}
)
_LAYOUT_KEYS: Final = frozenset(
    {
        "origin_x",
        "origin_y",
        "scale_x",
        "scale_y",
        "rotation",
        "mirror_x",
        "enable_3d",
        "mount_height",
        "ceiling_mount",
        "radar_type",
        "z_min",
        "z_max",
    }
)
_MAP_CONFIG_KEYS: Final = frozenset(
    {
        "update_interval",
        "merge_distance",
        "target_height",
        "fused_color",
        "ema_smoothing_level",
        "verify_delay",
        "hibernation_ttl",
        "enable_verify_rule",
        "enable_tracking",
        "show_labels",
        "show_trails",
        "show_heading",
        "show_pointcloud",
        "max_jump_base",
        "max_jump_speed",
        "stationary_max_hold",
        "auto_block_duration",
        "panel_opacity",
        "map_scale_x",
        "map_scale_y",
        "fall_alert_enabled",
        "fall_threshold_h",
        "fall_duration",
        "radar_radius",
        "zone_stroke",
        "target_render_mode",
    }
)


class ConfigurationImportError(ValueError):
    """Raised when an imported configuration is outside the safe contract."""


def _compact_key(key: str) -> str:
    return re.sub(r"[^a-z0-9]", "", key.lower())


def _reject_json_constant(value: str) -> None:
    raise ConfigurationImportError(f"non-finite JSON number is not allowed: {value}")


def _reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ConfigurationImportError("duplicate JSON key is not allowed")
        result[key] = value
    return result


def _validate_tree_bounds(value: Any) -> None:
    """Reject resource-exhaustion shapes before semantic validation."""

    node_count = 0
    stack: list[tuple[Any, int, str]] = [(value, 0, "$")]
    while stack:
        current, depth, path = stack.pop()
        node_count += 1
        if node_count > MAX_TOTAL_NODES:
            raise ConfigurationImportError("configuration contains too many values")
        if depth > MAX_NESTING_DEPTH:
            raise ConfigurationImportError(
                f"configuration nesting exceeds {MAX_NESTING_DEPTH} at {path}"
            )

        if isinstance(current, dict):
            if len(current) > MAX_COLLECTION_ITEMS:
                raise ConfigurationImportError(f"object is too large at {path}")
            for key, child in current.items():
                if not isinstance(key, str):
                    raise ConfigurationImportError(f"object key is not text at {path}")
                if len(key) > 128:
                    raise ConfigurationImportError(f"object key is too long at {path}")
                if _compact_key(key) in _FORBIDDEN_COMPACT_KEYS:
                    raise ConfigurationImportError(
                        f"forbidden configuration field at {path}"
                    )
                stack.append((child, depth + 1, f"{path}.field"))
            continue

        if isinstance(current, list):
            if len(current) > MAX_COLLECTION_ITEMS:
                raise ConfigurationImportError(f"list is too large at {path}")
            stack.extend(
                (child, depth + 1, f"{path}[{index}]")
                for index, child in enumerate(current)
            )
            continue

        if isinstance(current, str):
            if len(current) > MAX_GENERIC_STRING_LENGTH:
                raise ConfigurationImportError(f"text value is too long at {path}")
            continue

        if isinstance(current, bool):
            continue

        if isinstance(current, (int, float)):
            if not math.isfinite(current):
                raise ConfigurationImportError(f"non-finite number at {path}")
            if abs(current) > 1_000_000_000:
                raise ConfigurationImportError(f"number is out of range at {path}")
            continue

        if current is None:
            raise ConfigurationImportError(f"null is not allowed at {path}")

        raise ConfigurationImportError(f"unsupported value at {path}")


def _expect_dict(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ConfigurationImportError(f"expected an object at {path}")
    return value


def _expect_list(value: Any, path: str) -> list[Any]:
    if not isinstance(value, list):
        raise ConfigurationImportError(f"expected a list at {path}")
    return value


def _reject_unknown_keys(
    value: dict[str, Any], allowed: frozenset[str], path: str
) -> None:
    if set(value) - allowed:
        raise ConfigurationImportError(f"unsupported key at {path}")


def _identifier(value: Any, path: str) -> str:
    if not isinstance(value, str) or _IDENTIFIER_RE.fullmatch(value) is None:
        raise ConfigurationImportError(f"invalid identifier at {path}")
    return value


def _text(value: Any, path: str, *, max_length: int = 128) -> str:
    if not isinstance(value, str) or not value or len(value) > max_length:
        raise ConfigurationImportError(f"invalid text at {path}")
    if any(ord(character) < 32 for character in value):
        raise ConfigurationImportError(f"control character in text at {path}")
    if "<" in value or ">" in value:
        raise ConfigurationImportError(f"markup is not allowed in text at {path}")
    return value


def _boolean(value: Any, path: str) -> bool:
    if not isinstance(value, bool):
        raise ConfigurationImportError(f"expected a boolean at {path}")
    return value


def _number(
    value: Any,
    path: str,
    *,
    minimum: float,
    maximum: float,
) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ConfigurationImportError(f"expected a number at {path}")
    result = float(value)
    if not math.isfinite(result) or result < minimum or result > maximum:
        raise ConfigurationImportError(
            f"number at {path} must be between {minimum} and {maximum}"
        )
    return result


def _integer(
    value: Any,
    path: str,
    *,
    minimum: int,
    maximum: int,
) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ConfigurationImportError(f"expected an integer at {path}")
    if value < minimum or value > maximum:
        raise ConfigurationImportError(
            f"integer at {path} must be between {minimum} and {maximum}"
        )
    return value


def _validate_points(value: Any, path: str) -> list[list[float]]:
    points = _expect_list(value, path)
    if len(points) < 3 or len(points) > MAX_POINTS_PER_ZONE:
        raise ConfigurationImportError(
            f"zone at {path} must contain 3-{MAX_POINTS_PER_ZONE} points"
        )

    result: list[list[float]] = []
    for index, point in enumerate(points):
        point_path = f"{path}[{index}]"
        if isinstance(point, list):
            if len(point) != 2:
                raise ConfigurationImportError(
                    f"point must contain exactly two coordinates at {point_path}"
                )
            x_value, y_value = point
        elif isinstance(point, dict):
            _reject_unknown_keys(point, frozenset({"x", "y"}), point_path)
            if set(point) != {"x", "y"}:
                raise ConfigurationImportError(f"point requires x and y at {point_path}")
            x_value, y_value = point["x"], point["y"]
        else:
            raise ConfigurationImportError(f"invalid point at {point_path}")
        result.append(
            [
                _number(x_value, f"{point_path}.x", minimum=-100_000, maximum=100_000),
                _number(y_value, f"{point_path}.y", minimum=-100_000, maximum=100_000),
            ]
        )
    return result


def _validate_zone(value: Any, path: str) -> dict[str, Any]:
    zone = _expect_dict(value, path)
    _reject_unknown_keys(zone, _ZONE_KEYS, path)
    if "points" not in zone:
        raise ConfigurationImportError(f"zone requires points at {path}")

    result: dict[str, Any] = {"points": _validate_points(zone["points"], f"{path}.points")}
    if "name" in zone:
        result["name"] = _text(zone["name"], f"{path}.name")
    if "delay" in zone:
        result["delay"] = _number(
            zone["delay"], f"{path}.delay", minimum=0, maximum=86_400
        )
    if "custom_z" in zone:
        result["custom_z"] = _boolean(zone["custom_z"], f"{path}.custom_z")
    if "z_min" in zone:
        result["z_min"] = _number(
            zone["z_min"], f"{path}.z_min", minimum=-100, maximum=100
        )
    if "z_max" in zone:
        result["z_max"] = _number(
            zone["z_max"], f"{path}.z_max", minimum=-100, maximum=100
        )
    if result.get("custom_z") and not {"z_min", "z_max"}.issubset(result):
        raise ConfigurationImportError(f"custom_z requires z_min and z_max at {path}")
    if "z_min" in result and "z_max" in result and result["z_min"] > result["z_max"]:
        raise ConfigurationImportError(f"z_min exceeds z_max at {path}")
    return result


def validate_zone_configuration(value: Any) -> dict[str, Any]:
    """Validate one zone supplied by a state-changing service."""

    _validate_tree_bounds(value)
    return _validate_zone(value, "$.zone")


def _validate_zone_group(
    value: Any, allowed_keys: frozenset[str], path: str
) -> dict[str, list[dict[str, Any]]]:
    group = _expect_dict(value, path)
    _reject_unknown_keys(group, allowed_keys, path)
    result: dict[str, list[dict[str, Any]]] = {}
    for zone_kind, raw_zones in group.items():
        zones = _expect_list(raw_zones, f"{path}.{zone_kind}")
        if len(zones) > MAX_ZONES_PER_KIND:
            raise ConfigurationImportError(
                f"too many zones at {path}.{zone_kind}"
            )
        result[zone_kind] = [
            _validate_zone(zone, f"{path}.{zone_kind}[{index}]")
            for index, zone in enumerate(zones)
        ]
    return result


def _validate_map_config(value: Any, path: str) -> dict[str, Any]:
    config = _expect_dict(value, path)
    _reject_unknown_keys(config, _MAP_CONFIG_KEYS, path)
    result: dict[str, Any] = {}

    numeric_ranges = {
        "update_interval": (0.1, 5.0),
        "merge_distance": (0.01, 20.0),
        "target_height": (0.0, 5.0),
        "verify_delay": (0.0, 60.0),
        "hibernation_ttl": (0.0, 168.0),
        "max_jump_base": (0.0, 100.0),
        "max_jump_speed": (0.0, 100.0),
        "stationary_max_hold": (0.0, 86_400.0),
        "auto_block_duration": (0.0, 86_400.0),
        "panel_opacity": (0.2, 1.0),
        "map_scale_x": (0.001, 10_000.0),
        "map_scale_y": (0.001, 10_000.0),
        "fall_threshold_h": (0.0, 5.0),
        "fall_duration": (0.0, 300.0),
        "radar_radius": (1.0, 200.0),
        "zone_stroke": (0.1, 20.0),
    }
    boolean_keys = {
        "enable_verify_rule",
        "enable_tracking",
        "show_labels",
        "show_trails",
        "show_heading",
        "show_pointcloud",
        "fall_alert_enabled",
    }

    for key, raw_value in config.items():
        key_path = f"{path}.{key}"
        if key in numeric_ranges:
            minimum, maximum = numeric_ranges[key]
            result[key] = _number(
                raw_value, key_path, minimum=minimum, maximum=maximum
            )
        elif key == "ema_smoothing_level":
            result[key] = _integer(raw_value, key_path, minimum=1, maximum=10)
        elif key in boolean_keys:
            result[key] = _boolean(raw_value, key_path)
        elif key == "fused_color":
            if not isinstance(raw_value, str) or _COLOR_RE.fullmatch(raw_value) is None:
                raise ConfigurationImportError(f"invalid color at {key_path}")
            result[key] = raw_value
        elif key == "target_render_mode":
            if raw_value not in {"css", "canvas"}:
                raise ConfigurationImportError(f"invalid render mode at {key_path}")
            result[key] = raw_value
    return result


def validate_map_configuration_settings(value: Any) -> dict[str, Any]:
    """Validate a partial map settings object supplied by a service."""

    _validate_tree_bounds(value)
    return _validate_map_config(value, "$.config")


def _validate_layout(value: Any, path: str) -> dict[str, Any]:
    layout = _expect_dict(value, path)
    _reject_unknown_keys(layout, _LAYOUT_KEYS, path)
    result: dict[str, Any] = {}
    numeric_ranges = {
        "origin_x": (-100_000.0, 100_000.0),
        "origin_y": (-100_000.0, 100_000.0),
        "scale_x": (0.001, 10_000.0),
        "scale_y": (0.001, 10_000.0),
        "rotation": (-3_600.0, 3_600.0),
        "mount_height": (0.0, 20.0),
        "z_min": (-100.0, 100.0),
        "z_max": (-100.0, 100.0),
    }
    for key, raw_value in layout.items():
        key_path = f"{path}.{key}"
        if key in numeric_ranges:
            minimum, maximum = numeric_ranges[key]
            result[key] = _number(
                raw_value, key_path, minimum=minimum, maximum=maximum
            )
        elif key in {"mirror_x", "enable_3d", "ceiling_mount"}:
            result[key] = _boolean(raw_value, key_path)
        elif key == "radar_type":
            result[key] = _integer(raw_value, key_path, minimum=1, maximum=3)
    if "z_min" in result and "z_max" in result and result["z_min"] > result["z_max"]:
        raise ConfigurationImportError(f"z_min exceeds z_max at {path}")
    return result


def validate_layout_configuration(value: Any) -> dict[str, Any]:
    """Validate a partial radar layout object supplied by a service."""

    _validate_tree_bounds(value)
    return _validate_layout(value, "$.layout")


def _validate_map(value: Any, path: str) -> dict[str, Any]:
    map_config = _expect_dict(value, path)
    _reject_unknown_keys(map_config, frozenset({"zones", "config"}), path)
    result: dict[str, Any] = {}
    if "zones" in map_config:
        result["zones"] = _validate_zone_group(
            map_config["zones"], _MAP_ZONE_KEYS, f"{path}.zones"
        )
    if "config" in map_config:
        result["config"] = _validate_map_config(
            map_config["config"], f"{path}.config"
        )
    return result


def _validate_radar(value: Any, path: str) -> dict[str, Any]:
    radar = _expect_dict(value, path)
    allowed = frozenset({"map_group", "paused", "layout"}) | _RADAR_ZONE_KEYS
    _reject_unknown_keys(radar, allowed, path)
    if "map_group" not in radar:
        raise ConfigurationImportError(f"radar requires map_group at {path}")

    result: dict[str, Any] = {
        "map_group": _identifier(radar["map_group"], f"{path}.map_group")
    }
    if "paused" in radar:
        result["paused"] = _boolean(radar["paused"], f"{path}.paused")
    if "layout" in radar:
        result["layout"] = _validate_layout(radar["layout"], f"{path}.layout")
    for zone_kind in _RADAR_ZONE_KEYS:
        if zone_kind not in radar:
            continue
        zones = _expect_list(radar[zone_kind], f"{path}.{zone_kind}")
        if len(zones) > MAX_ZONES_PER_KIND:
            raise ConfigurationImportError(f"too many zones at {path}.{zone_kind}")
        result[zone_kind] = [
            _validate_zone(zone, f"{path}.{zone_kind}[{index}]")
            for index, zone in enumerate(zones)
        ]
    return result


def validate_configuration(value: Any) -> dict[str, Any]:
    """Validate and return a detached, normalized configuration object."""

    _validate_tree_bounds(value)
    root = _expect_dict(value, "$")
    _reject_unknown_keys(root, frozenset({"version", "maps", "radars"}), "$")
    if set(root) != {"version", "maps", "radars"}:
        raise ConfigurationImportError(
            "configuration requires exactly version, maps, and radars"
        )

    version = _integer(root["version"], "$.version", minimum=1, maximum=2)
    raw_maps = _expect_dict(root["maps"], "$.maps")
    raw_radars = _expect_dict(root["radars"], "$.radars")
    if not raw_maps or len(raw_maps) > MAX_MAPS:
        raise ConfigurationImportError(f"configuration must contain 1-{MAX_MAPS} maps")
    if len(raw_radars) > MAX_RADARS:
        raise ConfigurationImportError(f"configuration exceeds {MAX_RADARS} radars")

    maps: dict[str, Any] = {}
    for index, (map_name, map_value) in enumerate(raw_maps.items()):
        map_path = f"$.maps[{index}]"
        safe_name = _identifier(map_name, map_path)
        maps[safe_name] = _validate_map(map_value, map_path)

    radars: dict[str, Any] = {}
    for index, (radar_name, radar_value) in enumerate(raw_radars.items()):
        radar_path = f"$.radars[{index}]"
        safe_name = _identifier(radar_name, radar_path)
        radar = _validate_radar(radar_value, radar_path)
        if radar["map_group"] not in maps:
            raise ConfigurationImportError("radar refers to an unknown map")
        radars[safe_name] = radar

    return {"version": version, "maps": maps, "radars": radars}


def parse_configuration_import(config_json: str) -> dict[str, Any]:
    """Parse one bounded JSON document and return validated configuration."""

    if not isinstance(config_json, str):
        raise ConfigurationImportError("config_json must be text")
    encoded_size = len(config_json.encode("utf-8"))
    if encoded_size == 0:
        raise ConfigurationImportError("config_json is empty")
    if encoded_size > MAX_CONFIG_JSON_BYTES:
        raise ConfigurationImportError(
            f"config_json exceeds {MAX_CONFIG_JSON_BYTES} bytes"
        )
    try:
        value = json.loads(
            config_json,
            parse_constant=_reject_json_constant,
            object_pairs_hook=_reject_duplicate_keys,
        )
    except ConfigurationImportError:
        raise
    except (TypeError, ValueError, json.JSONDecodeError, RecursionError) as err:
        raise ConfigurationImportError("config_json is not valid JSON") from err
    return validate_configuration(value)
