import logging
import json
import math
import time
from copy import deepcopy

from .observation import (
    GENERATION_RESET,
    SOURCE_STATUS,
    TARGET_INACTIVE,
    TARGET_OBSERVATION,
    ObservationSequenceGuard,
    RESET_REASONS,
)
from .runtime_state import RuntimeState, get_runtime_state

_LOGGER = logging.getLogger(__name__)


class FusionEngine:
    def __init__(
        self,
        hass,
        coordinator=None,
        *,
        runtime_state=None,
        clock=None,
    ):
        self.hass = hass
        self.coordinator = coordinator
        self._clock = clock or time.monotonic
        self.runtime_state = runtime_state or (
            get_runtime_state(hass) if hass is not None else RuntimeState()
        )
        self._history = {}
        self._active_observations = {}
        self._source_generations = {}
        self._sequence_guard = ObservationSequenceGuard()
        self._config_fingerprint = None

    def reset(self, reason="explicit-reset", logical_time_ms=None, *, clear_observations=None):
        """Start a new presentation generation and clear tracking history."""

        if reason not in RESET_REASONS:
            raise ValueError("reset reason is not allowlisted")
        now_ms = self._logical_time(logical_time_ms)
        if clear_observations is None:
            clear_observations = reason == "privacy-clear"
        preserved_source_health = (
            {} if clear_observations else deepcopy(self.runtime_state.source_health)
        )
        self._history.clear()
        if clear_observations:
            self._active_observations.clear()
        self._source_generations.clear()
        self._sequence_guard.clear()
        self.runtime_state.begin_generation(reason, now_ms)
        if not clear_observations:
            self.runtime_state.source_health.update(preserved_source_health)

    def update(self, observations=None, logical_time_ms=None):
        """Consume normalized observations and update ephemeral fused state."""

        if not self.coordinator:
            return {}
        try:
            data = self.coordinator.data
            if not data:
                return {}
            now_ms = self._logical_time(logical_time_ms)
            if data.pop("_force_reset_history", False):
                self.reset("explicit-reset", now_ms)
                _LOGGER.info("RMM: Tracking history has been manually reset.")
            fingerprint = self._configuration_fingerprint(data)
            if self._config_fingerprint is None:
                self._config_fingerprint = fingerprint
            elif fingerprint != self._config_fingerprint:
                self._config_fingerprint = fingerprint
                self.reset("map-replaced", now_ms)
            if observations is None:
                observations = ()
            return self.update_from_observations(observations, logical_time_ms=now_ms)
        except Exception as e:
            try:
                self.reset(
                    "privacy-clear",
                    locals().get("now_ms"),
                    clear_observations=True,
                )
            except Exception:
                self._history.clear()
                self._active_observations.clear()
                self.runtime_state.radar_targets.clear()
                self.runtime_state.map_targets.clear()
                self.runtime_state.source_health.clear()
            _LOGGER.error(
                "RMM: Fusion update failed closed (%s); runtime coordinates were cleared.",
                type(e).__name__,
            )
            return {}

    def update_from_observations(self, observations, *, logical_time_ms=None):
        """Pure-input fusion entry point used by live, synthetic, and replay data."""

        if not self.coordinator or not self.coordinator.data:
            return {}
        now_ms = self._logical_time(logical_time_ms)
        for raw_observation in observations:
            observation = self._sequence_guard.accept(raw_observation)
            if observation is None:
                continue
            sensor_id = observation["sensorId"]
            source_generation = observation["generationId"]
            previous_generation = self._source_generations.get(sensor_id)
            if (
                previous_generation is not None
                and previous_generation != source_generation
                and observation["kind"] != GENERATION_RESET
            ):
                self._remove_source_observations(sensor_id)
                self.reset("source-restart", observation["logicalTimeMs"])
                self._sequence_guard.accept(observation)
            self._source_generations[sensor_id] = source_generation

            kind = observation["kind"]
            if kind == GENERATION_RESET:
                reason = observation.get("reason", "source-restart")
                self._remove_source_observations(sensor_id)
                self.reset(reason, observation["logicalTimeMs"])
                self._source_generations[sensor_id] = source_generation
                self._sequence_guard.accept(observation)
                self.runtime_state.set_source_health(
                    sensor_id,
                    "degraded",
                    "restart",
                    observation["logicalTimeMs"],
                )
                continue
            if kind == SOURCE_STATUS:
                if observation["status"] == "offline":
                    self._remove_source_observations(sensor_id)
                    self.reset("source-restart", observation["logicalTimeMs"])
                    self._source_generations[sensor_id] = source_generation
                    self._sequence_guard.accept(observation)
                self.runtime_state.set_source_health(
                    sensor_id,
                    observation["status"],
                    observation["reason"],
                    observation["logicalTimeMs"],
                )
                continue

            slot = observation.get("sourceSlot", "default")
            key = (sensor_id, slot)
            if kind == TARGET_INACTIVE:
                self._active_observations.pop(key, None)
                continue
            if kind == TARGET_OBSERVATION:
                # Slots address source samples but are never treated as identity. If
                # a device relabels an otherwise identical point, replace the old
                # diagnostic slot instead of creating a second person.
                self._remove_relabelled_duplicate(observation, key)
                self._active_observations[key] = observation

        return self._fuse_active(now_ms)

    def _fuse_active(self, logical_time_ms):
        data = self.coordinator.data
        maps = data.get("maps", {})
        radars = data.get("radars", {})
        map_targets = {map_id: [] for map_id in maps}
        map_scales = {}
        map_has_3d = {}
        radar_runtime_targets = {radar_name: [] for radar_name in radars}

        radar_name_lookup = {str(name).casefold(): name for name in radars}
        for observation in self._active_observations.values():
            configured_name = radar_name_lookup.get(observation["sensorId"].casefold())
            if configured_name is None:
                self.runtime_state.set_source_health(
                    observation["sensorId"],
                    "degraded",
                    "unknown-sensor",
                    observation["logicalTimeMs"],
                )
                continue
            r_conf = radars[configured_name]
            if r_conf.get("paused", False):
                continue
            map_group = r_conf.get("map_group", "default")
            if map_group not in map_targets:
                map_targets[map_group] = []
            map_config = maps.get(map_group, {}).get("config", {})
            layout = r_conf.get("layout", {})
            capabilities = r_conf.get("capabilities", {})
            radar_type = int(layout.get("radar_type", capabilities.get("radar_type", 1)))
            if radar_type == 3 or capabilities.get("z", False):
                map_has_3d[map_group] = True
            sx = float(layout.get("scale_x", 5.0))
            sy = float(layout.get("scale_y", 5.0))
            map_scales.setdefault(map_group, []).append((sx + sy) / 2.0)

            position = observation["positionMeters"]
            raw_point = {
                "x": position["x"] * 1000.0,
                "y": position["y"] * 1000.0,
                "z": position.get("z", 0.0) * 1000.0,
                "is_1d": False,
            }
            radar_runtime_targets[configured_name].append(
                {
                    "sourceSlot": observation.get("sourceSlot"),
                    "positionMeters": dict(position),
                    "observedAt": observation["logicalTimeMs"],
                }
            )
            if abs(raw_point["x"]) < 100 and abs(raw_point["y"]) < 100:
                continue
            projected = self._calculate_standard_coord(
                layout,
                raw_point,
                float(map_config.get("target_height", 1.5)),
                radar_type,
                float(layout.get("mount_height", 2.5)),
            )
            if not projected or not projected.get("active"):
                continue
            px, py = projected["left"], projected["top"]
            monitor_zones = r_conf.get("monitor_zones", [])
            if monitor_zones and not any(
                self._point_in_polygon(
                    px,
                    py,
                    (zone.get("points", []) if isinstance(zone, dict) else zone) or [],
                )
                for zone in monitor_zones
            ):
                continue
            map_targets[map_group].append(
                {
                    "x": px,
                    "y": py,
                    "radar": configured_name,
                    "raw_id": observation.get("sourceSlot", "default"),
                    "is_1d": False,
                    "abs_height": projected.get("abs_height"),
                    "observed_at_ms": observation["logicalTimeMs"],
                }
            )

        for radar_name, targets in radar_runtime_targets.items():
            self.runtime_state.set_radar_targets(radar_name, targets)

        fused_by_map = {}
        for map_id, points in map_targets.items():
            map_data = maps.get(map_id, {})
            map_zones = map_data.get("zones", {})
            map_config = map_data.get("config", {})
            scales = map_scales.get(map_id, [5.0])
            avg_map_scale = sum(scales) / len(scales) if scales else 5.0
            raw_scale_x = map_config.get("map_scale_x")
            raw_scale_y = map_config.get("map_scale_y")
            map_scale_x = float(raw_scale_x or raw_scale_y or avg_map_scale)
            map_scale_y = float(raw_scale_y or raw_scale_x or avg_map_scale)
            if map_scale_x <= 0:
                map_scale_x = avg_map_scale
            if map_scale_y <= 0:
                map_scale_y = avg_map_scale
            has_3d = map_has_3d.get(map_id, False)
            fused_results = self._cluster_targets(
                map_id,
                points,
                float(map_config.get("merge_distance", 0.8)),
                int(map_config.get("ema_smoothing_level", 7)),
                float(map_config.get("update_interval", 0.1)),
                map_zones.get("entrance_zones", []),
                map_zones.get("exclude_zones", []),
                map_zones.get("stationary_zones", []),
                float(map_config.get("verify_delay", 2.5)),
                float(map_config.get("hibernation_ttl", 12.0)) * 3600.0,
                map_scale_x,
                map_scale_y,
                bool(map_config.get("enable_verify_rule", True)),
                float(map_config.get("max_jump_base", 1.0)),
                float(map_config.get("max_jump_speed", 2.5)),
                float(map_config.get("stationary_max_hold", 300.0)),
                bool(map_config.get("enable_tracking", True)),
                has_3d and bool(map_config.get("fall_alert_enabled", True)),
                float(map_config.get("fall_threshold_h", 0.40)),
                float(map_config.get("fall_duration", 5.0)),
                current_time=logical_time_ms / 1000.0,
            )
            fused_results = self._annotate_tracks(
                map_id,
                fused_results,
                logical_time_ms,
            )
            self.runtime_state.set_map_targets(map_id, fused_results)
            fused_by_map[map_id] = fused_results
        return fused_by_map

    def _remove_source_observations(self, sensor_id):
        for key in [key for key in self._active_observations if key[0] == sensor_id]:
            del self._active_observations[key]

    def _remove_relabelled_duplicate(self, observation, new_key):
        new_position = observation["positionMeters"]
        for key, existing in list(self._active_observations.items()):
            if key == new_key or key[0] != new_key[0]:
                continue
            old_position = existing["positionMeters"]
            if math.hypot(
                new_position["x"] - old_position["x"],
                new_position["y"] - old_position["y"],
            ) <= 0.001:
                del self._active_observations[key]

    def _configuration_fingerprint(self, data):
        maps = data.get("maps", {})
        radars = {}
        for name, radar in data.get("radars", {}).items():
            radars[name] = {
                "map_group": radar.get("map_group", "default"),
                "paused": bool(radar.get("paused", False)),
                "layout": radar.get("layout", {}),
                "monitor_zones": radar.get("monitor_zones", []),
            }
        return json.dumps(
            {"maps": maps, "radars": radars},
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        )

    def _logical_time(self, value):
        logical_time_ms = self._clock() * 1000.0 if value is None else value
        if not isinstance(logical_time_ms, (int, float)) or not math.isfinite(logical_time_ms):
            raise ValueError("logical time must be finite")
        return max(0.0, float(logical_time_ms))

    def _annotate_tracks(self, map_id, tracks, logical_time_ms):
        history = self._history.get(map_id, {})
        annotated = []
        for track in tracks:
            item = dict(track)
            sources = set(item.get("sources", []))
            history_item = history.get(item.get("id"), {})
            reported_observed_at = item.get("observedAt")
            if not isinstance(reported_observed_at, (int, float)) or not math.isfinite(
                reported_observed_at
            ):
                reported_observed_at = logical_time_ms
            if "unverified" in sources:
                item["lifecycle"] = "tentative"
                item["positionBasis"] = "observed"
                item["uncertainty"] = ["source-unverified"]
                observed_at = reported_observed_at
            elif "hold" in sources:
                item["lifecycle"] = "coasting"
                item["positionBasis"] = "held"
                item["uncertainty"] = ["held-in-stationary-zone"]
                observed_at = float(history_item.get("last_seen", logical_time_ms / 1000.0)) * 1000.0
            elif "hibernating" in sources:
                item["lifecycle"] = "fading"
                item["positionBasis"] = "last-seen"
                item["uncertainty"] = ["source-not-currently-observed"]
                observed_at = float(history_item.get("last_seen", logical_time_ms / 1000.0)) * 1000.0
            else:
                item["lifecycle"] = "confirmed"
                item["positionBasis"] = "observed"
                observed_at = reported_observed_at
            item["observedAt"] = min(float(logical_time_ms), observed_at)
            annotated.append(item)
        return annotated

    def _calculate_standard_coord(self, layout, point, target_h_m=1.5, radar_type=1, radar_h=2.5):
        try:
            x_val = point['x']
            y_val = point['y']
            z_val = point.get('z', 0)
            abs_height = None
            ceiling_mount = layout.get('ceiling_mount', False)
            if radar_type == 1 and not ceiling_mount and y_val > 0:
                h_diff = abs(radar_h - target_h_m)
                x_m = x_val / 1000.0; y_m = y_val / 1000.0
                slant_dist = math.sqrt(x_m**2 + y_m**2)
                if slant_dist > h_diff:
                    ground_dist = math.sqrt(slant_dist**2 - h_diff**2)
                    scale_k = ground_dist / slant_dist
                    x_val *= scale_k; y_val *= scale_k
                else:
                    x_val = 0; y_val = 0
            elif radar_type == 2:
                pass
            elif radar_type == 3:
                abs_height = z_val / 1000.0
            xm = x_val / 1000.0
            ym = y_val / 1000.0
            if layout.get('mirror_x', False): xm = -xm
            ox = float(layout.get('origin_x', 50))
            oy = float(layout.get('origin_y', 50))
            sx = float(layout.get('scale_x', 5))
            sy = float(layout.get('scale_y', 5))
            rot = float(layout.get('rotation', 0))
            base_rad = (rot - 90) * math.pi / 180.0
            y_vec_x = math.cos(base_rad); y_vec_y = math.sin(base_rad)
            x_vec_x = math.cos(base_rad + (math.pi / 2)); x_vec_y = math.sin(base_rad + (math.pi / 2))
            final_x = ox + (xm * sx * x_vec_x) + (ym * sy * y_vec_x)
            final_y = oy + (xm * sx * x_vec_y) + (ym * sy * y_vec_y)
            return {'left': final_x, 'top': final_y, 'active': True, 'abs_height': abs_height}
        except Exception as e:
            return None
    def _cluster_targets(self, map_id, points, merge_dist_m=0.8, ema_level=7, update_interval=0.1, entrance_zones=None, exclude_zones=None, stationary_zones=None, verify_delay=2.5, hibernation_ttl_sec=43200, map_scale_x=5.0, map_scale_y=5.0, enable_verify_rule=True, max_jump_base=1.0, max_jump_speed=2.5, stationary_max_hold_sec=300.0, enable_tracking=True, fall_enabled=True, fall_threshold_h=0.40, fall_duration=5.0, current_time=None):
        if current_time is None:
            current_time = self._clock()
        old_targets = self._history.get(map_id, {})
        available_old = list(old_targets.keys())
        if not points: 
            new_history = {}
            results = []
            for old_id, data in old_targets.items():
                if data.get('is_verified', False):
                    if (current_time - data.get('last_seen', current_time)) < hibernation_ttl_sec:
                        new_history[old_id] = dict(data)
                        new_history[old_id]['hibernating'] = True
                        results.append({
                            "id": old_id,
                            "x": round(data['x'], 2),
                            "y": round(data['y'], 2),
                            "count": 0,
                            "sources": ["hibernating"],
                            "posture": data.get('posture', 'unknown'),
                        })
            self._history[map_id] = new_history
            return results
        merge_threshold_m = merge_dist_m
        clusters = []
        used = [False] * len(points)
        for i in range(len(points)):
            if used[i]: continue
            cluster = [points[i]]
            used[i] = True
            for j in range(i + 1, len(points)):
                if used[j]: continue
                p1 = points[i]
                p2 = points[j]
                already_has_radar = any(p['radar'] == p2['radar'] for p in cluster)
                if already_has_radar:
                    continue
                dist_m = float('inf')
                is_p1_1d = p1.get('is_1d', False)
                is_p2_1d = p2.get('is_1d', False)
                if is_p1_1d or is_p2_1d:
                    if is_p1_1d: ox, oy = p1.get('origin_x'), p1.get('origin_y')
                    else: ox, oy = p2.get('origin_x'), p2.get('origin_y')
                    if ox is not None and oy is not None:
                        r1 = math.sqrt(((p1['x'] - ox)/map_scale_x)**2 + ((p1['y'] - oy)/map_scale_y)**2)
                        r2 = math.sqrt(((p2['x'] - ox)/map_scale_x)**2 + ((p2['y'] - oy)/map_scale_y)**2)
                        dist_m = abs(r1 - r2)
                    else:
                        dist_m = math.hypot((p1['x'] - p2['x'])/map_scale_x, (p1['y'] - p2['y'])/map_scale_y)
                else:
                    dist_m = math.hypot((p1['x'] - p2['x'])/map_scale_x, (p1['y'] - p2['y'])/map_scale_y)
                if dist_m < merge_threshold_m:
                    cluster.append(p2)
                    used[j] = True
            clusters.append(cluster)
        new_centroids = []
        for cl in clusters:
            valid_2d_points = [p for p in cl if not p.get('is_1d', False)]
            if valid_2d_points:
                avg_x = sum(p['x'] for p in valid_2d_points) / len(valid_2d_points)
                avg_y = sum(p['y'] for p in valid_2d_points) / len(valid_2d_points)
            else:
                avg_x = sum(p['x'] for p in cl) / len(cl)
                avg_y = sum(p['y'] for p in cl) / len(cl)
            heights = [p['abs_height'] for p in cl if p.get('abs_height') is not None]
            avg_h = sum(heights) / len(heights) if heights else None
            posture = 'unknown'
            if avg_h is not None:
                if avg_h < fall_threshold_h: posture = 'low'
                elif avg_h < 1.2: posture = 'sitting'
                else: posture = 'standing'
            sources = [f"{p['radar']}:{p['raw_id']}" for p in cl]
            observed_at_ms = max(p.get('observed_at_ms', current_time * 1000.0) for p in cl)
            new_centroids.append({'x': avg_x, 'y': avg_y, 'count': len(cl), 'sources': sources, 'abs_height': avg_h, 'posture': posture, 'observed_at_ms': observed_at_ms})
        if not enable_tracking:
            results = []
            for idx, new_c in enumerate(new_centroids):
                x, y = new_c['x'], new_c['y']
                in_exclude = False
                if exclude_zones:
                    for zone in exclude_zones:
                        poly = zone.get("points", [])
                        if poly and len(poly) >= 3 and self._point_in_polygon(x, y, poly):
                            in_exclude = True
                            break
                if in_exclude: continue
                in_stationary = False
                if stationary_zones:
                    for zone in stationary_zones:
                        poly = zone.get("points", [])
                        if poly and len(poly) >= 3 and self._point_in_polygon(x, y, poly):
                            in_stationary = True
                            break
                final_posture = new_c['posture']
                if final_posture == 'low':
                    if in_stationary: final_posture = 'resting'
                    elif fall_enabled: final_posture = 'fallen'
                    else: final_posture = 'sitting'
                res = {
                    "id": f"target_{idx+1}",
                    "x": round(x, 2), 
                    "y": round(y, 2),
                    "count": new_c['count'],
                    "sources": new_c['sources'],
                    "posture": final_posture,
                    "observedAt": new_c['observed_at_ms']
                }
                if new_c.get('abs_height') is not None: res['abs_height'] = round(new_c['abs_height'], 2)
                results.append(res)
            self._history[map_id] = {}
            return results
        results = []
        base_alpha = max(0.1, min(1.0, (11 - ema_level) / 10.0))
        effective_jump_base = max(1.5, max_jump_base)
        max_jump_m = effective_jump_base + (max_jump_speed * max(0.1, update_interval)) 
        resurrect_radius_m = 1.5
        used_ids = set()
        for t_id in old_targets.keys():
            if t_id.startswith("target_"):
                try: used_ids.add(int(t_id.replace("target_", "")))
                except ValueError: pass
        new_history = {}
        for new_c in new_centroids:
            best_id = None
            best_dist = float('inf')
            is_resurrected = False
            for old_id in available_old:
                if not old_targets[old_id].get('hibernating', False) and old_targets[old_id].get('is_verified', False):
                    ox = old_targets[old_id]['x']
                    oy = old_targets[old_id]['y']
                    dist_m = math.hypot((new_c['x'] - ox)/map_scale_x, (new_c['y'] - oy)/map_scale_y)
                    if dist_m < best_dist and dist_m < max_jump_m:
                        best_dist = dist_m
                        best_id = old_id
            if best_id is None:
                best_dist = float('inf')
                for old_id in available_old:
                    if old_targets[old_id].get('hibernating', False):
                        ox = old_targets[old_id]['x']
                        oy = old_targets[old_id]['y']
                        dist_m = math.hypot((new_c['x'] - ox)/map_scale_x, (new_c['y'] - oy)/map_scale_y)
                        if dist_m < resurrect_radius_m and dist_m < best_dist:
                            best_dist = dist_m
                            best_id = old_id
                            is_resurrected = True
            if best_id is None:
                best_dist = float('inf')
                for old_id in available_old:
                    if not old_targets[old_id].get('hibernating', False) and not old_targets[old_id].get('is_verified', False):
                        ox = old_targets[old_id]['x']
                        oy = old_targets[old_id]['y']
                        dist_m = math.hypot((new_c['x'] - ox)/map_scale_x, (new_c['y'] - oy)/map_scale_y)
                        if dist_m < best_dist and dist_m < max_jump_m:
                            best_dist = dist_m
                            best_id = old_id
            fall_start_time = None
            if best_id is not None:
                available_old.remove(best_id)
                old_x = old_targets[best_id]['x']
                old_y = old_targets[best_id]['y']
                target_id = best_id
                spawn_time = old_targets[best_id].get('spawn_time', current_time)
                is_verified = old_targets[best_id].get('is_verified', False)
                is_valid_birth = old_targets[best_id].get('is_valid_birth', True)
                fall_start_time = old_targets[best_id].get('fall_start_time')
                if not is_verified:
                    current_alpha = 1.0
                else:
                    still_threshold_m = 0.2 
                    walk_threshold_m  = 1.0 
                    jump_threshold_m  = 1.5 
                    if best_dist < still_threshold_m: current_alpha = base_alpha * 0.5
                    elif best_dist < walk_threshold_m: current_alpha = base_alpha
                    elif best_dist > jump_threshold_m: current_alpha = 1.0
                    else:
                        ratio = (best_dist - walk_threshold_m) / (jump_threshold_m - walk_threshold_m)
                        current_alpha = base_alpha + (1.0 - base_alpha) * ratio
                smoothed_x = current_alpha * new_c['x'] + (1 - current_alpha) * old_x
                smoothed_y = current_alpha * new_c['y'] + (1 - current_alpha) * old_y
                if is_resurrected:
                    is_verified = True
                elif not is_verified:
                    if entrance_zones:
                        for zone in entrance_zones:
                            poly = zone.get("points", [])
                            if poly and len(poly) >= 3:
                                if self._point_in_polygon(smoothed_x, smoothed_y, poly):
                                    is_valid_birth = True
                                    is_verified = True
                                    break
                    if exclude_zones and is_verified:
                        for zone in exclude_zones:
                            poly = zone.get("points", [])
                            if poly and len(poly) >= 3:
                                if self._point_in_polygon(smoothed_x, smoothed_y, poly):
                                    is_valid_birth = False
                                    is_verified = False
                                    break
                    if not is_verified and is_valid_birth and (current_time - spawn_time) >= verify_delay:
                        is_verified = True 
            else:
                smoothed_x = new_c['x']
                smoothed_y = new_c['y']
                new_id_num = 1
                while new_id_num in used_ids: new_id_num += 1
                used_ids.add(new_id_num)
                target_id = f"target_{new_id_num}"
                spawn_time = current_time
                is_valid_birth = enable_verify_rule
                is_verified = False
                if entrance_zones:
                    for zone in entrance_zones:
                        poly = zone.get("points", [])
                        if poly and len(poly) >= 3:
                            if self._point_in_polygon(smoothed_x, smoothed_y, poly):
                                is_valid_birth = True 
                                is_verified = True 
                                break
                if exclude_zones:
                    for zone in exclude_zones:
                        poly = zone.get("points", [])
                        if poly and len(poly) >= 3:
                            if self._point_in_polygon(smoothed_x, smoothed_y, poly):
                                is_valid_birth = False
                                is_verified = False 
                                break
                if is_valid_birth and verify_delay <= 0.001:
                    is_verified = True
            avg_h = new_c.get('abs_height')
            in_furniture_zone = False
            if stationary_zones:
                for zone in stationary_zones:
                    poly = zone.get("points", [])
                    if poly and len(poly) >= 3 and self._point_in_polygon(smoothed_x, smoothed_y, poly):
                        in_furniture_zone = True
                        break
            final_posture = 'unknown'
            if avg_h is not None:
                if in_furniture_zone:
                    fall_start_time = None
                    if avg_h < 0.6: final_posture = 'resting'
                    elif avg_h < 1.2: final_posture = 'sitting'
                    else: final_posture = 'standing'
                elif not fall_enabled:
                    fall_start_time = None
                    if avg_h < 1.2: final_posture = 'sitting'
                    else: final_posture = 'standing'
                else:
                    if avg_h <= fall_threshold_h:
                        if fall_start_time is None:
                            fall_start_time = current_time
                        elapsed = current_time - fall_start_time
                        if elapsed >= fall_duration:
                            final_posture = 'fallen'
                        else:
                            final_posture = 'suspected_fall'
                    elif avg_h >= (fall_threshold_h + 0.10):
                        fall_start_time = None
                        if avg_h < 1.2: final_posture = 'sitting'
                        else: final_posture = 'standing'
                    else:
                        if fall_start_time is not None:
                            elapsed = current_time - fall_start_time
                            if elapsed >= fall_duration:
                                final_posture = 'fallen'
                            else:
                                final_posture = 'suspected_fall'
                        else:
                            final_posture = 'sitting'
            currently_excluded = False
            if exclude_zones:
                for zone in exclude_zones:
                    poly = zone.get("points", [])
                    if poly and len(poly) >= 3:
                        if self._point_in_polygon(smoothed_x, smoothed_y, poly):
                            currently_excluded = True
                            break
            if is_verified:
                if not currently_excluded:
                    res = {
                        "id": target_id,
                        "x": round(smoothed_x, 2), 
                        "y": round(smoothed_y, 2),
                        "count": new_c['count'],
                        "sources": new_c['sources'],
                        "posture": final_posture,
                        "observedAt": new_c['observed_at_ms']
                    }
                    if new_c.get('abs_height') is not None: res['abs_height'] = round(new_c['abs_height'], 2)
                    if fall_start_time is not None: res['fall_duration'] = round(current_time - fall_start_time, 1)
                    results.append(res)
            elif not currently_excluded:
                res = {
                    "id": target_id,
                    "x": round(smoothed_x, 2), 
                    "y": round(smoothed_y, 2),
                    "count": new_c['count'],
                    "sources": ["unverified"],
                    "sourceRefs": new_c['sources'],
                    "posture": final_posture,
                    "observedAt": new_c['observed_at_ms']
                }
                if new_c.get('abs_height') is not None: res['abs_height'] = round(new_c['abs_height'], 2)
                if fall_start_time is not None: res['fall_duration'] = round(current_time - fall_start_time, 1)
                results.append(res)
            if not currently_excluded:
                new_history[target_id] = {
                    'x': smoothed_x, 'y': smoothed_y,
                    'is_verified': is_verified,
                    'is_valid_birth': is_valid_birth,
                    'spawn_time': spawn_time,
                    'last_seen': new_c['observed_at_ms'] / 1000.0,
                    'hibernating': False,
                    'fall_start_time': fall_start_time,
                    'posture': final_posture
                }
        active_verified_points = [
            (t['x'], t['y']) for t in new_history.values() 
            if t.get('is_verified', False) and not t.get('hibernating', False)
        ]
        for old_id in available_old:
            old_t = dict(old_targets[old_id]) 
            lifespan = current_time - old_t.get('spawn_time', current_time)
            if old_t.get('is_verified', False) and lifespan >= verify_delay:
                in_stationary = False
                specific_hold_sec = stationary_max_hold_sec
                if stationary_zones:
                    for zone in stationary_zones:
                        poly = zone.get("points", [])
                        if poly and len(poly) >= 3 and self._point_in_polygon(old_t['x'], old_t['y'], poly):
                            in_stationary = True
                            if zone.get("delay") is not None and float(zone.get("delay")) > 0:
                                specific_hold_sec = float(zone.get("delay"))
                            break
                in_exclude = False
                if exclude_zones:
                    for zone in exclude_zones:
                        poly = zone.get("points", [])
                        if poly and len(poly) >= 3 and self._point_in_polygon(old_t['x'], old_t['y'], poly):
                            in_exclude = True
                            break
                time_since_last_seen = current_time - old_t.get('last_seen', current_time)
                is_redundant = False
                for ax, ay in active_verified_points:
                    if math.hypot((old_t['x'] - ax)/map_scale_x, (old_t['y'] - ay)/map_scale_y) < resurrect_radius_m:
                        is_redundant = True
                        break
                if in_stationary and not in_exclude and time_since_last_seen < specific_hold_sec and not is_redundant:
                    old_t['hibernating'] = False
                    new_history[old_id] = old_t
                    results.append({"id": old_id, "x": round(old_t['x'], 2), "y": round(old_t['y'], 2), "count": 1, "sources": ["hold"], "posture": old_t.get('posture', 'resting')})
                elif time_since_last_seen < hibernation_ttl_sec and not is_redundant:
                    old_t['hibernating'] = True
                    new_history[old_id] = old_t
                    results.append({"id": old_id, "x": round(old_t['x'], 2), "y": round(old_t['y'], 2), "count": 0, "sources": ["hibernating"]})
            else:
                if (current_time - old_t.get('last_seen', current_time)) <= 1.0:
                    new_history[old_id] = old_t
        self._history[map_id] = new_history
        return results
    def _point_in_polygon(self, x, y, poly):
        if not poly or len(poly) < 3:
            return False
        min_x = max_x = poly[0][0]
        min_y = max_y = poly[0][1]
        for p in poly[1:]:
            px, py = p[0], p[1]
            if px < min_x: min_x = px
            elif px > max_x: max_x = px
            if py < min_y: min_y = py
            elif py > max_y: max_y = py
        if x < min_x or x > max_x or y < min_y or y > max_y:
            return False
        n = len(poly)
        inside = False
        p1x, p1y = poly[0]
        for i in range(n + 1):
            p2x, p2y = poly[i % n]
            if y > min(p1y, p2y):
                if y <= max(p1y, p2y):
                    if x <= max(p1x, p2x):
                        if p1y != p2y:
                            xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                        if p1x == p2x or x <= xinters:
                            inside = not inside
            p1x, p1y = p2x, p2y
        return inside
