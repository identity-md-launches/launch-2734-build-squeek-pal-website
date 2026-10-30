import "./style.css";
import { drawChest, drawPal, palCanvas, SPRITE_H, SPRITE_W, type Pose } from "../../shared/art";
import { startChestPlacer } from "../../shared/chests";
import { mountPanel, PANEL_CSS } from "../../shared/panel";
import { drawCard } from "../../shared/card";
import { defaultState, type Lang, type SaveState } from "../../shared/state";
import { liveStrip } from "../../shared/ui";
import { mountWidget } from "../../shared/widget";
import { demoStore, liveOnly, type DemoStore } from "./demoStore";
import { samplePosts } from "./posts";
import { st, type SiteKey } from "./strings";

const GENESIS = "https://squeekchain.com/genesis/e86n3z8y";
const AUTHOR = "https://x.com/Truongsonxyz";
const DL = { chrome: "downloads/squeek-pal-chrome.zip", firefox: "downloads/squeek-pal-firefox.zip", source: "downloads/squeek-pal-source.zip" };

let lang: Lang = (localStorage.getItem("squeekpal-lang") as Lang | null) ?? (navigator.language.toLowerCase().startsWith("vi") ? "vi" : "en");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let cleanup: (() => void)[] = [];

const s = (k: SiteKey) => st(lang, k);
const main = document.getElementById("main")!;

function route(): "home" | "demo" | "install" | "missing" {
  const h = location.hash.replace(/^#\/?/, "");
  if (h === "" || h === "top") return "home";
  if (h === "demo" || h === "install") return h;
  if (!h.startsWith("/") && document.getElementById(h)) return "home";
  return "missing";
}

function header() {
  const r = route();
  document.getElementById("brand-text")!.textContent = "Squeek Pal";
  const nav = document.getElementById("nav")!;
  nav.innerHTML = `
    <a href="#/demo" ${r === "demo" ? 'aria-current="page"' : ""}>${s("navDemo")}</a>
    <a href="#/install" ${r === "install" ? 'aria-current="page"' : ""}>${s("navInstall")}</a>
    <button type="button" id="lang" lang="${lang === "en" ? "vi" : "en"}" aria-label="${s("switchLangLabel")}">${s("switchLang")}</button>`;
  nav.querySelector("#lang")!.addEventListener("click", () => {
    lang = lang === "en" ? "vi" : "en";
    localStorage.setItem("squeekpal-lang", lang);
    render(false);
    (document.getElementById("lang") as HTMLElement).focus();
  });
  document.querySelector(".skip")!.textContent = s("skip");
  const foot = document.getElementById("foot")!;
  foot.innerHTML = `
    <p><a href="${AUTHOR}" rel="noopener" target="_blank">${s("footMade")}</a></p>
    <p><a href="${GENESIS}" rel="noopener" target="_blank">${s("footGenesis")}</a></p>
    <p><a href="${DL.source}" download>${s("footSource")}</a></p>
    <p class="muted">${s("footNote")}</p>`;
}

/** Animated canvas of the pal; holds still under reduced motion. */
function animatedPal(scale: number, poses: Pose[], label: string, hat: string | null = null, wheel: string | null = null): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = SPRITE_W * scale;
  c.height = SPRITE_H * scale;
  c.setAttribute("role", "img");
  c.setAttribute("aria-label", label);
  const ctx = c.getContext("2d")!;
  let frame = 0;
  const draw = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.scale(scale, scale);
    const pose = poses[Math.floor(frame / 20) % poses.length];
    drawPal(ctx, { pose, frame, hat, wheel, mood: "happy" });
  };
  draw();
  const id = window.setInterval(() => {
    if (reduced.matches || document.hidden) return;
    frame++;
    draw();
  }, 160);
  cleanup.push(() => clearInterval(id));
  return c;
}

function chestCanvas(kind: "normal" | "golden"): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 12 * 4;
  c.height = 9 * 4;
  const ctx = c.getContext("2d")!;
  ctx.scale(4, 4);
  drawChest(ctx, kind, 1, 1);
  c.setAttribute("aria-hidden", "true");
  return c;
}

