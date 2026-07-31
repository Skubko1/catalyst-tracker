// ЗАГЛУШКА (следующий узел). Ватчер заявок в SEC EDGAR: крипто-ETF (S-1, 19b-4,
// S-3, transfer agent). kind:"watcher" — real-time, с backfill по watermark.
//
// План реализации:
//  1. Поллить EDGAR full-text search (efts.sec.gov) по ключам issuer/тикер +
//     тип формы; ИЛИ RSS getcurrent для потока свежих филингов.
//  2. Обязательный свой User-Agent с контактом (config.HTTP_UA) — иначе SEC банит.
//  3. announce_ts = дата филинга. event_ts = уставной дедлайн решения
//     (окна ~45/90/240 дней от подачи) → форвардная дата считается из filing date.
//  4. Мапить эмитента/траст → coin (таблица соответствий issuer→тикер).
//  5. external_id = accession number филинга (стабилен, идеально для дедупа).
//  6. type: "etf_filing" на подаче, "etf_decision" на приближении дедлайна.
//
// Пока возвращает [] — чтобы раннер работал со всем набором детекторов сразу.
export const name = "edgar";
export const kind = "watcher";

export async function collect(/* { since } */) {
  return []; // TODO
}
