// ДЕТЕКТОР: заявки в SEC EDGAR на крипто-ETF. kind:"watcher".
// Источник — гос. full-text search (efts.sec.gov): бесплатно, без ключа, стабильно.
// Проверено живьём — отвечает JSON. Ловим свежие филинги (S-1/19b-4/…), где
// упоминается spot-ETF по конкретному активу; каждый тегируется coin_ref актива,
// чтобы event-study мог сопоставить заявку с ценой.
//
// v1: event_ts = дата филинга (announce). Уставной дедлайн решения (форвардное
// окно 45/90/240 дней) — TODO: считается из даты подачи 19b-4 после публикации
// в Federal Register. Пока меряем forward-доходность от даты подачи — это тоже
// валидный сигнал (предсказывает ли ETF-заявка избыточную доходность актива).
import { EDGAR_ENDPOINT, EDGAR_FORMS, EDGAR_QUERIES } from "../../config.mjs";
import { fetchJson, makeEvent } from "./_base.mjs";

export const name = "edgar";
export const kind = "watcher";

const ymd = (ts) => new Date(ts).toISOString().slice(0, 10); // ms → "YYYY-MM-DD"

// Один hit EFTS → нормализованное событие (или null).
function mapHit(hit, asset, coin_ref) {
  const s = hit._source ?? {};
  const fileDate = s.file_date; // "2026-07-15"
  const announce_ts = fileDate ? Date.parse(fileDate + "T00:00:00Z") : null;
  if (!announce_ts) return null;

  // Ссылка на сам филинг из _id ("accession:doc") + cik
  const [acc, doc] = String(hit._id ?? "").split(":");
  const accNo = (acc ?? "").replace(/-/g, "");
  const cik = String(s.ciks?.[0] ?? "").replace(/^0+/, "");
  const source_url = cik && accNo && doc
    ? `https://www.sec.gov/Archives/edgar/data/${cik}/${accNo}/${doc}`
    : "https://efts.sec.gov/LATEST/search-index";

  return makeEvent({
    detector: name,
    external_id: hit._id,                 // accession:doc — стабилен, уникален
    type: "etf_filing",
    coin: asset, coin_ref,
    announce_ts, event_ts: announce_ts,   // TODO: заменить на дедлайн решения
    source: "sec-edgar", source_url,
    raw: { form: s.root_forms ?? s.file_type ?? null, names: s.display_names ?? null, id: hit._id },
  });
}

async function queryEdgar(q, forms, startdt, enddt) {
  const url = `${EDGAR_ENDPOINT}?q=${encodeURIComponent(q)}&forms=${encodeURIComponent(forms)}`
            + `&dateRange=custom&startdt=${startdt}&enddt=${enddt}&sort=desc`;
  const data = await fetchJson(url, { headers: { accept: "application/json" } });
  return data?.hits?.hits ?? [];
}

export async function collect({ since = 0 } = {}) {
  const enddt = ymd(Date.now());
  const startdt = ymd(since || Date.now() - 14 * 864e5); // окно с watermark (или 14д назад)
  const out = [];
  for (const { asset, coin_ref, q } of EDGAR_QUERIES) {
    try {
      const hits = await queryEdgar(q, EDGAR_FORMS, startdt, enddt);
      for (const h of hits) { const ev = mapHit(h, asset, coin_ref); if (ev) out.push(ev); }
      await new Promise((r) => setTimeout(r, 300)); // вежливо к SEC (<10 req/s)
    } catch (e) {
      console.warn(`[edgar] ${asset}: ${e.message}`);
    }
  }
  return out;
}

// ── CLI: оффлайн-selftest маппера (без сети) ──────────────────────
if (process.argv[1]?.endsWith("edgar.mjs") && process.argv.includes("--selftest")) {
  const hit = {
    _id: "0001213900-26-012345:ea01-s1_ishares.htm",
    _source: { file_date: "2026-07-15", ciks: ["0001213900"], root_forms: "S-1",
               display_names: ["iShares Spot Bitcoin Trust (CIK 0001213900)"] },
  };
  const ev = mapHit(hit, "BTC", "coingecko:bitcoin");
  console.log(JSON.stringify(ev, null, 2));
  const ok = ev && ev.type === "etf_filing" && ev.direction_prior === "bullish" && ev.tier === 1
    && ev.coin_ref === "coingecko:bitcoin" && ev.source_url.includes("/edgar/data/1213900/");
  console.log(ok ? "\nOK selftest прошёл" : "\nFAIL selftest");
  if (!ok) process.exit(1);
}
