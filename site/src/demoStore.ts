// The website demo runs the same reducer in the page and saves to localStorage.
// It polls the real Squeekchain API on the same schedule as the extension's worker.
import { fetchEvents, fetchStatus } from "../../shared/api";
import { reduce, type Action, type Effects } from "../../shared/game";
import { defaultState, migrate, type Lang, type SaveState, type WheelSnapshot } from "../../shared/state";
import type { PalStore } from "../../shared/store";

const KEY = "squeekpal-demo";

// Keep the reading and request schedule across route/language renders, and share
// it with the demo so navigating never starts an extra /status request.
let liveState = defaultState(Date.now());
let nextPoll = 0;
let pending: Promise<WheelSnapshot> | null = null;
const rememberRetry = (retryAfter: number) => {
  liveState.sync = { ...liveState.sync, reach: "error", retryAfter: Math.max(liveState.sync.retryAfter, retryAfter) };
};
function statusReading(): Promise<WheelSnapshot> {
  if (pending) return pending;
  const now = Date.now();
  if (now < Math.max(nextPoll, liveState.sync.retryAfter)) return Promise.resolve(liveState.sync);
  nextPoll = now + 60_000;
  pending = fetchStatus(fetch.bind(window), now).then(snap => {
    // An /events 429 may have arrived while /status was in flight.
    if (liveState.sync.retryAfter > Date.now()) snap = { ...snap, reach: "error", retryAfter: Math.max(snap.retryAfter, liveState.sync.retryAfter) };
    liveState = reduce(liveState, { type: "status", snap }, { now: Date.now(), rand: Math.random }).state;
    return liveState.sync;
  }).finally(() => { pending = null; });
  return pending;
}

export interface DemoStore extends PalStore {
  reset(): void;
  stop(): void;
}

export function demoStore(lang: Lang): DemoStore {
  let state: SaveState;
  try {
    const raw = localStorage.getItem(KEY);
    state = raw ? migrate(JSON.parse(raw), Date.now()) : defaultState(Date.now(), lang);
  } catch {
    state = defaultState(Date.now(), lang);
  }
  const subs = new Set<(s: SaveState) => void>();
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* private mode: the demo still plays */
    }
    for (const fn of subs) fn(state);
  };
  const apply = (action: Action): Effects => {
    const r = reduce(state, action, { now: Date.now(), rand: Math.random });
    state = r.state;
    save();
    return r.fx;
  };

  const pollStatus = async () => {
    if (state.sync.retryAfter > Date.now()) return;
    apply({ type: "status", snap: await statusReading() });
  };
  const pollEvents = async () => {
    if (Math.max(state.sync.retryAfter, liveState.sync.retryAfter) > Date.now()) return;
    const r = await fetchEvents(fetch.bind(window), Date.now());
    if (r?.retryAfter) {
      rememberRetry(r.retryAfter);
      apply({ type: "status", snap: { ...state.sync, reach: "error", retryAfter: r.retryAfter } });
    } else if (r) apply({ type: "events", events: r.events });
  };
  // the open demo page stands in for an open x.com tab
  const beat = () => !document.hidden && apply({ type: "heartbeat" });
  beat();
  void pollStatus();
  void pollEvents();
  const timers = [window.setInterval(pollStatus, 60_000), window.setInterval(pollEvents, 300_000), window.setInterval(beat, 30_000)];

  return {
    get: () => state,
    dispatch: async (a) => apply(a),
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    reset() {
      const keepSync = state.sync;
      state = { ...defaultState(Date.now(), state.settings.lang), sync: keepSync, lastXSeen: Date.now() };
      save();
    },
    stop() {
      timers.forEach(clearInterval);
    },
  };
}

/** A read-only store for the home page's live strip: polls /status once a minute. */
export function liveOnly(onChange: (s: SaveState) => void, lang: Lang): () => void {
  let active = true;
  onChange(liveState);
  const poll = async () => {
    await statusReading();
    if (active) onChange(liveState);
  };
  void poll();
  const id = window.setInterval(poll, 60_000);
  return () => { active = false; clearInterval(id); };
}
