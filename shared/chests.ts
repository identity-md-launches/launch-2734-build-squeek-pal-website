// Watches posts scroll into view and places chests in their action row.
// Reads visible post text locally; never clicks, posts, likes or follows.
import { drawChest } from "./art";
import type { Effects } from "./game";
import { t } from "./i18n";
import { mentionsSqueekchain } from "./rules";
import { actionRow, findTweets, tweetText } from "./selectors";
import type { PendingChest } from "./state";
import type { PalStore } from "./store";

export interface PlacerOptions {
  store: PalStore;
  root: ParentNode;
  /** element whose scrolling reveals posts; null means the viewport */
  scrollRoot?: Element | null;
  onOpened: (fx: Effects) => void;
}

const CHEST_CSS = `
:host { display: inline-flex; align-items: center; margin-inline-start: 4px; }
button { all: unset; box-sizing: border-box; display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 999px; cursor: pointer; }
button:hover { background: rgb(242 194 48 / 0.18); }
button:focus-visible { outline: 2px solid #1d9bf0; outline-offset: 1px; }
canvas { width: 24px; height: 18px; image-rendering: pixelated; }
@media (prefers-reduced-motion: no-preference) {
  button { animation: pop 300ms cubic-bezier(0.2, 0, 0, 1); }
  @keyframes pop { from { scale: 0.25; opacity: 0; } to { scale: 1; opacity: 1; } }
}`;

export function chestButton(doc: Document, chest: PendingChest, label: string, onClick: () => void): HTMLElement {
  const host = doc.createElement("span");
  host.setAttribute("data-squeekpal-chest", chest.id);
  const shadow = host.attachShadow({ mode: "open" });
  const style = doc.createElement("style");
  style.textContent = CHEST_CSS;
  const btn = doc.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-label", label);
  btn.title = label;
  const c = doc.createElement("canvas");
  c.width = 12;
  c.height = 9;
  drawChest(c.getContext("2d")!, chest.kind, 1, 1);
  btn.append(c);
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation(); // keep X from opening the post
    onClick();
  });
  shadow.append(style, btn);
  return host;
}

export function startChestPlacer(opts: PlacerOptions): () => void {
  const seen = new WeakSet<Element>();
  const doc = (opts.root as Node).ownerDocument ?? (opts.root as Document);
  let stopped = false;

  const place = (tweet: Element, chest: PendingChest) => {
    const row = actionRow(tweet);
    if (!row) return; // markup changed: the chest waits in the pal's panel instead
    const lang = opts.store.get()?.settings.lang ?? "en";
    const label = t(lang, chest.kind === "golden" ? "act.openGolden" : "act.openChest");
    const btn = chestButton(doc, chest, label, async () => {
      btn.remove();
      const fx = await opts.store.dispatch({ type: "openChest", id: chest.id });
      opts.onOpened(fx);
    });
    row.append(btn);
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting || seen.has(en.target)) continue;
        seen.add(en.target);
        io.unobserve(en.target);
        const tweet = en.target;
        let mention = false;
        try {
          mention = mentionsSqueekchain(tweetText(tweet));
        } catch {
          mention = false;
        }
        opts.store
          .dispatch({ type: "tweetSeen", mention })
          .then((fx) => {
            if (!stopped && fx.chest) place(tweet, fx.chest);
          })
          .catch(() => {});
      }
    },
    { root: opts.scrollRoot ?? null, threshold: 0.6 },
  );

  const scan = () => {
    try {
      for (const tw of findTweets(opts.root)) if (!seen.has(tw)) io.observe(tw);
    } catch {
      /* selectors broke: no chests, nothing else affected */
    }
  };
  let pending = 0;
  const mo = new MutationObserver(() => {
    if (pending) return;
    pending = window.setTimeout(() => {
      pending = 0;
      scan();
    }, 400);
  });
  mo.observe(opts.root as Node, { childList: true, subtree: true });
  scan();

  return () => {
    stopped = true;
    io.disconnect();
    mo.disconnect();
    clearTimeout(pending);
  };
}
