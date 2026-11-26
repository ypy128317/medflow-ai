-- ============================================================
-- MedFlow AI · PostgreSQL 目标模型
-- 演示版不依赖本文件；生产化时按此建表并接 FastAPI。
-- 需要 PostgreSQL 15+，向量检索需要 pgvector。
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------- 组织 / 用户 / 权限 ----------
CREATE TABLE departments (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  short_name    text,
  color         text,
  director      text,
  phone         text,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  code          text PRIMARY KEY,
  name          text NOT NULL,
  description   text
);

CREATE TABLE permissions (
  code          text PRIMARY KEY,
  name          text NOT NULL,
  resource      text NOT NULL,
  action        text NOT NULL
);

CREATE TABLE role_permissions (
  role_code       text REFERENCES roles(code) ON DELETE CASCADE,
  permission_code text REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_code, permission_code)
);

CREATE TABLE app_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username      text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name          text NOT NULL,
  phone         text,
  department_id text REFERENCES departments(id),
  role_code     text NOT NULL REFERENCES roles(code),
  data_scope    text NOT NULL DEFAULT 'self'
                CHECK (data_scope IN ('global','hospital','department','ward','self')),
  active        boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------- 病区 / 床位 ----------
CREATE TABLE wards (
  id            text PRIMARY KEY,
  department_id text NOT NULL REFERENCES departments(id),
  name          text NOT NULL,
  floor         text,
  side          text,
  head_nurse    text,
  phone         text
);

CREATE TABLE beds (
  id                 text PRIMARY KEY,
  ward_id            text NOT NULL REFERENCES wards(id),
  department_id      text NOT NULL REFERENCES departments(id),
  room_no            text NOT NULL,
  bed_no             text NOT NULL,
  bed_type           text NOT NULL
                     CHECK (bed_type IN ('三人间','双人间','单人间','监护床','隔离间')),
  gender_policy      text NOT NULL DEFAULT '不限'
                     CHECK (gender_policy IN ('男','女','不限')),
  status             text NOT NULL DEFAULT 'free'
                     CHECK (status IN ('free','reserved','occupied','cleaning','maintenance','paused')),
  features           jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_patient_id uuid,
  current_admission_id uuid,
  occupied_at        timestamptz,
  expected_discharge_at timestamptz,
  cleaning_started_at timestamptz,
  cleaning_deadline timestamptz,
  maintenance_note   text,
  version            integer NOT NULL DEFAULT 1,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ward_id, room_no, bed_no)
);

CREATE INDEX idx_beds_status_dept ON beds (department_id, status);
CREATE INDEX idx_beds_ward ON beds (ward_id);

