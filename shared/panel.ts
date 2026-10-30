// The toolbar popup: pet card, stats, Seeds, shop, wardrobe, quests, settings and the live strip.
// Used by extension/popup.html, extension/options.html and the website demo.
import { palCanvas } from "./art";
import { downloadCard } from "./card";
import { ITEMS, itemsOfKind, type ItemKind } from "./catalog";
import { ACHIEVEMENTS, type Effects } from "./game";
import { t, type Key } from "./i18n";
import { mood, nextQuestReset, nextStageXp, stageFor } from "./rules";
import { intentUrl } from "./share";
import { exportCode, importCode, type Lang, type SaveState } from "./state";
import type { PalStore } from "./store";
import { esc, liveStrip, statBars, THEME_CSS } from "./ui";

export type Tab = "pet" | "shop" | "wardrobe" | "quests" | "settings";
const TABS: Tab[] = ["pet", "shop", "wardrobe", "quests", "settings"];

export const PANEL_CSS = `${THEME_CSS}
.sp-root { font: 400 14px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif; color: var(--sp-fg); background: var(--sp-bg); }
.sp-root * { box-sizing: border-box; }
.sp-root h2, .sp-root h3, .sp-root p, .sp-root dl, .sp-root dd, .sp-root ul { margin: 0; padding: 0; }
.sp-root ul { list-style: none; }
.sp-root button, .sp-root input, .sp-root textarea, .sp-root select { font: inherit; color: inherit; }
.sp-root :focus-visible { outline: 2px solid var(--sp-focus); outline-offset: 2px; }
.sp-btn { min-block-size: 36px; padding: 6px 14px; border-radius: 10px; border: 1px solid var(--sp-line); background: var(--sp-surface); cursor: pointer; transition: scale 150ms cubic-bezier(0.2, 0, 0, 1), background-color 150ms; }
.sp-btn:active { scale: 0.96; }
.sp-btn[disabled] { opacity: 0.55; cursor: not-allowed; }
.sp-btn.primary { background: var(--sp-accent); color: var(--sp-accent-fg); border-color: transparent; font-weight: 600; }
.sp-row { display: flex; flex-wrap: wrap; gap: 8px; }
.sp-tabs { display: flex; gap: 4px; padding: 8px; border-block-end: 1px solid var(--sp-line); overflow-x: auto; }
.sp-tab { min-block-size: 36px; padding: 6px 8px; border: 0; border-radius: 8px; background: transparent; cursor: pointer; white-space: nowrap; }
.sp-tab[aria-selected="true"] { background: var(--sp-surface); font-weight: 600; }
.sp-body { padding: 12px; display: grid; gap: 16px; }
.sp-card { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: center; }
.sp-card canvas { inline-size: 84px; block-size: 78px; image-rendering: pixelated; background: var(--sp-surface); border-radius: 12px; }
.sp-name { font-size: 18px; font-weight: 600; line-height: 1.2; }
.sp-small { font-size: 12px; color: var(--sp-muted); }
.sp-seeds { font-weight: 600; font-variant-numeric: tabular-nums; }
.sp-stats { display: grid; gap: 6px; }
.sp-stat { display: grid; grid-template-columns: 92px 1fr; align-items: center; gap: 8px; }
.sp-stat dt { color: var(--sp-muted); }
.sp-stat dd { display: flex; align-items: center; gap: 8px; }
.sp-bar { flex: 1; block-size: 8px; border-radius: 4px; background: var(--sp-line); overflow: hidden; }
.sp-bar > span { display: block; block-size: 100%; background: var(--sp-good); }
.sp-bar > span.low { background: var(--sp-warn); }
.sp-num { inline-size: 3ch; text-align: end; font-variant-numeric: tabular-nums; }
.sp-live { padding: 10px 12px; border-radius: 12px; background: var(--sp-surface); display: grid; gap: 6px; }
.sp-live-title { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.sp-dot { inline-size: 8px; block-size: 8px; border-radius: 50%; background: var(--sp-muted); }
.sp-live-running .sp-dot { background: var(--sp-good); }
.sp-live-offline .sp-dot { background: var(--sp-warn); }
.sp-live-nums { display: flex; flex-wrap: wrap; gap: 4px 16px; font-variant-numeric: tabular-nums; }
.sp-live-nums dt { font-size: 12px; color: var(--sp-muted); }
.sp-fest { font-weight: 600; color: var(--sp-warn); }
.sp-list { display: grid; gap: 8px; }
.sp-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; border-radius: 10px; background: var(--sp-surface); }
.sp-item > div { min-inline-size: 0; }
.sp-h { font-size: 14px; font-weight: 600; }
.sp-section { display: grid; gap: 8px; }
.sp-q { display: grid; gap: 4px; }
.sp-ach { display: flex; flex-wrap: wrap; gap: 6px; }
.sp-ach li { padding: 2px 8px; border-radius: 999px; background: var(--sp-surface); font-size: 12px; color: var(--sp-muted); }
.sp-ach li.got { color: var(--sp-fg); font-weight: 600; }
.sp-field { display: grid; gap: 4px; }
.sp-field input, .sp-field textarea, .sp-field select { inline-size: 100%; padding: 8px; border-radius: 8px; border: 1px solid var(--sp-line); background: var(--sp-bg); }
.sp-field textarea { min-block-size: 64px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; }
.sp-check { display: flex; gap: 8px; align-items: center; min-block-size: 32px; cursor: pointer; }
.sp-check input { inline-size: 18px; block-size: 18px; accent-color: var(--sp-accent); }
.sp-msg { min-block-size: 1.45em; }
`;

