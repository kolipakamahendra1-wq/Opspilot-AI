from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    database_url: str = "postgresql+psycopg://opspilot:opspilot@127.0.0.1:5434/opspilot"
    # Read-only role used by the agent's SQL tool (FR-5). Empty = same host/db as DATABASE_URL.
    readonly_database_url: str = ""
    readonly_db_password: str = "opspilot_ro"
    mock_service_url: str = "http://127.0.0.1:8001"

    # "ollama" = local LLM via OpenAI-compatible API; "rules" = deterministic fallback only.
    llm_provider: str = "ollama"
    llm_base_url: str = "http://127.0.0.1:11434/v1"
    llm_model: str = "qwen2.5:3b"
    llm_api_key: str = "ollama"
    llm_timeout_s: float = 120.0
    # USD per 1k tokens; 0 for a local model.
    llm_cost_per_1k_tokens: float = 0.0

    # "ollama" = nomic-embed-text; "hash" = deterministic feature hashing (CI / offline).
    embed_provider: str = "ollama"
    ollama_url: str = "http://127.0.0.1:11434"
    embed_model: str = "nomic-embed-text"

    jwt_secret: str = "dev-only-change-me"
    jwt_ttl_minutes: int = 480
    admin_password: str = "admin123"
    support_password: str = "support123"

    rate_limit_per_minute: int = 120
    tool_timeout_s: float = 5.0
    max_tool_steps: int = 6
    documents_dir: Path = ROOT / "data" / "documents"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"


    @model_validator(mode="after")
    def _normalize_urls(self) -> "Settings":
        # Hosted Postgres (Railway, Render) hands out postgres:// or postgresql:// URLs.
        def fix(url: str) -> str:
            for prefix in ("postgres://", "postgresql://"):
                if url.startswith(prefix):
                    return "postgresql+psycopg://" + url[len(prefix):]
            return url

        self.database_url = fix(self.database_url)
        if self.readonly_database_url:
            self.readonly_database_url = fix(self.readonly_database_url)
        else:
            ro = make_url(self.database_url).set(username="opspilot_ro", password=self.readonly_db_password)
            self.readonly_database_url = ro.render_as_string(hide_password=False)
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
