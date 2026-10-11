"""Vercel entry point: the FastAPI app as a Python function, behind the /api rewrite."""
from backend.serverless import bootstrap

bootstrap()

from backend.main import app  # noqa: E402

__all__ = ["app"]
