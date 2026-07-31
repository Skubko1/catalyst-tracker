// Крон-вход КАЛЕНДАРНОГО слоя (запускай, скажем, раз в час).
// Stateless: пересобирает будущие датированные события. Даунтайм безопасен.
import { initSchema, upsertMany, upcoming } from "./db.mjs";
import { calendars } from "./registry.mjs";
import { notify, fmtEvent } from "./notify.mjs";

initSchema();

let totalNew = 0;
for (const det of calendars) {
  try {
    const events = await det.collect();
    const flags = upsertMany(events);
    const fresh = events.filter((_, i) => flags[i]);
    totalNew += fresh.length;
    console.log(`[${det.name}] собрано ${events.length}, новых ${fresh.length}`);
    // Алертим только про ближние новые события (шум дальних отсекаем)
    for (const ev of fresh) {
      if (ev.event_ts && ev.event_ts - Date.now() < 14 * 864e5) await notify(fmtEvent(ev));
    }
  } catch (e) {
    console.error(`[${det.name}] ошибка:`, e.message);
  }
}

const soon = upcoming(30);
console.log(`\nИтого новых: ${totalNew}. В календаре на 30 дней вперёд: ${soon.length} событий.`);
