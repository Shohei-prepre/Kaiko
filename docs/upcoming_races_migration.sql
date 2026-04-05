-- ============================================================
-- upcoming_races: netkeiba から取得した出走予定レース情報
-- ============================================================
CREATE TABLE IF NOT EXISTS upcoming_races (
  race_id        TEXT PRIMARY KEY,           -- netkeiba の race_id そのまま
  race_name      TEXT NOT NULL,
  race_date      DATE NOT NULL,
  track          TEXT NOT NULL,              -- '東京', '中山', '阪神', '京都' etc.
  distance       INTEGER NOT NULL,
  surface        TEXT NOT NULL,              -- '芝' | 'ダート'
  grade          TEXT NOT NULL,              -- 'G1' | 'G2' | ... | '新馬'
  race_number    INTEGER,
  head_count     INTEGER,                    -- 登録頭数（確定前は暫定値）
  odds_updated_at TIMESTAMPTZ,               -- 最終オッズ取得日時
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- upcoming_entries: 出馬表（1馬 × 1レース = 1行）
-- ============================================================
CREATE TABLE IF NOT EXISTS upcoming_entries (
  id             SERIAL PRIMARY KEY,
  race_id        TEXT NOT NULL REFERENCES upcoming_races(race_id) ON DELETE CASCADE,
  horse_id       INTEGER REFERENCES horses(horse_id),   -- 既存馬はリンク。新馬は NULL
  horse_name     TEXT NOT NULL,                          -- 非正規化（表示用）
  frame_number   INTEGER,                               -- 枠番 1〜8
  horse_number   INTEGER,                               -- 馬番
  jockey         TEXT,
  weight_carried NUMERIC(4,1),                          -- 斤量
  odds           NUMERIC(6,1),                          -- 単勝オッズ
  popularity     INTEGER,                               -- 人気順
  UNIQUE (race_id, horse_id),
  UNIQUE (race_id, horse_number)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_upcoming_races_date ON upcoming_races(race_date);
CREATE INDEX IF NOT EXISTS idx_upcoming_entries_race ON upcoming_entries(race_id);
CREATE INDEX IF NOT EXISTS idx_upcoming_entries_horse ON upcoming_entries(horse_id);

-- RLS（Supabase: 全ユーザー読み取り可）
ALTER TABLE upcoming_races  ENABLE ROW LEVEL SECURITY;
ALTER TABLE upcoming_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read upcoming_races"
  ON upcoming_races FOR SELECT USING (true);

CREATE POLICY "public read upcoming_entries"
  ON upcoming_entries FOR SELECT USING (true);
