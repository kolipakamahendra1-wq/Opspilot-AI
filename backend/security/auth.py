from datetime import timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.database.models import User, utcnow
from backend.database.session import get_db

_bearer = HTTPBearer(auto_error=False)

# Per-role tool allowlist (PRD §8). Support users can trigger investigations (read tools)
# but only admins can authorize action tools.
ROLE_TOOLS = {
    "support": {"search_knowledge", "query_orders_db", "get_order", "get_payment", "get_webhook_status"},
    "admin": {"search_knowledge", "query_orders_db", "get_order", "get_payment", "get_webhook_status",
              "replay_webhook", "escalate_ticket"},
}


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())


def create_token(user: User) -> str:
    st = get_settings()
    payload = {"sub": str(user.id), "role": user.role, "exp": utcnow() + timedelta(minutes=st.jwt_ttl_minutes)}
    return jwt.encode(payload, st.jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
                 db: Session = Depends(get_db)) -> User:
    if not creds:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        user_id = int(decode_token(creds.credentials)["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    user = db.get(User, user_id)
    if not user or not user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Inactive user")
    return user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin role required")
    return user
