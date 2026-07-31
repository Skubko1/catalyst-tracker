// Реестр детекторов. Новый детектор = один импорт сюда, интерфейс единый:
//   export const name, kind ("calendar"|"watcher"), async collect({ since })
import * as unlocks from "./detectors/unlocks.mjs";
import * as edgar from "./detectors/edgar.mjs";
import * as onchainBurn from "./detectors/onchain-burn.mjs";

export const DETECTORS = [unlocks, edgar, onchainBurn];
export const calendars = DETECTORS.filter((d) => d.kind === "calendar");
export const watchers = DETECTORS.filter((d) => d.kind === "watcher");
