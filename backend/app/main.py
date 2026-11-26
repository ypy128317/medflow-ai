"""MedFlow AI FastAPI application."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .config import PROJECT_DIR
from .database import engine
from .routers import (ai, alerts, appointments, approvals, auth, beds, copilot, demo, exams,
                      knowledge, ops, patient_portal, staff, system, triage)
from .seed import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    reset = os.getenv("MEDFLOW_RESET_DB", "0") == "1"
    init_db(reset=reset)
    if reset:
        from .workflow import reset_checkpoints
        reset_checkpoints()
    yield


app = FastAPI(
    title="MedFlow AI API",
    description="医院运营与医疗资源调度平台 · FastAPI + SQLAlchemy + LangGraph + MCP",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:8765", "http://localhost:8765",
                   "http://127.0.0.1:8000", "http://127.0.0.1:8010",
                   "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for router in (auth.router, ops.router, beds.router, appointments.router, exams.router,
               staff.router, approvals.router, ai.router, alerts.router, knowledge.router,
               system.router, triage.router, patient_portal.router, demo.router, copilot.router):
    app.include_router(router, prefix="/api/v1")


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok", "service": "medflow-ai", "version": "1.0.0",
            "database": engine.url.get_backend_name()}


WEB_DIST = PROJECT_DIR / "web" / "dist"
PORTAL_DIST = PROJECT_DIR / "portal" / "dist"

if (WEB_DIST / "assets").exists():
    app.mount("/app/assets", StaticFiles(directory=WEB_DIST / "assets"), name="web-assets")
if (PORTAL_DIST / "assets").exists():
    app.mount("/portal/assets", StaticFiles(directory=PORTAL_DIST / "assets"), name="portal-assets")


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse("/app/" if (WEB_DIST / "index.html").exists() else "/docs")


@app.get("/app/{full_path:path}", include_in_schema=False)
def vue_app(full_path: str):
    """Serve the built internal Vue SPA, falling back to index.html for history routes."""
    if not (WEB_DIST / "index.html").exists():
        raise HTTPException(404, "Vue build not found. Run `cd web && npm run build` first.")
    root = WEB_DIST.resolve()
    candidate = (WEB_DIST / full_path).resolve()
    if candidate.is_relative_to(root) and candidate.is_file():
        return FileResponse(candidate)
    return FileResponse(WEB_DIST / "index.html")


@app.get("/portal/{full_path:path}", include_in_schema=False)
def patient_portal_app(full_path: str):
    """Serve the standalone patient H5 portal."""
    if not (PORTAL_DIST / "index.html").exists():
        raise HTTPException(404, "Patient portal build not found. Run `cd portal && npm run build` first.")
    root = PORTAL_DIST.resolve()
    candidate = (PORTAL_DIST / full_path).resolve()
    if candidate.is_relative_to(root) and candidate.is_file():
        return FileResponse(candidate)
    return FileResponse(PORTAL_DIST / "index.html")


# The existing zero-build frontend remains available for visual comparison.
app.mount("/demo", StaticFiles(directory=PROJECT_DIR, html=True), name="demo")
