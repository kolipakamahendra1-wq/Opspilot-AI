import asyncio
import json
import math
import re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.agents import service
from backend.database.models import Approval, Run, RunStep, Ticket, User
from backend.database.session import get_db, session_scope
from backend.security.audit import audit
from backend.security.auth import (
    create_token, current_user, decode_token, require_admin, verify_password,
)
from backend.security.pii import mask
from backend.tools.sql_guard import SQLRejected, validate_select

router = APIRouter(prefix="/api")
TERMINAL = {"resolved", "escalated", "failed", "rejected"}


# ---------- serializers ----------

def user_out(u: User) -> dict:
    return {"id": u.id, "email": u.email, "name": u.name, "role": u.role, "active": u.active}


def ticket_out(t: Ticket) -> dict:
    return {"ticket_id": t.id, "customer_id": t.customer_id, "message": t.message, "priority": t.priority,
            "product": t.product, "status": t.status, "created_at": t.created_at.isoformat()}


def step_out(r: RunStep, full: bool = False) -> dict:
    d = {"id": r.id, "node": r.node, "tool": r.tool, "latency_ms": r.latency_ms, "tokens": r.tokens,
         "cost": r.cost, "error": r.error, "created_at": r.created_at.isoformat(), "output": r.output}
    if full:
        d["input"] = r.input
    return d


def run_out(run: Run, s: Session, with_steps: bool = True) -> dict:
    st = run.state or {}
    diag = st.get("diagnosis") or {}
    appr = s.scalar(select(Approval).where(Approval.run_id == run.id).order_by(Approval.id.desc()))
    out = {
        "run_id": run.id, "ticket_id": run.ticket_id, "status": run.status, "category": run.category,
        "diagnosis": run.diagnosis, "diagnosis_code": diag.get("code"), "confidence": run.confidence,
        "recommended_action": run.recommended_action,
        "evidence": [c["text"] for c in diag.get("claims", []) if c["source"].startswith("tool:")],
        "claims": diag.get("claims", []),
        "sources": sorted({c["source"] for c in diag.get("claims", []) if not c["source"].startswith("tool:")}),
        "retrieved": [{"source": d["source"], "score": d["score"], "flagged": bool(d.get("injection_flags"))}
                      for d in st.get("docs", [])],
        "injection_flags": st.get("injection_flags", []),
        "classified_by": st.get("classified_by"), "diagnosed_by": st.get("diagnosed_by"),
        "action": st.get("action"), "verification": st.get("verification"),
        "report": mask(run.report) if run.report else None,
        "approval": {"id": appr.id, "status": appr.status, "action": appr.action, "args": appr.args, "note": appr.note,
                     "decided_at": appr.decided_at.isoformat() if appr.decided_at else None} if appr else None,
        "started_at": run.started_at.isoformat(),
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
    }
    if with_steps:
        steps = s.scalars(select(RunStep).where(RunStep.run_id == run.id).order_by(RunStep.id)).all()
        out["steps"] = [step_out(r) for r in steps]
        out["totals"] = {"latency_ms": sum(r.latency_ms for r in steps), "tokens": sum(r.tokens for r in steps),
                         "cost": round(sum(r.cost for r in steps), 6)}
    return out


def _can_view_run(run: Run, user: User) -> bool:
    return user.role == "admin" or run.created_by == user.id


# ---------- auth ----------

class LoginIn(BaseModel):
    email: str
    password: str


