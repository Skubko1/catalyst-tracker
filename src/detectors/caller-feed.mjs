// ДЕТЕКТОР: коллы инфлюенсера. kind:"watcher".
// Смысл — НЕ верить скринам «x18», а честно измерить реализованный эдж: логируем
// каждый CA в момент публикации, а event-study гонит его вперёд по механическому
// правилу и считает hit-rate по ВСЕМ коллам, включая мёртвые (честный знаменатель).
//
// Источник — локальный append-only инбокс (config.CALLER_INBOX), куда твой скрапер
// кладёт по строке на сообщение: {"ts":<ms>,"caller":"...","text":"..."}.
// Скрапер (Telegram/твиттер) — отдельно; детектор только парсит CA из текста.
import { readFileSync, existsSync } from "node:fs";
import { CALLER_INBOX } from "../../config.mjs";
import { makeEvent } from "./_base.mjs";

export const name = "caller-feed";
export const kind = "watcher";

// EVM: 0x + ровно 40 hex (не заденет tx-хеши на 64 символа — граница слова).
const RE_EVM = /\b0x[a-fA-F0-9]{40}\b/g;
// Solana/base58: 32–44 символа алфавита base58. Может ловить лишнее в «грязном»
// тексте — приемлемо для соц-слоя Tier 3, дедуп и последующая цена отсеют мусор.
const RE_SOL = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

// Достаём уникальные CA из одного сообщения. НАМЕРЕННО не парсим «entry mc»
// из текста — это самоотчёт коллера (часто пик), ровно то враньё, что мы измеряем.
export function extractCAs(text) {
  if (!text) return [];
  const out = new Map(); // ca_norm → { ca, chain, coin_ref }
  for (const m of text.matchAll(RE_EVM)) {
    const ca = m[0], norm = ca.toLowerCase();
    out.set(norm, { ca, chain: "evm", coin_ref: `evm:${norm}` }); // какой EVM-чейн — неизвестно, резолвится ценой
  }
  for (const m of text.matchAll(RE_SOL)) {
    const ca = m[0];
    if (ca.startsWith("0x")) continue;              // уже покрыто EVM-веткой
    if (out.has(ca)) continue;
    out.set(ca, { ca, chain: "solana", coin_ref: `solana:${ca}` });
  }
  return [...out.values()];
}

export async function collect({ since = 0 } = {}) {
  if (!existsSync(CALLER_INBOX)) return [];
  const lines = readFileSync(CALLER_INBOX, "utf8").split("\n").filter(Boolean);
  const events = [];
  for (const line of lines) {
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    const ts = msg.ts ?? msg.timestamp;
    if (!ts || ts <= since) continue;               // только новое (watermark/бэкфилл)
    const caller = msg.caller ?? "unknown";
    for (const { ca, coin_ref } of extractCAs(msg.text)) {
      events.push(makeEvent({
        detector: name,
        // ОДИН event на (коллер, токен): дедуп по caller:ca оставит ПЕРВЫЙ колл —
        // именно его timestamp и есть точка входа для измерения.
        external_id: `${caller}:${coin_ref}`,
        type: "caller_call",
        coin: null, coin_ref,
        announce_ts: ts, event_ts: ts,             // колл = событие; форвард считаем отсюда
        source: caller, source_url: msg.url ?? null,
        raw: { caller, ca, snippet: String(msg.text).slice(0, 200) },
        // mcap_at_announce НЕ из текста — заполнит прайс-энричер (истинный MC на дату)
      }));
    }
  }
  return events;
}

// ── CLI: оффлайн-selftest парсера CA (без сети, БД и инбокса) ──────
if (process.argv[1]?.endsWith("caller-feed.mjs") && process.argv.includes("--selftest")) {
  const cases = [
    ["aped some here 1.2m 0x92d1f7e25590869cc648af1032773023bfb5a4e1", 1, "evm"],
    ["infinity glitch $CAT 0xC05e0E564C9292ABdb52f843ACedb093b78b0f45 first v2", 1, "evm"],
    ["gamble https://gmgn.ai/eth/token/0x439f40d8651080175e071bbe1dc4c292dcad7c1a soon", 1, "evm"],
    ["no ca here, just gm and hopium", 0, null],
    ["tx 0xfd620223b3bf51538898ea28973f0a0f184c0d68eba85c2ec5a11a652431744b (64hex, не CA)", 0, null],
  ];
  let ok = true;
  for (const [text, expect, chain] of cases) {
    const cas = extractCAs(text);
    const pass = cas.length === expect && (expect === 0 || cas[0].chain === chain);
    if (!pass) ok = false;
    console.log(`${pass ? "✅" : "❌"} [${cas.length}/${expect}] ${cas[0]?.chain ?? "—"}  «${text.slice(0, 45)}…»`);
  }
  console.log(ok ? "\n✅ selftest OK" : "\n❌ selftest провален");
  if (!ok) process.exit(1);
}
