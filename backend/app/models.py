"""SQLAlchemy models for the MedFlow AI backend.

The local demo uses SQLite; the same models run on PostgreSQL by setting
DATABASE_URL=postgresql+psycopg://...
"""
from __future__ import annotations

from sqlalchemy import JSON, Boolean, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(30), index=True)
    role_name: Mapped[str] = mapped_column(String(80))
    dept: Mapped[str] = mapped_column(String(80), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="启用")
    color: Mapped[str] = mapped_column(String(20), default="#0f766e")
    permissions: Mapped[str] = mapped_column(String(255), default="")
    last_login: Mapped[str] = mapped_column(String(40), default="—")


class Department(Base):
    __tablename__ = "departments"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    short_name: Mapped[str] = mapped_column(String(40), default="")
    color: Mapped[str] = mapped_column(String(20), default="#0f766e")
    director: Mapped[str] = mapped_column(String(80), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")


class Ward(Base):
    __tablename__ = "wards"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    department_id: Mapped[str] = mapped_column(String(40), ForeignKey("departments.id"))
    name: Mapped[str] = mapped_column(String(80))
    floor: Mapped[str] = mapped_column(String(20), default="")
    side: Mapped[str] = mapped_column(String(20), default="")
    head_nurse: Mapped[str] = mapped_column(String(80), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")


class Bed(Base):
    __tablename__ = "beds"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    ward_id: Mapped[str] = mapped_column(String(40), ForeignKey("wards.id"), index=True)
    ward_name: Mapped[str] = mapped_column(String(80), default="")
    department_id: Mapped[str] = mapped_column(String(40), index=True)
    code: Mapped[str] = mapped_column(String(40))
    room_no: Mapped[str] = mapped_column(String(20))
    room_type: Mapped[str] = mapped_column(String(30))
    bed_type: Mapped[str] = mapped_column(String(30))
    gender_policy: Mapped[str] = mapped_column(String(10), default="不限")
    status: Mapped[str] = mapped_column(String(20), default="空闲", index=True)
    features: Mapped[list] = mapped_column(JSON, default=list)
    version: Mapped[int] = mapped_column(Integer, default=1)
    patient_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    patient_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    admission_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    occupied_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    expected_discharge: Mapped[str | None] = mapped_column(String(40), nullable=True)
    expected_discharge_time: Mapped[str | None] = mapped_column(String(20), nullable=True)
    cleaning_started_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    cleaning_deadline: Mapped[str | None] = mapped_column(String(40), nullable=True)
    maintenance_note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reserved_for: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reserved_until: Mapped[str | None] = mapped_column(String(40), nullable=True)


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(80), index=True)
    gender: Mapped[str] = mapped_column(String(10))
    age: Mapped[int] = mapped_column(Integer)
    phone: Mapped[str] = mapped_column(String(40), default="")
    department_id: Mapped[str] = mapped_column(String(40), index=True)
    department_name: Mapped[str] = mapped_column(String(80), default="")
    patient_type: Mapped[str] = mapped_column(String(20), default="住院")
    status: Mapped[str] = mapped_column(String(30), default="")
    diagnosis: Mapped[str] = mapped_column(String(255), default="")
    care_level: Mapped[str] = mapped_column(String(30), default="")
    attending: Mapped[str] = mapped_column(String(80), default="")
    bed_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    bed_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    ward_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    admitted_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    expected_discharge: Mapped[str | None] = mapped_column(String(40), nullable=True)
    updated_at: Mapped[str] = mapped_column(String(40), default="")
    tags: Mapped[list] = mapped_column(JSON, default=list)


class Admission(Base):
    __tablename__ = "admissions"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    patient_id: Mapped[str] = mapped_column(String(40), index=True)
    name: Mapped[str] = mapped_column(String(80))
    gender: Mapped[str] = mapped_column(String(10))
    age: Mapped[int] = mapped_column(Integer)
    phone: Mapped[str] = mapped_column(String(40), default="")
    department_id: Mapped[str] = mapped_column(String(40), index=True)
    department_name: Mapped[str] = mapped_column(String(80))
    bed_type: Mapped[str] = mapped_column(String(30))
    priority: Mapped[str] = mapped_column(String(20), default="常规")
    priority_source: Mapped[str] = mapped_column(String(80), default="主管医师标注")
    applied_at: Mapped[str] = mapped_column(String(40))
    diagnosis: Mapped[str] = mapped_column(String(255), default="")
    care_level: Mapped[str] = mapped_column(String(30), default="")
    expected_stay: Mapped[int] = mapped_column(Integer, default=5)
    source: Mapped[str] = mapped_column(String(80), default="")
    attending: Mapped[str] = mapped_column(String(80), default="")
    required_features: Mapped[list] = mapped_column(JSON, default=list)
    isolation: Mapped[bool] = mapped_column(Boolean, default=False)
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(30), default="待分配", index=True)
    assigned_bed_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    assigned_at: Mapped[str | None] = mapped_column(String(40), nullable=True)


