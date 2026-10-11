"""load -> clean -> chunk -> embed -> store (FR-3)."""
import io
import re
from pathlib import Path

from sqlalchemy import delete, select

from backend.config import get_settings
from backend.database.models import Chunk, Document
from backend.database.session import session_scope
from backend.rag.embeddings import embed, model_name

CHUNK_CHARS = 800


def source_for(filename: str) -> str:
    """`runbook__payment-webhook-recovery.md` -> `runbook:payment-webhook-recovery`."""
    stem = Path(filename).stem.lower()
    kind, _, slug = stem.partition("__")
    if not slug:
        kind, slug = "doc", kind
    slug = re.sub(r"[^a-z0-9-]+", "-", slug).strip("-")
    return f"{kind}:{slug}"


def clean(text: str) -> str:
    text = text.replace("\r\n", "\n")
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"[ \t]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def chunk(text: str, size: int = CHUNK_CHARS) -> list[str]:
    """Split on headings first, then pack paragraphs up to `size` chars."""
    sections = re.split(r"\n(?=#{1,3} )", text)
    title = sections[0].splitlines()[0].lstrip("# ").strip() if sections else ""
    chunks: list[str] = []
    for sec in sections:
        buf = ""
        for para in sec.split("\n\n"):
            if buf and len(buf) + len(para) > size:
                chunks.append(buf.strip())
                buf = ""
            buf += para + "\n\n"
        if buf.strip():
            chunks.append(buf.strip())
    # Prefix the document title so each chunk keeps its context.
    return [c if c.startswith("# ") else f"{title}\n{c}" for c in chunks]


def extract_text(filename: str, data: bytes) -> str:
    if filename.lower().endswith(".pdf"):
        from pypdf import PdfReader
        return "\n\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(data)).pages)
    return data.decode("utf-8", errors="replace")


def ingest_document(filename: str, raw_text: str) -> Document:
    text = clean(raw_text)
    source = source_for(filename)
    title = next((ln.lstrip("# ").strip() for ln in text.splitlines() if ln.strip()), source)
    pieces = chunk(text)
    vectors = embed(pieces, kind="document")
    with session_scope() as s:
        old = s.scalar(select(Document).where(Document.source == source))
        if old:
            s.execute(delete(Chunk).where(Chunk.document_id == old.id))
            s.delete(old)
            s.flush()
        doc = Document(source=source, title=title, embed_model=model_name())
        s.add(doc)
        s.flush()
        for i, (p, v) in enumerate(zip(pieces, vectors)):
            s.add(Chunk(document_id=doc.id, idx=i, source=source, text=p, embedding=v))
    return doc


def ingest_directory(path: Path | None = None) -> int:
    """Index any document that is new or was embedded with a different model."""
    path = path or get_settings().documents_dir
    with session_scope() as s:
        current = {d.source: d.embed_model for d in s.scalars(select(Document))}
    n = 0
    for f in sorted(path.glob("*.md")):
        if current.get(source_for(f.name)) != model_name():
            ingest_document(f.name, f.read_text(encoding="utf-8"))
            n += 1
    return n
