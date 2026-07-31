// Общее для всех детекторов: сетевой хелпер и фабрика нормализованного события.
import { DIRECTION_PRIOR, TIER_BY_TYPE, HTTP_UA } from "../../config.mjs";

// fetch с таймаутом и парой ретраев. Node 20+ имеет глобальный fetch.
export async function fetchJson(url, { tries = 3, timeoutMs = 15000, headers = {} } = {}) {
  for (let i = 1; i <= tries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": HTTP_UA, ...headers } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === tries) throw e;
      await new Promise((res) => setTimeout(res, 1000 * i));
    } finally { clearTimeout(t); }
  }
}

// Единая фабрика события. Тир и априор направления НЕ передаются руками —
// они детерминированы типом (см. config), чтобы разметка была консистентной.
export function makeEvent({ detector, external_id, type, coin, coin_ref,
                            announce_ts, event_ts, source, source_url,
                            onchain_proof, mcap_at_announce, raw }) {
  if (!detector || !external_id || !type) throw new Error("makeEvent: detector/external_id/type обязательны");
  const tier = TIER_BY_TYPE[type];
  const direction_prior = DIRECTION_PRIOR[type];
  if (tier === undefined || direction_prior === undefined)
    throw new Error(`makeEvent: неизвестный тип "${type}" — добавь его в config (TIER_BY_TYPE + DIRECTION_PRIOR)`);
  return {
    detector, external_id, type, tier, direction_prior,
    coin: coin ?? null, coin_ref: coin_ref ?? null,
    announce_ts: announce_ts ?? null, event_ts: event_ts ?? null,
    source: source ?? null, source_url: source_url ?? null,
    onchain_proof: onchain_proof ?? null, mcap_at_announce: mcap_at_announce ?? null,
    raw: raw ?? null,
  };
}
