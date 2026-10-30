// Background service worker (Chrome) / event page (Firefox).
// Owns the save: every change arrives as a message and runs through the shared reducer.
// Only network calls: api.squeekchain.com /status (every minute) and /events (every 5 minutes).
import { fetchEvents, fetchStatus } from "../shared/api";
import { reduce, type Action, type Effects } from "../shared/game";
import { defaultState, migrate, STORAGE_KEY, type SaveState } from "../shared/state";

const STATUS_ALARM = "squeekpal-status";
const EVENTS_ALARM = "squeekpal-events";

let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<SaveState> {
  const got = await chrome.storage.local.get(STORAGE_KEY);
  const raw = got[STORAGE_KEY];
  if (!raw) {
    const lang = (chrome.i18n?.getUILanguage?.() ?? "en").toLowerCase().startsWith("vi") ? "vi" : "en";
    return defaultState(Date.now(), lang);
  }
  return migrate(raw, Date.now());
}

/** Serialised so two messages never overwrite each other's changes. */
function apply(action: Action): Promise<Effects> {
  const job = queue.then(async () => {
    const prev = await load();
    const { state, fx } = reduce(prev, action, { now: Date.now(), rand: Math.random });
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
    return fx;
  });
  queue = job.catch(() => undefined);
  return job;
}

async function pollStatus() {
  const s = await load();
  if (s.sync.retryAfter > Date.now()) return; // 429: wait as asked
  const snap = await fetchStatus(fetch.bind(globalThis), Date.now());
  await apply({ type: "status", snap });
}

async function pollEvents() {
  const s = await load();
  if (s.sync.retryAfter > Date.now()) return;
  const r = await fetchEvents(fetch.bind(globalThis), Date.now());
  if (!r) return;
  if (r.retryAfter) {
    await apply({ type: "status", snap: { ...s.sync, reach: "error", retryAfter: r.retryAfter } });
    return;
  }
  await apply({ type: "events", events: r.events });
}

function ensureAlarms() {
  // chrome.alarms: once a minute for /status (never faster), every 5 minutes for /events.
  chrome.alarms.create(STATUS_ALARM, { periodInMinutes: 1, delayInMinutes: 0.1 });
  chrome.alarms.create(EVENTS_ALARM, { periodInMinutes: 5, delayInMinutes: 0.2 });
}

chrome.runtime.onInstalled.addListener(async () => {
  const got = await chrome.storage.local.get(STORAGE_KEY);
  if (!got[STORAGE_KEY]) await chrome.storage.local.set({ [STORAGE_KEY]: await load() });
  ensureAlarms();
});

chrome.runtime.onStartup.addListener(ensureAlarms);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === STATUS_ALARM) void pollStatus();
  if (alarm.name === EVENTS_ALARM) void pollEvents();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "squeekpal:dispatch" && msg.action && typeof msg.action.type === "string") {
    apply(msg.action as Action).then(sendResponse, () => sendResponse({}));
    return true; // async response
  }
  return false;
});
