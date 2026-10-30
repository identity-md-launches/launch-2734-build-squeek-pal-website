// PalStore for the content script, popup and options page: reads chrome.storage,
// sends every change to the background worker.
import type { Action, Effects } from "../shared/game";
import { migrate, STORAGE_KEY, type SaveState } from "../shared/state";
import type { PalStore } from "../shared/store";

export async function chromeStore(): Promise<PalStore> {
  let state: SaveState | null = null;
  const subs = new Set<(s: SaveState) => void>();
  const got = await chrome.storage.local.get(STORAGE_KEY);
  if (got[STORAGE_KEY]) state = migrate(got[STORAGE_KEY], Date.now());

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_KEY]?.newValue) return;
    state = migrate(changes[STORAGE_KEY].newValue, Date.now());
    for (const fn of subs) fn(state);
  });

  const store: PalStore = {
    get: () => state,
    async dispatch(action: Action): Promise<Effects> {
      try {
        const fx = (await chrome.runtime.sendMessage({ type: "squeekpal:dispatch", action })) as Effects | undefined;
        const fresh = await chrome.storage.local.get(STORAGE_KEY);
        if (fresh[STORAGE_KEY]) {
          state = migrate(fresh[STORAGE_KEY], Date.now());
          for (const fn of subs) fn(state);
        }
        return fx ?? {};
      } catch {
        return {}; // extension reloaded or worker unavailable: the page keeps working
      }
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
  if (!state) await store.dispatch({ type: "tick" });
  return store;
}
