"""Roomabouts Home Assistant integration.

The first proof accepts live observations only through Home Assistant entity
state. Inherited RMM-exclusive UDP, MQTT, pairing, hardware publishing, and
direct-radar WebSocket transports are intentionally not registered here.
"""

from __future__ import annotations

import copy
from datetime import timedelta
from functools import wraps
import json
import logging
import os
from typing import Any, Awaitable, Callable

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import ServiceValidationError, Unauthorized
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.service import async_register_admin_service

try:
    from homeassistant.components.frontend import add_extra_js_url
except ImportError:

    def add_extra_js_url(hass, url, es5=False):
        """Compatibility shim for older Home Assistant versions."""


try:
    from homeassistant.components.http import StaticPathConfig
except ImportError:
    StaticPathConfig = None

from .authorization import evaluate_admin_authorization
from .configuration import (
    CONFIG_IDENTIFIER_PATTERN,
    ConfigurationImportError,
    MAX_ZONES_PER_KIND,
    apply_configuration_import,
    plan_configuration_import,
    validate_aggregate_configuration_bounds,
    validate_layout_configuration,
    validate_map_configuration_settings,
    validate_zone_configuration,
)
from .const import CONF_RADARS, DOMAIN
from .coordinator import RadarCoordinator
from .processor import RadarProcessor


_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor", "binary_sensor"]
STREAM_WEBSOCKET_TYPE = "rmm/stream"
_SNAPSHOT_REQUIRED_FIELDS = frozenset(
    {
        "schemaVersion",
        "generationId",
        "sequence",
        "logicalTimeMs",
        "map",
        "tracks",
        "sourceHealth",
    }
)
_SNAPSHOT_ALLOWED_FIELDS = _SNAPSHOT_REQUIRED_FIELDS | {"resetReason"}
_MUTATING_SERVICES = (
    "add_radar",
    "remove_radar",
    "set_radar_pause",
    "update_radar_zone",
    "update_radar_layout",
    "generate_radar_config",
    "update_map_config",
    "import_config",
    "reset_tracking_history",
)


CONFIG_SCHEMA = vol.Schema(
    {
        DOMAIN: vol.Schema(
            {vol.Optional(CONF_RADARS, default=[]): vol.All(cv.ensure_list, [cv.string])}
        )
    },
    extra=vol.ALLOW_EXTRA,
)

