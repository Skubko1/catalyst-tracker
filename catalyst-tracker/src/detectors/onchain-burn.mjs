// ЗАГЛУШКА (узел Tier 2). Ончейн-детектор buyback/burn. kind:"watcher".
// Ловим НЕ пресс-релиз, а транзакцию — событие с ончейн-пруфом (tx hash).
//
// План реализации:
//  1. Конфиг: список отслеживаемых токенов → { chain, token_addr, burn_addr,
//     treasury_addr }. (Injective buyback/burn ловится именно так.)
//  2. Через RPC (config.ETH_RPC / SOLANA_RPC) поллить Transfer-события на
//     burn-адрес / активность treasury-контракта с последнего блока (watermark).
//  3. onchain_proof = tx hash; announce_ts = event_ts = время блока.
//  4. external_id = txHash:logIndex (стабилен, дедуп бесплатный).
//  5. type: "burn" или "buyback"; прайор bullish (сток предложения).
//  6. Исторический бэкфилл — разово через Dune/Flipside (SQL по чейну),
//     затем живой поллинг только с текущего блока.
//
// Пока возвращает [] — интерфейс совпадает с рабочими детекторами.
export const name = "onchain-burn";
export const kind = "watcher";

export async function collect(/* { since } */) {
  return []; // TODO
}