export interface PanelOptions {
  store: PalStore;
  /** link added to the share post; empty means no link */
  shareUrl: string;
  initialTab?: Tab;
  /** opens a URL the user chose to open (intent window) */
  open?: (url: string) => void;
}

function fxMessage(lang: Lang, fx: Effects): string {
  if (fx.error === "noSeeds") return t(lang, "err.noSeeds");
  if (fx.error === "owned") return t(lang, "err.owned");
  if (fx.opened) {
    const item = fx.opened.item ? ` ${t(lang, "chest.item", { item: t(lang, `item.${fx.opened.item}` as Key) })}` : "";
    return `${t(lang, "chest.got", { n: fx.opened.seeds })}${item}`;
  }
  if (fx.achievements?.length) return `${t(lang, "ach.title")}: ${fx.achievements.map((a) => t(lang, `ach.${a}` as Key)).join(", ")}`;
  return "";
}

export function mountPanel(root: HTMLElement, opts: PanelOptions): () => void {
  const { store } = opts;
  let tab: Tab = opts.initialTab ?? "pet";
  let msg = "";
  const doc = root.ownerDocument;
  root.classList.add("sp-root");

  const render = () => {
    const s = store.get();
    if (!s) return;
    const lang = s.settings.lang;
    root.dataset.lang = lang;
    const focusKey = (doc.activeElement as HTMLElement | null)?.dataset?.k ?? (root.getRootNode() as ShadowRoot).activeElement?.getAttribute("data-k");
    const now = Date.now();
    root.innerHTML = `
      <div class="sp-tabs" role="tablist" aria-label="Squeek Pal">
        ${TABS.map((id) => `<button class="sp-tab" role="tab" id="sp-tab-${id}" data-k="tab-${id}" data-tab="${id}" aria-selected="${id === tab}" aria-controls="sp-tabpanel" tabindex="${id === tab ? 0 : -1}">${t(lang, `tab.${id}`)}</button>`).join("")}
      </div>
      <div class="sp-body" id="sp-tabpanel" role="tabpanel" aria-labelledby="sp-tab-${tab}">
        ${body(tab, s, lang, now)}
        <p class="sp-msg sp-small" role="status">${esc(msg)}</p>
      </div>`;
    const slot = root.querySelector<HTMLElement>("[data-pal-slot]");
    if (slot) {
      slot.replaceWith(palCanvas(doc, 3, { pose: "sit", frame: 0, hat: s.pet.hat, wheel: s.pet.wheel, mood: mood(s.pet.stats) }));
    }
    if (focusKey) root.querySelector<HTMLElement>(`[data-k="${focusKey}"]`)?.focus();
  };

  const run = async (action: Parameters<PalStore["dispatch"]>[0]) => {
    const fx = await store.dispatch(action);
    const s = store.get();
    msg = s ? fxMessage(s.settings.lang, fx) : "";
    render();
  };

  const onClick = async (e: Event) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-act],[data-tab]");
    if (!el) return;
    const s = store.get();
    if (!s) return;
    const lang = s.settings.lang;
    if (el.dataset.tab) {
      tab = el.dataset.tab as Tab;
      msg = "";
      render();
      return;
    }
    const act = el.dataset.act!;
    const id = el.dataset.id ?? "";
    if (act === "feed" || act === "play" || act === "clean") return run({ type: act });
    if (act === "buy") return run({ type: "buy", id });
    if (act === "equip") return run({ type: "equip", id: id || null, slot: el.dataset.slot as "hat" | "wheel" });
    if (act === "share") {
      const text = t(lang, "share.text", { name: s.pet.name, stage: t(lang, `stage.${stageFor(s.pet.xp)}`) });
      const url = intentUrl(text, opts.shareUrl);
      (opts.open ?? ((u: string) => window.open(u, "_blank", "noopener")))(url);
      return run({ type: "shared" });
    }
    if (act === "card") return downloadCard(doc, s);
    if (act === "export") {
      const code = exportCode(s);
      const ta = root.querySelector<HTMLTextAreaElement>("#sp-code");
      if (ta) ta.value = code;
      try {
        await navigator.clipboard.writeText(code);
        msg = t(lang, "set.copied");
      } catch {
        msg = "";
        ta?.select();
      }
      const m = root.querySelector(".sp-msg");
      if (m) m.textContent = msg;
      return;
    }
    if (act === "import") {
      const ta = root.querySelector<HTMLTextAreaElement>("#sp-code");
      const next = ta ? importCode(ta.value, Date.now()) : null;
      if (!next) {
        msg = t(lang, "set.importBad");
        ta?.setAttribute("aria-invalid", "true");
        const m = root.querySelector(".sp-msg");
        if (m) m.textContent = msg;
        ta?.focus();
        return;
      }
      await store.dispatch({ type: "replace", state: next });
      msg = t(next.settings.lang, "set.importOk");
      render();
      return;
    }
    if (act === "unhide") return run({ type: "settings", patch: { hiddenPaths: [] } });
  };

  const onChange = (e: Event) => {
    const el = e.target as HTMLInputElement;
    if (el.name === "palOn" || el.name === "chestsOn") void run({ type: "settings", patch: { [el.name]: el.checked } });
    if (el.name === "lang") void run({ type: "settings", patch: { lang: el.value as Lang } });
    if (el.name === "petName") void run({ type: "rename", name: el.value });
  };

  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (!el.dataset.tab || (e.key !== "ArrowRight" && e.key !== "ArrowLeft")) return;
    const i = TABS.indexOf(el.dataset.tab as Tab);
    tab = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
    msg = "";
    render();
    root.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.focus();
  };

  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);
  root.addEventListener("keydown", onKey);
  const unsub = store.subscribe(() => {
    // don't wipe a field the user is typing in
    const active = (root.getRootNode() as Document | ShadowRoot).activeElement as HTMLElement | null;
    if (active && root.contains(active) && (active.tagName === "TEXTAREA" || active.tagName === "INPUT")) return;
    render();
  });
  const timer = window.setInterval(render, 30_000);
  render();
  return () => {
    unsub();
    clearInterval(timer);
    root.removeEventListener("click", onClick);
    root.removeEventListener("change", onChange);
    root.removeEventListener("keydown", onKey);
  };

  void nextQuestReset;
}

