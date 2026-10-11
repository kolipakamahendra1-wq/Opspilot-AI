import math
from datetime import timedelta
import statistics
import threading

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.api.core import step_out, user_out
from backend.config import get_settings
from backend.database.models import AuditLog, Chunk, Document, Evaluation, Run, RunStep, Ticket, User, utcnow
from backend.database.session import get_db
from backend.rag.embeddings import model_name
from backend.rag.ingest import extract_text, ingest_document
from backend.rag.retrieve import search
from backend.security.audit import audit
from backend.security.auth import current_user, hash_password, require_admin

router = APIRouter(prefix="/api")


# ---------- traces ----------

@router.get("/traces/{run_id}")
def trace(run_id: str, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    run = db.get(Run, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    steps = db.scalars(select(RunStep).where(RunStep.run_id == run_id).order_by(RunStep.id)).all()
    return {"run_id": run_id, "ticket_id": run.ticket_id, "status": run.status,
            "steps": [step_out(r, full=True) for r in steps],
            "totals": {"steps": len(steps), "latency_ms": sum(r.latency_ms for r in steps),
                       "tokens": sum(r.tokens for r in steps), "cost": round(sum(r.cost for r in steps), 6),
                       "errors": sum(1 for r in steps if r.error)}}


# ---------- knowledge ----------

class SearchIn(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    k: int = Field(default=5, ge=1, le=20)


@router.post("/knowledge/search")
def knowledge_search(body: SearchIn, _: User = Depends(current_user)):
    return {"query": body.query, "results": [c.model_dump() for c in search(body.query, k=body.k)]}


@router.get("/documents")
def list_documents(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.execute(select(Document, func.count(Chunk.id)).outerjoin(Chunk, Chunk.document_id == Document.id)
                      .group_by(Document.id).order_by(Document.source)).all()
    return [{"id": d.id, "source": d.source, "title": d.title, "chunks": n, "embed_model": d.embed_model,
             "created_at": d.created_at.isoformat()} for d, n in rows]


@router.post("/documents/upload", status_code=201)
async def upload_document(file: UploadFile = File(...), user: User = Depends(require_admin)):
    name = file.filename or "upload.md"
    if not name.lower().endswith((".md", ".markdown", ".txt", ".pdf")):
        raise HTTPException(400, "Only .md, .txt or .pdf files are supported")
    data = await file.read()
    if len(data) > 2_000_000:
        raise HTTPException(413, "File too large (max 2 MB)")
    text = extract_text(name, data)
    if len(text.strip()) < 20:
        raise HTTPException(400, "Document has no extractable text")
    doc = ingest_document(name, text)
    audit(user.email, "document_uploaded", {"source": doc.source, "filename": name})
    return {"id": doc.id, "source": doc.source, "title": doc.title}


# ---------- metrics ----------

def _pct(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    values = sorted(values)
    return values[min(len(values) - 1, math.ceil(p * len(values)) - 1)]


def _last_14_days(by_day: dict[str, dict]) -> list[dict]:
    today = utcnow().date()
    days = [(today - timedelta(days=i)).isoformat() for i in range(13, -1, -1)]
    return [by_day.get(d, {"day": d, "runs": 0, "resolved": 0, "escalated": 0}) for d in days]


@router.get("/metrics")
def metrics(_: User = Depends(current_user), db: Session = Depends(get_db)):
    not_eval = or_(Ticket.product.is_(None), Ticket.product != "evaluation")
    runs = db.scalars(select(Run).join(Ticket, Ticket.id == Run.ticket_id).where(not_eval)).all()
    run_ids = [r.id for r in runs]
    step_rows = db.execute(select(RunStep.run_id, func.sum(RunStep.latency_ms), func.sum(RunStep.tokens),
                                  func.sum(RunStep.cost)).where(RunStep.run_id.in_(run_ids))
                           .group_by(RunStep.run_id)).all() if run_ids else []
    per_run = {rid: (lat or 0, tok or 0, cost or 0.0) for rid, lat, tok, cost in step_rows}
    finished = [r for r in runs if r.finished_at]
    durations = [(r.finished_at - r.started_at).total_seconds() for r in finished]
    status_counts: dict[str, int] = {}
    category_counts: dict[str, int] = {}
    by_day: dict[str, dict[str, int]] = {}
    for r in runs:
        status_counts[r.status] = status_counts.get(r.status, 0) + 1
        if r.category:
            category_counts[r.category] = category_counts.get(r.category, 0) + 1
        day = r.started_at.date().isoformat()
        by_day.setdefault(day, {"day": day, "runs": 0, "resolved": 0, "escalated": 0})
        by_day[day]["runs"] += 1
        if r.status in ("resolved", "escalated"):
            by_day[day][r.status] += 1
    auto_resolved = sum(1 for r in runs if r.status == "resolved" and r.recommended_action == "none")
    success = sum(1 for r in finished if r.status in ("resolved", "escalated"))
    latencies = [v[0] for v in per_run.values()]
    tool_calls = db.execute(select(RunStep.tool, func.count(), func.avg(RunStep.latency_ms))
                            .where(RunStep.tool.is_not(None), RunStep.run_id.in_(run_ids))
                            .group_by(RunStep.tool)).all() if run_ids else []
    return {
        "total_tickets": db.scalar(select(func.count()).select_from(Ticket).where(not_eval)),
        "total_runs": len(runs), "auto_resolved": auto_resolved,
        "escalated": status_counts.get("escalated", 0),
        "awaiting_approval": status_counts.get("awaiting_approval", 0),
        "success_rate": round(success / len(finished), 4) if finished else 0.0,
        "avg_resolution_s": round(statistics.mean(durations), 2) if durations else 0.0,
        "avg_latency_ms": round(statistics.mean(latencies)) if latencies else 0,
        "p95_latency_ms": round(_pct(latencies, 0.95)),
        "avg_tokens": round(statistics.mean(v[1] for v in per_run.values())) if per_run else 0,
        "avg_cost": round(statistics.mean(v[2] for v in per_run.values()), 6) if per_run else 0.0,
        "status_counts": status_counts, "category_counts": category_counts,
        "runs_by_day": _last_14_days(by_day),
        "tools": [{"tool": t, "calls": n, "avg_latency_ms": round(float(avg or 0))} for t, n, avg in tool_calls],
    }


# ---------- evaluations ----------

def _eval_out(e: Evaluation | None, with_cases: bool = True) -> dict | None:
    if not e:
        return None
    d = {"id": e.id, "status": e.status, "mode": e.mode, "progress": e.progress, "total": e.total,
         "summary": e.summary, "started_at": e.started_at.isoformat(),
         "finished_at": e.finished_at.isoformat() if e.finished_at else None}
    if with_cases:
        d["cases"] = e.cases
    return d


@router.get("/evaluations")
def latest_evaluation(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    latest = db.scalar(select(Evaluation).order_by(Evaluation.id.desc()))
    history = db.scalars(select(Evaluation).where(Evaluation.status == "completed").order_by(Evaluation.id.desc()).limit(10)).all()
    return {"latest": _eval_out(latest), "history": [_eval_out(e, with_cases=False) for e in history]}


@router.get("/evaluations/public-summary")
def public_eval_summary(db: Session = Depends(get_db)):
    """Aggregate numbers only, for the public landing page."""
    e = db.scalar(select(Evaluation).where(Evaluation.status == "completed").order_by(Evaluation.id.desc()))
    if not e:
        return {"available": False}
    keys = ("task_completion_rate", "tool_selection_accuracy", "recall_at_5", "groundedness",
            "injection_resistance", "avg_latency_ms", "cases")
    return {"available": True, "mode": e.mode, "finished_at": e.finished_at.isoformat() if e.finished_at else None,
            **{k: e.summary.get(k) for k in keys}}


class EvalRunIn(BaseModel):
    mode: str = Field(default="rules", pattern="^(rules|llm)$")
    limit: int | None = Field(default=None, ge=1, le=50)


_eval_lock = threading.Lock()


@router.post("/evaluations/run", status_code=202)
def run_evaluation(body: EvalRunIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    from backend.evaluation.run import run_evaluation as run_eval

    if db.scalar(select(Evaluation).where(Evaluation.status == "running")) or _eval_lock.locked():
        raise HTTPException(409, "An evaluation is already running")
    ev = Evaluation(mode=body.mode, status="running")
    db.add(ev)
    db.commit()
    audit(user.email, "evaluation_started", {"evaluation_id": ev.id, "mode": body.mode})

    def work():
        with _eval_lock:
            run_eval(mode=body.mode, evaluation_id=ev.id, limit=body.limit)

    threading.Thread(target=work, daemon=True).start()
    return {"evaluation_id": ev.id, "status": "running"}


# ---------- audit ----------

@router.get("/audit")
def audit_log(actor: str | None = None, event: str | None = None, page: int = Query(1, ge=1),
              page_size: int = Query(25, ge=1, le=100), _: User = Depends(require_admin), db: Session = Depends(get_db)):
    stmt = select(AuditLog)
    if actor:
        stmt = stmt.where(AuditLog.actor.ilike(f"%{actor}%"))
    if event:
        stmt = stmt.where(AuditLog.event == event)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    events = db.scalars(select(AuditLog.event).distinct()).all()
    return {"items": [{"id": a.id, "actor": a.actor, "event": a.event, "detail": a.detail,
                       "created_at": a.created_at.isoformat()} for a in rows],
            "total": total, "page": page, "pages": max(1, math.ceil(total / page_size)), "events": sorted(events)}


# ---------- users & settings ----------

@router.get("/users")
def list_users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [user_out(u) for u in db.scalars(select(User).order_by(User.id))]


class UserIn(BaseModel):
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    name: str = Field(min_length=1, max_length=200)
    role: str = Field(pattern="^(support|admin)$")
    password: str = Field(min_length=8, max_length=200)


@router.post("/users", status_code=201)
def create_user(body: UserIn, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    email = body.email.lower().strip()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "A user with that email already exists")
    u = User(email=email, name=body.name, role=body.role, password_hash=hash_password(body.password))
    db.add(u)
    db.commit()
    audit(admin.email, "user_created", {"email": email, "role": body.role})
    return user_out(u)


class UserPatch(BaseModel):
    role: str | None = Field(default=None, pattern="^(support|admin)$")
    active: bool | None = None


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: UserPatch, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if u.id == admin.id:
        raise HTTPException(400, "You cannot change your own role or status")
    if body.role is not None:
        u.role = body.role
    if body.active is not None:
        u.active = body.active
    db.commit()
    audit(admin.email, "user_updated", {"user_id": user_id, **body.model_dump(exclude_none=True)})
    return user_out(u)


def _reachable(url: str) -> bool:
    try:
        return httpx.get(url, timeout=2).status_code < 500
    except httpx.HTTPError:
        return False


@router.get("/settings/status")
def settings_status(_: User = Depends(require_admin)):
    """Configuration status. Secrets are reported as set/unset, never returned."""
    st = get_settings()
    return {
        "llm": {"provider": st.llm_provider, "model": st.llm_model,
                "reachable": _reachable(st.llm_base_url.removesuffix("/v1") + "/api/tags") if st.llm_provider == "ollama" else None,
                "api_key_set": bool(st.llm_api_key and st.llm_api_key != "ollama")},
        "embeddings": {"provider": st.embed_provider, "model": model_name()},
        "mock_service": {"reachable": _reachable(f"{st.mock_service_url}/health")},
        "security": {"jwt_secret_set": st.jwt_secret != "dev-only-change-me", "rate_limit_per_minute": st.rate_limit_per_minute},
        "agent": {"max_tool_steps": st.max_tool_steps, "tool_timeout_s": st.tool_timeout_s},
    }


@router.post("/settings/reset-demo")
def reset_demo(admin: User = Depends(require_admin)):
    """Restore the seeded internal-system records (e.g. after approving webhook replays)."""
    from backend.database.seed import reset_demo_data

    reset_demo_data()
    audit(admin.email, "demo_data_reset", {})
    return {"ok": True}
