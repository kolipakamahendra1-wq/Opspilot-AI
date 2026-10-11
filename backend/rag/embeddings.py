"""Embeddings: Ollama nomic-embed-text, or deterministic feature hashing for offline/CI runs."""
import hashlib
import math
import re

import httpx

from backend.config import get_settings
from backend.database.models import EMBED_DIM

_TOKEN = re.compile(r"[a-z0-9]+")
_STOP = {"the", "a", "an", "and", "or", "to", "of", "in", "on", "is", "it", "my", "i", "for", "but", "was",
         "be", "this", "that", "with", "are", "has", "have", "not", "if", "at", "as", "by", "from", "when"}


def model_name() -> str:
    st = get_settings()
    return st.embed_model if st.embed_provider == "ollama" else "hash-v1"


def _hash_embed(text: str) -> list[float]:
    vec = [0.0] * EMBED_DIM
    tokens = [t for t in _TOKEN.findall(text.lower()) if t not in _STOP]
    # unigrams + bigrams, signed hashing
    feats = tokens + [f"{a}_{b}" for a, b in zip(tokens, tokens[1:])]
    for f in feats:
        h = int.from_bytes(hashlib.md5(f.encode()).digest()[:8], "little")
        vec[h % EMBED_DIM] += 1.0 if (h >> 32) & 1 else -1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def embed(texts: list[str], kind: str = "document") -> list[list[float]]:
    st = get_settings()
    if st.embed_provider != "ollama":
        return [_hash_embed(t) for t in texts]
    # nomic-embed-text expects task prefixes.
    prefix = "search_query: " if kind == "query" else "search_document: "
    r = httpx.post(f"{st.ollama_url}/api/embed",
                   json={"model": st.embed_model, "input": [prefix + t for t in texts]}, timeout=120)
    r.raise_for_status()
    return r.json()["embeddings"]
