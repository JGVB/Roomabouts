import logging
import time
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.core import HomeAssistant
from homeassistant.util import slugify
from .fusion_engine import FusionEngine
from .ha_entity_adapter import HAEntityAdapter
from .presentation import SnapshotPresenter
from .runtime_state import get_runtime_state
_LOGGER = logging.getLogger(__name__)


class RadarProcessor:
    def __init__(self, hass: HomeAssistant, coordinator, *, clock=None):
        self.hass = hass
        self._coordinator = coordinator
        self._clock = clock or time.monotonic
        self.runtime_state = get_runtime_state(hass)
        self._entity_adapter = HAEntityAdapter(
            clock_ms=lambda: self._clock() * 1000.0
        )
        self._fusion_engine = FusionEngine(
            hass,
            coordinator,
            runtime_state=self.runtime_state,
            clock=self._clock,
        )
        self._presenter = SnapshotPresenter()
        self.current_snapshot = None
        self._master_entity_ids = set()
    async def async_start(self):
        _LOGGER.debug("Roomabouts: Processor started.")
    async def async_stop(self):
        self._fusion_engine.reset("privacy-clear")
        self.current_snapshot = None
        for entity_id in self._master_entity_ids:
            self.hass.states.async_remove(entity_id)
        self._master_entity_ids.clear()
        _LOGGER.debug("Roomabouts: Processor stopped.")
    def reset(self, reason="explicit-reset", *, logical_time_ms=None):
        self._fusion_engine.reset(reason, logical_time_ms)
        self.current_snapshot = None
    async def update(
        self,
        now=None,
        force=False,
        *,
        observations=None,
        logical_time_ms=None,
        map_id=None,
    ):
        if logical_time_ms is None:
            logical_time_ms = float(now) if isinstance(now, (int, float)) else self._clock() * 1000.0
        if observations is None:
            try:
                observations = self._entity_adapter.collect(
                    self.hass,
                    self._coordinator.data.get("radars", {}),
                    logical_time_ms=logical_time_ms,
                )
            except Exception as err:
                self._fusion_engine.reset(
                    "privacy-clear",
                    logical_time_ms,
                    clear_observations=True,
                )
                observations = ()
                _LOGGER.error(
                    "Roomabouts: Entity adaptation failed closed (%s); runtime coordinates were cleared.",
                    type(err).__name__,
                )
        fused_by_map = self._fusion_engine.update(
            observations=observations,
            logical_time_ms=logical_time_ms,
        )
        self._publish_coordinate_free_master(fused_by_map)
        if self._coordinator:
            self._coordinator._notify_listeners()
        return self._update_frontend_sensor(logical_time_ms, map_id=map_id)
    def _update_frontend_sensor(self, logical_time_ms, *, map_id=None):
        if not self._coordinator.data:
            return None
        context = self.runtime_state.next_snapshot_context(logical_time_ms)
        snapshot = self._presenter.present(
            self._coordinator.data,
            self.runtime_state.view(),
            context,
            map_id=map_id,
        )
        self.current_snapshot = snapshot
        async_dispatcher_send(self.hass, "rmm_stream_update", snapshot)
        return snapshot
    def _publish_coordinate_free_master(self, fused_by_map):
        published = set()
        for map_id in self._coordinator.data.get("maps", {}):
            targets = fused_by_map.get(map_id, self.runtime_state.get_map_targets(map_id))
            active_count = sum(
                1
                for target in targets
                if target.get("lifecycle") not in {"tentative", "fading"}
                and not ({"hibernating", "unverified"} & set(target.get("sources", [])))
            )
            entity_id = f"sensor.rmm_{slugify(map_id)}_master"
            published.add(entity_id)
            self.hass.states.async_set(
                entity_id,
                str(active_count),
                {
                    "map_group": map_id,
                    "count": active_count,
                    "friendly_name": f"Roomabouts {map_id} Master",
                    "icon": "mdi:radar",
                    "generation_id": self.runtime_state.generation_id,
                    "coordinate_stream": "administrator-only",
                },
            )
        for entity_id in self._master_entity_ids - published:
            self.hass.states.async_remove(entity_id)
        self._master_entity_ids = published
