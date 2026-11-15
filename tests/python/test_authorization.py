"""Pure tests for the fail-closed administrator boundary."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import SimpleNamespace
import sys
import unittest


ROOT = Path(__file__).resolve().parents[2]


def _load_module(name: str, relative_path: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {relative_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


authorization = _load_module(
    "roomabouts_authorization_test_module",
    "custom_components/radar_map_manager/authorization.py",
)


class AdminAuthorizationTests(unittest.TestCase):
    def test_admin_user_is_authorized(self) -> None:
        user = SimpleNamespace(id="admin-1", is_admin=True)

        decision = authorization.evaluate_admin_authorization("admin-1", user)

        self.assertTrue(decision.authorized)
        self.assertEqual(decision.reason, "authorized")

    def test_non_admin_user_is_rejected(self) -> None:
        user = SimpleNamespace(id="viewer-1", is_admin=False)

        decision = authorization.evaluate_admin_authorization("viewer-1", user)

        self.assertFalse(decision.authorized)
        self.assertEqual(decision.reason, "not_admin")

    def test_truthy_non_boolean_admin_value_is_rejected(self) -> None:
        user = SimpleNamespace(id="user-1", is_admin=1)

        decision = authorization.evaluate_admin_authorization("user-1", user)

        self.assertFalse(decision.authorized)
        self.assertEqual(decision.reason, "not_admin")

    def test_missing_context_user_id_is_rejected(self) -> None:
        for user_id in (None, "", "   ", 123):
            with self.subTest(user_id=user_id):
                decision = authorization.evaluate_admin_authorization(user_id, None)
                self.assertFalse(decision.authorized)
                self.assertEqual(decision.reason, "missing_user_id")

    def test_failed_user_lookup_is_rejected(self) -> None:
        decision = authorization.evaluate_admin_authorization("missing", None)

        self.assertFalse(decision.authorized)
        self.assertEqual(decision.reason, "user_not_found")

    def test_mismatched_lookup_result_is_rejected(self) -> None:
        user = SimpleNamespace(id="different-user", is_admin=True)

        decision = authorization.evaluate_admin_authorization("requested-user", user)

        self.assertFalse(decision.authorized)
        self.assertEqual(decision.reason, "user_id_mismatch")

    def test_lookup_result_without_an_id_is_rejected(self) -> None:
        user = SimpleNamespace(is_admin=True)

        decision = authorization.evaluate_admin_authorization("requested-user", user)

        self.assertFalse(decision.authorized)
        self.assertEqual(decision.reason, "user_id_mismatch")

    def test_side_effect_is_installed_only_after_admin_decision(self) -> None:
        installed: list[str] = []

        def install_after_authorization(user_id, user) -> None:
            decision = authorization.evaluate_admin_authorization(user_id, user)
            if decision.authorized:
                installed.append("listener")

        install_after_authorization(
            "viewer", SimpleNamespace(id="viewer", is_admin=False)
        )
        install_after_authorization(None, None)
        self.assertEqual(installed, [])

        install_after_authorization(
            "admin", SimpleNamespace(id="admin", is_admin=True)
        )
        self.assertEqual(installed, ["listener"])


if __name__ == "__main__":
    unittest.main()
