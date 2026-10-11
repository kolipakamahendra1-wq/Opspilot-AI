"""PII masking for logs, traces and audit entries (PRD §8)."""
import re
from typing import Any

_EMAIL = re.compile(r"\b([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})\b")
_CARD = re.compile(r"\b(?:\d[ -]?){12,15}(\d{4})\b")
_PHONE = re.compile(r"(?<![\w-])\+?\d{1,3}[-. ]?\(?\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}\b")


def mask_text(s: str) -> str:
    s = _CARD.sub(r"**** **** **** \1", s)
    s = _EMAIL.sub(r"\1***@\2", s)
    s = _PHONE.sub("***-***-****", s)
    return s


def mask(value: Any) -> Any:
    if isinstance(value, str):
        return mask_text(value)
    if isinstance(value, dict):
        return {k: mask(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [mask(v) for v in value]
    return value
