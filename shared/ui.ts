// Shared UI pieces: theme tokens, stat bars and the "Squeektoshi live" strip.
import { fmtNum, t } from "./i18n";
import { isRunning, festivalOn } from "./game";
import { wheelMode } from "./rules";
import type { Lang, SaveState, StatName } from "./state";

export type Theme = "light" | "dim" | "dark";

/** Theme tokens, matched to X's light, dim and lights-out backgrounds. */
export const THEME_CSS = `
:host, .sp-root {
  --sp-bg: #fffaf2; --sp-surface: #f6ecdc; --sp-fg: #2b1d14; --sp-muted: #6b5544; --sp-line: #e3d3bb;
  --sp-accent: #a8481a; --sp-accent-fg: #ffffff; --sp-good: #2f7d4f; --sp-warn: #9a5b00; --sp-focus: #1d70b8;
  --sp-shadow: 0 1px 2px rgb(43 29 20 / 0.12), 0 6px 20px rgb(43 29 20 / 0.16);
  color-scheme: light;
}
[data-theme="dim"], :host([data-theme="dim"]) {
  --sp-bg: #1e2a36; --sp-surface: #273544; --sp-fg: #f2ece4; --sp-muted: #b9c2cc; --sp-line: #3a4a5b;
  --sp-accent: #f0a35c; --sp-accent-fg: #1a1209; --sp-good: #7fd6a2; --sp-warn: #f5c76b; --sp-focus: #8ec5ff;
  --sp-shadow: 0 1px 2px rgb(0 0 0 / 0.3), 0 6px 20px rgb(0 0 0 / 0.35);
  color-scheme: dark;
}
[data-theme="dark"], :host([data-theme="dark"]) {
  --sp-bg: #111111; --sp-surface: #1c1c1c; --sp-fg: #f2ece4; --sp-muted: #b3aca4; --sp-line: #333333;
  --sp-accent: #f0a35c; --sp-accent-fg: #1a1209; --sp-good: #7fd6a2; --sp-warn: #f5c76b; --sp-focus: #8ec5ff;
  --sp-shadow: 0 1px 2px rgb(0 0 0 / 0.4), 0 6px 20px rgb(0 0 0 / 0.5);
  color-scheme: dark;
}`;

/** X paints body with one of three colours; anything else falls back to the OS setting. */
export function detectXTheme(doc: Document): Theme {
  const bg = getComputedStyle(doc.body).backgroundColor.replace(/\s/g, "");
  if (bg === "rgb(0,0,0)") return "dark";
  if (bg === "rgb(21,32,43)") return "dim";
  if (bg === "rgb(255,255,255)") return "light";
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dim" : "light";
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const STATS: StatName[] = ["hunger", "happiness", "energy", "cleanliness"];

export function statBars(lang: Lang, s: SaveState): string {
  return `<dl class="sp-stats">${STATS.map((k) => {
    const v = Math.round(s.pet.stats[k]);
    return `<div class="sp-stat"><dt>${t(lang, `stat.${k}`)}</dt><dd><span class="sp-bar" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" aria-label="${t(lang, `stat.${k}`)}"><span style="inline-size:${v}%" class="${v < 25 ? "low" : ""}"></span></span><span class="sp-num">${v}</span></dd></div>`;
  }).join("")}</dl>`;
}

function bigFmt(lang: Lang, v: string | null, div: number, digits: number): string | null {
  if (v === null || !/^-?\d+(\.\d+)?$/.test(v)) return null;
  return fmtNum(lang, Number(v) / div, digits);
}

/** Text of the live strip; values the API marks unavailable show as a dash, never zero. */
export function liveStrip(lang: Lang, s: SaveState, now: number): string {
  const snap = s.sync;
  const mode = wheelMode(snap, now);
  let headline: string;
  let cls = "unknown";
  if (snap.reach === "never") headline = t(lang, "live.waiting");
  else if (snap.reach === "error") {
    headline = t(lang, "live.offline");
    cls = "offline";
  } else if (mode === "running") {
    headline = t(lang, "live.running");
    cls = "running";
  } else if (mode === "idle") {
    headline = t(lang, "live.idle");
    cls = "idle";
  } else headline = t(lang, "live.unknown");
  const speed = bigFmt(lang, snap.speedMmPerSecond, 1, 0);
  const dist = bigFmt(lang, snap.distanceMm, 1000, 1);
  const block = bigFmt(lang, snap.blockHeight, 1, 0);
  const fest = festivalOn(s, now)
    ? `<p class="sp-fest">${t(lang, "live.festival", { t: new Date(s.festival.until).toLocaleTimeString(lang === "vi" ? "vi-VN" : "en-US", { hour: "2-digit", minute: "2-digit" }) })}</p>`
    : "";
  const earned = isRunning(s, now) ? `<p class="sp-small">${t(lang, "live.earned", { n: s.earn.earnedThisHour })}</p>` : "";
  return `<section class="sp-live sp-live-${cls}" aria-label="${t(lang, "live.title")}">
    <h2 class="sp-live-title"><span class="sp-dot" aria-hidden="true"></span>${t(lang, "live.title")}</h2>
    <p class="sp-live-head" role="status">${headline}</p>
    <dl class="sp-live-nums">
      <div><dt>${t(lang, "live.speed")}</dt><dd>${speed === null ? "–" : `${speed} mm/s`}</dd></div>
      <div><dt>${t(lang, "live.distance")}</dt><dd>${dist === null ? "–" : `${dist} m`}</dd></div>
      <div><dt>${t(lang, "live.block")}</dt><dd>${block === null ? "–" : `#${block}`}</dd></div>
    </dl>${fest}${earned}
  </section>`;
}
