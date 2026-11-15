"""Static first-proof registration checks that do not import Home Assistant."""

from __future__ import annotations

import ast
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[2]
INTEGRATION = ROOT / "custom_components" / "radar_map_manager"


def _attribute_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Attribute):
        return node.attr
    if isinstance(node, ast.Name):
        return node.id
    return None


class NetworkRegistrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.init_source = (INTEGRATION / "__init__.py").read_text(encoding="utf-8")
        cls.init_tree = ast.parse(cls.init_source)

    def test_no_exclusive_transport_import_or_call_exists(self) -> None:
        banned_modules = {
            "aiohttp",
            "mqtt",
            "socket",
            "homeassistant.components.mqtt",
        }
        imported_modules: set[str] = set()
        called_names: set[str] = set()
        for node in ast.walk(self.init_tree):
            if isinstance(node, ast.Import):
                imported_modules.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported_modules.add(node.module)
                imported_modules.update(
                    f"{node.module}.{alias.name}" for alias in node.names
                )
            elif isinstance(node, ast.Call):
                name = _attribute_name(node.func)
                if name:
                    called_names.add(name)

        self.assertTrue(banned_modules.isdisjoint(imported_modules))
        self.assertTrue(
            {
                "create_datagram_endpoint",
                "async_publish",
                "async_subscribe",
                "async_call",
                "ws_connect",
            }.isdisjoint(called_names)
        )

    def test_no_exclusive_websocket_or_wildcard_topic_is_registered(self) -> None:
        banned_literals = {
            "rmm/subscribe_stream",
            "rmm/start_pair_window",
            "rmm/cancel_pair_window",
            "rmm_radar/+/",
        }
        string_literals = {
            node.value
            for node in ast.walk(self.init_tree)
            if isinstance(node, ast.Constant) and isinstance(node.value, str)
        }
        for banned in banned_literals:
            self.assertFalse(
                any(banned in literal for literal in string_literals),
                msg=f"exclusive registration literal remains: {banned}",
            )

    def test_only_stream_websocket_is_registered_and_it_requires_admin(self) -> None:
        command_handlers = [
            node
            for node in self.init_tree.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and any(
                "websocket_api.websocket_command" in ast.unparse(decorator)
                for decorator in node.decorator_list
            )
        ]
        self.assertEqual(
            [handler.name for handler in command_handlers],
            ["websocket_global_stream"],
        )
        stream_function = next(
            node
            for node in self.init_tree.body
            if isinstance(node, ast.FunctionDef)
            and node.name == "websocket_global_stream"
        )
        decorators = [ast.unparse(item) for item in stream_function.decorator_list]

        self.assertIn("websocket_api.require_admin", decorators)
        self.assertTrue(
            any("websocket_api.websocket_command" in item for item in decorators)
        )
        self.assertLess(
            decorators.index("websocket_api.require_admin"),
            decorators.index(
                next(
                    item
                    for item in decorators
                    if "websocket_api.websocket_command" in item
                )
            ),
        )

    def test_listener_installation_occurs_inside_admin_decorated_handler(self) -> None:
        stream_function = next(
            node
            for node in self.init_tree.body
            if isinstance(node, ast.FunctionDef)
            and node.name == "websocket_global_stream"
        )
        listener_calls = [
            node
            for node in ast.walk(stream_function)
            if isinstance(node, ast.Call)
            and _attribute_name(node.func) == "async_dispatcher_connect"
        ]
        self.assertEqual(len(listener_calls), 1)
        send_update = next(
            node
            for node in stream_function.body
            if isinstance(node, ast.FunctionDef) and node.name == "send_update"
        )
        send_update_source = ast.unparse(send_update)
        self.assertIn("schemaVersion", send_update_source)
        self.assertIn("_SNAPSHOT_REQUIRED_FIELDS", send_update_source)
        self.assertIn("_SNAPSHOT_ALLOWED_FIELDS", send_update_source)

    def test_every_mutating_service_uses_the_admin_wrapper(self) -> None:
        expected_services = {
            "add_radar",
            "remove_radar",
            "set_radar_pause",
            "update_radar_zone",
            "update_radar_layout",
            "generate_radar_config",
            "update_map_config",
            "import_config",
            "reset_tracking_history",
        }
        service_names_assignment = next(
            node
            for node in self.init_tree.body
            if isinstance(node, ast.Assign)
            and any(
                isinstance(target, ast.Name) and target.id == "_MUTATING_SERVICES"
                for target in node.targets
            )
        )
        self.assertEqual(
            set(ast.literal_eval(service_names_assignment.value)), expected_services
        )
        service_definitions = next(
            node
            for node in ast.walk(self.init_tree)
            if isinstance(node, ast.Assign)
            and any(
                isinstance(target, ast.Name) and target.id == "service_definitions"
                for target in node.targets
            )
        )
        defined_services = {
            item.elts[0].value
            for item in service_definitions.value.elts
            if isinstance(item, ast.Tuple)
            and isinstance(item.elts[0], ast.Constant)
        }
        self.assertEqual(defined_services, expected_services)

        registrations = [
            node
            for node in ast.walk(self.init_tree)
            if isinstance(node, ast.Call)
            and _attribute_name(node.func) == "async_register_admin_service"
        ]
        self.assertEqual(len(registrations), 1)
        registration = registrations[0]
        self.assertGreaterEqual(len(registration.args), 4)
        handler = registration.args[3]
        self.assertIsInstance(handler, ast.Call)
        self.assertEqual(_attribute_name(handler.func), "_admin_service_handler")

    def test_import_service_exposes_only_bounded_legacy_targeting(self) -> None:
        import_schema = next(
            node
            for node in self.init_tree.body
            if isinstance(node, ast.Assign)
            and any(
                isinstance(target, ast.Name)
                and target.id == "IMPORT_CONFIG_SCHEMA"
                for target in node.targets
            )
        )
        schema_source = ast.unparse(import_schema)

        self.assertIn("config_json", schema_source)
        self.assertIn("map_group", schema_source)
        self.assertNotIn("allow_empty", schema_source)
        self.assertNotIn("target_radar", schema_source)

        setup_entry = next(
            node
            for node in self.init_tree.body
            if isinstance(node, ast.AsyncFunctionDef)
            and node.name == "async_setup_entry"
        )
        import_handler = next(
            node
            for node in setup_entry.body
            if isinstance(node, ast.AsyncFunctionDef)
            and node.name == "handle_import_config"
        )
        defaults_call = next(
            node
            for node in ast.walk(import_handler)
            if isinstance(node, ast.Call)
            and _attribute_name(node.func) == "_merge_import_defaults"
        )
        keyword_values = {
            keyword.arg: ast.unparse(keyword.value)
            for keyword in defaults_call.keywords
        }
        self.assertEqual(keyword_values.get("map_group"), "plan.map_group")

    def test_admin_wrapper_authorizes_before_invoking_handler(self) -> None:
        wrapper = next(
            node
            for node in self.init_tree.body
            if isinstance(node, ast.FunctionDef)
            and node.name == "_admin_service_handler"
        )
        guarded = next(
            node
            for node in wrapper.body
            if isinstance(node, ast.AsyncFunctionDef) and node.name == "guarded"
        )
        awaited_calls = [
            statement.value.value
            for statement in guarded.body
            if isinstance(statement, ast.Expr)
            and isinstance(statement.value, ast.Await)
            and isinstance(statement.value.value, ast.Call)
        ]
        self.assertEqual(len(awaited_calls), 2)
        self.assertEqual(_attribute_name(awaited_calls[0].func), "_async_require_admin")
        self.assertEqual(_attribute_name(awaited_calls[1].func), "handler")

    def test_migrated_and_default_options_cannot_enable_transports(self) -> None:
        config_flow_source = (INTEGRATION / "config_flow.py").read_text(
            encoding="utf-8"
        )
        constants_source = (INTEGRATION / "const.py").read_text(encoding="utf-8")
        for forbidden in ("enable_udp", "udp_port", "stream_mode"):
            self.assertNotIn(forbidden, config_flow_source)
            self.assertNotIn(forbidden, constants_source)
        self.assertIn("options={}", self.init_source)

    def test_delayed_startup_is_owned_and_cancelled_by_the_entry(self) -> None:
        setup_entry = next(
            node
            for node in self.init_tree.body
            if isinstance(node, ast.AsyncFunctionDef)
            and node.name == "async_setup_entry"
        )
        schedule_startup = next(
            node
            for node in setup_entry.body
            if isinstance(node, ast.FunctionDef)
            and node.name == "schedule_initial_startup"
        )
        cancel_startup = next(
            node
            for node in setup_entry.body
            if isinstance(node, ast.FunctionDef) and node.name == "cancel_startup"
        )
        schedule_calls = {
            _attribute_name(node.func)
            for node in ast.walk(schedule_startup)
            if isinstance(node, ast.Call)
        }
        cancel_calls = {
            _attribute_name(node.func)
            for node in ast.walk(cancel_startup)
            if isinstance(node, ast.Call)
        }
        setup_source = ast.unparse(setup_entry)

        self.assertIn("async_create_task", schedule_calls)
        self.assertIn("cancel", cancel_calls)
        self.assertIn("entry.async_on_unload(cancel_startup)", setup_source)
        self.assertIn(
            "hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, schedule_initial_startup)",
            setup_source,
        )

    def test_unload_cleanup_occurs_only_after_platform_success(self) -> None:
        unload = next(
            node
            for node in self.init_tree.body
            if isinstance(node, ast.AsyncFunctionDef)
            and node.name == "async_unload_entry"
        )
        statements = [
            statement
            for statement in unload.body
            if not (
                isinstance(statement, ast.Expr)
                and isinstance(statement.value, ast.Constant)
                and isinstance(statement.value.value, str)
            )
        ]
        unload_assignment = statements[0]
        failed_unload_guard = statements[1]
        self.assertIsInstance(unload_assignment, ast.Assign)
        self.assertIn("async_unload_platforms", ast.unparse(unload_assignment))
        self.assertIsInstance(failed_unload_guard, ast.If)
        self.assertEqual(ast.unparse(failed_unload_guard.test), "not unload_ok")
        self.assertEqual(ast.unparse(failed_unload_guard.body[0]), "return False")

        cleanup_source = "\n".join(ast.unparse(item) for item in statements[2:])
        self.assertIn("cancel_startup()", cleanup_source)
        self.assertIn("remove_timer()", cleanup_source)
        self.assertIn("await processor.async_stop()", cleanup_source)
        runtime_cleanup = "domain_data.pop('runtime_state', None)"
        self.assertIn(runtime_cleanup, cleanup_source)
        self.assertLess(
            cleanup_source.index("await processor.async_stop()"),
            cleanup_source.index(runtime_cleanup),
        )


if __name__ == "__main__":
    unittest.main()