_SHORT_TEXT = vol.All(
    cv.string,
    vol.Match(CONFIG_IDENTIFIER_PATTERN),
)
ADD_RADAR_SCHEMA = vol.Schema(
    {
        vol.Required("radar_name"): _SHORT_TEXT,
        vol.Optional("map_group", default="default"): _SHORT_TEXT,
    },
    extra=vol.PREVENT_EXTRA,
)
REMOVE_RADAR_SCHEMA = vol.Schema(
    {vol.Required("radar_name"): _SHORT_TEXT}, extra=vol.PREVENT_EXTRA
)
SET_RADAR_PAUSE_SCHEMA = vol.Schema(
    {
        vol.Required("radar_name"): _SHORT_TEXT,
        vol.Required("paused"): cv.boolean,
    },
    extra=vol.PREVENT_EXTRA,
)
UPDATE_ZONE_SCHEMA = vol.Schema(
    {
        vol.Optional("radar_name"): vol.Any(_SHORT_TEXT, None),
        vol.Required("zone_type"): vol.In(
            (
                "monitor_zones",
                "hw_detect_zones",
                "hw_block_zones",
                "hw_stay_zones",
                "include_zones",
                "exclude_zones",
                "entrance_zones",
                "stationary_zones",
            )
        ),
        vol.Required("points"): list,
        vol.Optional("delay", default=0): vol.All(
            vol.Coerce(float), vol.Range(min=0, max=86_400)
        ),
        vol.Optional("name", default="New Zone"): vol.All(
            cv.string, vol.Length(min=1, max=128)
        ),
        vol.Optional("map_group", default="default"): _SHORT_TEXT,
    },
    extra=vol.PREVENT_EXTRA,
)
UPDATE_LAYOUT_SCHEMA = vol.Schema(
    {
        vol.Required("radar_name"): _SHORT_TEXT,
        vol.Required("layout"): dict,
        vol.Optional("map_group"): _SHORT_TEXT,
        vol.Optional("zones"): dict,
    },
    extra=vol.PREVENT_EXTRA,
)
UPDATE_MAP_CONFIG_SCHEMA = vol.Schema(
    {
        vol.Required("map_group"): _SHORT_TEXT,
        vol.Optional("update_interval"): vol.All(
            vol.Coerce(float), vol.Range(min=0.1, max=5.0)
        ),
        vol.Optional("merge_distance"): vol.All(
            vol.Coerce(float), vol.Range(min=0.01, max=20.0)
        ),
        vol.Optional("target_height"): vol.All(
            vol.Coerce(float), vol.Range(min=0.0, max=5.0)
        ),
        vol.Optional("fused_color"): cv.string,
        vol.Optional("ema_smoothing_level"): vol.All(
            vol.Coerce(int), vol.Range(min=1, max=10)
        ),
        vol.Optional("verify_delay"): vol.All(
            vol.Coerce(float), vol.Range(min=0.0, max=60.0)
        ),
        vol.Optional("hibernation_ttl"): vol.All(
            vol.Coerce(float), vol.Range(min=0.0, max=168.0)
        ),
        vol.Optional("enable_verify_rule"): cv.boolean,
        vol.Optional("enable_tracking"): cv.boolean,
        vol.Optional("show_labels"): cv.boolean,
        vol.Optional("show_trails"): cv.boolean,
        vol.Optional("show_heading"): cv.boolean,
        vol.Optional("show_pointcloud"): cv.boolean,
        vol.Optional("max_jump_base"): vol.All(
            vol.Coerce(float), vol.Range(min=0.0, max=100.0)
        ),
        vol.Optional("max_jump_speed"): vol.All(
            vol.Coerce(float), vol.Range(min=0.0, max=100.0)
        ),
        vol.Optional("stationary_max_hold"): vol.All(
            vol.Coerce(float), vol.Range(min=0.0, max=86_400.0)
        ),
        vol.Optional("auto_block_duration"): vol.All(
            vol.Coerce(float), vol.Range(min=0.0, max=86_400.0)
        ),
        vol.Optional("panel_opacity"): vol.All(
            vol.Coerce(float), vol.Range(min=0.2, max=1.0)
        ),
        vol.Optional("map_scale_x"): vol.All(
            vol.Coerce(float), vol.Range(min=0.001, max=10_000.0)
        ),
        vol.Optional("map_scale_y"): vol.All(
            vol.Coerce(float), vol.Range(min=0.001, max=10_000.0)
        ),
        vol.Optional("fall_alert_enabled"): cv.boolean,
        vol.Optional("fall_threshold_h"): vol.All(
            vol.Coerce(float), vol.Range(min=0.0, max=5.0)
        ),
        vol.Optional("fall_duration"): vol.All(
            vol.Coerce(float), vol.Range(min=0.0, max=300.0)
        ),
        vol.Optional("radar_radius"): vol.All(
            vol.Coerce(float), vol.Range(min=1.0, max=200.0)
        ),
        vol.Optional("zone_stroke"): vol.All(
            vol.Coerce(float), vol.Range(min=0.1, max=20.0)
        ),
        vol.Optional("target_render_mode"): vol.In(("css", "canvas")),
    },
    extra=vol.PREVENT_EXTRA,
)
IMPORT_CONFIG_SCHEMA = vol.Schema(
    {
        vol.Required("config_json"): cv.string,
        vol.Optional("map_group", default="default"): _SHORT_TEXT,
    },
    extra=vol.PREVENT_EXTRA,
)


async def async_register_frontend_resources(hass: HomeAssistant) -> None:
    """Register frontend resources once for the Home Assistant process."""

    domain_data = hass.data.setdefault(DOMAIN, {})
    if domain_data.get("frontend_registered"):
        return

    www_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "www"))
    if not os.path.isdir(www_dir):
        www_dir = hass.config.path("custom_components", DOMAIN, "www")
    if not os.path.isdir(www_dir):
        _LOGGER.error("Roomabouts frontend resources were not found at %s", www_dir)
        return

    try:
        if (
            hasattr(hass.http, "async_register_static_paths")
            and StaticPathConfig is not None
        ):
            await hass.http.async_register_static_paths(
                [
                    StaticPathConfig(
                        "/radar_map_manager", www_dir, cache_headers=False
                    )
                ]
            )
        elif hasattr(hass.http, "register_static_path"):
            hass.http.register_static_path(
                "/radar_map_manager", www_dir, cache_headers=False
            )
        else:
            _LOGGER.warning("Home Assistant has no supported static-path API")
    except Exception as err:  # Registration may already exist after a reload.
        _LOGGER.debug("Roomabouts static-path registration was skipped: %s", err)

    def _get_js_version() -> str:
        manifest_path = os.path.join(os.path.dirname(__file__), "manifest.json")
        with open(manifest_path, encoding="utf-8") as manifest_file:
            manifest = json.load(manifest_file)
        version = manifest.get("version")
        if not isinstance(version, str) or not version:
            raise ValueError("manifest version is missing")
        return version

    try:
        js_version = await hass.async_add_executor_job(_get_js_version)
        add_extra_js_url(
            hass, f"/radar_map_manager/radar-map-card.js?v={js_version}"
        )
    except Exception as err:
        _LOGGER.warning("Unable to register the Roomabouts frontend module: %s", err)
    domain_data["frontend_registered"] = True


