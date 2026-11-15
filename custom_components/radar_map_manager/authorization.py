"""Pure authorization decisions for Roomabouts.

This module deliberately has no Home Assistant imports so the fail-closed
authorization policy can be exercised with the standard library test suite.
Home Assistant-specific user lookup and exception handling live at the call
site in ``__init__.py``.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class AdminAuthorizationReason(StrEnum):
    """Stable reasons for an administrator authorization decision."""

    AUTHORIZED = "authorized"
    MISSING_USER_ID = "missing_user_id"
    USER_NOT_FOUND = "user_not_found"
    USER_ID_MISMATCH = "user_id_mismatch"
    NOT_ADMIN = "not_admin"


@dataclass(frozen=True, slots=True)
class AdminAuthorizationDecision:
    """Result of evaluating one resolved Home Assistant user."""

    authorized: bool
    reason: AdminAuthorizationReason


def evaluate_admin_authorization(
    user_id: object,
    resolved_user: Any | None,
) -> AdminAuthorizationDecision:
    """Return a fail-closed administrator authorization decision.

    ``resolved_user`` must be the user returned by Home Assistant for
    ``user_id``.  A missing context, failed lookup, mismatched lookup result,
    or anything other than the literal boolean ``True`` for ``is_admin`` is
    rejected.
    """

    if not isinstance(user_id, str) or not user_id.strip():
        return AdminAuthorizationDecision(
            False, AdminAuthorizationReason.MISSING_USER_ID
        )

    if resolved_user is None:
        return AdminAuthorizationDecision(
            False, AdminAuthorizationReason.USER_NOT_FOUND
        )

    resolved_user_id = getattr(resolved_user, "id", None)
    if resolved_user_id != user_id:
        return AdminAuthorizationDecision(
            False, AdminAuthorizationReason.USER_ID_MISMATCH
        )

    if getattr(resolved_user, "is_admin", False) is not True:
        return AdminAuthorizationDecision(False, AdminAuthorizationReason.NOT_ADMIN)

    return AdminAuthorizationDecision(True, AdminAuthorizationReason.AUTHORIZED)
