"""FastAPI backend configuration."""
from __future__ import annotations

import os
from datetime import date, datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BASE_DIR.parent
DEFAULT_DB = BASE_DIR / "medflow.db"


def _load_env_file() -> None:
    """Load backend/.env without adding a dependency; existing env wins."""
    env_file = BASE_DIR / ".env"
    if not env_file.exists():
        return
    for raw in env_file.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            os.environ.setdefault(key, value)


_load_env_file()

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB.as_posix()}")
JWT_SECRET = os.getenv("JWT_SECRET", "medflow-demo-secret-change-in-production")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
DEMO_PASSWORD = os.getenv("MEDFLOW_DEMO_PASSWORD", "medflow2026")
# The seed data is anchored to 2026-11-06 and shifted to the current date.
# Set MEDFLOW_DEMO_DATE explicitly to freeze the demo on a fixed day.
DEMO_DATE = os.getenv("MEDFLOW_DEMO_DATE") or date.today().isoformat()
DEMO_NOW = os.getenv("MEDFLOW_DEMO_NOW") or datetime.now().strftime("%Y-%m-%d %H:%M")
SEED_FILE = BASE_DIR / "seed_data.json"

# Qwen (DashScope OpenAI-compatible mode). Set DASHSCOPE_API_KEY in backend/.env.
DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "").strip()
QWEN_BASE_URL = os.getenv("QWEN_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").rstrip("/")
QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen-plus")
QWEN_TIMEOUT = float(os.getenv("QWEN_TIMEOUT", "25"))