@callback
@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): STREAM_WEBSOCKET_TYPE})
def websocket_global_stream(hass, connection, msg) -> None:
    """Subscribe an administrator to sanitized in-memory coordinate snapshots.

    ``require_admin`` executes before this function, so no dispatcher listener
    is installed and no snapshot is returned for a missing or non-admin user.
    """

    @callback
    def send_update(snapshot: dict[str, Any]) -> None:
        if (
            not isinstance(snapshot, dict)
            or snapshot.get("schemaVersion") != 1
            or not _SNAPSHOT_REQUIRED_FIELDS.issubset(snapshot)
            or not set(snapshot).issubset(_SNAPSHOT_ALLOWED_FIELDS)
        ):
            return
        if hasattr(connection, "_to_write") and connection._to_write.qsize() > 60:
            return
        connection.send_message(
            websocket_api.event_message(msg["id"], {"data": snapshot})
        )

    unsubscribe = async_dispatcher_connect(hass, "rmm_stream_update", send_update)
    connection.subscriptions[msg["id"]] = unsubscribe
    connection.send_result(msg["id"])

    processor = hass.data.get(DOMAIN, {}).get("processor")
    current_snapshot = getattr(processor, "current_snapshot", None)
    if current_snapshot is not None:
        send_update(current_snapshot)


def _register_stream_command(hass: HomeAssistant) -> None:
    domain_data = hass.data.setdefault(DOMAIN, {})
    if domain_data.get("stream_command_registered"):
        return
    websocket_api.async_register_command(hass, websocket_global_stream)
    domain_data["stream_command_registered"] = True


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up domain-level Roomabouts resources."""

    hass.data.setdefault(DOMAIN, {})
    await async_register_frontend_resources(hass)
    _register_stream_command(hass)
    return True


async def async_migrate_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Remove inherited transport options so migration cannot reactivate them."""

    if entry.version > 2:
        return False
    if entry.version < 2 or entry.options:
        hass.config_entries.async_update_entry(entry, version=2, options={})
    return True


async def _async_require_admin(hass: HomeAssistant, call: ServiceCall) -> None:
    """Resolve and verify the Home Assistant user for one service call."""

    context = getattr(call, "context", None)
    user_id = getattr(context, "user_id", None)
    user = None
    if isinstance(user_id, str) and user_id.strip():
        try:
            user = await hass.auth.async_get_user(user_id)
        except Exception as err:
            raise Unauthorized(context=context, user_id=user_id) from err

    decision = evaluate_admin_authorization(user_id, user)
    if not decision.authorized:
        raise Unauthorized(context=context, user_id=user_id)


def _admin_service_handler(
    hass: HomeAssistant,
    handler: Callable[[ServiceCall], Awaitable[None]],
) -> Callable[[ServiceCall], Awaitable[None]]:
    """Wrap a service so authorization completes before its handler runs."""

    @wraps(handler)
    async def guarded(call: ServiceCall) -> None:
        await _async_require_admin(hass, call)
        await handler(call)

    return guarded


def _minimum_update_interval(coordinator: RadarCoordinator) -> float:
    intervals: list[float] = []
    for map_data in (coordinator.data or {}).get("maps", {}).values():
        try:
            intervals.append(
                float(map_data.get("config", {}).get("update_interval", 0.1))
            )
        except (TypeError, ValueError):
            continue
    return max(0.1, min(intervals, default=0.1))