function body(tab: Tab, s: SaveState, lang: Lang, now: number): string {
  const nxt = nextStageXp(s.pet.xp);
  const card = `<div class="sp-card"><span data-pal-slot></span><div>
      <p class="sp-name">${esc(s.pet.name)}</p>
      <p class="sp-small">${t(lang, `stage.${stageFor(s.pet.xp)}`)} · ${t(lang, `mood.${mood(s.pet.stats)}`)} · ${s.pet.xp} ${t(lang, "label.xp")}</p>
      <p class="sp-small">${nxt === null ? t(lang, "label.maxStage") : t(lang, "label.nextStage", { n: nxt - s.pet.xp })}</p>
      <p class="sp-seeds">${s.seeds} ${t(lang, "label.seeds")}</p>
    </div></div>`;
  if (tab === "pet") {
    const food = itemsOfKind("food").map((f) => `${t(lang, `item.${f.id}` as Key)} ×${s.inventory[f.id] ?? 0}`).join(", ");
    return `${card}${liveStrip(lang, s, now)}${statBars(lang, s)}
      <div class="sp-row">
        <button class="sp-btn primary" data-act="feed" data-k="feed">${t(lang, "act.feed")}</button>
        <button class="sp-btn" data-act="play" data-k="play">${t(lang, "act.play")}</button>
        <button class="sp-btn" data-act="clean" data-k="clean">${t(lang, "act.clean")}</button>
      </div>
      <p class="sp-small">${t(lang, "label.inventory")}: ${food}</p>
      <div class="sp-row">
        <button class="sp-btn" data-act="share" data-k="share">${t(lang, "act.share")}</button>
        <button class="sp-btn" data-act="card" data-k="card">${t(lang, "act.card")}</button>
      </div>`;
  }
  if (tab === "shop") {
    const kinds: ItemKind[] = ["food", "toy", "hat", "wheel"];
    return `<p class="sp-seeds">${s.seeds} ${t(lang, "label.seeds")}</p>${kinds
      .map(
        (k) => `<section class="sp-section"><h3 class="sp-h">${t(lang, `kind.${k}`)}</h3><ul class="sp-list">${itemsOfKind(k)
          .map((it) => {
            const owned = it.kind !== "food" && s.owned.includes(it.id);
            const name = t(lang, `item.${it.id}` as Key);
            const sub = it.kind === "food" ? t(lang, "label.have", { n: s.inventory[it.id] ?? 0 }) : owned ? t(lang, "label.owned") : "";
            return `<li class="sp-item"><div><p>${name}</p><p class="sp-small">${t(lang, "label.price", { n: it.price })}${sub ? ` · ${sub}` : ""}</p></div>
              <button class="sp-btn" data-act="buy" data-id="${it.id}" data-k="buy-${it.id}" ${owned ? "disabled" : ""} aria-label="${t(lang, "act.buy")} ${name}">${t(lang, "act.buy")}</button></li>`;
          })
          .join("")}</ul></section>`,
      )
      .join("")}`;
  }
  if (tab === "wardrobe") {
    const slot = (k: "hat" | "wheel") => {
      const owned = ITEMS.filter((i) => i.kind === k && s.owned.includes(i.id));
      const none = k === "hat" ? t(lang, "label.noHat") : t(lang, "label.noWheel");
      const rows = [{ id: "", name: none }, ...owned.map((i) => ({ id: i.id, name: t(lang, `item.${i.id}` as Key) }))];
      return `<section class="sp-section"><h3 class="sp-h">${t(lang, `kind.${k}`)}</h3><ul class="sp-list">${rows
        .map((r) => {
          const on = (s.pet[k] ?? "") === r.id;
          return `<li class="sp-item"><p>${r.name}${on ? ` · <span class="sp-small">${t(lang, "label.wearing")}</span>` : ""}</p>
            <button class="sp-btn" data-act="equip" data-slot="${k}" data-id="${r.id}" data-k="eq-${k}-${r.id}" ${on ? "disabled" : ""} aria-label="${t(lang, "act.equip")} ${r.name}">${t(lang, "act.equip")}</button></li>`;
        })
        .join("")}</ul></section>`;
    };
    return `${card}${slot("hat")}${slot("wheel")}`;
  }
  if (tab === "quests") {
    return `<section class="sp-section"><h3 class="sp-h">${t(lang, "tab.quests")}</h3><p class="sp-small">${t(lang, "label.questReset")}</p>
      <ul class="sp-list">${s.quests.list
        .map(
          (q) => `<li class="sp-item"><div class="sp-q"><p>${t(lang, `quest.${q.id}`)}</p><p class="sp-small">${t(lang, "quest.reward")}</p></div>
          <p class="sp-num" style="inline-size:auto">${q.done ? t(lang, "quest.done") : `${q.progress}/${q.goal}`}</p></li>`,
        )
        .join("")}</ul></section>
      <section class="sp-section"><h3 class="sp-h">${t(lang, "ach.title")}</h3><p class="sp-small">${t(lang, "ach.count", { n: s.achievements.length, m: ACHIEVEMENTS.length })}</p>
      <ul class="sp-ach">${ACHIEVEMENTS.map((a) => `<li class="${s.achievements.includes(a) ? "got" : ""}">${s.achievements.includes(a) ? "✓ " : ""}${t(lang, `ach.${a}` as Key)}</li>`).join("")}</ul></section>`;
  }
  // settings
  return `<div class="sp-field"><label for="sp-name">${t(lang, "label.name")}</label><input id="sp-name" name="petName" maxlength="16" value="${esc(s.pet.name)}" autocomplete="off"></div>
    <div class="sp-field"><label for="sp-lang">${t(lang, "label.lang")}</label><select id="sp-lang" name="lang" data-k="lang"><option value="en" ${lang === "en" ? "selected" : ""}>English</option><option value="vi" ${lang === "vi" ? "selected" : ""}>Tiếng Việt</option></select></div>
    <label class="sp-check"><input type="checkbox" name="palOn" data-k="palOn" ${s.settings.palOn ? "checked" : ""}>${t(lang, "set.palOn")}</label>
    <label class="sp-check"><input type="checkbox" name="chestsOn" data-k="chestsOn" ${s.settings.chestsOn ? "checked" : ""}>${t(lang, "set.chestsOn")}</label>
    ${s.settings.hiddenPaths.length ? `<div class="sp-row"><p class="sp-small">${t(lang, "set.hidden", { n: s.settings.hiddenPaths.length })}</p><button class="sp-btn" data-act="unhide" data-k="unhide">${t(lang, "set.unhide")}</button></div>` : ""}
    <div class="sp-field"><label for="sp-code">${t(lang, "label.saveCode")}</label><textarea id="sp-code" spellcheck="false" placeholder="SQK2.…"></textarea></div>
    <div class="sp-row"><button class="sp-btn" data-act="export" data-k="export">${t(lang, "act.export")}</button><button class="sp-btn" data-act="import" data-k="import">${t(lang, "act.import")}</button></div>
    <p class="sp-small">${t(lang, "privacy")}</p>`;
}