@router.post("/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower().strip()))
    if not user or not user.active or not verify_password(body.password, user.password_hash):
        audit(body.email, "login_failed", {})
        raise HTTPException(401, "Invalid email or password")
    audit(user.email, "login", {})
    return {"access_token": create_token(user), "token_type": "bearer", "user": user_out(user)}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


# ---------- tickets ----------

class TicketIn(BaseModel):
    customer_id: str = Field(pattern=r"^CUST-\d{3,8}$")
    message: str = Field(min_length=5, max_length=2000)
    priority: str = Field(default="medium", pattern="^(low|medium|high|urgent)$")
    product: str | None = Field(default=None, max_length=60)
    start_run: bool = True


def next_ticket_id(db: Session) -> str:
    ids = db.scalars(select(Ticket.id).where(or_(Ticket.product.is_(None), Ticket.product != "evaluation"))).all()
    # Evaluation tickets live in their own TICKET-9xxxxxx range and never affect user-facing IDs.
    nums = [n for i in ids if (m := re.fullmatch(r"TICKET-(\d+)", i)) and (n := int(m.group(1))) < 9_000_000]
    return f"TICKET-{max(nums, default=1000) + 1}"


@router.post("/tickets", status_code=201)
def create_ticket(body: TicketIn, bg: BackgroundTasks, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = Ticket(id=next_ticket_id(db), customer_id=body.customer_id, message=body.message, priority=body.priority,
               product=body.product, created_by=user.id)
    db.add(t)
    db.commit()
    audit(user.email, "ticket_created", {"ticket_id": t.id})
    out = ticket_out(t)
    if body.start_run:
        run_id = service.create_run(t, user)
        bg.add_task(service.execute_run, run_id)
        out["run_id"] = run_id
    return out


@router.get("/tickets")
def list_tickets(status: str | None = None, priority: str | None = None, q: str | None = None,
                 page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=100),
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Ticket).where(or_(Ticket.product.is_(None), Ticket.product != "evaluation"))
    if user.role != "admin":
        stmt = stmt.where(Ticket.created_by == user.id)
    if status:
        stmt = stmt.where(Ticket.status == status)
    if priority:
        stmt = stmt.where(Ticket.priority == priority)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(Ticket.id.ilike(like), Ticket.customer_id.ilike(like), Ticket.message.ilike(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(Ticket.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    items = []
    for t in rows:
        last = db.scalar(select(Run).where(Run.ticket_id == t.id).order_by(Run.started_at.desc()))
        items.append({**ticket_out(t), "last_run_id": last.id if last else None})
    return {"items": items, "total": total, "page": page, "pages": max(1, math.ceil(total / page_size))}


@router.get("/tickets/{ticket_id}")
def get_ticket(ticket_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = db.get(Ticket, ticket_id)
    if not t or (user.role != "admin" and t.created_by != user.id):
        raise HTTPException(404, "Ticket not found")
    runs = db.scalars(select(Run).where(Run.ticket_id == t.id).order_by(Run.started_at.desc())).all()
    return {**ticket_out(t), "runs": [{"run_id": r.id, "status": r.status, "started_at": r.started_at.isoformat()} for r in runs]}


# ---------- agent runs ----------

class RunIn(BaseModel):
    ticket_id: str
    wait: bool = False  # true = run synchronously and return the result (API clients)


@router.post("/agent/run")
def start_run(body: RunIn, bg: BackgroundTasks, user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = db.get(Ticket, body.ticket_id)
    if not t or (user.role != "admin" and t.created_by != user.id):
        raise HTTPException(404, "Ticket not found")
    run_id = service.create_run(t, user)
    audit(user.email, "run_started", {"run_id": run_id, "ticket_id": t.id})
    if body.wait:
        service.execute_run(run_id)
        with session_scope() as s:
            return run_out(s.get(Run, run_id), s, with_steps=False)
    bg.add_task(service.execute_run, run_id)
    return {"run_id": run_id, "status": "running"}


@router.get("/runs")
def list_runs(limit: int = Query(10, ge=1, le=100), user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = (select(Run, Ticket).join(Ticket, Ticket.id == Run.ticket_id)
            .where(or_(Ticket.product.is_(None), Ticket.product != "evaluation")))
    if user.role != "admin":
        stmt = stmt.where(Run.created_by == user.id)
    rows = db.execute(stmt.order_by(Run.started_at.desc()).limit(limit)).all()
    return [{"run_id": r.id, "ticket_id": r.ticket_id, "customer_id": t.customer_id, "status": r.status,
             "category": r.category, "diagnosis": r.diagnosis, "confidence": r.confidence,
             "recommended_action": r.recommended_action, "started_at": r.started_at.isoformat(),
             "finished_at": r.finished_at.isoformat() if r.finished_at else None} for r, t in rows]


@router.get("/agent/{run_id}")
def get_run(run_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    run = db.get(Run, run_id)
    if not run or not _can_view_run(run, user):
        raise HTTPException(404, "Run not found")
    return run_out(run, db)


def _user_from_query_token(token: str = Query(...)) -> User:
    """EventSource cannot send headers, so the stream accepts the JWT as a query parameter."""
    try:
        uid = int(decode_token(token)["sub"])
    except Exception:
        raise HTTPException(401, "Invalid token")
    with session_scope() as s:
        user = s.get(User, uid)
        if not user or not user.active:
            raise HTTPException(401, "Inactive user")
        s.expunge(user)
        return user


@router.get("/agent/{run_id}/stream")
async def stream_run(run_id: str, request: Request, user: User = Depends(_user_from_query_token)):
    with session_scope() as s:
        run = s.get(Run, run_id)
        if not run or not _can_view_run(run, user):
            raise HTTPException(404, "Run not found")

    def poll(after_id: int):
        with session_scope() as s:
            steps = s.scalars(select(RunStep).where(RunStep.run_id == run_id, RunStep.id > after_id)
                              .order_by(RunStep.id)).all()
            run = s.get(Run, run_id)
            return [step_out(r) for r in steps], run.status

    async def events():
        last_id, last_status, idle = 0, None, 0
        while not await request.is_disconnected() and idle < 1200:  # ~15 min cap
            steps, status = await asyncio.to_thread(poll, last_id)
            for st in steps:
                last_id = st["id"]
                yield f"event: step\ndata: {json.dumps(st, default=str)}\n\n"
            if status != last_status:
                last_status = status
                yield f"event: status\ndata: {json.dumps({'status': status})}\n\n"
            if status in TERMINAL and not steps:
                yield "event: done\ndata: {}\n\n"
                return
            idle += 1
            if idle % 20 == 0:
                yield ": keep-alive\n\n"
            await asyncio.sleep(0.75)

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ---------- approvals ----------

@router.get("/approvals")
def list_approvals(status: str = "pending", _: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.scalars(select(Approval).where(Approval.status == status).order_by(Approval.created_at.desc()).limit(100)).all()
    out = []
    for a in rows:
        run = db.get(Run, a.run_id)
        t = db.get(Ticket, run.ticket_id)
        out.append({"id": a.id, "action": a.action, "args": a.args, "status": a.status, "note": a.note,
                    "created_at": a.created_at.isoformat(), "ticket": ticket_out(t),
                    "run": run_out(run, db, with_steps=False)})
    return out


class DecisionIn(BaseModel):
    decision: str = Field(pattern="^(approve|reject)$")
    note: str | None = Field(default=None, max_length=1000)


@router.post("/approval/{approval_id}")
def decide(approval_id: int, body: DecisionIn, bg: BackgroundTasks, user: User = Depends(require_admin)):
    try:
        run_id = service.decide_approval(approval_id, body.decision == "approve", user, body.note)
    except ValueError as e:
        raise HTTPException(409, str(e))
    bg.add_task(service.resume_run, run_id)
    return {"approval_id": approval_id, "run_id": run_id, "decision": body.decision}


# ---------- public demo ----------

class SqlCheckIn(BaseModel):
    sql: str = Field(min_length=1, max_length=500)


@router.post("/public/sql-check")
def public_sql_check(body: SqlCheckIn):
    """Landing-page demo of the SQL guard. Parses only; nothing is executed."""
    try:
        return {"allowed": True, "sql": validate_select(body.sql)}
    except SQLRejected as e:
        return {"allowed": False, "reason": str(e)}
