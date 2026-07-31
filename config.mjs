// Центральный конфиг. Всё, что хочется крутить, живёт здесь.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DB_PATH = join(__dirname, "data", "catalysts.db");

// ── Тип события → априор направления ──────────────────────────────
// Прайор зашит в ТИП, а не угадывается по факту. Без этого event-study
// смешает бычьи и медвежьи катализаторы в кашу и покажет "нет сигнала".
//   bullish     — сток предложения / приток спроса (buyback, burn, крупная интеграция)
//   bearish     — навес предложения (разлок/вестинг)
//   spike_fade  — резкий памп и типичный sell-the-news (листинг на бирже)
//   ambiguous   — исход неоднозначен, часто priced-in (одобрение ETF, суд)
export const DIRECTION_PRIOR = {
  unlock:        "bearish",
  etf_filing:    "bullish",     // сама подача — ожидание; отыгрывается в окне до решения
  etf_decision:  "ambiguous",   // решение — часто sell-the-news
  governance:    "bullish",     // предложение с датой (апгрейд/параметры)
  buyback:       "bullish",
  burn:          "bullish",
  listing:       "spike_fade",
  integration:   "bullish",
  regulatory:    "ambiguous",
};

// ── Тир источника: чем ближе к ончейн-правде, тем ниже false-positive ──
//   1 — датировано и структурировано (разлоки, EDGAR-дедлайны, governance)
//   2 — событийно/полуструктурировано (buyback/burn ончейн, листинги, интеграции)
//   3 — соц/PR (шум, только подтверждающий слой; ядро на нём не строим)
export const TIER_BY_TYPE = {
  unlock: 1, etf_filing: 1, etf_decision: 1, governance: 1,
  buyback: 2, burn: 2, listing: 2, integration: 2, regulatory: 2,
};

// ── Источники (по КАТЕГОРИИ; точные эндпоинты/лимиты/тарифы меняются — ─────
// сверяйся с актуальной докой при сборке; ребренды вроде TokenUnlocks→Tokenomist)
export const SOURCES = {
  unlocks_defillama: "https://api.llama.fi/emissions",
  edgar_fulltext:    "https://efts.sec.gov/LATEST/search-index?q=", // full-text search API
  edgar_rss:         "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent",
  coingecko:         "https://api.coingecko.com/api/v3",
};

// ── Ватчеры: как далеко назад дотягивать при рестарте (backfill-on-restart) ──
export const BACKFILL_MAX_DAYS = 14;

// SEC требует свой User-Agent с контактом, иначе банит. Подставь свой.
export const HTTP_UA = "catalyst-tracker/0.1 (contact: you@example.com)";