function home() {
  main.innerHTML = `
    <section class="hero wrap">
      <div class="hero-copy">
        <h1>${s("heroTitle")}</h1>
        <p class="lead">${s("heroLine")}</p>
        <div class="actions">
          <a class="btn primary" href="${DL.chrome}" download>${s("dlChrome")}</a>
          <a class="btn" href="#/demo">${s("tryDemo")}</a>
        </div>
        <p class="small"><a href="${DL.firefox}" download>${s("dlFirefox")}</a> · <a href="#/install">${s("howGuide")}</a></p>
      </div>
      <div class="hero-art">
        <div class="stage" id="hero-stage"></div>
        <div class="live-slot" id="live"></div>
      </div>
    </section>

    <section class="band" aria-labelledby="play-h" id="play">
      <div class="wrap">
        <h2 id="play-h">${s("playTitle")}</h2>
        <p class="sub">${s("playLine")}</p>
        <div class="poses" id="poses" role="img" aria-label="${s("statesLabel")}"></div>
        <ul class="features">
          <li><h3>${s("f1t")}</h3><p>${s("f1d")}</p></li>
          <li><h3>${s("f2t")}</h3><div class="shot-post" id="shot-post"></div><p>${s("f2d")}</p></li>
          <li><h3>${s("f3t")}</h3><p>${s("f3d")}</p></li>
          <li><h3>${s("f4t")}</h3><div class="shot-card" id="shot-card"></div><p>${s("f4d")}</p></li>
        </ul>
      </div>
    </section>

    <section class="wrap section" aria-labelledby="sync-h" id="sync">
      <h2 id="sync-h">${s("syncTitle")}</h2>
      <p class="sub">${s("syncLine")}</p>
      <ul class="rules">
        <li>${s("s1")}</li><li>${s("s2")}</li><li>${s("s3")}</li><li>${s("s4")}</li>
      </ul>
      <p class="note">${s("s5")}</p>
    </section>

    <section class="band" aria-labelledby="perm-h" id="permissions">
      <div class="wrap">
        <h2 id="perm-h">${s("permTitle")}</h2>
        <p class="sub">${s("permLine")}</p>
        <dl class="perms">
          <div><dt><code>${s("p1t")}</code></dt><dd>${s("p1d")}</dd></div>
          <div><dt><code>${s("p2t")}</code></dt><dd>${s("p2d")}</dd></div>
          <div><dt>${s("p3t")}</dt><dd>${s("p3d")}</dd></div>
          <div><dt>${s("p4t")}</dt><dd>${s("p4d")}</dd></div>
        </dl>
        <p class="note">${s("pNo")}</p>
      </div>
    </section>

    <section class="wrap section" aria-labelledby="inst-h">
      <h2 id="inst-h">${s("installTitle")}</h2>
      <p class="sub">${s("installLine")}</p>
      <div class="actions">
        <a class="btn primary" href="#/install">${s("howGuide")}</a>
        <a class="btn" href="${DL.firefox}" download>${s("dlFirefox")}</a>
      </div>
    </section>`;

  document.getElementById("hero-stage")!.append(animatedPal(8, ["run"], s("heroArtLabel"), "party", "sunset"));
  const poses = document.getElementById("poses")!;
  (["walk", "eat", "nap", "run"] as Pose[]).forEach((p) => {
    const c = palCanvas(document, 3, { pose: p, frame: 1, hat: p === "run" ? "crown" : p === "walk" ? "acorn" : null, wheel: "mint", mood: "happy" });
    c.setAttribute("aria-hidden", "true");
    poses.append(c);
  });
  const post = document.getElementById("shot-post")!;
  post.innerHTML = `<span aria-hidden="true">Reply</span><span aria-hidden="true">Repost</span><span aria-hidden="true">Like</span>`;
  post.append(chestCanvas("normal"), chestCanvas("golden"));
  const sample: SaveState = defaultState(Date.now(), lang);
  sample.pet.hat = "crown";
  sample.pet.wheel = "golden";
  sample.pet.xp = 520;
  sample.seeds = 342;
  const card = document.createElement("canvas");
  drawCard(card, sample);
  card.setAttribute("role", "img");
  card.setAttribute("aria-label", "Pet card: Pip, Adult, 342 Seeds");
  document.getElementById("shot-card")!.append(card);

  const live = document.getElementById("live")!;
  const show = (st: SaveState) => (live.innerHTML = `<div class="sp-root" data-theme="light">${liveStrip(lang, st, Date.now())}</div>`);
  show(defaultState(Date.now(), lang));
  cleanup.push(liveOnly(show, lang));
}

let demo: DemoStore | null = null;

