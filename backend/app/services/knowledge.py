"""Knowledge base ingestion, update and hybrid retrieval."""
from __future__ import annotations

import math
import re
from collections import Counter

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import KnowledgeDoc, User
from .common import audit, now, today


def tokens(text: str) -> list[str]:
    text = (text or "").lower()
    ascii_tokens = re.findall(r"[a-z0-9]+", text)
    chinese = re.sub(r"[^\u4e00-\u9fa5]", " ", text)
    out = list(ascii_tokens)
    for chunk in chinese.split():
        if len(chunk) <= 4:
            out.append(chunk)
        out += [chunk[i:i + 2] for i in range(len(chunk) - 1)]
    return list(dict.fromkeys(t for t in out if len(t) >= 2))


def embed(text: str) -> list[float]:
    vec = [0.0] * 64
    for t in tokens(text):
        h = 0
        for ch in t:
            h = (h * 31 + ord(ch)) & 0xFFFFFFFF
        vec[h % 64] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def cosine(a: list[float], b: list[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def search(db: Session, query: str, top_k: int = 5) -> list[dict]:
    q_tokens = tokens(query)
    q_vec = embed(query)
    results = []
    for doc in db.scalars(select(KnowledgeDoc)).all():
        for chunk in doc.chunks or []:
            content = f"{doc.title} {chunk.get('heading', '')} {chunk.get('content', '')}"
            score = 0.0
            for kw in chunk.get("keywords", []):
                if kw in query:
                    score += 5
            for t in q_tokens:
                if t in " ".join(chunk.get("keywords", [])):
                    score += 2.2
                elif t in chunk.get("heading", ""):
                    score += 1.1
                elif t in content:
                    score += 0.45
            vec_score = cosine(q_vec, embed(content))
            score += vec_score * 2.4
            if score <= 0:
                continue
            results.append({"doc_id": doc.id, "title": doc.title, "category": doc.category,
                            "owner": doc.owner, "version": doc.version, "chunk_id": chunk.get("id"),
                            "heading": chunk.get("heading"), "content": chunk.get("content"),
                            "score": round(score, 3), "vector_score": round(vec_score, 3)})
    if not results:
        return []
    best = max(r["score"] for r in results)
    for r in results:
        r["relevance"] = min(0.98, 0.42 + r["score"] / best * 0.55)
    return sorted(results, key=lambda r: r["score"], reverse=True)[:top_k]


def _split_chunks(title: str, category: str, content: str) -> list[dict]:
    parts = [p.strip() for p in re.split(r"\n\s*\n|\n", content) if p.strip()]
    if not parts:
        parts = [content]
    out = []
    for i, part in enumerate(parts, 1):
        out.append({"id": "", "heading": f"第 {i} 节", "content": part,
                    "keywords": [category, title] + tokens(part)[:12]})
    return out


def create_doc(db: Session, user: User, payload: dict) -> tuple[bool, dict | str]:
    title = payload.get("title")
    content = payload.get("content", "")
    if not title or len(content.strip()) < 20:
        return False, "标题和正文不能为空，正文至少 20 字"
    count = db.scalar(select(func.count()).select_from(KnowledgeDoc)) or 0
    doc_id = f"KB-{count + 1:03d}"
    chunks = _split_chunks(title, payload.get("category", "运营制度"), content)
    for i, chunk in enumerate(chunks, 1):
        chunk["id"] = f"{doc_id}-{i:02d}"
    doc = KnowledgeDoc(id=doc_id, title=title, category=payload.get("category", "运营制度"),
                       owner=payload.get("owner", user.dept), version="v1.0", updated_at=today(),
                       summary=payload.get("summary") or content[:56] + "…", chunks=chunks)
    db.add(doc)
    audit(db, user, "kb.upload", doc.id, f"上传知识库文档：{title}（{len(chunks)} 个片段）")
    db.commit()
    return True, {"doc": doc.id, "chunks": len(chunks)}


def update_doc(db: Session, user: User, doc_id: str, payload: dict) -> tuple[bool, str]:
    doc = db.get(KnowledgeDoc, doc_id)
    if not doc:
        return False, "文档不存在"
    title = payload.get("title") or doc.title
    content = payload.get("content", "")
    if len(content.strip()) < 20:
        return False, "正文至少 20 字"
    chunks = _split_chunks(title, payload.get("category") or doc.category, content)
    for i, chunk in enumerate(chunks, 1):
        chunk["id"] = f"{doc.id}-{i:02d}"
    old = doc.version
    try:
        numeric = float(re.sub(r"[^\d.]", "", doc.version) or 1)
    except ValueError:
        numeric = 1
    doc.title = title
    doc.category = payload.get("category") or doc.category
    doc.owner = payload.get("owner") or doc.owner
    doc.summary = payload.get("summary") or content[:56] + "…"
    doc.version = f"v{numeric + 0.1:.1f}"
    doc.updated_at = today()
    doc.chunks = chunks
    audit(db, user, "kb.update", doc.id, f"更新知识文档：{title}（{old} → {doc.version}）")
    db.commit()
    return True, f"文档已更新，版本 {doc.version}"


def delete_doc(db: Session, user: User, doc_id: str) -> tuple[bool, str]:
    doc = db.get(KnowledgeDoc, doc_id)
    if not doc:
        return False, "文档不存在"
    db.delete(doc)
    audit(db, user, "kb.delete", doc_id, f"删除知识库文档：{doc.title}")
    db.commit()
    return True, "文档已删除"