class Doctor(Base):
    __tablename__ = "doctors"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    department_id: Mapped[str] = mapped_column(String(40), index=True)
    department_name: Mapped[str] = mapped_column(String(80), default="")
    title: Mapped[str] = mapped_column(String(80), default="")
    specialty: Mapped[str] = mapped_column(String(120), default="")
    room: Mapped[str] = mapped_column(String(80), default="")
    period: Mapped[str] = mapped_column(String(20), default="")
    rating: Mapped[float] = mapped_column(Float, default=4.8)
    slots: Mapped[list] = mapped_column(JSON, default=list)
    clinic_days: Mapped[list] = mapped_column(JSON, default=list)


class Appointment(Base):
    __tablename__ = "appointments"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    code: Mapped[str] = mapped_column(String(30), default="")
    patient_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    patient_user_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    patient_name: Mapped[str] = mapped_column(String(80))
    phone: Mapped[str] = mapped_column(String(40), default="")
    department_id: Mapped[str] = mapped_column(String(40), index=True)
    department_name: Mapped[str] = mapped_column(String(80))
    doctor_id: Mapped[str] = mapped_column(String(40), index=True)
    doctor_name: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(80), default="")
    date: Mapped[str] = mapped_column(String(20), index=True)
    slot: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(20), default="待确认", index=True)
    wait_minutes: Mapped[int] = mapped_column(Integer, default=0)
    room: Mapped[str] = mapped_column(String(80), default="")
    source: Mapped[str] = mapped_column(String(80), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[str] = mapped_column(String(40))
    checked_in_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    completed_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    canceled_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reschedule_from: Mapped[str | None] = mapped_column(String(80), nullable=True)
    rescheduled_at: Mapped[str | None] = mapped_column(String(40), nullable=True)


class Waitlist(Base):
    __tablename__ = "appointment_waitlist"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    patient_name: Mapped[str] = mapped_column(String(80))
    phone: Mapped[str] = mapped_column(String(40), default="")
    department_id: Mapped[str] = mapped_column(String(40), index=True)
    department_name: Mapped[str] = mapped_column(String(80))
    doctor_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    doctor_name: Mapped[str] = mapped_column(String(80), default="")
    preferred_date: Mapped[str] = mapped_column(String(20))
    preferred_period: Mapped[str] = mapped_column(String(20), default="上午")
    priority: Mapped[str] = mapped_column(String(20), default="常规")
    source: Mapped[str] = mapped_column(String(80), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="等待中", index=True)
    appointment_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    registered_at: Mapped[str] = mapped_column(String(40))
    promoted_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    canceled_at: Mapped[str | None] = mapped_column(String(40), nullable=True)


class Device(Base):
    __tablename__ = "devices"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    device_type: Mapped[str] = mapped_column(String(20))
    model: Mapped[str] = mapped_column(String(120), default="")
    room: Mapped[str] = mapped_column(String(80), default="")
    status: Mapped[str] = mapped_column(String(20), default="运行中")
    open_time: Mapped[str] = mapped_column(String(20), default="08:00")
    close_time: Mapped[str] = mapped_column(String(20), default="18:00")
    capabilities: Mapped[list] = mapped_column(JSON, default=list)
    color: Mapped[str] = mapped_column(String(20), default="#0f766e")
    maintenance_note: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Exam(Base):
    __tablename__ = "exams"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    patient_name: Mapped[str] = mapped_column(String(80))
    gender: Mapped[str] = mapped_column(String(10), default="")
    age: Mapped[int] = mapped_column(Integer, default=0)
    department_id: Mapped[str] = mapped_column(String(40), default="")
    department_name: Mapped[str] = mapped_column(String(80), default="")
    device_id: Mapped[str] = mapped_column(String(40), index=True)
    device_name: Mapped[str] = mapped_column(String(80), default="")
    device_type: Mapped[str] = mapped_column(String(20), default="")
    exam_item: Mapped[str] = mapped_column(String(120))
    date: Mapped[str] = mapped_column(String(20), index=True)
    start: Mapped[str] = mapped_column(String(10))
    end: Mapped[str] = mapped_column(String(10))
    duration: Mapped[int] = mapped_column(Integer, default=30)
    status: Mapped[str] = mapped_column(String(20), default="已预约")
    priority: Mapped[str] = mapped_column(String(20), default="常规")
    priority_source: Mapped[str] = mapped_column(String(80), default="开单医师标注")
    ordered_by: Mapped[str] = mapped_column(String(80), default="")
    prep: Mapped[str] = mapped_column(Text, default="")
    note: Mapped[str] = mapped_column(Text, default="")
    room: Mapped[str] = mapped_column(String(80), default="")
    created_at: Mapped[str] = mapped_column(String(40), default="")
    canceled_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    cancel_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Staff(Base):
    __tablename__ = "staff"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(80), default="")
    department_id: Mapped[str] = mapped_column(String(40), index=True)
    department_name: Mapped[str] = mapped_column(String(80), default="")
    title: Mapped[str] = mapped_column(String(80), default="")
    skills: Mapped[list] = mapped_column(JSON, default=list)
    phone: Mapped[str] = mapped_column(String(40), default="")
    color: Mapped[str] = mapped_column(String(20), default="#0f766e")
    shifts: Mapped[dict] = mapped_column(JSON, default=dict)
    shift_times: Mapped[dict] = mapped_column(JSON, default=dict)
    weekly_hours: Mapped[float] = mapped_column(Float, default=0)
    night_shifts: Mapped[int] = mapped_column(Integer, default=0)
    work_days: Mapped[int] = mapped_column(Integer, default=0)
    workload: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="在岗")


