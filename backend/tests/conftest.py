from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
TEST_DB = ROOT / "tests" / "test_medflow.db"
if TEST_DB.exists():
    TEST_DB.unlink()
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["JWT_SECRET"] = "medflow-test-secret"
os.environ["MEDFLOW_RESET_DB"] = "0"
os.environ["DASHSCOPE_API_KEY"] = ""
os.environ["MEDFLOW_DEMO_DATE"] = "2026-11-06"
os.environ["MEDFLOW_DEMO_NOW"] = "2026-11-06 14:20"

from fastapi.testclient import TestClient  # noqa: E402

from app import workflow  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import init_db  # noqa: E402


@pytest.fixture()
def client():
    init_db(reset=True)
    workflow.reset_checkpoints()
    with TestClient(app) as c:
        yield c


def login(client: TestClient, username: str = "chenming", password: str = "medflow2026") -> dict:
    res = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
