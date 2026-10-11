"""OpsPilot investigation agent as a LangGraph state machine (FR-2).

CLASSIFY -> RETRIEVE -> CALL_TOOLS (loops, max N steps) -> ANALYZE -> DECIDE
  -> AWAIT_APPROVAL (run pauses; state persisted in runs.state)   | no action -> REPORT
Resume after the approval decision:
  approved -> EXECUTE -> VERIFY -> REPORT          rejected -> REPORT
"""
import time
from typing import Any, TypedDict

from langgraph.graph import END, StateGraph
from sqlalchemy import select

from backend.agents import reasoning as R
from backend.agents.llm import LLMInvalidOutput, LLMUnavailable, chat_json
from backend.config import get_settings
from backend.database.models import Approval, Run, Ticket, utcnow
from backend.database.scenarios import DIAGNOSES
from backend.database.session import session_scope
from backend.tools.runner import call_tool, record_step

LOW_CONFIDENCE = 0.5


class AgentState(TypedDict, total=False):
    run_id: str
    phase: str  # investigate | resume
    use_llm: bool | None  # None = follow LLM_PROVIDER
    ticket: dict
    actor: str
    category: str
    classified_by: str
    injection_flags: list[str]
    docs: list[dict]
    evidence: dict
    tool_steps: int
    tools_called: list[str]
    diagnosis: dict
    diagnosed_by: str
    action: dict | None
    approval: dict | None
    execution: dict | None
    verification: dict | None
    status: str
    report: str


def _persist(state: AgentState, **cols: Any) -> None:
    with session_scope() as s:
        run = s.get(Run, state["run_id"])
        if not run:
            return
        run.state = dict(state)
        for k, v in cols.items():
            setattr(run, k, v)


def _node(name: str, state: AgentState, output: dict, t0: float, tokens: int = 0, error: str | None = None) -> None:
    cost = tokens / 1000 * get_settings().llm_cost_per_1k_tokens
    record_step(state.get("run_id"), name, None, None, output, int((time.perf_counter() - t0) * 1000), tokens, cost, error)


def _use_llm(state: AgentState) -> bool:
    use = state.get("use_llm")
    return get_settings().llm_provider == "ollama" if use is None else use


def _tool(state: AgentState, node: str, name: str, args: dict):
    res = call_tool(name, args, run_id=state.get("run_id"), node=node, actor=state.get("actor", "agent"), role="admin"
                    if name in ("replay_webhook", "escalate_ticket") else "support")
    state.setdefault("tools_called", []).append(name)
    if res.via_alternative:
        state["tools_called"].append(res.tool)
    return res


# ---------- nodes ----------

def classify(state: AgentState) -> AgentState:
    t0 = time.perf_counter()
    msg = state["ticket"]["message"]
    state["injection_flags"] = R.detect_injection(msg)
    category, by, tokens, err = R.classify_rules(msg), "rules", 0, None
    if _use_llm(state):
        try:
            out, tokens = chat_json(R.SYSTEM_PROMPT, R.classify_prompt(msg), R.ClassifyOut)
            category, by = out.category, "llm"
        except (LLMUnavailable, LLMInvalidOutput) as e:
            err = f"LLM classify failed, used rules: {e}"[:300]
    state.update(category=category, classified_by=by, evidence={}, tool_steps=0, tools_called=[])
    _node("CLASSIFY", state, {"category": category, "by": by, "injection_flags": state["injection_flags"]}, t0, tokens, err)
    _persist(state, category=category)
    return state


def retrieve(state: AgentState) -> AgentState:
    query = f"{state['category']} issue: {state['ticket']['message']}"
    res = _tool(state, "RETRIEVE", "search_knowledge", {"query": query[:500]})
    docs = res.output["results"] if res.ok else []
    for d in docs:
        d["injection_flags"] = R.detect_injection(d["text"])
    state["docs"] = docs
    _persist(state)
    return state


def call_tools(state: AgentState) -> AgentState:
    ev = state["evidence"]
    t = state["ticket"]
    step = R.next_tool(state["category"], t["customer_id"], t["message"], ev)
    if step is None:
        return state
    name, args = step
    res = _tool(state, "CALL_TOOLS", name, args)
    state["tool_steps"] = state.get("tool_steps", 0) + 1
    if not res.ok:
        # Retries and alternatives already exhausted inside call_tool (FR-7).
        if name == "query_orders_db" and "orders" not in ev and state["category"] != "account":
            ev["orders"] = []
        ev["api_unavailable"] = name
        ev["api_error"] = res.error
        # Look up the documented procedure for the outage before deciding what to do.
        kb = _tool(state, "CALL_TOOLS", "search_knowledge", {"query": f"internal API outage: {name} unavailable, retries failed"})
        if kb.ok:
            known = {d["source"] for d in state.get("docs", [])}
            state["docs"] = state.get("docs", []) + [d for d in kb.output["results"][:2] if d["source"] not in known]
    elif res.via_alternative == "get_webhook_status":
        ev["webhook"] = res.output["rows"][0] if res.output["rows"] else {"status": "UNKNOWN", "txn_id": args["txn_id"], "attempts": 0}
        ev["webhook_via_alternative"] = True
    elif name == "query_orders_db" and state["category"] == "account":
        rows = res.output["rows"]
        ev["customer"] = rows[0] if rows else {"account_status": "NOT_FOUND", "failed_logins": 0}
    elif name == "query_orders_db":
        ev["orders"] = res.output["rows"]
        ev["focus_order_id"] = R.focus_order(t["message"], ev["orders"])
    elif name == "get_order":
        ev["order"] = res.output
    elif name == "get_payment":
        ev.setdefault("payments", {})[res.output["payment_id"]] = res.output
    elif name == "get_webhook_status":
        ev["webhook"] = res.output
    _persist(state)
    return state


