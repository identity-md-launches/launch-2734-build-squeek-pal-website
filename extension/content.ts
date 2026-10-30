// Content script on x.com / twitter.com. Mounts the pal and, if allowed, places chests.
// It reads only visible post text, locally, and never clicks, posts, likes or follows.
import { startChestPlacer } from "../shared/chests";
import { detectXTheme } from "../shared/ui";
import { mountWidget } from "../shared/widget";
import { chromeStore } from "./chromeStore";

const pageKey = () => location.pathname.replace(/\/+$/, "") || "/";

async function main() {
  if (document.querySelector("[data-squeekpal]")) return;
  const store = await chromeStore();
  const widget = mountWidget({ store, container: document.body, pageKey, theme: () => detectXTheme(document) });

  let stopChests: (() => void) | null = null;
  const syncChests = () => {
    const on = store.get()?.settings.chestsOn ?? true;
    if (on && !stopChests) {
      try {
        stopChests = startChestPlacer({ store, root: document.body, onOpened: (fx) => widget.toast(fx) });
      } catch {
        stopChests = null; // chests are optional; the pal keeps working
      }
    } else if (!on && stopChests) {
      stopChests();
      stopChests = null;
      document.querySelectorAll("[data-squeekpal-chest]").forEach((el) => el.remove());
    }
  };
  syncChests();
  store.subscribe(syncChests);

  // Tell the worker an x.com tab is open and visible (Seeds from running need one).
  const beat = () => {
    if (!document.hidden) void store.dispatch({ type: "heartbeat" });
  };
  beat();
  setInterval(beat, 30_000);
  document.addEventListener("visibilitychange", beat);
}

void main();