-- ---------- 患者 / 入院 ----------
CREATE TABLE patients (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_no    text NOT NULL UNIQUE,
  name          text NOT NULL,
  gender        text NOT NULL CHECK (gender IN ('男','女','未知')),
  birth_date    date,
  phone_masked  text,
  id_card_hash  text,
  patient_type  text NOT NULL DEFAULT 'outpatient'
                CHECK (patient_type IN ('inpatient','pending','outpatient')),
  status        text,
  department_id text REFERENCES departments(id),
  attending     text,
  diagnosis     text,
  care_level    text,
  current_bed_id text REFERENCES beds(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admissions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admission_no       text NOT NULL UNIQUE,
  patient_id         uuid NOT NULL REFERENCES patients(id),
  department_id      text NOT NULL REFERENCES departments(id),
  bed_type           text NOT NULL,
  priority           text NOT NULL DEFAULT '常规'
                     CHECK (priority IN ('紧急','优先','常规')),
  priority_source    text NOT NULL DEFAULT 'attending_physician',
  applied_at         timestamptz NOT NULL DEFAULT now(),
  diagnosis          text,
  care_level         text,
  expected_stay_days integer,
  source             text,
  attending          text,
  required_features  jsonb NOT NULL DEFAULT '[]'::jsonb,
  isolation          boolean NOT NULL DEFAULT false,
  note               text,
  status             text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','assigned','admitted','cancelled')),
  assigned_bed_id    text REFERENCES beds(id),
  assigned_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_admissions_queue ON admissions (department_id, status, priority, applied_at);

-- ---------- 医生 / 预约 ----------
CREATE TABLE doctors (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  department_id text NOT NULL REFERENCES departments(id),
  title         text,
  specialty     text,
  room          text,
  period        text,
  rating        numeric(3,1),
  active        boolean NOT NULL DEFAULT true
);

CREATE TABLE appointments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_no text NOT NULL UNIQUE,
  patient_id     uuid NOT NULL REFERENCES patients(id),
  doctor_id      text NOT NULL REFERENCES doctors(id),
  department_id  text NOT NULL REFERENCES departments(id),
  scheduled_at   timestamptz NOT NULL,
  slot_label     text,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','booked','checked_in','completed','cancelled','expired')),
  source         text,
  wait_minutes   integer NOT NULL DEFAULT 0,
  note           text,
  canceled_at    timestamptz,
  cancel_reason  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_doctor_slot_active
  ON appointments (doctor_id, scheduled_at)
  WHERE status <> 'cancelled';

CREATE INDEX idx_appointments_patient_date ON appointments (patient_id, scheduled_at);
CREATE INDEX idx_appointments_status ON appointments (status, scheduled_at);

CREATE TABLE appointment_waitlist (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  waitlist_no    text NOT NULL UNIQUE,
  patient_name   text NOT NULL,
  phone_masked   text,
  department_id  text NOT NULL REFERENCES departments(id),
  doctor_id      text REFERENCES doctors(id),
  preferred_date date NOT NULL,
  preferred_period text NOT NULL CHECK (preferred_period IN ('上午','下午')),
  priority       text NOT NULL DEFAULT '常规',
  status         text NOT NULL DEFAULT 'waiting'
                 CHECK (status IN ('waiting','promoted','cancelled','expired')),
  appointment_id uuid REFERENCES appointments(id),
  registered_at  timestamptz NOT NULL DEFAULT now(),
  promoted_at    timestamptz,
  note           text
);

CREATE INDEX idx_waitlist_queue ON appointment_waitlist (department_id, status, registered_at);

-- ---------- 设备 / 检查 ----------
CREATE TABLE devices (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  device_type   text NOT NULL CHECK (device_type IN ('CT','MRI','超声','X 光')),
  model         text,
  room          text,
  status        text NOT NULL DEFAULT 'running'
                CHECK (status IN ('running','maintenance','paused')),
  capabilities  jsonb NOT NULL DEFAULT '[]'::jsonb,
  open_from     time NOT NULL DEFAULT '08:00',
  open_to       time NOT NULL DEFAULT '18:00'
);

CREATE TABLE exams (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_no        text NOT NULL UNIQUE,
  patient_id     uuid NOT NULL REFERENCES patients(id),
  device_id      text NOT NULL REFERENCES devices(id),
  department_id  text REFERENCES departments(id),
  exam_item      text NOT NULL,
  scheduled_start timestamptz NOT NULL,
  scheduled_end   timestamptz NOT NULL,
  priority       text NOT NULL DEFAULT '常规'
                 CHECK (priority IN ('紧急','优先','常规')),
  priority_source text NOT NULL DEFAULT 'ordering_physician',
  status         text NOT NULL DEFAULT 'booked'
                 CHECK (status IN ('booked','checked_in','in_progress','completed','cancelled')),
  ordered_by     text,
  prep           text,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (scheduled_end > scheduled_start)
);

ALTER TABLE exams ADD CONSTRAINT exams_no_overlap
  EXCLUDE USING gist (
    device_id WITH =,
    tstzrange(scheduled_start, scheduled_end) WITH &&
  ) WHERE (status <> 'cancelled');

-- ---------- 人员 / 排班 ----------
CREATE TABLE staff (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_no      text NOT NULL UNIQUE,
  name          text NOT NULL,
  department_id text NOT NULL REFERENCES departments(id),
  role          text NOT NULL,
  title         text,
  skills        jsonb NOT NULL DEFAULT '[]'::jsonb,
  phone_masked  text,
  active        boolean NOT NULL DEFAULT true
);

CREATE TABLE shifts (
  code       text PRIMARY KEY,
  name       text NOT NULL,
  start_time time NOT NULL,
  end_time   time NOT NULL
);

CREATE TABLE staff_shifts (
  id          bigserial PRIMARY KEY,
  staff_id    uuid NOT NULL REFERENCES staff(id),
  shift_date  date NOT NULL,
  shift_code  text NOT NULL REFERENCES shifts(code),
  ward_id     text REFERENCES wards(id),
  status      text NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','published','changed')),
  created_by  uuid REFERENCES app_users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, shift_date, shift_code)
);

CREATE INDEX idx_staff_shifts_date ON staff_shifts (shift_date, shift_code);

-- ---------- 工作流 / 方案 / 审批 ----------
CREATE TABLE workflow_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_no    text NOT NULL UNIQUE,
  thread_id      text NOT NULL UNIQUE,
  intent         text NOT NULL,
  prompt         text NOT NULL,
  status         text NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running','awaiting_approval','completed','failed','cancelled')),
  current_node   text,
  state          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by     uuid REFERENCES app_users(id),
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  error          text
);

