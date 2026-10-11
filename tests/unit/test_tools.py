import pytest

from backend.rag.ingest import chunk, source_for
from backend.tools.registry import TOOLS, ToolFailed
from backend.tools.runner import _execute_once


def test_action_tools_need_approval():
    assert {n for n, t in TOOLS.items() if t.needs_approval} == {"replay_webhook", "escalate_ticket"}


@pytest.mark.parametrize("name,args", [
    ("get_order", {"order_id": "1; DROP TABLE"}),
    ("get_webhook_status", {"txn_id": "../../etc/passwd"}),
    ("escalate_ticket", {"ticket_id": "TICKET-1", "reason": ""}),
])
def test_invalid_args_rejected_before_execution(name, args):
    with pytest.raises(ToolFailed, match="invalid arguments"):
        _execute_once(name, args, role="admin")


def test_support_role_cannot_call_action_tools():
    with pytest.raises(ToolFailed, match="not allowed"):
        _execute_once("replay_webhook", {"txn_id": "TXN-9001"}, role="support")


def test_source_naming_and_chunking():
    assert source_for("runbook__payment-webhook-recovery.md") == "runbook:payment-webhook-recovery"
    assert source_for("My Notes.md") == "doc:my-notes"
    parts = chunk("# Title\n\n## A\n" + "word " * 400 + "\n\n## B\nshort")
    assert len(parts) >= 2 and all(p.startswith("# ") or p.startswith("Title") for p in parts)
