// ЭТАЛОННЫЙ ДЕТЕКТОР: токен-разлоки (вестинг). Тип "unlock", прайор bearish.
// kind:"calendar" — stateless: пересобирает форвардный список будущих разлоков
// из источника при каждом проходе. Даунтайм не страшен (нечего терять).
//
// ⚠️ Форму ответа DefiLlama нельзя было проверить вживую при сборке (нет сети).
// Маппинг полей ниже — по известной структуре emissions; сверь одним `--inspect`
// и, если имена полей отличаются, поправь ТОЛЬКО mapProtocol(). Логика нормализации
// (makeEvent, дедуп, event-study) от этого не зависит.
import { SOURCES } from "../../config.mjs";
import { fetchJson, makeEvent } from "./_base.mjs";

export const name = "unlocks";
export const kind = "calendar";

// Превращаем одну запись протокола из DefiLlama в 0..N будущих событий-разлоков.
// Ожидаемая (проверить!) форма: { token, name, gecko_id, mcap,
//   events: [{ timestamp, noOfTokens, unlockType, description }, ...] }
function mapProtocol(p, now) {
  const coin = p.token ?? p.symbol ?? p.name ?? null;
  const coin_ref = p.gecko_id ? `coingecko:${p.gecko_id}` : (p.token ?? null);
  const events = Array.isArray(p.events) ? p.events : [];
  return events
    .map((e) => {
      // timestamp у DefiLlama обычно в СЕКУНДАХ — нормализуем в мс
      const tsRaw = e.timestamp ?? e.date ?? null;
      if (tsRaw == null) return null;
      const event_ts = tsRaw < 1e12 ? tsRaw * 1000 : tsRaw;
      if (event_ts <= now) return null;            // только будущее — это календарь
      const tokens = Array.isArray(e.noOfTokens) ? e.noOfTokens.reduce((a, b) => a + b, 0)
                   : (e.noOfTokens ?? e.amount ?? null);
      return makeEvent({
        detector: name,
        // стабильный id для дедупа: протокол + метка события
        external_id: `${coin_ref ?? coin}:${event_ts}:${e.unlockType ?? e.category ?? "unlock"}`,
        type: "unlock",
        coin, coin_ref,
        announce_ts: now,       // расписание публично сейчас
        event_ts,
        source: "defillama",
        source_url: coin ? `https://defillama.com/unlocks/${encodeURIComponent(coin)}` : null,
        mcap_at_announce: p.mcap ?? null,
        raw: { tokens, unlockType: e.unlockType ?? e.category ?? null, desc: e.description ?? null },
      });
    })
    .filter(Boolean);
}

export async function collect() {
  const now = Date.now();
  try {
    const data = await fetchJson(SOURCES.unlocks_defillama);
    const list = Array.isArray(data) ? data : (data?.protocols ?? []);
    return list.flatMap((p) => mapProtocol(p, now));
  } catch (e) {
    if (String(e.message).includes("402"))
      console.warn("[unlocks] DefiLlama закрыл emissions за Pro ($300/мес) — разлоки без бесплатного источника, пропускаю. Прогон это не роняет. См. README.");
    else
      console.warn("[unlocks] источник недоступен, пропускаю:", e.message);
    return []; // мягкий выход: прогон остаётся зелёным, другие детекторы работают
  }
}

// ── CLI-режимы для отладки ────────────────────────────────────────
const isMain = process.argv[1]?.endsWith("unlocks.mjs");

if (isMain && process.argv.includes("--inspect")) {
  // Показать сырую форму ответа, чтобы сверить имена полей
  const data = await fetchJson(SOURCES.unlocks_defillama);
  const list = Array.isArray(data) ? data : (data?.protocols ?? []);
  console.log("записей:", list.length);
  console.log("пример[0]:", JSON.stringify(list[0], null, 2).slice(0, 1200));
}

if (isMain && process.argv.includes("--selftest")) {
  // Оффлайн-проверка парсера на канонном примере (без сети и без БД)
  const sample = [{
    token: "EXMPL", name: "Example", gecko_id: "example", mcap: 123_000_000,
    events: [
      { timestamp: Math.floor((Date.now() + 7 * 864e5) / 1000), noOfTokens: [1_000_000], unlockType: "cliff", description: "team" },
      { timestamp: Math.floor((Date.now() - 3 * 864e5) / 1000), noOfTokens: [500_000], unlockType: "linear", description: "прошлое — должно отсеяться" },
    ],
  }];
  const out = sample.flatMap((p) => mapProtocol(p, Date.now()));
  console.log("нормализовано событий:", out.length, "(ожидаем 1 — прошлое отфильтровано)");
  console.log(JSON.stringify(out, null, 2));
  if (out.length !== 1) { console.error("❌ selftest провален"); process.exit(1); }
  console.log("✅ selftest OK");
}