CREATE TABLE dispatch_plans (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_no        text NOT NULL UNIQUE,
  workflow_id    uuid REFERENCES workflow_runs(id),
  kind           text NOT NULL CHECK (kind IN ('bed','equipment','staff')),
  title          text NOT NULL,
  scope          text,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected','executing','executed','failed','cancelled')),
  version        integer NOT NULL DEFAULT 1,
  summary        text,
  snapshot       jsonb NOT NULL DEFAULT '{}'::jsonb,
  plan_payload   jsonb NOT NULL DEFAULT '{}'::jsonb,
  validation     jsonb NOT NULL DEFAULT '{}'::jsonb,
  citations      jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by     uuid REFERENCES app_users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plan_items (
  id               bigserial PRIMARY KEY,
  plan_id          uuid NOT NULL REFERENCES dispatch_plans(id) ON DELETE CASCADE,
  item_type        text NOT NULL CHECK (item_type IN ('bed','exam','shift')),
  target_id        text NOT NULL,
  patient_id       uuid,
  expected_version integer,
  score            numeric(5,2),
  reasons          jsonb NOT NULL DEFAULT '[]'::jsonb,
  status           text NOT NULL DEFAULT 'proposed'
                   CHECK (status IN ('proposed','unmatched','executing','executed','failed')),
  error            text
);

CREATE TABLE approvals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_no    text NOT NULL UNIQUE,
  plan_id        uuid NOT NULL REFERENCES dispatch_plans(id),
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected','cancelled','executed','failed')),
  requested_by   uuid REFERENCES app_users(id),
  decided_by     uuid REFERENCES app_users(id),
  decided_at     timestamptz,
  comment        text,
  plan_version   integer NOT NULL,
  execution      jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_approvals_pending ON approvals (status, created_at);

CREATE TABLE tool_calls (
  id             bigserial PRIMARY KEY,
  workflow_id    uuid REFERENCES workflow_runs(id),
  server_name    text NOT NULL,
  tool_name      text NOT NULL,
  args_summary   jsonb,
  result_summary jsonb,
  status         text NOT NULL DEFAULT 'ok',
  duration_ms    integer,
  trace_id       text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ---------- 预警 / 知识库 / 审计 ----------
CREATE TABLE alerts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_no       text NOT NULL UNIQUE,
  level          text NOT NULL CHECK (level IN ('紧急','高','中','低')),
  alert_type     text NOT NULL,
  title          text NOT NULL,
  department_id  text REFERENCES departments(id),
  trigger_at     timestamptz NOT NULL DEFAULT now(),
  status         text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','processing','resolved','ignored')),
  related_type   text,
  related_id     text,
  evidence       jsonb NOT NULL DEFAULT '{}'::jsonb,
  cause          text,
  ai_analysis    text,
  suggestion     text,
  handled_by     uuid REFERENCES app_users(id),
  handled_at     timestamptz,
  handle_note    text
);

CREATE TABLE kb_documents (
  id            text PRIMARY KEY,
  title         text NOT NULL,
  category      text,
  owner         text,
  version       text NOT NULL DEFAULT 'v1.0',
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','archived','deleted')),
  summary       text,
  source_file   text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  indexed_at    timestamptz
);

CREATE TABLE kb_chunks (
  id            text PRIMARY KEY,
  document_id   text NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  heading       text,
  content       text NOT NULL,
  keywords      jsonb NOT NULL DEFAULT '[]'::jsonb,
  embedding     vector(1024),
  token_count   integer,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_kb_chunks_doc ON kb_chunks (document_id);
CREATE INDEX idx_kb_chunks_embedding ON kb_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE audit_logs (
  id            bigserial PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  actor_id      uuid REFERENCES app_users(id),
  actor_name    text,
  actor_role    text,
  action        text NOT NULL,
  target_type   text,
  target_id     text,
  detail        text,
  before_state  jsonb,
  after_state   jsonb,
  trace_id      text,
  ip            inet,
  result        text NOT NULL DEFAULT 'success'
);

CREATE INDEX idx_audit_target ON audit_logs (target_id, at DESC);
CREATE INDEX idx_audit_actor ON audit_logs (actor_id, at DESC);
CREATE INDEX idx_audit_action ON audit_logs (action, at DESC);

-- ---------- 约束补充 ----------
ALTER TABLE beds
  ADD CONSTRAINT fk_beds_current_patient
  FOREIGN KEY (current_patient_id) REFERENCES patients(id);

ALTER TABLE beds
  ADD CONSTRAINT fk_beds_current_admission
  FOREIGN KEY (current_admission_id) REFERENCES admissions(id);

-- 同一患者不能同时占用两张已入住床位
CREATE UNIQUE INDEX uq_bed_occupied_patient
  ON beds (current_patient_id)
  WHERE status = 'occupied' AND current_patient_id IS NOT NULL;

-- 一个审批单只能对应一个方案版本的有效决策
CREATE UNIQUE INDEX uq_approval_pending_plan
  ON approvals (plan_id)
  WHERE status = 'pending';

COMMENT ON TABLE beds IS '床位主数据；version 用于审批期间乐观锁校验';
COMMENT ON TABLE dispatch_plans IS 'AI 调度方案；不直接修改业务表';
COMMENT ON TABLE approvals IS '人工审批；通过后由执行服务再次校验';
COMMENT ON TABLE tool_calls IS 'MCP 工具调用留痕，参数与结果摘要脱敏';
COMMENT ON COLUMN kb_chunks.embedding IS 'bge-m3 1024 维向量，使用 pgvector HNSW';