class StaffConflict(Base):
    __tablename__ = "staff_conflicts"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    staff_id: Mapped[str] = mapped_column(String(40), index=True)
    staff_name: Mapped[str] = mapped_column(String(80))
    department_id: Mapped[str] = mapped_column(String(40))
    conflict_type: Mapped[str] = mapped_column(String(80))
    detail: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(20))
    date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    from_shift: Mapped[str | None] = mapped_column(String(10), nullable=True)
    to_shift: Mapped[str | None] = mapped_column(String(10), nullable=True)
    suggestion: Mapped[str] = mapped_column(Text, default="")


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    level: Mapped[str] = mapped_column(String(20))
    alert_type: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(255))
    department_name: Mapped[str] = mapped_column(String(80), default="")
    trigger_at: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="待处理", index=True)
    related_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    related_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    data: Mapped[list] = mapped_column(JSON, default=list)
    cause: Mapped[str] = mapped_column(Text, default="")
    ai_analysis: Mapped[str] = mapped_column(Text, default="")
    suggestion: Mapped[str] = mapped_column(Text, default="")
    handled_by: Mapped[str | None] = mapped_column(String(80), nullable=True)
    handled_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    handle_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(40), default="规则引擎")
    rule_key: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)


class AlertRead(Base):
    __tablename__ = "alert_reads"
    user_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    alert_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    read_at: Mapped[str] = mapped_column(String(40), default="")


