// Event-БД на SQLite. НЕ перезаписываемый state-файл, а накапливающийся
// размеченный датасет: события джойнятся с ценой для event-study.
// Движок изолирован в этом файле — если native-сборка better-sqlite3 на Windows
// заартачится, меняется ТОЛЬКО здесь (напр. на встроенный node:sqlite с флагом
// --experimental-sqlite). Остальной код про движок не знает.
import Database from "better-sqlite3";
import { DB_PATH } from "../config.mjs";

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
initSchema();
export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id               INTEGER PRIMARY KEY,
      detector         TEXT    NOT NULL,   -- какой детектор нашёл
      external_id      TEXT    NOT NULL,   -- стабильный id из источника (для дедупа)
      coin             TEXT,               -- тикер
      coin_ref         TEXT,               -- coingecko id или chain:address
      type             TEXT    NOT NULL,   -- unlock | etf_filing | governance | burn | ...
      tier             INTEGER NOT NULL,
      direction_prior  TEXT    NOT NULL,   -- bullish | bearish | spike_fade | ambiguous
      announce_ts      INTEGER,            -- когда инфо стало публичным (для look-ahead!)
      event_ts         INTEGER,            -- когда катализатор реально бьёт (может быть в будущем)
      source           TEXT,
      source_url       TEXT,
      onchain_proof    TEXT,               -- tx hash, если событие подтверждено в чейне
      mcap_at_announce REAL,
      raw              TEXT,               -- сырой объект источника (json), на случай перепарсинга
      detected_at      INTEGER NOT NULL,
      UNIQUE(detector, external_id)
    );
    CREATE INDEX IF NOT EXISTS idx_events_coin  ON events(coin_ref);
    CREATE INDEX IF NOT EXISTS idx_events_event ON events(event_ts);
    CREATE INDEX IF NOT EXISTS idx_events_type  ON events(type);

    -- watermark на детектор: докуда уже обработано, чтобы rest не тянуть заново
    -- и чтобы после даунтайма дотянуть пропуск (аналог gapCandles в мем-ботах).
    CREATE TABLE IF NOT EXISTS watermarks (
      detector   TEXT PRIMARY KEY,
      last_ts    INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- цены под event-study заполняешь отдельно (CoinGecko history).
    -- coin_ref + день → цена; плюс BTC и секторный индекс для де-бетинга.
    CREATE TABLE IF NOT EXISTS prices (
      coin_ref TEXT    NOT NULL,
      day      INTEGER NOT NULL,   -- unix-полночь UTC
      close    REAL    NOT NULL,
      PRIMARY KEY (coin_ref, day)
    );
  `);
}

// INSERT OR IGNORE по (detector, external_id): один и тот же катализатор
// не задваивается при повторных проходах. Возвращает true, если это НОВОЕ событие.
const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO events
    (detector, external_id, coin, coin_ref, type, tier, direction_prior,
     announce_ts, event_ts, source, source_url, onchain_proof, mcap_at_announce, raw, detected_at)
  VALUES
    (@detector, @external_id, @coin, @coin_ref, @type, @tier, @direction_prior,
     @announce_ts, @event_ts, @source, @source_url, @onchain_proof, @mcap_at_announce, @raw, @detected_at)
`);

export function upsertEvent(ev) {
  const row = {
    detector: ev.detector, external_id: ev.external_id,
    coin: ev.coin ?? null, coin_ref: ev.coin_ref ?? null,
    type: ev.type, tier: ev.tier, direction_prior: ev.direction_prior,
    announce_ts: ev.announce_ts ?? null, event_ts: ev.event_ts ?? null,
    source: ev.source ?? null, source_url: ev.source_url ?? null,
    onchain_proof: ev.onchain_proof ?? null,
    mcap_at_announce: ev.mcap_at_announce ?? null,
    raw: ev.raw ? JSON.stringify(ev.raw) : null,
    detected_at: Date.now(),
  };
  const info = insertStmt.run(row);
  return info.changes > 0; // true = впервые увидели
}

export function upsertMany(events) {
  const tx = db.transaction((list) => list.map(upsertEvent));
  return tx(events);
}

const getWm = db.prepare("SELECT last_ts FROM watermarks WHERE detector = ?");
const setWm = db.prepare(`
  INSERT INTO watermarks (detector, last_ts, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(detector) DO UPDATE SET last_ts = excluded.last_ts, updated_at = excluded.updated_at
`);
export function getWatermark(detector) { return getWm.get(detector)?.last_ts ?? 0; }
export function setWatermark(detector, ts) { setWm.run(detector, ts, Date.now()); }

export function upcoming(days = 30) {
  const now = Date.now(), until = now + days * 864e5;
  return db.prepare(
    "SELECT * FROM events WHERE event_ts BETWEEN ? AND ? ORDER BY event_ts ASC"
  ).all(now, until);
}

export default db;

// CLI: `node src/db.mjs --init`
if (process.argv[1]?.endsWith("db.mjs") && process.argv.includes("--init")) {
  initSchema();
  console.log("✅ схема создана:", DB_PATH);
}
