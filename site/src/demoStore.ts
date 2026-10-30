// The website demo runs the same reducer in the page and saves to localStorage.
// It polls the real Squeekchain API on the same schedule as the extension's worker.
import { fetchEvents, fetchStatus } from "../../shared/api";
import { reduce, type Action, type Effects } from "../../shared/game";
import { defaultState, migrate, type Lang, type SaveState } from "../../shared/state";
import type { PalStore } from "../../shared/store";

const KEY = "squeekpal-demo";

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
    apply({ type: "status", snap: await fetchStatus(fetch.bind(window), Date.now()) });
  };
  const pollEvents = async () => {
    if (state.sync.retryAfter > Date.now()) return;
    const r = await fetchEvents(fetch.bind(window), Date.now());
    if (r && !r.retryAfter) apply({ type: "events", events: r.events });
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
  let s = defaultState(Date.now(), lang);
  const poll = async () => {
    const snap = await fetchStatus(fetch.bind(window), Date.now());
    s = reduce(s, { type: "status", snap }, { now: Date.now(), rand: Math.random }).state;
    onChange(s);
  };
  void poll();
  const id = window.setInterval(poll, 60_000);
  return () => clearInterval(id);
}
