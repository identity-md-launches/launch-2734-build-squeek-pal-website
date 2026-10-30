// Regression checks against the production export. No real X account is used.
// IMD_PLAYWRIGHT can name an existing Playwright module; evidence stays in scratch.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { unzipSync } from "fflate";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.IMD_PLAYWRIGHT ?? "playwright");
const out = "test/scratch/revision";
await mkdir(out, { recursive: true });
await build({ stdin: { contents: 'export * from "./shared/state"; export * from "./shared/api"; export * from "./shared/art"; export * from "./shared/card"; export * from "./shared/panel";', resolveDir: process.cwd() }, bundle: true, format: "esm", outfile: `${out}/helpers.js` });
const helpers = await import(pathToFileURL(resolve(`${out}/helpers.js`)).href);
const results = [];
const check = async (name, fn) => {
  try { const detail = await fn(); results.push({ name, passed: true, detail }); }
  catch (e) { results.push({ name, passed: false, detail: e.stack }); }
};
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".zip": "application/zip" };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const path = decodeURIComponent(url.pathname).replace(/^\/preview\//, "");
  const file = path === "helpers.js" ? `${out}/helpers.js` : `dist/${path || "index.html"}`;
  if (path.includes("..")) { res.writeHead(400); res.end(); return; }
  try { res.setHeader("Content-Type", mime[extname(file)] ?? "application/octet-stream"); res.end(await readFile(file)); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/preview/`;
const browser = await chromium.launch({ headless: true });
const status = { measurement: { coreStatus: "IDLE", freshness: "online", cumulativeWorkUnits: "100", speedMmPerSecond: "0", distanceMm: "12345" }, builder: { anchor: { blockHeight: "10", blockProgress: "0" } } };
const contexts = [];
const freshPage = async (width = 390, lang = "en", coreStatus = "IDLE") => {
  const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 844 }, reducedMotion: "reduce" });
  contexts.push(context);
  await context.addInitScript(lang => { if (!localStorage.getItem("squeekpal-lang")) localStorage.setItem("squeekpal-lang", lang); Math.random = () => 0; }, lang);
  const calls = [], errors = [], failed = [];
  await context.route("https://api.squeekchain.com/**", route => {
    const url = route.request().url(); calls.push(url);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(url.includes("/events") ? { events: [{ id: "record1", type: "measurement.speed_record", occurredAt: new Date().toISOString() }] } : { ...status, measurement: { ...status.measurement, coreStatus } }) });
  });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(String(error)));
  page.on("response", r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  return { page, context, calls, errors, failed };
};

try {
  await check("README in root and downloadable source", async () => {
    const readme = await readFile("README.md", "utf8");
    const archive = unzipSync(await readFile("dist/downloads/squeek-pal-source.zip"));
    assert.equal(new TextDecoder().decode(archive["squeek-pal/README.md"]), readme);
    for (const file of ["DESIGN.md", "artifacts/validation.md"]) assert.equal(new TextDecoder().decode(archive[`squeek-pal/${file}`]), await readFile(file, "utf8"));
    for (const field of ["storage", "alarms", "https://x.com/*", "https://twitter.com/*", "https://api.squeekchain.com/*", "measurement.coreStatus", "measurement.freshness", "measurement.rpmMilli", "measurement.speedMmPerSecond", "measurement.distanceMm", "measurement.cumulativeWorkUnits", "builder.anchor.blockHeight", "builder.anchor.blockProgress", "/events?category=measurement&limit=20", "300", "12:00 UTC"]) assert.ok(readme.includes(field), field);
    return `${Object.keys(archive).length} source entries; required documentation matches root`;
  });

  for (const lang of ["en", "vi"]) for (const width of [320, 390, 1440]) {
    await check(`${lang} routes and first screen at ${width}`, async () => {
      const { page, errors, failed } = await freshPage(width, lang);
      const boxes = {};
      for (const route of ["/", "/demo", "/install"]) {
        await page.goto(`${base}index.html#${route}`);
        await page.locator("h1").waitFor();
        assert.equal(await page.locator("html").getAttribute("lang"), lang);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} horizontal overflow`);
        if (route === "/demo") {
          const b = await page.locator("[data-squeekpal]").evaluate(el => el.getBoundingClientRect().toJSON());
          assert.ok(b.top >= 0 && b.bottom <= (width === 1440 ? 900 : 844), `pal outside first screen: ${JSON.stringify(b)}`);
          boxes.palBottom = b.bottom;
          const tabs = page.locator("#popup .sp-tabs");
          assert.ok(await tabs.evaluate(el => el.scrollWidth <= el.clientWidth), "tabs scroll sideways");
          const frame = await page.locator("#popup").boundingBox();
          const last = await page.locator('#popup [data-tab="settings"]').boundingBox();
          assert.ok(last.x >= frame.x && last.x + last.width <= frame.x + frame.width, "Settings clipped");
        }
        if (route === "/" && width === 390) assert.ok(await page.locator(".hero .primary").evaluate(el => el.getBoundingClientRect().bottom < innerHeight));
        await page.screenshot({ path: `${out}/${lang}-${width}-${route === "/" ? "home" : route.slice(1)}.png`, fullPage: true });
      }
      assert.deepEqual(errors, []); assert.deepEqual(failed, []);
      return boxes;
    });
  }

  await check("skip link and install anchors preserve the route", async () => {
    const { page } = await freshPage();
    for (const route of ["demo", "install"]) {
      await page.goto(`${base}index.html#/${route}`);
      const title = await page.locator("h1").textContent();
      await page.locator(".skip").focus(); await page.keyboard.press("Enter");
      assert.equal(await page.locator("h1").textContent(), title);
      assert.equal(await page.evaluate(() => location.hash), `#/${route}`);
      assert.equal(await page.evaluate(() => document.activeElement.id), "main");
    }
    for (const anchor of ["chrome", "firefox"]) {
      await page.evaluate(anchor => { location.hash = anchor; }, anchor);
      await page.waitForFunction(anchor => location.hash === `#${anchor}`, anchor);
      assert.equal(await page.locator("h1").textContent(), "Install in two minutes");
      assert.ok(await page.locator(`#${anchor}`).isVisible());
    }
  });

  await check("panel and saved pal stay within the timeline after drag, resize and reload", async () => {
    const { page } = await freshPage(1440);
    await page.goto(`${base}index.html#/demo`);
    const phone = page.locator("#phone");
    const pal = page.locator("[data-squeekpal] .pal");
    const frame = await phone.boundingBox();
    const origin = await pal.boundingBox();
    await page.mouse.move(origin.x + 40, origin.y + 35); await page.mouse.down();
    await page.mouse.move(frame.x + 44, frame.y + 40, { steps: 10 }); await page.mouse.up();
    await pal.click();
    const inside = async () => {
      const frame = await phone.boundingBox(), b = await page.locator("[data-squeekpal] .panel").boundingBox();
      assert.ok(b && b.x >= frame.x - 1 && b.y >= frame.y - 1 && b.x + b.width <= frame.x + frame.width + 1 && b.y + b.height <= frame.y + frame.height + 1, `panel clipped: ${JSON.stringify({ frame, b })}`);
    };
    await inside();
    await page.locator('[data-squeekpal] [data-act="feed"]').click();
    await page.setViewportSize({ width: 390, height: 844 }); await inside();
    await page.reload();
    const b = await pal.boundingBox(), f = await phone.boundingBox();
    assert.ok(b.x >= f.x - 1 && b.y >= f.y - 1 && b.x + b.width <= f.x + f.width + 1 && b.y + b.height <= f.y + f.height + 1);
    await pal.click(); await inside();
    await page.screenshot({ path: `${out}/drag-resize.png`, fullPage: true });
    return { pal: b, frame: f };
  });

  await check("save import rejects markup, persists safely, and leaves care usable", async () => {
    const { page } = await freshPage(1440);
    await page.goto(`${base}index.html#/demo`);
    const code = await page.evaluate(async () => {
      const h = await import("./helpers.js"), s = h.defaultState(Date.now());
      s.seeds = '<img src=x onerror="window.__xss=1">'; s.pet.name = '<img src=x>';
      s.chests.pending = [{ id: '\" onclick=\"window.__xss=2', kind: "normal", createdAt: Date.now() }];
      return h.exportCode(s);
    });
    await page.locator('#popup [data-tab="settings"]').click();
    await page.locator("#popup textarea").fill(code);
    await page.locator('#popup [data-act="import"]').click();
    await page.locator('#popup [data-tab="pet"]').click();
    await page.locator("[data-squeekpal] .pal").click();
    await page.locator('#popup [data-act="feed"]').click();
    await page.reload();
    assert.equal(await page.evaluate(() => window.__xss ?? 0), 0);
    assert.equal(await page.locator("#popup img").count(), 0);
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem("squeekpal-demo")));
    assert.equal(typeof state.seeds, "number"); assert.equal(state.seeds, 10);
    assert.equal(state.chests.pending.length, 0);
  });

  await check("Settings language updates the whole page and retains the selected tab", async () => {
    const { page } = await freshPage(1440);
    await page.goto(`${base}index.html#/demo`);
    await page.locator('#popup [data-tab="settings"]').click();
    await page.locator('#popup select[name="lang"]').selectOption("vi");
    assert.equal(await page.locator("h1").textContent(), "Chơi thử");
    assert.equal(await page.locator("#more").textContent(), "Xem thêm bài đăng");
    assert.equal(await page.locator('#popup [aria-selected="true"]').getAttribute("data-tab"), "settings");
    assert.equal(await page.locator(".post-actions").first().textContent(), "Trả lờiĐăng lạiThích");
    await page.locator(".brand").click();
    await page.waitForFunction(() => document.title === "Squeek Pal: chú hamster pixel trên x.com");
    assert.equal(await page.title(), "Squeek Pal: chú hamster pixel trên x.com");
    assert.equal(await page.locator("#shot-card canvas").getAttribute("aria-label"), "Thẻ thú cưng: Pip, Trưởng thành, 342 Hạt");
    assert.equal(await page.locator("#shot-post .post-actions").textContent(), "Trả lờiĐăng lạiThích");
  });

  await check("navigation respects Retry-After and retains the wheel reading", async () => {
    const { page, context, calls } = await freshPage();
    await context.unroute("https://api.squeekchain.com/**");
    await context.route("https://api.squeekchain.com/**", route => { calls.push(route.request().url()); return route.fulfill({ status: 429, headers: { "Retry-After": "3600" } }); });
    await page.goto(`${base}index.html#/`);
    await page.getByText("Can't reach the wheel right now", { exact: true }).waitFor();
    for (let i = 0; i < 4; i++) await page.locator("#lang").click();
    for (let i = 0; i < 3; i++) { await page.locator('#nav a[href="#/install"]').click(); await page.locator(".brand").click(); }
    assert.equal(calls.length, 1);
    await page.getByText("Can't reach the wheel right now", { exact: true }).waitFor();
    return { requests: calls.length };
  });

  await check("hero canvas follows idle, active and unknown live readings under reduced motion", async () => {
    for (const [core, pose] of [["IDLE", "nap"], ["ACTIVE", "run"], ["COUNTER_FAULT", "sit"]]) {
      const { page } = await freshPage(390, "en", core);
      await page.goto(`${base}index.html#/`);
      await page.waitForFunction(() => !document.querySelector(".sp-live-head").textContent.includes("Checking"));
      const same = await page.evaluate(async pose => {
        const h = await import("./helpers.js"), c = document.createElement("canvas");
        c.width = 224; c.height = 208; const ctx = c.getContext("2d"); ctx.scale(8, 8);
        h.drawPal(ctx, { pose, frame: 0, hat: "party", wheel: "sunset", mood: "happy" });
        return c.toDataURL() === document.querySelector("#hero-stage canvas").toDataURL();
      }, pose);
      assert.ok(same, `${core} hero differs from ${pose}`);
      assert.equal(await page.locator("#hero-stage canvas").getAttribute("aria-label"), "Your pal");
    }
  });

  await check("landing screenshot contains a post, action-row chest and pal, with a readable card", async () => {
    const { page } = await freshPage(1440);
    await page.goto(`${base}index.html#/`);
    assert.equal(await page.locator("#shot-post article").count(), 1);
    assert.equal(await page.locator('#shot-post [role="group"] canvas').count(), 1);
    assert.equal(await page.locator("#shot-post .shot-pal").count(), 1);
    assert.equal(await page.locator("#shot-golden canvas").count(), 1);
    const width = await page.locator("#shot-card").evaluate(el => el.getBoundingClientRect().width);
    assert.equal(width, 600);
    return { cardWidth: width };
  });

  await check("pet card fits wide names, Vietnamese legend and large amounts; PNG download is 1200x630", async () => {
    const { page } = await freshPage(1440);
    await page.goto(`${base}index.html#/demo`);
    const lines = await page.evaluate(async () => {
      const h = await import("./helpers.js"), s = h.defaultState(Date.now(), "vi");
      s.pet.name = "WWWWWWWWWWWWWWWW"; s.pet.xp = 2500; s.seeds = 12345;
      localStorage.setItem("squeekpal-demo", JSON.stringify(s));
      localStorage.setItem("squeekpal-lang", "vi");
      const c = document.createElement("canvas"), rows = [], original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function(text, x, y, ...rest) { rows.push({ text, x, y, width: this.measureText(text).width }); return original.call(this, text, x, y, ...rest); };
      h.drawCard(c, s); CanvasRenderingContext2D.prototype.fillText = original;
      return rows.filter(r => r.y === 150 || r.y === 205);
    });
    assert.equal(lines.length, 2); for (const line of lines) assert.ok(line.width <= 600 && line.x + line.width <= 1160, JSON.stringify(line));
    await page.reload();
    const downloadPromise = page.waitForEvent("download");
    await page.locator('#popup [data-act="card"]').click();
    const download = await downloadPromise; await download.saveAs(`${out}/pet-card.png`);
    const png = await readFile(`${out}/pet-card.png`);
    assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
    return lines;
  });

  await check("care, minimization, chest placement/opening and placement-off fallback", async () => {
    const { page, calls } = await freshPage(1440);
    await page.goto(`${base}index.html#/demo`);
    const state = () => page.evaluate(() => JSON.parse(localStorage.getItem("squeekpal-demo")));
    await page.locator('[data-squeekpal] .pal').click();
    await page.locator('[data-squeekpal] [data-act="play"]').click();
    assert.equal((await state()).counters.plays, 1);
    await page.locator('[data-squeekpal] [data-act="min"]').click();
    await page.locator('[data-squeekpal] .bubble').click();
    await page.locator('[data-squeekpal] .pal').click();
    await page.locator('[data-squeekpal] [data-act="close"]').click();
    for (let i = 0; i < 28; i++) { await page.locator('#timeline').evaluate(el => { el.scrollTop += 120; }); await page.waitForTimeout(30); }
    const chests = page.locator('[data-squeekpal-chest]');
    assert.ok(await chests.count() > 0, 'no chest after 20+ visible sample posts');
    const before = await state();
    assert.equal(before.chests.opened, 0);
    await chests.first().click();
    assert.equal((await state()).chests.opened, 1);
    assert.ok((await state()).seeds > before.seeds);
    await page.locator('#popup [data-tab="settings"]').click();
    await page.locator('#popup input[name="chestsOn"]').uncheck();
    await page.locator('#timeline').evaluate(el => { el.innerHTML = '<p>X markup changed</p>'; });
    await page.locator('[data-squeekpal] .pal').click();
    await page.locator('[data-squeekpal] [data-act="clean"]').click();
    assert.equal((await state()).counters.cleans, 1);
    assert.ok(calls.every(url => url.startsWith('https://api.squeekchain.com/')));
  });

  await check("browser ZIP manifests and local scripts", async () => {
    const sizes = {};
    for (const browser of ["chrome", "firefox"]) {
      const bytes = await readFile(`dist/downloads/squeek-pal-${browser}.zip`), files = unzipSync(bytes);
      const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
      assert.deepEqual(manifest.permissions, ['storage', 'alarms']);
      assert.deepEqual(manifest.host_permissions, ['https://x.com/*', 'https://twitter.com/*', 'https://api.squeekchain.com/*']);
      for (const file of ['background.js', 'content.js', 'popup.js', 'popup.html', 'options.html']) assert.ok(files[file]?.length > 0, file);
      if (browser === 'chrome') assert.equal(manifest.background.service_worker, 'background.js');
      else assert.ok(manifest.browser_specific_settings.gecko.id);
      sizes[browser] = bytes.length;
    }
    return sizes;
  });

  await check("standalone popup Settings ignores the body's initial-tab attribute", async () => {
    const { page } = await freshPage();
    await page.goto(`${base}index.html#/`);
    await page.evaluate(async () => {
      const h = await import("./helpers.js");
      document.body.dataset.tab = "pet";
      const root = document.createElement("div"); root.id = "standalone-popup"; document.body.prepend(root);
      const style = document.createElement("style"); style.textContent = h.PANEL_CSS; document.head.append(style);
      let state = h.defaultState(Date.now()); const subs = new Set();
      const store = { get: () => state, subscribe: f => { subs.add(f); return () => subs.delete(f); }, dispatch: async a => { state = { ...state, settings: { ...state.settings, ...a.patch } }; for (const f of subs) f(state); return {}; } };
      h.mountPanel(root, { store, shareUrl: "" });
    });
    await page.locator('#standalone-popup [data-tab="settings"]').click();
    await page.locator('#standalone-popup input[name="chestsOn"]').uncheck();
    assert.equal(await page.locator('#standalone-popup [aria-selected="true"]').getAttribute('data-tab'), 'settings');
    assert.equal(await page.locator('#standalone-popup input[name="chestsOn"]').isChecked(), false);
    await page.locator('#standalone-popup select[name="lang"]').click();
    assert.equal(await page.locator('#standalone-popup [aria-selected="true"]').getAttribute('data-tab'), 'settings');
  });
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
  await new Promise(r => server.close(r));
}
await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
for (const r of results) console.log(`${r.passed ? 'PASS' : 'FAIL'} ${r.name}${r.passed ? '' : `\n${r.detail}`}`);
console.log(`${results.filter(r => r.passed).length}/${results.length} regression checks passed`);
if (results.some(r => !r.passed)) process.exitCode = 1;
