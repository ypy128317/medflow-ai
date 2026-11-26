from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import CopilotRequest
from ..security import get_current_user
from ..services import copilot as svc
from ..services.llm import qwen

router = APIRouter(prefix="/copilot", tags=["copilot"])


@router.get("/status")
def status(user: User = Depends(get_current_user)):
    return {**qwen.status(), "tools": [t["function"]["name"] for t in svc.TOOLS]}


@router.post("/chat")
def chat(payload: CopilotRequest, db: Session = Depends(get_db),
         user: User = Depends(get_current_user)):
    return svc.chat(db, user, payload.message, payload.session_id)
