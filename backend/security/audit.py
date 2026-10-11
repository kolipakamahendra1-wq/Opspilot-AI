from backend.database.models import AuditLog
from backend.database.session import session_scope
from backend.security.pii import mask


def audit(actor: str, event: str, detail: dict | None = None) -> None:
    """Append an audit entry in its own transaction so it survives caller rollbacks."""
    with session_scope() as s:
        s.add(AuditLog(actor=actor, event=event, detail=mask(detail or {})))
