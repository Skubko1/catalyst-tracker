// Крон-вход REAL-TIME слоя (запускай часто, напр. каждые 2–5 мин).
// С backfill-on-restart: каждый ватчер дотягивает пропуск с последнего
// виденного timestamp. Пропущенный филинг = дыра в размеченном датасете,
// а дыры в лейблах хуже пропущенной сделки — поэтому догон обязателен.
// (Прямой аналог gapCandles из мем-ботов.)
import { initSchema, upsertMany, getWatermark, setWatermark } from "./db.mjs";
import { watchers } from "./registry.mjs";
import { notify, fmtEvent } from "./notify.mjs";
import { BACKFILL_MAX_DAYS } from "../config.mjs";

initSchema();

for (const det of watchers) {
  try {
    const floor = Date.now() - BACKFILL_MAX_DAYS * 864e5;
    const since = Math.max(getWatermark(det.name), floor);
    const events = await det.collect({ since });
    if (!events.length) { console.log(`[${det.name}] новых событий нет`); continue; }

    const flags = upsertMany(events);
    const fresh = events.filter((_, i) => flags[i]);
    for (const ev of fresh) await notify(fmtEvent(ev));

    // Сдвигаем watermark на максимальный виденный announce_ts (не event_ts:
    // watermark — это «докуда прочитали ленту источника»)
    const maxTs = Math.max(...events.map((e) => e.announce_ts ?? 0), since);
    setWatermark(det.name, maxTs);
    console.log(`[${det.name}] всего ${events.length}, новых ${fresh.length}, watermark→${new Date(maxTs).toISOString()}`);
  } catch (e) {
    console.error(`[${det.name}] ошибка:`, e.message);
  }
}
