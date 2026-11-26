"""Pydantic request/response schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class BedAssignRequest(BaseModel):
    admission_id: str
    comment: str = ""


class AppointmentCreateRequest(BaseModel):
    patient_name: str
    phone: str = ""
    gender: str = "女"
    age: int = 35
    doctor_id: str
    date: str
    slot: str
    reason: str = ""
    source: str = "运营后台"


class RescheduleRequest(BaseModel):
    date: str
    slot: str


class WaitlistCreateRequest(BaseModel):
    patient_name: str
    phone: str = ""
    dept: str
    doctor_id: str | None = None
    preferred_date: str
    preferred_period: str = "上午"
    priority: str = "常规"
    note: str = ""


class ExamCreateRequest(BaseModel):
    patient_name: str
    gender: str = ""
    age: int = 40
    dept: str = "ortho"
    dept_name: str = "骨科"
    device_id: str
    exam_item: str | None = None
    date: str
    start: str
    duration: int | None = None
    priority: str = "常规"
    note: str = ""


class DeviceStatusRequest(BaseModel):
    status: str
    note: str = ""


class StaffLeaveRequest(BaseModel):
    date: str
    reason: str = ""


class StaffSwapRequest(BaseModel):
    date: str
    new_shift: str


class PlanDecisionRequest(BaseModel):
    decision: str
    comment: str = ""


class AITaskRequest(BaseModel):
    prompt: str = Field(min_length=2, max_length=500)


class CopilotRequest(BaseModel):
    message: str = Field(min_length=2, max_length=1000)
    session_id: str | None = None


class DemoEventRequest(BaseModel):
    action: str = "all"


class TriageRequest(BaseModel):
    age: int = 30
    sex: str = "女"
    symptoms: str = Field(min_length=4, max_length=1000)
    duration: str = ""


class TriageBookRequest(BaseModel):
    patient_name: str
    phone: str = ""
    gender: str = "女"
    age: int = 30
    doctor_id: str
    date: str
    slot: str
    symptoms: str = ""


class KBDocRequest(BaseModel):
    title: str
    category: str = "运营制度"
    owner: str = "运营管理部"
    content: str
    summary: str = ""


class AlertHandleRequest(BaseModel):
    status: str
    note: str = ""


class UserCreateRequest(BaseModel):
    name: str
    role: str
    dept: str = "运营管理部"
    phone: str = ""
    username: str | None = None


class UserUpdateRequest(BaseModel):
    name: str | None = None
    role: str | None = None
    dept: str | None = None
    phone: str | None = None
