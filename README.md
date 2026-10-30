# Squeek Pal

A tiny pixel hamster for x.com, living in sync with Squeektoshi's real wheel on Squeekchain, a proof-of-work toychain on Ethereum Sepolia. The static website includes a playable demo and Chrome/Firefox extension downloads. EN and VI are available in the site header and the pal's Settings.

Made by [@Truongsonxyz](https://x.com/Truongsonxyz). [Join Squeekchain Genesis](https://squeekchain.com/genesis/e86n3z8y).

**Unofficial fan project. Testnet values have no monetary value.** Squeektoshi runs when it wants to; nothing in this game asks or pressures the real hamster to run.

## Install the extension

### Chrome, Edge and Brave

1. Download `dist/downloads/squeek-pal-chrome.zip` from the website and unzip it into a folder you will keep.
2. Enter `chrome://extensions` in the address bar.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the extracted folder containing `manifest.json`.
5. Pin Squeek Pal from the extensions menu and open x.com. The pal appears in the bottom-right corner on home, profile and tweet pages. Click it for care controls; drag to move it.

### Firefox

1. Download `dist/downloads/squeek-pal-firefox.zip`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on** and select the ZIP, or unzip it and select `manifest.json`.
4. In `about:addons`, open Squeek Pal's **Permissions** and allow x.com, twitter.com and api.squeekchain.com.
5. Open x.com. Temporary add-ons are removed when Firefox closes; load it again next session. This is an unsigned development build, not a store installation.

Click the toolbar icon for the pet, shop, wardrobe, quests and Settings. Options opens Settings in a full page. Copy a save code before updates, then download/extract the new version and reload it. Settings can turn chest placement off without removing the pal, restore hidden pages, and export/import the local save.

## Permissions and hosts

- `storage`: saves the pet, settings, wheel reading and progression in `chrome.storage.local` under the versioned `squeekpal` key; migrations repair older saves.
- `alarms`: schedules a public `/status` read once per minute and a measurement `/events` read every five minutes, including when the popup is closed.
- `https://x.com/*`: places the pal and optional chests on X. Only visible post text is inspected locally for Squeekchain keywords; no text leaves the device.
- `https://twitter.com/*`: provides the same companion on the legacy Twitter host.
- `https://api.squeekchain.com/*`: reads public wheel status and measurement events, without credentials or a key. These are the extension's only network requests.

There is no `tabs`, `cookies` or `<all_urls>` permission, analytics, tracker, wallet, token, remote code or eval. The extension never reads DMs, notifications, followers, cookies, login tokens or other account data. State stays on the device. The website uses localStorage for its separate demo save; it does not import or change the extension's save automatically.

## API fields used

- Base: `https://api.squeekchain.com/v1`, public read-only JSON, no key, CORS open.
- `GET /status`: `measurement.coreStatus` (`ACTIVE`, `IDLE`, `COUNTER_FAULT`) and `measurement.freshness` select the synced behavior.
- `measurement.rpmMilli`, `measurement.speedMmPerSecond`, `measurement.distanceMm`: stored wheel readings; speed and distance appear in the live strip.
- `measurement.cumulativeWorkUnits`: decimal-string cumulative magnet passes; differences between readings determine running Seeds.
- `builder.anchor.blockHeight`: shown in the live strip and compared for a new block bonus.
- `builder.anchor.blockProgress`: retained with the wheel snapshot.
- `GET /events?category=measurement&limit=20`, every five minutes: `id` deduplicates events; `type` identifies `measurement.speed_record` and `measurement.distance_milestone`; `occurredAt`, falling back to `recordedAt`, supplies the event time. Older timestamp field aliases are supported.
- Big numbers remain decimal strings for comparisons. `{"status":"unavailable"}` means unknown, never zero. A failed read shows **Can't reach the wheel right now**, keeps the pal playable, and disables sync bonuses. HTTP 429 honors `Retry-After` in seconds or HTTP-date form; status and events both defer requests until that deadline. The website retains its reading and status schedule across route/language changes.

## Game and safety rules

- Four stats, 0–100: hunger, happiness, energy and cleanliness drift slowly; time away applies at most 12 hours of drift. The pet never dies; neglect makes it grumpy. Feed, play and clean grant XP. Stages are Pup, Junior, Adult and Wheel Legend.
- **1 Seed per new real magnet pass**, measured by the difference in `cumulativeWorkUnits` between polls, only with `coreStatus === ACTIVE`, freshness online and a recently visible x.com tab (the visible demo stands in for one). The first reading is a baseline, not earnings. Running earns **at most 300 Seeds per real hour**.
- Regular Seed chests can appear only after at least **20 newly seen posts since the last regular chest**, at most one per 20 posts, and **12 placed chests per real hour**. Placement is occasional, not guaranteed. Bonus chests also count against the hourly placement limit. A chest opens only when clicked and grants Seeds and sometimes an item.
- Visible post text is checked case-insensitively for `squeekchain`, `@squeekchain`, `$SQK` and `#Squeekchain`. Mention posts can hold a more valuable golden chest. No account or hidden post data is consulted.
- While ACTIVE and online, the pal runs on its wheel and chest Seed rewards are **2×**. While IDLE, it naps and energy recovers **2×** as fast as an ordinary nap.
- A rise in real `builder.anchor.blockHeight` while browsing queues **one bonus chest**. A new speed-record or distance-milestone event starts a **one-hour golden-chest festival**, timed from the event. IDs are deduplicated; fresh installs ignore events older than one hour.
- Three of four rotating daily quests reset at **12:00 UTC**: open five chests, find a golden chest, be online during a run, and feed twice. The shop has three foods, three toys, four hats and three wheel skins. There are 22 achievements. Owned cosmetics appear on the pal and downloaded pet card.
- The pal lives in a Shadow DOM root, supports a 24px minimized bubble and per-page hiding, respects reduced motion, and follows X's light/dim/dark theme. Tweet selectors and fallbacks are centralized in `shared/selectors.ts`; the widget and toolbar work independently if placement is disabled or tweet markup changes.
- **No automated actions:** never posts, replies, likes, reposts or follows, and never asks for a reply to open a chest. **Share my Squeek Pal** opens `https://x.com/intent/post` with editable text. You choose whether to post. Downloading the 1200×630 PNG card does not contact X.
- Save codes have a typo checksum, not an authenticity guarantee. Imports validate numeric fields, known item/quest/achievement IDs, settings and nested records before use. Imported text is escaped before HTML rendering.

## Build and preview

Use Node.js 22 or newer and npm. From the repository root:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

Open the preview address printed by Vite. The build writes a complete static export to `dist/`, with relative asset URLs and hash routes `#/`, `#/demo`, `#/install`; serve that directory at any static subpath or IPFS gateway. No backend, server rewrites or external fonts/images are needed. Public API access is optional for gameplay and required only for real sync bonuses.

`npm run build:ext` builds `build/chrome/` and `build/firefox/`, draws original pixel icons/share art in code, and generates the browser ZIPs plus `site/public/downloads/squeek-pal-source.zip`. `npm run build:site` copies those assets into `dist/`. Run the combined build so the published ZIPs match the website's shared game logic. Dependencies are installed normally, not vendored; do not submit node_modules, build intermediates or scratch evidence. The source ZIP includes README, design documentation, tests, source, configuration and the npm lockfile.

The extension's share-link URL is a public build setting. Once the final landing address is assigned, rebuild with `SITE_URL=https://your-landing-address/ npm run build`. Without it, the extension opens the editable compose text without a landing link. The in-page demo uses the current landing URL. Hosting and the final URL are supplied after review.

## Source layout

- `extension/`: Chrome service worker / Firefox event page, content script, popup and options page.
- `site/`: Vite static site, demo, install guide and EN/VI site strings.
- `shared/`: pure game reducer/rules, API parsing, save validation, canvas art, widget and popup UI.
- `scripts/`: extension packaging and original pixel assets.
- `test/unit/`: time drift, earnings/caps, chests, noon quests, event festival/dedupe, save imports and site polling regressions.
- `dist/`: the production site and three downloadable ZIPs; this is the static hosting deliverable.

## Validation and limitations

After `npm run build`, run the browser regressions with a locally available Playwright module:

```sh
IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node test/browser/revision.mjs
IMD_PLAYWRIGHT=/path/to/playwright/index.mjs node test/browser/extension.mjs
```

The first serves the export at a subpath, exercises the routes and shared UI in Chromium, and writes screenshots/results under `test/scratch/revision/`. The second loads the built Chrome extension into a fresh temporary Chromium profile and checks synthetic home/profile/tweet pages, popup controls and options. It needs the full Chromium browser, rather than the headless shell. Set `PLAYWRIGHT_BROWSERS_PATH` if your existing browser installation requires it. These are test settings, not product configuration or extra runtime permissions. No real X account is used.

See [artifacts/validation.md](artifacts/validation.md) for the revision reproductions, actual checks, six-domain design review and remaining browser coverage limits. [DESIGN.md](DESIGN.md) records the implemented palette, typography, shared components and responsive behavior. Tests and local browser checks are worker evidence, not independent certification.
