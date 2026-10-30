// Builds the browser extension for Chrome (MV3) and Firefox from /extension and /shared,
// zips both, renders icons and the og:image, and puts the downloads in site/public/.
import { build } from "esbuild";
import { zipSync } from "fflate";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const out = join(root, "build");
const siteUrl = process.env.SITE_URL ?? "";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// 1. assets from the pixel art code
await build({ entryPoints: [join(root, "scripts/assets.ts")], bundle: true, platform: "node", format: "esm", outfile: join(out, "assets.mjs"), logLevel: "warning" });
const assets = await import(pathToFileURL(join(out, "assets.mjs")).href);
const iconDir = join(out, "icons");
mkdirSync(iconDir);
for (const size of [16, 32, 48, 128]) writeFileSync(join(iconDir, `icon${size}.png`), assets.icon(size));
mkdirSync(join(root, "site/public/downloads"), { recursive: true });
writeFileSync(join(root, "site/public/og.png"), assets.ogImage());
writeFileSync(join(root, "site/public/favicon.png"), assets.icon(32));

// 2. scripts, as classic scripts (content scripts can't be modules)
const js = join(out, "js");
await build({
  entryPoints: { background: "extension/background.ts", content: "extension/content.ts", popup: "extension/popup.ts" },
  absWorkingDir: root,
  bundle: true,
  format: "iife",
  target: ["chrome110", "firefox115"],
  outdir: js,
  minify: false,
  legalComments: "none",
  define: { __SITE_URL__: JSON.stringify(siteUrl) },
  logLevel: "warning",
});

const hosts = ["https://x.com/*", "https://twitter.com/*", "https://api.squeekchain.com/*"];
const base = {
  manifest_version: 3,
  name: "Squeek Pal",
  version: pkg.version,
  description: "A tiny pixel hamster on x.com that lives in sync with Squeektoshi's real wheel. Unofficial fan project.",
  permissions: ["storage", "alarms"],
  host_permissions: hosts,
  icons: { 16: "icons/icon16.png", 32: "icons/icon32.png", 48: "icons/icon48.png", 128: "icons/icon128.png" },
  action: { default_popup: "popup.html", default_title: "Squeek Pal", default_icon: { 16: "icons/icon16.png", 32: "icons/icon32.png" } },
  options_ui: { page: "options.html", open_in_tab: true },
  content_scripts: [{ matches: ["https://x.com/*", "https://twitter.com/*"], js: ["content.js"], run_at: "document_idle" }],
  content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
};
const manifests = {
  chrome: { ...base, background: { service_worker: "background.js" }, minimum_chrome_version: "110" },
  firefox: {
    ...base,
    background: { scripts: ["background.js"] },
    browser_specific_settings: { gecko: { id: "squeek-pal@squeekpal.fan", strict_min_version: "115.0", data_collection_permissions: { required: ["none"] } } },
  },
};

function filesOf(dir) {
  const files = {};
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else files[relative(dir, p).split("\\").join("/")] = new Uint8Array(readFileSync(p));
    }
  };
  walk(dir);
  return files;
}

const FIXED = new Date("2026-01-01T00:00:00Z");
for (const [browser, manifest] of Object.entries(manifests)) {
  const dir = join(out, browser);
  mkdirSync(dir, { recursive: true });
  for (const f of ["background.js", "content.js", "popup.js"]) cpSync(join(js, f), join(dir, f));
  cpSync(join(root, "extension/popup.html"), join(dir, "popup.html"));
  cpSync(join(root, "extension/options.html"), join(dir, "options.html"));
  cpSync(iconDir, join(dir, "icons"), { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  const files = filesOf(dir);
  const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [v, { mtime: FIXED }]])), { level: 9 });
  writeFileSync(join(root, `site/public/downloads/squeek-pal-${browser}.zip`), zipped);
  console.log(`built ${browser}: ${Object.keys(files).length} files, ${zipped.length} bytes zipped`);
}

// 3. the source, so the download page can link to exactly what was built
const src = {};
for (const d of ["extension", "shared", "scripts", "site", "test"]) {
  const p = join(root, d);
  try {
    statSync(p);
  } catch {
    continue;
  }
  for (const [k, v] of Object.entries(filesOf(p))) {
    if (k.startsWith("public/downloads/") || k.startsWith("scratch/") || k.endsWith("og.png")) continue;
    src[`squeek-pal/${d}/${k}`] = [v, { mtime: FIXED }];
  }
}
for (const f of ["package.json", "package-lock.json", "tsconfig.json", "vite.config.ts", "README.md", "DESIGN.md"]) {
  try {
    src[`squeek-pal/${f}`] = [new Uint8Array(readFileSync(join(root, f))), { mtime: FIXED }];
  } catch {
    /* optional */
  }
}
const srcZip = zipSync(src, { level: 9 });
writeFileSync(join(root, "site/public/downloads/squeek-pal-source.zip"), srcZip);
console.log(`source zip: ${Object.keys(src).length} files, ${srcZip.length} bytes`);
