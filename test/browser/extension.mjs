// Native unpacked Chromium smoke test on synthetic X pages, without an account.
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const { chromium } = await import(process.env.IMD_PLAYWRIGHT ?? "playwright");
const out = "test/scratch/extension";
await mkdir(out, { recursive: true });
await build({ stdin: { contents: 'export { defaultState } from "./shared/state";', resolveDir: process.cwd() }, bundle: true, format: "esm", outfile: `${out}/state.js` });
const { defaultState } = await import(pathToFileURL(resolve(`${out}/state.js`)).href);
const profile = await mkdtemp(join(tmpdir(), "squeek-pal-browser-"));
let context;
const results = [];
try {
  context = await chromium.launchPersistentContext(join(profile, "data"), {
    headless: true, channel: "chromium", viewport: { width: 360, height: 600 },
    ignoreDefaultArgs: ["--disable-extensions"],
    env: { XDG_CONFIG_HOME: join(profile, "config"), XDG_CACHE_HOME: join(profile, "cache") },
    args: [`--disable-extensions-except=${resolve("build/chrome")}`, `--load-extension=${resolve("build/chrome")}`],
  });
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker", { timeout: 15_000 });
  const extensionId = new URL(worker.url()).host;
  const errors = [], requests = [];
  context.on("page", page => page.on("pageerror", e => errors.push(String(e))));
  context.on("request", r => { if (r.url().startsWith("http")) requests.push(r.url()); });
  await context.route("https://api.squeekchain.com/**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(route.request().url().includes("/events") ? { events: [] } : { measurement: { coreStatus: "IDLE", freshness: "online" }, builder: { anchor: { blockHeight: "10" } } }) }));
  // UI test only: alarms/earnings are separately covered by the game tests.
  await worker.evaluate(async seed => { await chrome.storage.local.set({ squeekpal: seed }); await chrome.alarms.clearAll(); }, defaultState(Date.now()));
  await context.route("https://x.com/**", route => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body style="background:#fff"><main><h1>X fixture</h1><article data-testid="tweet"><div data-testid="tweetText">Squeekchain visible sample text</div><div role="group">Sample actions</div></article></main></body></html>' }));
  const page = await context.newPage();
  for (const path of ["/home", "/sample", "/sample/status/1"]) {
    await page.goto(`https://x.com${path}`);
    await page.locator("[data-squeekpal] .pal").click();
    await page.locator('[data-squeekpal] [data-act="feed"]').click();
    results.push({ path, widget: true, feed: true });
  }
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.locator('button[data-tab="settings"]').click();
  await popup.locator('select[name="lang"]').selectOption("vi");
  await popup.waitForFunction(() => document.documentElement.lang === "vi");
  assert.ok(await popup.locator(".sp-tabs").evaluate(el => el.scrollWidth <= el.clientWidth));
  await popup.screenshot({ path: `${out}/popup-vi.png` });
  await popup.locator('input[name="chestsOn"]').uncheck();
  await popup.locator('button[data-tab="pet"]').click();
  await popup.locator('[data-act="play"]').click();
  // Read the background-owned save, waiting for its asynchronous message queue.
  let saved;
  for (let i = 0; i < 100; i++) {
    saved = await worker.evaluate(async () => (await chrome.storage.local.get("squeekpal")).squeekpal);
    if (saved.counters.plays === 1) break;
    await new Promise(r => setTimeout(r, 20));
  }
  assert.equal(saved.settings.chestsOn, false);
  assert.equal(saved.counters.feeds, 3);
  assert.equal(saved.counters.plays, 1);
  await popup.goto(`chrome-extension://${extensionId}/options.html`);
  await popup.locator('select[name="lang"]').waitFor();
  assert.deepEqual(errors, []);
  assert.ok(requests.every(url => url.startsWith("https://x.com/") || url.startsWith("https://api.squeekchain.com/")));
  results.push({ nativeChromium: "passed", popup: "VI tabs and Settings usable at 360", options: "Settings loaded", scriptErrors: errors });
  await writeFile(`${out}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await context?.close();
  await rm(profile, { recursive: true, force: true });
}
