from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    database_url: str = "postgresql+psycopg://opspilot:opspilot@127.0.0.1:5434/opspilot"
    # Read-only role used by the agent's SQL tool (FR-5).
    readonly_database_url: str = "postgresql+psycopg://opspilot_ro:opspilot_ro@127.0.0.1:5434/opspilot"
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
