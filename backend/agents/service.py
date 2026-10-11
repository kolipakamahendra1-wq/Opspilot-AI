"""Run lifecycle: start, resume after approval, and recover runs interrupted by a restart."""
import secrets
import traceback

from sqlalchemy import select

from backend.agents.graph import GRAPH, AgentState
from backend.database.models import Approval, Evaluation, Run, Ticket, User, utcnow
from backend.database.session import session_scope
from backend.security.audit import audit
from backend.tools.runner import record_step


def new_run_id() -> str:
    return f"RUN-{secrets.token_hex(3).upper()}"


def create_run(ticket: Ticket, user: User | None, use_llm: bool | None = None) -> str:
    run_id = new_run_id()
    state: AgentState = {
        "run_id": run_id, "phase": "investigate", "use_llm": use_llm, "actor": user.email if user else "system",
        "ticket": {"id": ticket.id, "customer_id": ticket.customer_id, "message": ticket.message, "priority": ticket.priority},
    }
    with session_scope() as s:
        s.add(Run(id=run_id, ticket_id=ticket.id, status="running", state=dict(state), created_by=user.id if user else None))
        if t := s.get(Ticket, ticket.id):
            t.status = "investigating"
    return run_id


def _invoke(run_id: str, state: AgentState) -> AgentState:
    try:
        return GRAPH.invoke(state, {"recursion_limit": 40})
    except Exception as e:  # a crash must leave the run in a visible terminal state
        record_step(run_id, "ERROR", error=f"{type(e).__name__}: {e}"[:500], output={"trace": traceback.format_exc()[-800:]})
        with session_scope() as s:
            if run := s.get(Run, run_id):
                run.status, run.finished_at = "failed", utcnow()
        return state


def execute_run(run_id: str) -> AgentState:
    with session_scope() as s:
        state = dict(s.get(Run, run_id).state)
    return _invoke(run_id, state)


def decide_approval(approval_id: int, approve: bool, user: User, note: str | None) -> str:
    """Record an Admin decision. Returns the run_id to resume."""
    with session_scope() as s:
        appr = s.get(Approval, approval_id)
        if not appr or appr.status != "pending":
            raise ValueError("approval not found or already decided")
        appr.status = "approved" if approve else "rejected"
        appr.note, appr.decided_by, appr.decided_at = note, user.id, utcnow()
        run = s.get(Run, appr.run_id)
        state = dict(run.state)
        state["phase"] = "resume"
        state["approval"] = {"id": appr.id, "status": appr.status, "by": user.email, "note": note}
        run.state, run.status = state, "running"
        run_id = run.id
    audit(user.email, "approval_decision",
          {"approval_id": approval_id, "run_id": run_id, "decision": "approved" if approve else "rejected", "note": note})
    return run_id


def resume_run(run_id: str) -> AgentState:
    return execute_run(run_id)


def recover_interrupted_runs() -> None:
    """Runs and evaluations left 'running' by a restart cannot continue; mark them failed."""
    with session_scope() as s:
        for run in s.scalars(select(Run).where(Run.status == "running")):
            run.status, run.finished_at = "failed", utcnow()
            run.report = (run.report or "") + "\nRun interrupted by a server restart."
        for ev in s.scalars(select(Evaluation).where(Evaluation.status == "running")):
            ev.status, ev.finished_at = "failed", utcnow()
            ev.summary = {**(ev.summary or {}), "error": f"interrupted by a server restart at case {ev.progress}/{ev.total}"}
