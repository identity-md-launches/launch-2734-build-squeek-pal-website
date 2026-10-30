// The pal on the page: a draggable pixel hamster in its own Shadow DOM root,
// so the host page's CSS never reaches it. Same code on x.com and in the website demo.
import { drawPal, SPRITE_H, SPRITE_W, type Pose } from "./art";
import type { Effects } from "./game";
import { t, type Key } from "./i18n";
import { mood, wheelMode } from "./rules";
import type { SaveState } from "./state";
import type { PalStore } from "./store";
import { esc, liveStrip, statBars, THEME_CSS, type Theme } from "./ui";

const SCALE = 3;

const CSS = `${THEME_CSS}
:host { all: initial; position: fixed; z-index: 2147483000; inset-inline-end: 16px; inset-block-end: 16px; font: 400 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif; color: var(--sp-fg); }
:host([data-contained]) { position: absolute; z-index: 5; }
* { box-sizing: border-box; }
p, h2, dl, dd { margin: 0; }
button { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--sp-focus); outline-offset: 2px; }
.pal { display: block; padding: 0; border: 0; background: transparent; cursor: grab; touch-action: none; }
.pal canvas { display: block; inline-size: ${SPRITE_W * SCALE}px; block-size: ${SPRITE_H * SCALE}px; image-rendering: pixelated; }
.pal:active { cursor: grabbing; }
.bubble { display: none; inline-size: 24px; block-size: 24px; border-radius: 50%; border: 0; padding: 0; background: var(--sp-accent); box-shadow: var(--sp-shadow); cursor: pointer; position: relative; }
.bubble::after { content: ""; position: absolute; inset: -10px; }
.bubble canvas { inline-size: 16px; block-size: 14px; image-rendering: pixelated; display: block; margin: auto; }
:host([data-min]) .pal, :host([data-min]) .panel { display: none; }
:host([data-min]) .bubble { display: grid; place-items: center; }
.panel { position: absolute; inset-block-end: calc(100% + 8px); inset-inline-end: 0; inline-size: min(300px, calc(100vw - 32px)); padding: 12px; border-radius: 16px; background: var(--sp-bg); box-shadow: var(--sp-shadow); display: grid; gap: 12px; max-block-size: min(calc(100vh - 140px), 520px); overflow-y: auto; overscroll-behavior: contain; }
:host([data-contained]) .panel { max-block-size: calc(min(70vh, 640px) - 110px); }
.panel[hidden] { display: none; }
.head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.name { font-size: 16px; font-weight: 600; }
.small { font-size: 12px; color: var(--sp-muted); }
.row { display: flex; flex-wrap: wrap; gap: 8px; }
.btn { min-block-size: 36px; padding: 6px 12px; border-radius: 10px; border: 1px solid var(--sp-line); background: var(--sp-surface); cursor: pointer; transition: scale 150ms cubic-bezier(0.2, 0, 0, 1); }
.btn:active { scale: 0.96; }
.btn.primary { background: var(--sp-accent); color: var(--sp-accent-fg); border-color: transparent; font-weight: 600; }
.link { min-block-size: 32px; padding: 4px 8px; border: 0; background: transparent; color: var(--sp-muted); text-decoration: underline; cursor: pointer; }
.sp-stats { display: grid; gap: 4px; }
.sp-stat { display: grid; grid-template-columns: 84px 1fr; align-items: center; gap: 8px; font-size: 12px; }
.sp-stat dt { color: var(--sp-muted); }
.sp-stat dd { display: flex; align-items: center; gap: 6px; }
.sp-bar { flex: 1; block-size: 6px; border-radius: 3px; background: var(--sp-line); overflow: hidden; }
.sp-bar > span { display: block; block-size: 100%; background: var(--sp-good); }
.sp-bar > span.low { background: var(--sp-warn); }
.sp-num { inline-size: 3ch; text-align: end; font-variant-numeric: tabular-nums; }
.sp-live { padding: 8px 10px; border-radius: 10px; background: var(--sp-surface); display: grid; gap: 4px; font-size: 12px; }
.sp-live-title { font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.sp-dot { inline-size: 8px; block-size: 8px; border-radius: 50%; background: var(--sp-muted); }
.sp-live-running .sp-dot { background: var(--sp-good); }
.sp-live-offline .sp-dot { background: var(--sp-warn); }
.sp-live-nums { display: flex; flex-wrap: wrap; gap: 2px 12px; font-variant-numeric: tabular-nums; }
.sp-live-nums dt { color: var(--sp-muted); }
.sp-small { font-size: 12px; color: var(--sp-muted); }
.sp-fest { font-weight: 600; color: var(--sp-warn); }
.toast { position: absolute; inset-block-end: 8px; inset-inline-end: calc(100% + 8px); inline-size: max-content; max-inline-size: min(240px, calc(100vw - 140px)); padding: 6px 10px; border-radius: 10px; background: var(--sp-fg); color: var(--sp-bg); font-size: 12px; white-space: normal; pointer-events: none; opacity: 0; transition: opacity 150ms ease-out; }
.toast.on { opacity: 1; }
.sr { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
`;

