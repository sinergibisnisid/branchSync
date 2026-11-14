-- BranchSync — skema awal. Lihat API.md untuk bentuk data yang dikirim ke frontend.

CREATE TABLE roles (
  name        text PRIMARY KEY,
  permissions text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE users (
  id            bigserial PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL,
  username      text,
  role          text NOT NULL REFERENCES roles(name) ON UPDATE CASCADE,
  status        text NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Nonaktif')),
  password_hash text,
  last_active   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE UNIQUE INDEX users_username_key ON users (lower(username)) WHERE username IS NOT NULL;

CREATE TABLE sessions (
  token_hash bytea PRIMARY KEY,
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE otp_codes (
  email      text PRIMARY KEY,
  code_hash  bytea NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts   int NOT NULL DEFAULT 0
);

-- Status OAuth sementara (login Google & menghubungkan GBP)
CREATE TABLE oauth_states (
  state        text PRIMARY KEY,
  kind         text NOT NULL CHECK (kind IN ('login', 'gbp')),
  redirect_uri text NOT NULL,
  user_id      bigint REFERENCES users(id) ON DELETE CASCADE,
  expires_at   timestamptz NOT NULL
);

CREATE TABLE settings (
  id   int PRIMARY KEY CHECK (id = 1),
  data jsonb NOT NULL
);

-- Konfigurasi Google API. Rahasia disimpan terenkripsi (AES-256-GCM, kunci BS_SECRET_KEY) dan tidak pernah dikirim balik.
CREATE TABLE google_config (
  id                int PRIMARY KEY CHECK (id = 1),
  data              jsonb NOT NULL,
  client_secret_enc bytea,
  api_key_enc       bytea,
  refresh_token_enc bytea,
  connected         boolean NOT NULL DEFAULT false,
  last_test         timestamptz,
  quota_day         date,
  quota_used        int NOT NULL DEFAULT 0
);

-- Akun Google Business Profile
CREATE TABLE accounts (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  email      text NOT NULL DEFAULT '',
  account_id text UNIQUE            -- "accounts/1043920001"
);

CREATE SEQUENCE location_code_seq;
CREATE TABLE locations (
  code         text PRIMARY KEY,
  name         text NOT NULL,
  type         text NOT NULL,
  city         text NOT NULL DEFAULT '',
  province     text NOT NULL DEFAULT '',
  region       text NOT NULL DEFAULT '',
  address      text NOT NULL DEFAULT '',
  phone        text NOT NULL DEFAULT '',
  hours        text NOT NULL DEFAULT '',
  hours_spec   jsonb,
  lat          double precision NOT NULL,
  lng          double precision NOT NULL,
  status       text NOT NULL DEFAULT 'Belum Sync',
  account_id   text REFERENCES accounts(id) ON DELETE SET NULL,
  gbp          text NOT NULL DEFAULT 'Belum Diklaim',
  google       jsonb,                 -- snapshot listing Google { name, phone, hours, address, lat, lng }
  gbp_name     text UNIQUE,           -- "locations/123456" di Business Information API
  pending      text[] NOT NULL DEFAULT '{}',  -- kolom yang diubah di Dashboard dan belum dikirim ke Google
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   text NOT NULL DEFAULT '',
  last_sync    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE approval_seq;
CREATE TABLE approvals (
  id          text PRIMARY KEY,
  code        text NOT NULL REFERENCES locations(code) ON DELETE CASCADE,
  field       text NOT NULL,
  before      text NOT NULL DEFAULT '',
  after       text NOT NULL DEFAULT '',
  by          text NOT NULL DEFAULT '',
  time        timestamptz NOT NULL DEFAULT now(),
  status      text NOT NULL DEFAULT 'Menunggu',
  decided_at  timestamptz,
  decided_by  text,
  google_value jsonb                  -- nilai mentah dari Google (mis. regularHours) untuk diterapkan saat disetujui
);

CREATE SEQUENCE claim_seq;
CREATE TABLE claims (
  id           text PRIMARY KEY,
  kind         text NOT NULL,
  code         text,
  proposal     jsonb,
  status       text NOT NULL DEFAULT 'Diajukan',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  done_at      timestamptz,
  note         text NOT NULL DEFAULT '',
  created_by   text NOT NULL DEFAULT ''
);

CREATE SEQUENCE run_seq;
CREATE TABLE runs (
  id          text PRIMARY KEY,
  time        timestamptz NOT NULL DEFAULT now(),
  scope       text NOT NULL DEFAULT '',
  by          text NOT NULL DEFAULT '',
  total       int NOT NULL DEFAULT 0,
  ok          int NOT NULL DEFAULT 0,
  fail        int NOT NULL DEFAULT 0,
  skip        int NOT NULL DEFAULT 0,
  duration_ms int NOT NULL DEFAULT 0,
  items       jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX runs_time_idx ON runs (time DESC);

CREATE TABLE audit (
  id      bigserial PRIMARY KEY,
  time    timestamptz NOT NULL DEFAULT now(),
  "user"  text NOT NULL,
  actor   text NOT NULL DEFAULT 'Internal',
  module  text NOT NULL,
  action  text NOT NULL,
  target  text NOT NULL DEFAULT '',
  detail  text NOT NULL DEFAULT '',
  changes jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX audit_time_idx ON audit (time DESC);

CREATE SEQUENCE review_seq;
CREATE TABLE reviews (
  id          text PRIMARY KEY,
  code        text NOT NULL REFERENCES locations(code) ON DELETE CASCADE,
  google_name text UNIQUE,            -- "accounts/1/locations/2/reviews/abc"
  author      text NOT NULL DEFAULT '',
  rating      int NOT NULL DEFAULT 0,
  text        text NOT NULL DEFAULT '',
  time        timestamptz NOT NULL DEFAULT now(),
  reply_text  text,
  reply_by    text,
  reply_time  timestamptz
);
CREATE INDEX reviews_code_idx ON reviews (code);

CREATE SEQUENCE schedule_seq;
CREATE TABLE report_schedules (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  frequency  text NOT NULL CHECK (frequency IN ('weekly', 'monthly')),
  day        text NOT NULL,
  period     text NOT NULL,
  format     text NOT NULL,
  recipients text[] NOT NULL,
  filters    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL DEFAULT '',
  last_sent  date
);

CREATE TABLE disc_notes (
  code  text NOT NULL REFERENCES locations(code) ON DELETE CASCADE,
  field text NOT NULL,
  text  text NOT NULL,
  by    text NOT NULL,
  time  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (code, field)
);

CREATE TABLE dup_ignored (
  a text NOT NULL,
  b text NOT NULL,
  PRIMARY KEY (a, b)
);

-- Data awal: peran bawaan (sama dengan Mode Demo) dan pengaturan.
INSERT INTO roles (name, permissions) VALUES
  ('Administrator', ARRAY['locations.read','locations.write','locations.import','sync.run','claims.manage','approvals.decide','reviews.reply','audit.read','users.manage','settings.write']),
  ('Operator', ARRAY['locations.read','locations.write','locations.import','sync.run','claims.manage','audit.read']),
  ('Viewer', ARRAY['locations.read','audit.read']);

INSERT INTO settings (id, data) VALUES (1, '{"workspace":"BranchSync · Jaringan BRI","timezone":"Asia/Jakarta","slaInternal":24,"slaGoogle":120,"dupRadius":150,"coordTol":50}');

INSERT INTO google_config (id, data) VALUES (1, '{"account":"","project":"","clientId":"","scopes":["business.manage"],"syncInterval":"60","quotaLimit":10000,"pubsubTopic":"","webhook":false}');
