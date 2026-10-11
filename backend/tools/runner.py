"""Executes tools with validation, role allowlist, retries, fallbacks, tracing and audit (FR-4/5/7/8)."""
import time
from typing import Any

from pydantic import BaseModel, ValidationError

from backend.database.models import RunStep
from backend.database.session import session_scope
from backend.security.audit import audit
from backend.security.auth import ROLE_TOOLS
from backend.security.pii import mask
from backend.tools.registry import ALTERNATIVES, TOOLS, ToolFailed, ToolUnavailable

MAX_RETRIES = 2


class ToolResult(BaseModel):
    tool: str
    args: dict[str, Any]
    ok: bool
    output: dict[str, Any] | None = None
    error: str | None = None
    attempts: int = 1
    via_alternative: str | None = None


def record_step(run_id: str | None, node: str, tool: str | None = None, input: Any = None,
                output: Any = None, latency_ms: int = 0, tokens: int = 0, cost: float = 0.0,
                error: str | None = None) -> None:
    if not run_id:
        return
    with session_scope() as s:
        s.add(RunStep(run_id=run_id, node=node, tool=tool, input=mask(input), output=mask(output),
                      latency_ms=latency_ms, tokens=tokens, cost=cost, error=mask(error) if error else None))


def _execute_once(name: str, args: dict, role: str) -> dict:
    if name not in TOOLS:
        raise ToolFailed(f"unknown tool: {name}")
    if name not in ROLE_TOOLS.get(role, set()):
        raise ToolFailed(f"role '{role}' is not allowed to call {name}")
    tool = TOOLS[name]
    try:
        parsed = tool.input_model(**args)
    except ValidationError as e:
        raise ToolFailed(f"invalid arguments: {e.errors()[0]['msg']}")
    try:
        return tool.fn(parsed).model_dump()
    except (ToolUnavailable, ToolFailed):
        raise
    except ValueError as e:  # includes SQLRejected
        raise ToolFailed(str(e))
    except Exception as e:  # DB timeouts, unexpected errors -> treat as transient
        raise ToolUnavailable(f"{type(e).__name__}: {str(e)[:200]}")


def call_tool(name: str, args: dict, *, run_id: str | None, node: str, actor: str, role: str,
              allow_alternative: bool = True) -> ToolResult:
    """Run a tool with up to MAX_RETRIES retries on transient errors, then an alternative tool."""
    attempts, error = 0, None
    t0 = time.perf_counter()
    while attempts <= MAX_RETRIES:
        attempts += 1
        try:
            out = _execute_once(name, args, role)
            ms = int((time.perf_counter() - t0) * 1000)
            record_step(run_id, node, name, args, out, ms, error=None if attempts == 1 else f"succeeded after {attempts} attempts")
            audit(actor, "tool_call", {"run_id": run_id, "tool": name, "args": args, "ok": True, "attempts": attempts})
            return ToolResult(tool=name, args=args, ok=True, output=out, attempts=attempts)
        except ToolFailed as e:
            error = str(e)
            break
        except ToolUnavailable as e:
            error = str(e)
    ms = int((time.perf_counter() - t0) * 1000)
    record_step(run_id, node, name, args, None, ms, error=f"{error} (attempts={attempts})")
    audit(actor, "tool_call", {"run_id": run_id, "tool": name, "args": args, "ok": False, "error": error, "attempts": attempts})

    if allow_alternative and name in ALTERNATIVES:
        alt_name, alt_args = ALTERNATIVES[name](args)
        alt = call_tool(alt_name, alt_args, run_id=run_id, node=node, actor=actor, role=role, allow_alternative=False)
        if alt.ok:
            return alt.model_copy(update={"via_alternative": name})
    return ToolResult(tool=name, args=args, ok=False, error=error, attempts=attempts)
