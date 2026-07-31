// Telegram-алерт. Если токен не задан — просто печатает в консоль (для дев-режима).
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

const ARROW = { bullish: "🟢", bearish: "🔴", spike_fade: "⚡", ambiguous: "⚪" };

export async function notify(text) {
  if (!TOKEN || !CHAT) { console.log("[notify]", text); return; }
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
  } catch (e) { console.error("[notify] ошибка:", e.message); }
}

// Красивый однострочник под событие
export function fmtEvent(ev) {
  const arrow = ARROW[ev.direction_prior] ?? "•";
  const when = ev.event_ts ? new Date(ev.event_ts).toISOString().slice(0, 10) : "?";
  const days = ev.event_ts ? Math.round((ev.event_ts - Date.now()) / 864e5) : null;
  const eta = days === null ? "" : days >= 0 ? ` · через ${days}д` : ` · ${-days}д назад`;
  return `${arrow} <b>${ev.coin ?? ev.coin_ref ?? "?"}</b> · ${ev.type} · T${ev.tier}\n` +
         `${when}${eta} · прайор: ${ev.direction_prior}\n` +
         (ev.source_url ? ev.source_url : ev.source ?? "");
}
