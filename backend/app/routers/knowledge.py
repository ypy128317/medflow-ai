from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import KnowledgeDoc, User
from ..schemas import KBDocRequest
from ..security import get_current_user, require
from ..services import knowledge as svc

router = APIRouter(prefix="/kb", tags=["knowledge"])


@router.get("/documents")
def documents(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [{"id": d.id, "title": d.title, "category": d.category, "owner": d.owner,
             "version": d.version, "updated_at": d.updated_at, "summary": d.summary,
             "chunks": len(d.chunks or [])} for d in db.scalars(select(KnowledgeDoc)).all()]


@router.get("/documents/{doc_id}")
def document(doc_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    doc = db.get(KnowledgeDoc, doc_id)
    if not doc:
        raise HTTPException(404, "文档不存在")
    return {"id": doc.id, "title": doc.title, "category": doc.category, "owner": doc.owner,
            "version": doc.version, "updated_at": doc.updated_at, "summary": doc.summary,
            "chunks": doc.chunks or []}


@router.post("/documents")
def create(payload: KBDocRequest, db: Session = Depends(get_db),
           user: User = Depends(require("knowledge.manage"))):
    ok, result = svc.create_doc(db, user, payload.model_dump())
    if not ok:
        raise HTTPException(422, result)
    return result


@router.put("/documents/{doc_id}")
def update(doc_id: str, payload: KBDocRequest, db: Session = Depends(get_db),
           user: User = Depends(require("knowledge.manage"))):
    ok, message = svc.update_doc(db, user, doc_id, payload.model_dump())
    if not ok:
        raise HTTPException(422, message)
    return {"ok": True, "message": message}


@router.delete("/documents/{doc_id}")
def delete(doc_id: str, db: Session = Depends(get_db),
           user: User = Depends(require("knowledge.manage"))):
    ok, message = svc.delete_doc(db, user, doc_id)
    if not ok:
        raise HTTPException(404, message)
    return {"ok": True, "message": message}


@router.post("/search")
def search(payload: dict, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    query = str(payload.get("query", ""))
    return {"query": query, "results": svc.search(db, query, int(payload.get("top_k", 5)))}
