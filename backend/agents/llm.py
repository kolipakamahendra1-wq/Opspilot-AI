"""Minimal JSON-mode chat client for an OpenAI-compatible endpoint (Ollama by default)."""
import json
import re
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from backend.config import get_settings

T = TypeVar("T", bound=BaseModel)


class LLMUnavailable(Exception):
    pass


class LLMInvalidOutput(Exception):
    pass


def _chat(messages: list[dict]) -> tuple[str, int]:
    st = get_settings()
    try:
        r = httpx.post(f"{st.llm_base_url}/chat/completions",
                       headers={"Authorization": f"Bearer {st.llm_api_key}"},
                       json={"model": st.llm_model, "messages": messages, "temperature": 0,
                             "response_format": {"type": "json_object"}},
                       timeout=st.llm_timeout_s)
        r.raise_for_status()
    except httpx.HTTPError as e:
        raise LLMUnavailable(f"{type(e).__name__}: {e}")
    body = r.json()
    usage = body.get("usage") or {}
    return body["choices"][0]["message"]["content"], int(usage.get("total_tokens", 0))


def _parse(raw: str, model: type[T]) -> T:
    m = re.search(r"\{.*\}", raw, re.S)
    if not m:
        raise ValueError("no JSON object in response")
    return model.model_validate(json.loads(m.group(0)))


def chat_json(system: str, user: str, model: type[T]) -> tuple[T, int]:
    """Ask for JSON matching `model`. On invalid output, re-prompt once with the error (FR-7)."""
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    raw, tokens = _chat(messages)
    try:
        return _parse(raw, model), tokens
    except (ValueError, ValidationError) as e:
        messages += [{"role": "assistant", "content": raw},
                     {"role": "user", "content": f"Your JSON was invalid: {str(e)[:400]}. Reply with corrected JSON only."}]
        raw, more = _chat(messages)
        tokens += more
        try:
            return _parse(raw, model), tokens
        except (ValueError, ValidationError) as e2:
            raise LLMInvalidOutput(str(e2)[:300]) from e2
