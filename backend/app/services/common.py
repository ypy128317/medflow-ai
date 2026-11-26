"""Shared helpers for domain services."""
from __future__ import annotations

import json
import re
import secrets
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import DEMO_DATE, DEMO_NOW
from ..models import AuditLog, Setting, User


def now() -> str:
    return DEMO_NOW


def today() -> str:
    return DEMO_DATE


def add_days(date_str: str, days: int) -> str:
    d = datetime.strptime(date_str, "%Y-%m-%d") + timedelta(days=days)
    return d.strftime("%Y-%m-%d")


def minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")[:2]
    return int(h) * 60 + int(m)


def hhmm(total: int) -> str:
    return f"{total // 60:02d}:{total % 60:02d}"


def round1(value: float) -> float:
    return round(float(value or 0), 1)


def serialize(obj) -> dict[str, Any]:
    if obj is None:
        return {}
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


def audit(db: Session, user: User | None, action: str, target: str, detail: str) -> AuditLog:
    log = AuditLog(at=now(), actor=user.name if user else "系统", role=user.role_name if user else "系统",
                   action=action, target=target, detail=detail, ip="10.24.8.21")
    db.add(log)
    return log


def get_setting(db: Session, key: str, default: Any = None) -> Any:
    row = db.get(Setting, key)
    return row.value if row else default


def set_setting(db: Session, key: str, value: Any) -> None:
    row = db.get(Setting, key)
    if row:
        row.value = value
    else:
        db.add(Setting(key=key, value=value))


def new_id(prefix: str, table, db: Session, width: int = 3) -> str:
    count = db.scalar(select(func.count()).select_from(table)) or 0
    return f"{prefix}-{datetime.strptime(today(), '%Y-%m-%d').strftime('%Y%m%d')}-{count + 1:0{width}d}"


def token(n: int = 4) -> str:
    return secrets.token_hex(n // 2)


def parse_date_time(value: str | None) -> datetime | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(value[:16] if "T" in value else value, fmt)
        except ValueError:
            continue
    return None


def next_shift_codes(pattern: list[str], date: str) -> list[str]:
    return pattern


def normalize_query(text: str) -> str:
    return re.sub(r"\s+", "", text or "")
