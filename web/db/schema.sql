-- Schema database Két Cọc Trọ. Khớp docs/data-contract.md > Bảng database.
-- Chạy được nhiều lần (IF NOT EXISTS). Dán cả file vào Supabase > SQL Editor rồi bấm Run.
-- Server cũng tự chạy file này lúc khởi động, nên quên chạy tay vẫn không sao.
-- Không có cột trạng thái hợp đồng: trạng thái luôn đọc từ contract.

CREATE TABLE IF NOT EXISTS listings (
  id          TEXT PRIMARY KEY,
  landlord    TEXT NOT NULL,
  terms       JSONB NOT NULL,
  terms_hash  TEXT NOT NULL,
  deal_id     BIGINT UNIQUE,            -- null tới khi createDeal lên chuỗi
  tx_hash     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- File ảnh nằm trong kho ảnh (Supabase Storage, bucket "photos") tại storage_path.
-- Khi chạy local không có kho ảnh, byte ảnh lưu tạm ở cột data.
CREATE TABLE IF NOT EXISTS photos (
  id            TEXT PRIMARY KEY,
  owner         TEXT NOT NULL,
  sha256        TEXT NOT NULL,
  mime          TEXT NOT NULL,
  bytes         INTEGER NOT NULL,
  storage_path  TEXT,
  data          BYTEA,
  purpose       TEXT NOT NULL,          -- listing | example | checkin | checkout | mismatch
  position_id   TEXT,
  captured_at   TIMESTAMPTZ,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  accuracy_m    DOUBLE PRECISION,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS photo_sets (
  id          TEXT PRIMARY KEY,
  deal_id     BIGINT NOT NULL,
  kind        TEXT NOT NULL,            -- checkin | checkout | mismatch
  manifest    JSONB NOT NULL,
  set_hash    TEXT NOT NULL,
  photo_ids   JSONB NOT NULL,           -- { "p1": "ph_...", ... } để hiện ảnh
  created_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS photo_sets_deal ON photo_sets (deal_id, kind);
CREATE INDEX IF NOT EXISTS photo_sets_hash ON photo_sets (set_hash);

CREATE TABLE IF NOT EXISTS ai_reports (
  id             TEXT PRIMARY KEY,
  deal_id        BIGINT NOT NULL,
  type           TEXT NOT NULL,         -- damage | mismatch
  input_hash     TEXT NOT NULL,         -- checkOutHash (damage) hoặc evidenceHash (mismatch)
  status         TEXT NOT NULL,         -- processing | done | failed
  report         JSONB,
  report_hash    TEXT,
  sealed_amount  TEXT,
  verdict        INTEGER,
  signature      TEXT,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deal_id, type, input_hash)
);

CREATE TABLE IF NOT EXISTS faucet_claims (
  wallet      TEXT PRIMARY KEY,
  claimed_at  TIMESTAMPTZ NOT NULL
);

-- Bảng chỉ server đọc ghi (qua DATABASE_URL). Bật RLS để khóa publishable key của Supabase không đọc được.
ALTER TABLE listings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_sets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_reports    ENABLE ROW LEVEL SECURITY;
ALTER TABLE faucet_claims ENABLE ROW LEVEL SECURITY;

-- Nhật ký sự kiện trên chuỗi cho mục history của GET /deals/:id.
-- Server đọc log của contract theo từng đoạn khối (RPC giới hạn số khối mỗi lần) và lưu lại ở đây.
CREATE TABLE IF NOT EXISTS chain_events (
  tx_hash       TEXT NOT NULL,
  log_index     INTEGER NOT NULL,
  block_number  BIGINT NOT NULL,
  deal_id       BIGINT NOT NULL,
  event         TEXT NOT NULL,
  at            TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS chain_events_deal ON chain_events (deal_id, block_number, log_index);

-- Khối cuối đã đọc, theo địa chỉ contract (deploy bản mới thì đọc lại từ deployBlock của bản đó).
CREATE TABLE IF NOT EXISTS sync_state (
  key    TEXT PRIMARY KEY,
  value  BIGINT NOT NULL
);

-- Lời giải thích phụ của OpenAI: không nằm trong báo cáo đã hash và ký.
ALTER TABLE ai_reports ADD COLUMN IF NOT EXISTS explanation JSONB;

ALTER TABLE chain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_state   ENABLE ROW LEVEL SECURITY;

-- Chỉ mục cho các truy vấn hay chạy (thêm 16/11, không đổi dữ liệu).
CREATE INDEX IF NOT EXISTS photos_owner_time ON photos (owner, created_at);
CREATE INDEX IF NOT EXISTS ai_reports_deal ON ai_reports (deal_id, type, created_at);

-- Sửa dữ liệu cũ (18/11): postgres.js tự JSON.stringify tham số jsonb, nên chuỗi JSON truyền vào bị bọc thêm một lớp
-- và cột lưu một "chuỗi" thay vì object. Server đọc ra terms là string => mọi route đọc terms báo lỗi máy chủ.
-- Code ghi đã đổi sang $n::text::jsonb. Các lệnh dưới gỡ lớp bọc ở dòng cũ; chạy lại nhiều lần vẫn an toàn.
UPDATE listings   SET terms      = (terms #>> '{}')::jsonb      WHERE jsonb_typeof(terms)      = 'string';
UPDATE photo_sets SET manifest   = (manifest #>> '{}')::jsonb   WHERE jsonb_typeof(manifest)   = 'string';
UPDATE photo_sets SET photo_ids  = (photo_ids #>> '{}')::jsonb  WHERE jsonb_typeof(photo_ids)  = 'string';
UPDATE ai_reports SET report     = (report #>> '{}')::jsonb     WHERE jsonb_typeof(report)     = 'string';
UPDATE ai_reports SET explanation = (explanation #>> '{}')::jsonb WHERE jsonb_typeof(explanation) = 'string';

-- Danh mục phòng và yêu cầu thuê (19/11, docs/data-contract.md > Bảng database).
-- Chủ trọ đăng phòng một lần, CHƯA có ngày và CHƯA lên chuỗi (template = điều khoản kct.terms/1 thiếu createdAt, dates).
-- Người thuê chọn ngày dọn vào + ngày hết hạn, gửi yêu cầu. Chủ trọ duyệt: server ghép ngày thành điều khoản đầy đủ,
-- tạo một dòng listings (request_id trỏ về yêu cầu) rồi chủ trọ ký createDeal như cũ.
CREATE TABLE IF NOT EXISTS rooms (
  id          TEXT PRIMARY KEY,
  landlord    TEXT NOT NULL,
  template    JSONB NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rental_requests (
  id          TEXT PRIMARY KEY,
  room_id     TEXT NOT NULL REFERENCES rooms(id),
  tenant      TEXT NOT NULL,
  move_in     TIMESTAMPTZ NOT NULL,
  lease_end   TIMESTAMPTZ NOT NULL,
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'PENDING',   -- PENDING | APPROVED | REJECTED | CANCELLED
  listing_id  TEXT,                               -- có khi APPROVED
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at  TIMESTAMPTZ
);

-- Tin đăng sinh ra từ một yêu cầu thuê: riêng cho người gửi yêu cầu, không hiện ở GET /listings.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS request_id TEXT;

CREATE INDEX IF NOT EXISTS rooms_landlord ON rooms (landlord, created_at);
CREATE INDEX IF NOT EXISTS rental_requests_room ON rental_requests (room_id, status);
CREATE INDEX IF NOT EXISTS rental_requests_tenant ON rental_requests (tenant, created_at);

ALTER TABLE rooms           ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_requests ENABLE ROW LEVEL SECURITY;

-- Lý do kèm đề xuất mức trừ (chủ trọ) và kháng nghị (người thuê), cho bên kia và bồi thẩm đọc.
-- Ngoài chuỗi: chỉ sửa được trước khi giao dịch tương ứng lên chuỗi (API kiểm tra trạng thái), sau đó khóa.
CREATE TABLE IF NOT EXISTS deal_notes (
  deal_id     BIGINT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('proposal', 'dispute')),
  author      TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deal_id, kind)
);
ALTER TABLE deal_notes ENABLE ROW LEVEL SECURITY;
