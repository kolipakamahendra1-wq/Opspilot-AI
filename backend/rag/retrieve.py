from pydantic import BaseModel
from sqlalchemy import select

from backend.database.models import Chunk
from backend.database.session import session_scope
from backend.rag.embeddings import embed


class RetrievedChunk(BaseModel):
    source: str
    text: str
    score: float


def search(query: str, k: int = 5) -> list[RetrievedChunk]:
    """Top-k chunks by cosine similarity, at most one chunk per document."""
    qv = embed([query], kind="query")[0]
    dist = Chunk.embedding.cosine_distance(qv)
    with session_scope() as s:
        rows = s.execute(select(Chunk.source, Chunk.text, dist.label("d")).order_by(dist).limit(k * 4)).all()
    seen: set[str] = set()
    out: list[RetrievedChunk] = []
    for src, text, d in rows:
        if src in seen:
            continue
        seen.add(src)
        out.append(RetrievedChunk(source=src, text=text, score=round(1 - float(d), 4)))
        if len(out) == k:
            break
    return out