def _merge_import_defaults(
    coordinator: RadarCoordinator,
    imported: dict[str, Any],
    *,
    map_group: str | None = None,
) -> dict[str, Any]:
    """Apply coordinate-free defaults without changing unrelated legacy maps."""

    result = copy.deepcopy(imported)
    empty = coordinator._get_empty_data()
    result["version"] = empty.get("version", result.get("version", 2))
    default_map = empty.get("maps", {}).get("default", {})
    default_zones = default_map.get("zones", {})
    default_config = default_map.get("config", {})
    maps_to_fill = result["maps"].values()
    if map_group is not None:
        target_map = result["maps"].get(map_group)
        maps_to_fill = () if target_map is None else (target_map,)
    for map_data in maps_to_fill:
        map_data["zones"] = {
            **copy.deepcopy(default_zones),
            **map_data.get("zones", {}),
        }
        map_data["config"] = {
            **copy.deepcopy(default_config),
            **map_data.get("config", {}),
        }
    validate_aggregate_configuration_bounds(result)
    return result


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up a Roomabouts config entry using Home Assistant entity input only."""

    domain_data = hass.data.setdefault(DOMAIN, {})
    await async_register_frontend_resources(hass)
    _register_stream_command(hass)

    coordinator = RadarCoordinator(hass)
    await coordinator.async_load()
    processor = RadarProcessor(hass, coordinator)
    domain_data["coordinator"] = coordinator
    domain_data["processor"] = processor
    domain_data["timer_remove"] = None

    entry.async_on_unload(entry.add_update_listener(async_reload_entry))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    def start_processing_loop(interval_seconds: float) -> None:
        remove_timer = domain_data.get("timer_remove")
        if remove_timer is not None:
            remove_timer()
        safe_interval = max(0.1, float(interval_seconds))

        async def _processing_tick(now=None) -> None:
            await processor.update()

        domain_data["timer_remove"] = async_track_time_interval(
            hass, _processing_tick, timedelta(seconds=safe_interval)
        )

    async def handle_add_radar(call: ServiceCall) -> None:
        await coordinator.async_add_radar(
            call.data["radar_name"], call.data.get("map_group", "default")
        )
        await processor.update(force=True)

    async def handle_remove_radar(call: ServiceCall) -> None:
        await coordinator.async_remove_radar(call.data["radar_name"])
        await processor.update(force=True)

    async def handle_set_radar_pause(call: ServiceCall) -> None:
        await coordinator.async_set_radar_pause(
            call.data["radar_name"], call.data["paused"]
        )
        await processor.update(force=True)

    async def handle_update_radar_zone(call: ServiceCall) -> None:
        radar_name = call.data.get("radar_name")
        zone_type = call.data["zone_type"]
        map_group = call.data.get("map_group", "default")
        raw_points = call.data["points"]

        if len(raw_points) > MAX_ZONES_PER_KIND:
            raise ServiceValidationError("zone update contains too many items")

        radar_zone = zone_type in {
            "monitor_zones",
            "hw_detect_zones",
            "hw_block_zones",
            "hw_stay_zones",
        }
        if radar_zone != bool(radar_name):
            raise ServiceValidationError(
                "radar_name is required only for radar-local zone types"
            )

        try:
            if not raw_points:
                zone_data: list[dict[str, Any]] = []
            elif all(
                isinstance(item, dict) and "points" in item for item in raw_points
            ):
                zone_data = [
                    validate_zone_configuration(item) for item in raw_points
                ]
            else:
                zone_data = [
                    validate_zone_configuration(
                        {
                            "points": raw_points,
                            "delay": call.data.get("delay", 0),
                            "name": call.data.get("name", "New Zone"),
                        }
                    )
                ]
        except ConfigurationImportError as err:
            raise ServiceValidationError(str(err)) from err

        await coordinator.async_update_zone(
            radar_name, zone_type, zone_data, map_group
        )
        await processor.update(force=True)

    async def handle_update_radar_layout(call: ServiceCall) -> None:
        try:
            layout = validate_layout_configuration(call.data["layout"])
            zones: dict[str, Any] | None = None
            if "zones" in call.data:
                zones = {}
                for zone_type, raw_zones in call.data["zones"].items():
                    if zone_type not in {
                        "monitor_zones",
                        "hw_detect_zones",
                        "hw_block_zones",
                        "hw_stay_zones",
                    }:
                        raise ConfigurationImportError("unsupported radar zone key")
                    if not isinstance(raw_zones, list):
                        raise ConfigurationImportError("radar zone must be a list")
                    if len(raw_zones) > MAX_ZONES_PER_KIND:
                        raise ConfigurationImportError(
                            "radar zone contains too many items"
                        )
                    zones[zone_type] = [
                        validate_zone_configuration(zone) for zone in raw_zones
                    ]
        except ConfigurationImportError as err:
            raise ServiceValidationError(str(err)) from err

        await coordinator.async_update_layout(
            call.data["radar_name"],
            layout,
            call.data.get("map_group"),
            zones=zones,
        )
        await processor.update(force=True)

    async def handle_generate_config(call: ServiceCall) -> None:
        await processor.update(force=True)

    async def handle_update_map_config(call: ServiceCall) -> None:
        map_group = call.data["map_group"]
        try:
            settings = validate_map_configuration_settings(
                {key: value for key, value in call.data.items() if key != "map_group"}
            )
        except ConfigurationImportError as err:
            raise ServiceValidationError(str(err)) from err
        await coordinator.async_update_map_config(
            map_group, {"map_group": map_group, **settings}
        )
        start_processing_loop(_minimum_update_interval(coordinator))
        await processor.update(force=True)

    async def handle_import_config(call: ServiceCall) -> None:
        try:
            plan = plan_configuration_import(
                call.data["config_json"],
                map_group=call.data.get("map_group", "default"),
            )
            imported = apply_configuration_import(coordinator.data, plan)
            replacement = _merge_import_defaults(
                coordinator,
                imported,
                map_group=plan.map_group,
            )
        except ConfigurationImportError as err:
            raise ServiceValidationError(str(err)) from err

        coordinator.data = replacement
        await coordinator.async_save()
        start_processing_loop(_minimum_update_interval(coordinator))
        await processor.update(force=True)

    async def handle_reset_history(call: ServiceCall) -> None:
        processor.reset(reason="explicit-reset")
        await processor.update(force=True)

    service_definitions = (
        ("add_radar", handle_add_radar, ADD_RADAR_SCHEMA),
        ("remove_radar", handle_remove_radar, REMOVE_RADAR_SCHEMA),
        ("set_radar_pause", handle_set_radar_pause, SET_RADAR_PAUSE_SCHEMA),
        ("update_radar_zone", handle_update_radar_zone, UPDATE_ZONE_SCHEMA),
        ("update_radar_layout", handle_update_radar_layout, UPDATE_LAYOUT_SCHEMA),
        ("generate_radar_config", handle_generate_config, None),
        ("update_map_config", handle_update_map_config, UPDATE_MAP_CONFIG_SCHEMA),
        ("import_config", handle_import_config, IMPORT_CONFIG_SCHEMA),
        ("reset_tracking_history", handle_reset_history, None),
    )
    for service_name, handler, schema in service_definitions:
        async_register_admin_service(
            hass,
            DOMAIN,
            service_name,
            _admin_service_handler(hass, handler),
            schema=schema,
        )

    await processor.async_start()

    async def initial_startup(event=None) -> None:
        start_processing_loop(_minimum_update_interval(coordinator))
        await processor.update(force=True)

    startup_task = None
    startup_unsubscribe = None

    @callback
    def cancel_startup() -> None:
        """Prevent delayed startup work from surviving a successful unload."""

        nonlocal startup_task, startup_unsubscribe
        if startup_unsubscribe is not None:
            startup_unsubscribe()
            startup_unsubscribe = None
        if startup_task is not None and not startup_task.done():
            startup_task.cancel()
        startup_task = None

    @callback
    def schedule_initial_startup(event=None) -> None:
        """Create startup work owned by this config entry."""

        nonlocal startup_task, startup_unsubscribe
        startup_unsubscribe = None
        if startup_task is None or startup_task.done():
            startup_task = entry.async_create_task(
                hass,
                initial_startup(event),
                "Roomabouts initial startup",
            )

    entry.async_on_unload(cancel_startup)
    domain_data["startup_cancel"] = cancel_startup

    if hass.is_running:
        schedule_initial_startup()
    else:
        startup_unsubscribe = hass.bus.async_listen_once(
            EVENT_HOMEASSISTANT_STARTED, schedule_initial_startup
        )
    return True


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload Roomabouts after a config entry update."""

    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload the config entry and remove all state-changing services."""

    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if not unload_ok:
        return False

    domain_data = hass.data.get(DOMAIN, {})
    cancel_startup = domain_data.pop("startup_cancel", None)
    if cancel_startup is not None:
        cancel_startup()
    remove_timer = domain_data.pop("timer_remove", None)
    if remove_timer is not None:
        remove_timer()
    processor = domain_data.get("processor")
    if processor is not None:
        await processor.async_stop()

    for service_name in _MUTATING_SERVICES:
        hass.services.async_remove(DOMAIN, service_name)
    domain_data.pop("processor", None)
    domain_data.pop("coordinator", None)
    domain_data.pop("runtime_state", None)
    return True