export interface WidgetOptions {
  store: PalStore;
  /** where to mount; document.body on x.com, the demo frame on the website */
  container: HTMLElement;
  contained?: boolean;
  pageKey: () => string;
  theme: () => Theme;
}

export interface Widget {
  toast(fx: Effects): void;
  destroy(): void;
}

export function mountWidget(opts: WidgetOptions): Widget {
  const doc = opts.container.ownerDocument;
  const host = doc.createElement("div");
  host.setAttribute("data-squeekpal", "");
  if (opts.contained) host.setAttribute("data-contained", "");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>${CSS}</style>
    <div class="toast" aria-hidden="true"></div>
    <p class="sr" role="status"></p>
    <section class="panel" hidden></section>
    <button class="pal" type="button" aria-expanded="false"><canvas width="${SPRITE_W * SCALE}" height="${SPRITE_H * SCALE}"></canvas></button>
    <button class="bubble" type="button"><canvas width="${16 * 2}" height="${14 * 2}"></canvas></button>`;
  opts.container.append(host);

  const palBtn = shadow.querySelector<HTMLButtonElement>(".pal")!;
  const bubble = shadow.querySelector<HTMLButtonElement>(".bubble")!;
  const panel = shadow.querySelector<HTMLElement>(".panel")!;
  const toastEl = shadow.querySelector<HTMLElement>(".toast")!;
  const live = shadow.querySelector<HTMLElement>(".sr")!;
  const ctx = palBtn.querySelector("canvas")!.getContext("2d")!;
  const bctx = bubble.querySelector("canvas")!.getContext("2d")!;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  let frame = 0;
  let walkX = 6;
  let dir = 1;
  let eatUntil = 0;
  let lastState: SaveState | null = null;

  const pose = (s: SaveState, now: number): Pose => {
    if (now < eatUntil) return "eat";
    const mode = wheelMode(s.sync, now);
    if (mode === "running") return "run";
    if (mode === "idle" || s.pet.stats.energy < 20) return "nap";
    if (reduced.matches) return "sit";
    return Math.floor(frame / 24) % 3 === 2 ? "sit" : "walk";
  };

  const draw = () => {
    const s = store.get();
    if (!s) return;
    const now = Date.now();
    const p = pose(s, now);
    if (p === "walk") {
      walkX += dir * 0.5;
      if (walkX > 11 || walkX < 1) dir = -dir;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, SPRITE_W * SCALE, SPRITE_H * SCALE);
    ctx.scale(SCALE, SCALE);
    drawPal(ctx, { pose: p, frame, hat: s.pet.hat, wheel: s.pet.wheel, mood: mood(s.pet.stats), flip: dir < 0 && p === "walk", x: Math.round(walkX) });
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, 32, 28);
    bctx.scale(2, 2);
    bctx.translate(-6, -12);
    drawPal(bctx, { pose: "sit", frame: 0, hat: null, wheel: null, mood: "ok" });
  };

  const { store } = opts;

  const bounds = () => opts.contained ? opts.container.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight, width: innerWidth, height: innerHeight };
  const clampPosition = () => {
    const box = bounds();
    const size = host.hasAttribute("data-min") ? { width: 24, height: 24 } : { width: SPRITE_W * SCALE, height: SPRITE_H * SCALE };
    const pos = lastState?.settings.pos;
    host.style.insetInlineEnd = `${Math.max(0, Math.min(pos?.x ?? 16, box.width - size.width))}px`;
    host.style.insetBlockEnd = `${Math.max(0, Math.min(pos?.y ?? 16, box.height - size.height))}px`;
  };
  const positionPanel = () => {
    if (panel.hidden) return;
    const box = bounds(), r = host.getBoundingClientRect();
    panel.style.inlineSize = `${Math.min(300, Math.max(0, box.width - 16))}px`;
    const width = panel.getBoundingClientRect().width;
    const left = Math.max(box.left + 8, Math.min(r.right - width, box.right - width - 8));
    panel.style.insetInlineEnd = "auto";
    panel.style.insetInlineStart = `${left - r.left}px`;
    const above = Math.max(0, r.top - box.top - 8);
    const below = Math.max(0, box.bottom - r.bottom - 8);
    const openBelow = above < panel.scrollHeight && below > above;
    panel.style.maxBlockSize = `${Math.min(520, openBelow ? below : above)}px`;
    panel.style.insetBlockEnd = openBelow ? "auto" : "calc(100% + 8px)";
    panel.style.insetBlockStart = openBelow ? "calc(100% + 8px)" : "auto";
  };

  const applyState = (s: SaveState) => {
    lastState = s;
    const lang = s.settings.lang;
    const hidden = !s.settings.palOn || s.settings.hiddenPaths.includes(opts.pageKey());
    host.style.display = hidden ? "none" : "";
    host.toggleAttribute("data-min", s.settings.minimized);
    palBtn.setAttribute("aria-label", t(lang, "act.open", { name: s.pet.name }));
    bubble.setAttribute("aria-label", t(lang, "act.restore", { name: s.pet.name }));
    clampPosition();
    if (!panel.hidden) renderPanel();
    draw();
  };

  const renderPanel = () => {
    const s = lastState;
    if (!s) return;
    const lang = s.settings.lang;
    const waiting = s.chests.pending.filter((c) => c.createdAt > 0);
    const focusKey = (shadow.activeElement as HTMLElement | null)?.dataset.k;
    panel.setAttribute("aria-label", s.pet.name);
    panel.innerHTML = `
      <div class="head"><p class="name">${esc(s.pet.name)}</p><p class="small">${esc(String(s.seeds))} ${t(lang, "label.seeds")}</p></div>
      ${statBars(lang, s)}
      <div class="row">
        <button class="btn primary" data-k="feed" data-act="feed">${t(lang, "act.feed")}</button>
        <button class="btn" data-k="play" data-act="play">${t(lang, "act.play")}</button>
        <button class="btn" data-k="clean" data-act="clean">${t(lang, "act.clean")}</button>
      </div>
      ${waiting.length ? `<button class="btn" data-k="chest" data-act="chest" data-id="${esc(waiting[0].id)}">${t(lang, waiting[0].kind === "golden" ? "act.openGolden" : "act.openChest")} (${t(lang, "label.waiting", { n: waiting.length })})</button>` : ""}
      ${liveStrip(lang, s, Date.now())}
      <div class="row">
        <button class="link" data-k="min" data-act="min">${t(lang, "act.minimize")}</button>
        <button class="link" data-k="hide" data-act="hide">${t(lang, "act.hidePage")}</button>
        <button class="link" data-k="close" data-act="close">${t(lang, "act.close")}</button>
      </div>`;
    if (focusKey) panel.querySelector<HTMLElement>(`[data-k="${focusKey}"]`)?.focus();
    positionPanel();
  };

  const setOpen = (open: boolean, focusPanel = false) => {
    panel.hidden = !open;
    host.toggleAttribute("data-open", open);
    palBtn.setAttribute("aria-expanded", String(open));
    if (open) {
      renderPanel();
      if (focusPanel) panel.querySelector<HTMLElement>("button")?.focus();
    }
  };

  let toastTimer = 0;
  const showToast = (text: string) => {
    if (!text) return;
    toastEl.textContent = text;
    live.textContent = text;
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove("on"), 2800);
  };

  const toast = (fx: Effects) => {
    const lang = store.get()?.settings.lang ?? "en";
    if (fx.opened) {
      const item = fx.opened.item ? ` ${t(lang, "chest.item", { item: t(lang, `item.${fx.opened.item}` as Key) })}` : "";
      showToast(`${t(lang, `chest.${fx.opened.kind}` as Key)}: ${t(lang, "chest.got", { n: fx.opened.seeds })}${item}`);
    } else if (fx.achievements?.length) {
      showToast(`${t(lang, "ach.title")}: ${fx.achievements.map((a) => t(lang, `ach.${a}` as Key)).join(", ")}`);
    }
  };

  panel.addEventListener("click", async (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    if (act === "feed" || act === "play" || act === "clean") {
      if (act === "feed") eatUntil = Date.now() + 2000;
      toast(await store.dispatch({ type: act }));
    } else if (act === "chest") {
      toast(await store.dispatch({ type: "openChest", id: el.dataset.id! }));
    } else if (act === "min") {
      setOpen(false);
      await store.dispatch({ type: "settings", patch: { minimized: true } });
      bubble.focus();
    } else if (act === "hide") {
      setOpen(false);
      await store.dispatch({ type: "hidePath", path: opts.pageKey(), hidden: true });
    } else if (act === "close") {
      setOpen(false);
      palBtn.focus();
    }
  });

  shadow.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Escape" && !panel.hidden) {
      setOpen(false);
      palBtn.focus();
    }
  });

  bubble.addEventListener("click", () => {
    void store.dispatch({ type: "settings", patch: { minimized: false } }).then(() => palBtn.focus());
  });

  // drag with pointer; a short press without movement is a click
  let drag: { x: number; y: number; right: number; bottom: number; moved: boolean } | null = null;
  palBtn.addEventListener("pointerdown", (e) => {
    const r = host.getBoundingClientRect();
    const box = bounds();
    drag = { x: e.clientX, y: e.clientY, right: box.right - r.right, bottom: box.bottom - r.bottom, moved: false };
    palBtn.setPointerCapture(e.pointerId);
  });
  palBtn.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    const box = bounds();
    const x = Math.max(0, Math.min(drag.right - dx, box.width - SPRITE_W * SCALE));
    const y = Math.max(0, Math.min(drag.bottom - dy, box.height - SPRITE_H * SCALE));
    host.style.insetInlineEnd = `${x}px`;
    host.style.insetBlockEnd = `${y}px`;
    positionPanel();
  });
  palBtn.addEventListener("pointerup", () => {
    if (drag?.moved) {
      const x = parseFloat(host.style.insetInlineEnd) || 0;
      const y = parseFloat(host.style.insetBlockEnd) || 0;
      void store.dispatch({ type: "settings", patch: { pos: { x: Math.round(x), y: Math.round(y) } } });
    }
  });
  palBtn.addEventListener("click", (e) => {
    if (drag?.moved) {
      drag = null;
      e.preventDefault();
      return;
    }
    drag = null;
    setOpen(!host.hasAttribute("data-open"), e.detail === 0);
  });

  const unsub = store.subscribe(applyState);
  const s0 = store.get();
  if (s0) applyState(s0);

  const tick = window.setInterval(() => {
    if (doc.hidden) return;
    if (!reduced.matches) frame++;
    draw();
  }, 180);
  const themeTimer = window.setInterval(() => host.setAttribute("data-theme", opts.theme()), 2000);
  host.setAttribute("data-theme", opts.theme());
  const panelTimer = window.setInterval(() => !panel.hidden && renderPanel(), 30_000);
  const onReduced = () => draw();
  reduced.addEventListener("change", onReduced);
  const onResize = () => { clampPosition(); positionPanel(); };
  window.addEventListener("resize", onResize);
  const resizeObserver = new ResizeObserver(onResize);
  if (opts.contained) resizeObserver.observe(opts.container);

  return {
    toast,
    destroy() {
      unsub();
      clearInterval(tick);
      clearInterval(themeTimer);
      clearInterval(panelTimer);
      reduced.removeEventListener("change", onReduced);
      window.removeEventListener("resize", onResize);
      resizeObserver.disconnect();
      host.remove();
    },
  };
}