def route_after_tools(state: AgentState) -> str:
    t = state["ticket"]
    if state.get("tool_steps", 0) >= get_settings().max_tool_steps:
        return "ANALYZE"
    if R.next_tool(state["category"], t["customer_id"], t["message"], dict(state["evidence"])) is None:
        return "ANALYZE"
    return "CALL_TOOLS"


def analyze(state: AgentState) -> AgentState:
    t0 = time.perf_counter()
    ev, docs = state["evidence"], state.get("docs", [])
    doc_sources = [d["source"] for d in docs]
    rule_code = R.diagnose_rules(state["category"], ev)
    code, conf, summary, by, tokens, err = rule_code, R.RULE_CONFIDENCE.get(rule_code, 0.9), None, "rules", 0, None
    if _use_llm(state) and rule_code != "api_unavailable":
        try:
            out, tokens = chat_json(R.SYSTEM_PROMPT, R.analyze_prompt(state["ticket"]["message"], state["category"], ev, docs),
                                    R.AnalyzeOut)
            code, conf, summary, by = out.diagnosis_code, out.confidence, out.summary, "llm"
        except LLMUnavailable as e:
            err = f"LLM unavailable, used rules: {e}"[:300]
        except LLMInvalidOutput as e:
            # FR-7: invalid output after one re-prompt -> escalate with partial findings.
            code, conf, by, err = "api_unavailable", 0.3, "llm_invalid", f"LLM output invalid twice: {e}"[:300]
            summary = "The model produced invalid output twice; escalating to a human with the evidence collected."
    diag = R.build_diagnosis(code, conf, summary, ev, doc_sources)
    state["diagnosis"] = diag.model_dump()
    state["diagnosed_by"] = by
    _node("ANALYZE", state, {"code": code, "confidence": conf, "by": by, "rule_baseline": rule_code}, t0, tokens, err)
    _persist(state, diagnosis=diag.summary, confidence=conf)
    return state


def decide(state: AgentState) -> AgentState:
    t0 = time.perf_counter()
    diag, ev, ticket = state["diagnosis"], state["evidence"], state["ticket"]
    action_name = DIAGNOSES[diag["code"]][1]
    if diag["confidence"] < LOW_CONFIDENCE and action_name == "replay_webhook":
        action_name = "escalate_ticket"
    action: dict | None = None
    guard = None
    if action_name == "replay_webhook":
        # Precondition guard: only replay a webhook the evidence shows as FAILED for a SUCCESS payment.
        w = ev.get("webhook") or {}
        paid = any(p["status"] == "SUCCESS" and p["txn_id"] == w.get("txn_id") for p in ev.get("payments", {}).values())
        if w.get("status") == "FAILED" and paid:
            action = {"name": "replay_webhook", "args": {"txn_id": w["txn_id"]}}
        else:
            guard = "replay_webhook precondition not met (no FAILED webhook for a SUCCESS payment); escalating instead"
            action_name = "escalate_ticket"
    if action_name == "escalate_ticket":
        action = {"name": "escalate_ticket", "args": {"ticket_id": ticket["id"], "reason": diag["summary"][:900]}}
    state["action"] = action
    _node("DECIDE", state, {"action": action, "guard": guard}, t0)
    if action:
        with session_scope() as s:
            s.add(Approval(run_id=state["run_id"], action=action["name"], args=action["args"]))
        state["status"] = "awaiting_approval"
        _node("AWAIT_APPROVAL", state, {"action": action["name"], "message": "Waiting for an Admin decision"}, time.perf_counter())
        _persist(state, status="awaiting_approval", recommended_action=action["name"])
        with session_scope() as s:
            if tk := s.get(Ticket, ticket["id"]):
                tk.status = "awaiting_approval"
    else:
        _persist(state, recommended_action="none")
    return state


def route_after_decide(state: AgentState) -> str:
    return END if state.get("action") else "REPORT"


def execute(state: AgentState) -> AgentState:
    action = state["action"]
    # Defence in depth: re-check the approval in the database, not just the in-memory state.
    with session_scope() as s:
        appr = s.scalar(select(Approval).where(Approval.run_id == state["run_id"]).order_by(Approval.id.desc()))
        approved = bool(appr and appr.status == "approved")
    if not approved:
        state["execution"] = {"ok": False, "error": "no approved approval found"}
        return state
    res = _tool(state, "EXECUTE", action["name"], action["args"])
    state["execution"] = res.model_dump()
    _persist(state)
    return state