class KnowledgeDoc(Base):
    __tablename__ = "knowledge_docs"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(80), default="")
    owner: Mapped[str] = mapped_column(String(80), default="")
    version: Mapped[str] = mapped_column(String(20), default="v1.0")
    updated_at: Mapped[str] = mapped_column(String(20), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    chunks: Mapped[list] = mapped_column(JSON, default=list)


class BedWaitlist(Base):
    __tablename__ = "bed_waitlist"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    admission_id: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    patient_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    patient_name: Mapped[str] = mapped_column(String(80))
    gender: Mapped[str] = mapped_column(String(10), default="")
    age: Mapped[int] = mapped_column(Integer, default=0)
    department_id: Mapped[str] = mapped_column(String(40), index=True)
    department_name: Mapped[str] = mapped_column(String(80))
    bed_type: Mapped[str] = mapped_column(String(30))
    priority: Mapped[str] = mapped_column(String(20), default="常规")
    priority_source: Mapped[str] = mapped_column(String(80), default="主管医师标注")
    applied_at: Mapped[str] = mapped_column(String(40))
    required_features: Mapped[list] = mapped_column(JSON, default=list)
    isolation: Mapped[bool] = mapped_column(Boolean, default=False)
    reason: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="候补中", index=True)
    last_plan_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    matched_bed_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))


class Plan(Base):
    __tablename__ = "plans"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)
    title: Mapped[str] = mapped_column(String(255))
    scope: Mapped[str] = mapped_column(String(120), default="")
    status: Mapped[str] = mapped_column(String(20), default="待审批", index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    summary: Mapped[str] = mapped_column(Text, default="")
    snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    matched: Mapped[list] = mapped_column(JSON, default=list)
    unmatched: Mapped[list] = mapped_column(JSON, default=list)
    changes: Mapped[list] = mapped_column(JSON, default=list)
    conflicts: Mapped[list] = mapped_column(JSON, default=list)
    validation: Mapped[dict] = mapped_column(JSON, default=dict)
    citations: Mapped[list] = mapped_column(JSON, default=list)
    rationale: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[str] = mapped_column(String(40))
    created_by: Mapped[str] = mapped_column(String(80), default="MedFlow Coordinator")
    created_by_name: Mapped[str] = mapped_column(String(80), default="AI 调度中心")
    workflow_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    approval: Mapped[dict] = mapped_column(JSON, default=dict)
    execution: Mapped[dict] = mapped_column(JSON, default=dict)
    department_id: Mapped[str | None] = mapped_column(String(40), nullable=True)


class WorkflowRun(Base):
    __tablename__ = "workflow_runs"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    prompt: Mapped[str] = mapped_column(Text)
    intent: Mapped[str] = mapped_column(String(60))
    intent_label: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(30), default="running")
    plan_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    steps: Mapped[list] = mapped_column(JSON, default=list)
    citations: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[str] = mapped_column(String(40))
    completed_at: Mapped[str | None] = mapped_column(String(40), nullable=True)
    actor: Mapped[str] = mapped_column(String(80), default="")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[str] = mapped_column(String(40), index=True)
    actor: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(80), default="")
    action: Mapped[str] = mapped_column(String(80))
    target: Mapped[str] = mapped_column(String(120), default="")
    detail: Mapped[str] = mapped_column(Text, default="")
    ip: Mapped[str] = mapped_column(String(80), default="127.0.0.1")


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, default=dict)


Index("ix_beds_dept_status", Bed.department_id, Bed.status)
Index("ix_appointments_doctor_date", Appointment.doctor_id, Appointment.date)
Index("ix_exams_device_date", Exam.device_id, Exam.date)
Index("ix_plans_status_kind", Plan.status, Plan.kind)
