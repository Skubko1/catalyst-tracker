// Центральный конфиг. Всё, что хочется крутить, живёт здесь.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DB_PATH = join(__dirname, "data", "catalysts.db");

// Инбокс коллера: append-only JSONL, куда твой скрапер (Telegram/твиттер) кладёт
// по строке на сообщение: {"ts":<ms>,"caller":"watisdes","text":"aped 0x..."}.
// Детектор caller-feed только ПОТРЕБЛЯЕТ его — скрапер строишь отдельно.
export const CALLER_INBOX = join(__dirname, "data", "caller-inbox.jsonl");

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
  // Колл инфлюенсера — неявный buy-сигнал. Прайор bullish, чтобы event-study
  // дал hit-rate («% коллов, обошедших BTC») — число, которое фальсифицирует
  // «100x альфу». Хочешь агностично — поставь "ambiguous" (тогда только средн./медиана).
  caller_call:   "bullish",
};

// ── Тир источника: чем ближе к ончейн-правде, тем ниже false-positive ──
//   1 — датировано и структурировано (разлоки, EDGAR-дедлайны, governance)
//   2 — событийно/полуструктурировано (buyback/burn ончейн, листинги, интеграции)
//   3 — соц/PR (шум, только подтверждающий слой; ядро на нём не строим)
export const TIER_BY_TYPE = {
  unlock: 1, etf_filing: 1, etf_decision: 1, governance: 1,
  buyback: 2, burn: 2, listing: 2, integration: 2, regulatory: 2,
  caller_call: 3, // соц/PR — шумный слой, ценен только после честного замера
};

// ── Источники (по КАТЕГОРИИ; точные эндпоинты/лимиты/тарифы меняются) ──────
export const SOURCES = {
  // ВНИМАНИЕ: DefiLlama закрыл emissions/unlocks за Pro ($300/мес) — этот эндпоинт
  // теперь отдаёт HTTP 402. Бесплатного публичного пути под разлоки на данный
  // момент нет; детектор unlocks мягко выключен (лог + пустой результат), пока
  // не найдём открытый источник. Прогон при этом остаётся зелёным.
  unlocks_defillama: "https://api.llama.fi/emissions",
  coingecko:         "https://api.coingecko.com/api/v3",
};

// ── EDGAR (SEC full-text search): бесплатно, без ключа, гос. ───────────────
// Проверено: https://efts.sec.gov/LATEST/search-index отвечает JSON без авторизации.
export const EDGAR_ENDPOINT = "https://efts.sec.gov/LATEST/search-index";
// Формы, релевантные запуску крипто-ETF (регистрация продукта / листинг на бирже)
export const EDGAR_FORMS = "S-1,19b-4,S-3,424B4,N-1A";
// Запросы по активам: каждый тегируется своим coin_ref, чтобы event-study
// потом смог сопоставить заявку с ценой базового актива. Правь/дополняй список.
export const EDGAR_QUERIES = [
  { asset: "BTC", coin_ref: "coingecko:bitcoin",  q: '"spot bitcoin" ETF' },
  { asset: "ETH", coin_ref: "coingecko:ethereum", q: '"spot ethereum" ETF' },
  { asset: "SOL", coin_ref: "coingecko:solana",   q: '"spot solana" ETF' },
  { asset: "XRP", coin_ref: "coingecko:ripple",   q: '"spot XRP" ETF' },
  { asset: "DOGE", coin_ref: "coingecko:dogecoin", q: '"spot dogecoin" ETF' },
];

// ── Ватчеры: как далеко назад дотягивать при рестарте (backfill-on-restart) ──
export const BACKFILL_MAX_DAYS = 14;

// SEC требует свой User-Agent с контактом, иначе банит. Подставь свой.
export const HTTP_UA = "catalyst-tracker/0.1 (contact: you@example.com)";
