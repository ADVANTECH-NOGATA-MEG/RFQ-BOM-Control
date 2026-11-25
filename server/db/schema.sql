CREATE TABLE IF NOT EXISTS rfqs (
  id         TEXT NOT NULL,
  version    TEXT NOT NULL,
  status     TEXT,
  created_at TEXT,
  data       TEXT NOT NULL,
  PRIMARY KEY (id, version)
);
CREATE INDEX IF NOT EXISTS idx_rfqs_status     ON rfqs(status);
CREATE INDEX IF NOT EXISTS idx_rfqs_created_at ON rfqs(created_at);

CREATE TABLE IF NOT EXISTS boms (
  id     TEXT PRIMARY KEY,
  rfq_id TEXT,
  data   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_boms_rfq_id ON boms(rfq_id);

CREATE TABLE IF NOT EXISTS materials (
  partNo TEXT PRIMARY KEY,
  code   TEXT,
  data   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_materials_code ON materials(code);

CREATE TABLE IF NOT EXISTS audit (
  id         TEXT PRIMARY KEY,
  created_at TEXT,
  data       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit(created_at);

CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY, data TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS integration_jobs (
  id     TEXT PRIMARY KEY,
  status TEXT,
  data   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_integration_jobs_status ON integration_jobs(status);
