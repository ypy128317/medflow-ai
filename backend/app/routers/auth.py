from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import LoginRequest
from ..security import ROLE_PERMISSIONS, create_access_token, get_any_user, verify_password
from ..services.common import audit, now

router = APIRouter(prefix="/auth", tags=["auth"])


def public_user(user: User) -> dict:
    return {"id": user.id, "username": user.username, "name": user.name, "role": user.role,
            "role_name": user.role_name, "dept": user.dept, "phone": user.phone,
            "status": user.status, "color": user.color, "permissions": user.permissions,
            "permission_codes": sorted(ROLE_PERMISSIONS.get(user.role, set())),
            "last_login": user.last_login}


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if user.status != "启用":
        raise HTTPException(status_code=403, detail="账号已停用")
    user.last_login = now()
    audit(db, user, "auth.login", user.id, "登录演示环境")
    db.commit()
    return {"access_token": create_access_token(user), "token_type": "bearer",
            "expires_in": 480 * 60, "user": public_user(user)}


@router.get("/me")
def me(user: User = Depends(get_any_user)):
    return {"user": public_user(user)}


@router.post("/logout")
def logout(user: User = Depends(get_any_user), db: Session = Depends(get_db)):
    audit(db, user, "auth.logout", user.id, "退出登录")
    db.commit()
    return {"ok": True}
