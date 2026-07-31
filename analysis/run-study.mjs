// Event-study по собранным катализаторам.
// Для каждого события: forward-доходность монеты за горизонт H минус доходность
// BTC за то же окно = АБНОРМАЛ (де-бетнутая) доходность. Затем агрегируем по
// типу и априору направления. Это и есть проверка «работает ли катализатор».
//
// Требует заполненной таблицы prices (coin_ref, day, close), включая BTC
// (coin_ref = 'coingecko:bitcoin'). Цены тянешь отдельным скриптом из CoinGecko.
//
// ЧЕСТНЫЙ ЗНАМЕНАТЕЛЬ: репортим не только результат, но и ПОКРЫТИЕ — сколько
// событий вообще имели цену. Низкое покрытие = выводам верить нельзя.
import db from "../src/db.mjs";

const HORIZONS = [7, 30, 90]; // дней
const BTC = "coingecko:bitcoin";
const DAY = 864e5;

const dayOf = (ts) => Math.floor(ts / DAY) * (DAY / 1000); // unix-секунды полуночи UTC
const priceStmt = db.prepare("SELECT close FROM prices WHERE coin_ref = ? AND day = ?");
const priceAt = (ref, daySec) => priceStmt.get(ref, daySec)?.close ?? null;

function fwdReturn(ref, t0, days) {
  const d0 = dayOf(t0), d1 = dayOf(t0 + days * DAY);
  const p0 = priceAt(ref, d0), p1 = priceAt(ref, d1);
  if (p0 == null || p1 == null || p0 <= 0) return null;
  return p1 / p0 - 1;
}

// Знак ожидаемого движения по прайору — чтобы считать hit rate «в свою сторону»
const priorSign = { bullish: 1, bearish: -1, spike_fade: -1, ambiguous: 0 };

const events = db.prepare("SELECT * FROM events WHERE event_ts IS NOT NULL").all();
console.log(`Событий с event_ts: ${events.length}\n`);

for (const H of HORIZONS) {
  const buckets = new Map(); // ключ: type|prior
  for (const ev of events) {
    // look-ahead guard: событие должно уже отыграться (event_ts + H в прошлом)
    if (ev.event_ts + H * DAY > Date.now()) continue;
    const rCoin = fwdReturn(ev.coin_ref, ev.event_ts, H);
    const rBtc = fwdReturn(BTC, ev.event_ts, H);
    const key = `${ev.type}|${ev.direction_prior}`;
    if (!buckets.has(key)) buckets.set(key, { seen: 0, covered: 0, abn: [], prior: ev.direction_prior });
    const b = buckets.get(key);
    b.seen++;
    if (rCoin == null || rBtc == null) continue; // нет цены — в покрытие не идёт
    b.covered++;
    b.abn.push(rCoin - rBtc); // абнормал-ретёрн
  }

  console.log(`═══ Горизонт ${H}д ═══`);
  const rows = [...buckets.entries()].sort();
  for (const [key, b] of rows) {
    if (!b.covered) { console.log(`${key.padEnd(28)}  покрытие 0/${b.seen} — пропуск`); continue; }
    const arr = b.abn.slice().sort((a, z) => a - z);
    const mean = arr.reduce((a, z) => a + z, 0) / arr.length;
    const med = arr[Math.floor(arr.length / 2)];
    const sign = priorSign[b.prior] ?? 0;
    const hit = sign === 0 ? null
      : arr.filter((x) => Math.sign(x) === sign).length / arr.length;
    const pct = (x) => (x * 100).toFixed(1) + "%";
    console.log(
      `${key.padEnd(28)}  n=${b.covered}/${b.seen}` +
      `  средн.абн ${pct(mean)}  медиана ${pct(med)}` +
      (hit === null ? "  (прайор ambiguous)" : `  в сторону прайора ${(hit * 100).toFixed(0)}%`)
    );
  }
  console.log("");
}

console.log(
  "Читать так: если у типа с bullish-прайором средний абнормал уверенно > 0 при\n" +
  "приличном n и покрытии — сигнал есть. Низкое покрытие или n<~20 — статистики нет,\n" +
  "не переобучайся. spike_fade проверяй на КОРОТКОМ горизонте (памп-затем-фейд)."
);
