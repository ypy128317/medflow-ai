from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import DEMO_PASSWORD
from ..database import get_db
from ..models import AuditLog, User
from ..schemas import UserCreateRequest, UserUpdateRequest
from ..security import ROLE_NAMES, ROLE_PERMISSIONS, get_current_user, hash_password, require
from ..services.common import audit, now, serialize
from .auth import public_user

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/users")
def users(db: Session = Depends(get_db), user: User = Depends(require("system.manage"))):
    return [public_user(u) for u in db.scalars(select(User)).all()]


@router.post("/users")
def create_user(payload: UserCreateRequest, db: Session = Depends(get_db),
                user: User = Depends(require("system.manage"))):
    if payload.role not in ROLE_NAMES:
        raise HTTPException(422, "角色不存在")
    username = payload.username or f"user{int((db.scalar(select(func.count()).select_from(User)) or 0) + 1):03d}"
    if db.scalar(select(User).where(User.username == username)):
        raise HTTPException(409, "用户名已存在")
    count = db.scalar(select(func.count()).select_from(User)) or 0
    new = User(id=f"u-{count + 1:03d}", username=username, name=payload.name, role=payload.role,
               role_name=ROLE_NAMES[payload.role], dept=payload.dept, phone=payload.phone,
               password_hash=hash_password(DEMO_PASSWORD), status="启用", color="#0f766e",
               permissions="演示新增账号", last_login="—")
    db.add(new)
    audit(db, user, "user.create", new.id, f"新增用户：{new.name} / {new.role_name}")
    db.commit()
    return public_user(new)


@router.put("/users/{user_id}")
def update_user(user_id: str, payload: UserUpdateRequest, db: Session = Depends(get_db),
                user: User = Depends(require("system.manage"))):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "用户不存在")
    if payload.role:
        if payload.role not in ROLE_NAMES:
            raise HTTPException(422, "角色不存在")
        target.role = payload.role
        target.role_name = ROLE_NAMES[payload.role]
    if payload.name:
        target.name = payload.name
    if payload.dept:
        target.dept = payload.dept
    if payload.phone:
        target.phone = payload.phone
    audit(db, user, "user.update", target.id, f"编辑用户：{target.name} / {target.role_name}")
    db.commit()
    return public_user(target)


@router.post("/users/{user_id}/toggle")
def toggle_user(user_id: str, db: Session = Depends(get_db),
                user: User = Depends(require("system.manage"))):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "用户不存在")
    if target.id == user.id:
        raise HTTPException(409, "不能停用当前账号")
    target.status = "停用" if target.status == "启用" else "启用"
    audit(db, user, "user.toggle", target.id, f"{target.status}用户：{target.name}")
    db.commit()
    return public_user(target)


@router.get("/permissions")
def permissions(user: User = Depends(get_current_user)):
    return {"roles": [{"code": code, "name": ROLE_NAMES[code], "permissions": sorted(perms)}
                      for code, perms in ROLE_PERMISSIONS.items()]}


@router.get("/audit")
def audit_logs(limit: int = 100, action: str | None = None, db: Session = Depends(get_db),
               user: User = Depends(require("system.manage"))):
    query = select(AuditLog).order_by(AuditLog.at.desc()).limit(max(1, min(limit, 500)))
    if action:
        query = query.where(AuditLog.action == action)
    return [serialize(a) for a in db.scalars(query).all()]
