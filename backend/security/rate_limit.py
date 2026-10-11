"""Sliding-window rate limiter per client IP (single-process, in-memory)."""
import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

LOGIN_LIMIT_PER_MINUTE = 10


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, per_minute: int):
        super().__init__(app)
        self.per_minute = per_minute
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not path.startswith("/api") or path.endswith("/stream"):
            return await call_next(request)
        ip = request.client.host if request.client else "unknown"
        is_login = path == "/api/auth/login"
        key = f"{ip}:login" if is_login else ip
        limit = LOGIN_LIMIT_PER_MINUTE if is_login else self.per_minute
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > 60:
            q.popleft()
        if len(q) >= limit:
            return JSONResponse({"detail": "Rate limit exceeded"}, status_code=429, headers={"Retry-After": "60"})
        q.append(now)
        return await call_next(request)
