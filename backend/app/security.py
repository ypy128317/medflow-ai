"""JWT authentication and RBAC dependencies."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import ACCESS_TOKEN_EXPIRE_MINUTES, JWT_SECRET
from .database import get_db
from .models import User

bearer = HTTPBearer(auto_error=False)

ROLE_PERMISSIONS: dict[str, set[str]] = {
    "admin": {"system.manage", "approval.decide", "plan.create", "bed.manage", "appointment.manage",
              "equipment.manage", "staff.manage", "alert.handle", "knowledge.manage", "report.generate"},
    "ops": {"approval.decide", "plan.create", "alert.handle", "knowledge.manage", "report.generate", "bed.manage"},
    "bed": {"plan.create", "bed.manage"},
    "appt": {"appointment.manage"},
    "equip": {"equipment.manage", "plan.create"},
    "staff": {"staff.manage", "plan.create"},
    "patient": {"portal.use"},
}

ROLE_NAMES = {"admin": "系统管理员", "ops": "医院运营主管", "bed": "床位管理员",
              "appt": "预约管理员", "equip": "医技科室管理员", "staff": "医护排班管理员",
              "patient": "患者"}


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    iterations = 120_000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("ascii"), iterations)
    return f"pbkdf2_sha256${iterations}${salt}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algo, iterations, salt, digest = encoded.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        expected = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("ascii"), int(iterations)).hex()
        return hmac.compare_digest(expected, digest)
    except Exception:
        return False


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def create_access_token(user: User) -> str:
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"sub": user.id, "role": user.role, "name": user.name, "iat": now,
               "exp": now + ACCESS_TOKEN_EXPIRE_MINUTES * 60}
    head = _b64(json.dumps(header, separators=(",", ":")).encode())
    body = _b64(json.dumps(payload, separators=(",", ":")).encode())
    signing = f"{head}.{body}".encode()
    sig = _b64(hmac.new(JWT_SECRET.encode(), signing, hashlib.sha256).digest())
    return f"{head}.{body}.{sig}"


def decode_token(token: str) -> dict:
    try:
        head, body, sig = token.split(".")
        expected = _b64(hmac.new(JWT_SECRET.encode(), f"{head}.{body}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            raise ValueError("bad signature")
        payload = json.loads(_unb64(body))
        if int(payload.get("exp", 0)) < int(time.time()):
            raise ValueError("expired")
        return payload
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效或过期的 token") from exc


def get_any_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录")
    payload = decode_token(credentials.credentials)
    user = db.get(User, payload.get("sub"))
    if not user or user.status != "启用":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户不存在或已停用")
    return user


def get_current_user(user: User = Depends(get_any_user)) -> User:
    """Internal operations APIs: patient accounts are blocked at the boundary."""
    if user.role == "patient":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="患者账号不能访问医院内部运营 API")
    return user


def get_portal_user(user: User = Depends(get_any_user)) -> User:
    if user.role != "patient":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="该接口仅面向患者端")
    return user


def require(*permissions: str, portal: bool = False) -> Callable:
    dependency_user = get_portal_user if portal else get_current_user

    def dependency(user: User = Depends(dependency_user)) -> User:
        allowed = ROLE_PERMISSIONS.get(user.role, set())
        if not any(p in allowed for p in permissions):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                detail=f"当前角色无权限：{', '.join(permissions)}")
        return user
    return dependency


def can(user: User, permission: str) -> bool:
    return permission in ROLE_PERMISSIONS.get(user.role, set())