def verify(state: AgentState) -> AgentState:
    t0 = time.perf_counter()
    action, ex = state["action"], state.get("execution") or {}
    result: dict = {"verified": False}
    if ex.get("ok") and action["name"] == "replay_webhook":
        order_id = (state["evidence"].get("order") or {}).get("order_id")
        res = _tool(state, "VERIFY", "get_order", {"order_id": order_id}) if order_id else None
        status = res.output["status"] if res and res.ok else None
        result = {"verified": status == "CONFIRMED", "check": "order status", "expected": "CONFIRMED", "actual": status,
                  "before": (state["evidence"].get("order") or {}).get("status")}
    elif ex.get("ok") and action["name"] == "escalate_ticket":
        with session_scope() as s:
            tk = s.get(Ticket, state["ticket"]["id"])
            status = tk.status if tk else None
        result = {"verified": status == "escalated", "check": "ticket status", "expected": "escalated", "actual": status}
    elif not ex.get("ok"):
        result = {"verified": False, "error": ex.get("error")}
    state["verification"] = result
    _node("VERIFY", state, result, t0)
    _persist(state)
    return state


def report(state: AgentState) -> AgentState:
    t0 = time.perf_counter()
    diag, action, appr = state["diagnosis"], state.get("action"), state.get("approval")
    ver = state.get("verification") or {}
    if action is None:
        status = "resolved"
    elif appr and appr.get("status") == "rejected":
        status = "rejected"
    elif ver.get("verified"):
        status = "resolved" if action["name"] == "replay_webhook" else "escalated"
    else:
        status = "failed"
    t = state["ticket"]
    lines = [
        f"# Investigation report: {t['id']}",
        f"**Customer:** {t['customer_id']}  |  **Category:** {state['category']} (by {state.get('classified_by')})",
        f"**Diagnosis:** {diag['summary']}",
        f"**Confidence:** {diag['confidence']:.2f}  |  **Diagnosed by:** {state.get('diagnosed_by')}",
        "", "## Evidence",
        *[f"- {c['text']} (`{c['source']}`)" for c in diag["claims"]],
        "", "## Sources",
        *([f"- {s}" for s in sorted({c['source'] for c in diag['claims'] if not c['source'].startswith('tool:')})] or ["- none"]),
        "", "## Action",
    ]
    if action is None:
        lines.append("- No state-changing action required.")
    else:
        lines.append(f"- Recommended: `{action['name']}` {action['args']}")
        if appr:
            lines.append(f"- Approval: **{appr['status']}** by {appr.get('by')}" + (f". Note: {appr['note']}" if appr.get("note") else ""))
        if appr and appr.get("status") == "approved":
            lines.append(f"- Verification: {'passed' if ver.get('verified') else 'FAILED'} ({ver})")
        elif appr and appr.get("status") == "rejected":
            lines.append("- The action was rejected, so it was not executed. The ticket needs manual follow-up.")
    if state.get("injection_flags") or any(d.get("injection_flags") for d in state.get("docs", [])):
        lines += ["", "## Security note",
                  "- Instruction-like text was found in the ticket or retrieved documents and was treated as data, not followed."]
    state["report"] = "\n".join(lines)
    state["status"] = status
    _node("REPORT", state, {"status": status}, t0)
    _persist(state, status=status, report=state["report"], finished_at=utcnow())
    with session_scope() as s:
        if tk := s.get(Ticket, t["id"]):
            tk.status = {"resolved": "resolved", "escalated": "escalated", "rejected": "open", "failed": "open"}[status]
    return state


def route_entry(state: AgentState) -> str:
    if state.get("phase") == "resume":
        return "EXECUTE" if (state.get("approval") or {}).get("status") == "approved" else "REPORT"
    return "CLASSIFY"


def build_graph():
    g = StateGraph(AgentState)
    for name, fn in [("CLASSIFY", classify), ("RETRIEVE", retrieve), ("CALL_TOOLS", call_tools), ("ANALYZE", analyze),
                     ("DECIDE", decide), ("EXECUTE", execute), ("VERIFY", verify), ("REPORT", report)]:
        g.add_node(name, fn)
    g.set_conditional_entry_point(route_entry, {"CLASSIFY": "CLASSIFY", "EXECUTE": "EXECUTE", "REPORT": "REPORT"})
    g.add_edge("CLASSIFY", "RETRIEVE")
    g.add_edge("RETRIEVE", "CALL_TOOLS")
    g.add_conditional_edges("CALL_TOOLS", route_after_tools, {"CALL_TOOLS": "CALL_TOOLS", "ANALYZE": "ANALYZE"})
    g.add_edge("ANALYZE", "DECIDE")
    g.add_conditional_edges("DECIDE", route_after_decide, {END: END, "REPORT": "REPORT"})
    g.add_edge("EXECUTE", "VERIFY")
    g.add_edge("VERIFY", "REPORT")
    g.add_edge("REPORT", END)
    return g.compile()


GRAPH = build_graph()
