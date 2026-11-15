"""Config flow for Roomabouts."""

from homeassistant import config_entries

from .const import DOMAIN


class RadarMapManagerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Create the single Roomabouts integration entry."""

    VERSION = 2

    async def async_step_user(self, user_input=None):
        """Create a first-proof entry with no exclusive transport options."""

        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        if user_input is not None:
            return self.async_create_entry(title="Roomabouts", data={})
        return self.async_show_form(step_id="user")