function demoPage() {
  main.innerHTML = `
    <section class="wrap section demo-head">
      <h1>${s("demoTitle")}</h1>
      <p class="lead">${s("demoLine")}</p>
    </section>
    <section class="wrap demo">
      <div class="demo-col">
        <h2 class="col-h" id="tl-h">${s("demoTimeline")}</h2>
        <p class="small">${s("demoHint")}</p>
        <div class="phone" id="phone">
          <div class="timeline" id="timeline" tabindex="0" role="region" aria-labelledby="tl-h"></div>
        </div>
        <div class="actions">
          <button class="btn" type="button" id="more">${s("demoMore")}</button>
          <button class="btn" type="button" id="reset">${s("demoReset")}</button>
        </div>
      </div>
      <div class="demo-col">
        <h2 class="col-h">${s("demoPopup")}</h2>
        <div class="popup-frame" id="popup"></div>
      </div>
    </section>`;
  demo ??= demoStore(lang);
  const store = demo;
  if (store.get()?.settings.lang !== lang) void store.dispatch({ type: "settings", patch: { lang } });
  const tl = document.getElementById("timeline")!;
  tl.innerHTML = samplePosts(40);
  const phone = document.getElementById("phone")!;
  const widget = mountWidget({ store, container: phone, contained: true, pageKey: () => "/demo", theme: () => "light" });
  const stopChests = startChestPlacer({ store, root: tl, scrollRoot: tl, onOpened: (fx) => widget.toast(fx) });
  const more = () => tl.insertAdjacentHTML("beforeend", samplePosts(30));
  tl.addEventListener("scroll", () => {
    if (tl.scrollTop + tl.clientHeight > tl.scrollHeight - 400) more();
  });
  document.getElementById("more")!.addEventListener("click", more);
  document.getElementById("reset")!.addEventListener("click", () => store.reset());

  const popupHost = document.getElementById("popup")!;
  const shadow = popupHost.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>${PANEL_CSS} .sp-root{min-block-size:520px;border-radius:16px}</style><div data-theme="light"></div>`;
  const shareUrl = location.href.split("#")[0];
  const unPanel = mountPanel(shadow.querySelector("div")!, { store, shareUrl });
  const unLang = store.subscribe((st) => {
    if (st.settings.lang !== lang) {
      lang = st.settings.lang;
      localStorage.setItem("squeekpal-lang", lang);
      document.documentElement.lang = lang;
      header();
    }
  });
  cleanup.push(() => {
    widget.destroy();
    stopChests();
    unPanel();
    unLang();
  });
}

function step(list: SiteKey[]): string {
  return `<ol class="steps">${list.map((k) => `<li>${s(k)}</li>`).join("")}</ol>`;
}

function installPage() {
  main.innerHTML = `
    <section class="wrap section">
      <h1>${s("installTitle")}</h1>
      <p class="lead">${s("installLine")}</p>
      <div class="actions">
        <a class="btn primary" href="${DL.chrome}" download>${s("dlChrome")}</a>
        <a class="btn" href="${DL.firefox}" download>${s("dlFirefox")}</a>
        <a class="btn" href="${DL.source}" download>${s("dlSource")}</a>
      </div>
    </section>
    <section class="wrap install">
      <div><h2 id="chrome">${s("chromeTitle")}</h2>${step(["c1", "c2", "c3", "c4", "c5"])}</div>
      <div><h2 id="firefox">${s("firefoxTitle")}</h2>${step(["x1", "x2", "x3", "x4", "x5"])}</div>
    </section>
    <section class="wrap section"><p class="note">${s("updateNote")}</p></section>
    <section class="band" aria-labelledby="perm-h2">
      <div class="wrap">
        <h2 id="perm-h2">${s("permTitle")}</h2>
        <dl class="perms">
          <div><dt><code>${s("p1t")}</code></dt><dd>${s("p1d")}</dd></div>
          <div><dt><code>${s("p2t")}</code></dt><dd>${s("p2d")}</dd></div>
          <div><dt>${s("p3t")}</dt><dd>${s("p3d")}</dd></div>
          <div><dt>${s("p4t")}</dt><dd>${s("p4d")}</dd></div>
        </dl>
        <p class="note">${s("pNo")}</p>
      </div>
    </section>`;
}

function missing() {
  main.innerHTML = `<section class="wrap section"><h1>${s("notFound")}</h1><p><a class="btn" href="#/">${s("goHome")}</a></p></section>`;
}

function render(moveFocus = true) {
  cleanup.forEach((fn) => fn());
  cleanup = [];
  document.documentElement.lang = lang;
  header();
  const r = route();
  if (r === "home") home();
  else if (r === "demo") demoPage();
  else if (r === "install") installPage();
  else missing();
  const titles = { home: "Squeek Pal: a pixel hamster for x.com", demo: `${s("demoTitle")} · Squeek Pal`, install: `${s("installTitle")} · Squeek Pal`, missing: "Squeek Pal" };
  document.title = titles[r];
  const anchor = location.hash.replace(/^#\/?/, "");
  if (r === "home" && anchor && document.getElementById(anchor)) document.getElementById(anchor)!.scrollIntoView();
  else if (moveFocus) {
    window.scrollTo(0, 0);
    if (initialised) {
      const h1 = main.querySelector<HTMLElement>("h1");
      h1?.setAttribute("tabindex", "-1");
      h1?.focus();
    }
  }
}

let initialised = false;
window.addEventListener("hashchange", () => render());
render();
initialised = true;

