// The whole save lives under one versioned key in chrome.storage.local
// (localStorage on the website demo). Migrations upgrade older saves.

export const STORAGE_KEY = "squeekpal";
export const SAVE_VERSION = 2;

export type Lang = "en" | "vi";
export type StatName = "hunger" | "happiness" | "energy" | "cleanliness";
export type Stats = Record<StatName, number>;
export type ChestKind = "normal" | "golden" | "bonus";
export type QuestId = "open5" | "golden1" | "runOnline" | "feed2";

export interface PendingChest {
  id: string;
  kind: ChestKind;
  createdAt: number;
}

export interface Quest {
  id: QuestId;
  progress: number;
  goal: number;
  done: boolean;
}

export interface WheelSnapshot {
  /** ms epoch of the last successful /status read, 0 if never */
  fetchedAt: number;
  coreStatus: string | null;
  freshness: string | null;
  rpmMilli: string | null;
  speedMmPerSecond: string | null;
  distanceMm: string | null;
  cumulativeWorkUnits: string | null;
  blockHeight: string | null;
  blockProgress: string | null;
  /** "ok" after a good read, "error" when the last read failed */
  reach: "ok" | "error" | "never";
  /** do not call the API before this time (429 Retry-After) */
  retryAfter: number;
}

export interface SaveState {
  version: 2;
  createdAt: number;
  lastTick: number;
  pet: {
    name: string;
    stats: Stats;
    xp: number;
    hat: string | null;
    wheel: string | null;
  };
  seeds: number;
  inventory: Record<string, number>;
  owned: string[];
  chests: {
    seenSinceLast: number;
    /** times chests were placed, last real hour only */
    placedTimes: number[];
    pending: PendingChest[];
    opened: number;
    goldenOpened: number;
  };
  earn: {
    hourStart: number;
    earnedThisHour: number;
    totalRunSeeds: number;
  };
  counters: { feeds: number; plays: number; cleans: number; shares: number; questsDone: number; seedsTotal: number };
  quests: { day: number; list: Quest[] };
  achievements: string[];
  festival: { until: number; seenIds: string[] };
  sync: WheelSnapshot;
  /** last time a visible x.com tab (or the demo) reported in */
  lastXSeen: number;
  settings: {
    lang: Lang;
    chestsOn: boolean;
    palOn: boolean;
    minimized: boolean;
    hiddenPaths: string[];
    pos: { x: number; y: number } | null;
  };
  log: { t: number; key: string; n?: number }[];
}

export function emptySnapshot(): WheelSnapshot {
  return {
    fetchedAt: 0,
    coreStatus: null,
    freshness: null,
    rpmMilli: null,
    speedMmPerSecond: null,
    distanceMm: null,
    cumulativeWorkUnits: null,
    blockHeight: null,
    blockProgress: null,
    reach: "never",
    retryAfter: 0,
  };
}

export function defaultState(now: number, lang: Lang = "en"): SaveState {
  return {
    version: 2,
    createdAt: now,
    lastTick: now,
    pet: {
      name: "Pip",
      stats: { hunger: 80, happiness: 80, energy: 80, cleanliness: 80 },
      xp: 0,
      hat: null,
      wheel: null,
    },
    seeds: 10,
    inventory: { sunflower: 2 },
    owned: [],
    chests: { seenSinceLast: 0, placedTimes: [], pending: [], opened: 0, goldenOpened: 0 },
    earn: { hourStart: now, earnedThisHour: 0, totalRunSeeds: 0 },
    counters: { feeds: 0, plays: 0, cleans: 0, shares: 0, questsDone: 0, seedsTotal: 0 },
    quests: { day: -1, list: [] },
    achievements: [],
    festival: { until: 0, seenIds: [] },
    sync: emptySnapshot(),
    lastXSeen: 0,
    settings: {
      lang,
      chestsOn: true,
      palOn: true,
      minimized: false,
      hiddenPaths: [],
      pos: null,
    },
    log: [],
  };
}

/** Version 1 saves (early builds) kept a flat pet record and no quests. */
interface SaveV1 {
  version: 1;
  name?: string;
  stats?: Partial<Stats>;
  xp?: number;
  seeds?: number;
  inventory?: Record<string, number>;
  lang?: Lang;
}

function clampNum(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.min(hi, Math.max(lo, n));
}

/** Upgrade any known save shape to the current version. Unknown input gives a fresh save. */
export function migrate(raw: unknown, now: number): SaveState {
  if (!raw || typeof raw !== "object") return defaultState(now);
  const r = raw as { version?: number };
  if (r.version === 1) {
    const v1 = raw as SaveV1;
    const s = defaultState(now, v1.lang === "vi" ? "vi" : "en");
    s.pet.name = typeof v1.name === "string" && v1.name.trim() ? v1.name.slice(0, 16) : s.pet.name;
    for (const k of Object.keys(s.pet.stats) as StatName[]) {
      s.pet.stats[k] = clampNum(v1.stats?.[k], 0, 100, s.pet.stats[k]);
    }
    s.pet.xp = clampNum(v1.xp, 0, 1e9, 0);
    s.seeds = clampNum(v1.seeds, 0, 1e9, s.seeds);
    if (v1.inventory && typeof v1.inventory === "object") s.inventory = { ...v1.inventory };
    return s;
  }
  if (r.version === 2) {
    // Fill any field a hand-edited or partial save is missing.
    const base = defaultState(now);
    const v2 = raw as Partial<SaveState>;
    return {
      ...base,
      ...v2,
      pet: { ...base.pet, ...v2.pet, stats: { ...base.pet.stats, ...v2.pet?.stats } },
      chests: { ...base.chests, ...v2.chests },
      earn: { ...base.earn, ...v2.earn },
      counters: { ...base.counters, ...v2.counters },
      quests: { ...base.quests, ...v2.quests },
      festival: { ...base.festival, ...v2.festival },
      sync: { ...base.sync, ...v2.sync },
      settings: { ...base.settings, ...v2.settings },
      version: 2,
    } as SaveState;
  }
  return defaultState(now);
}

// Export/import as a text code: "SQK2." + base64url(JSON) + "." + checksum.

function checksum(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function toB64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64(s: string): string {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "===".slice((pad.length + 3) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function exportCode(state: SaveState): string {
  const { log: _log, sync: _sync, ...rest } = state;
  const body = toB64(JSON.stringify(rest));
  return `SQK2.${body}.${checksum(body)}`;
}

export function importCode(code: string, now: number): SaveState | null {
  const parts = code.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "SQK2") return null;
  if (checksum(parts[1]) !== parts[2]) return null;
  try {
    const data = JSON.parse(fromB64(parts[1]));
    return migrate(data, now);
  } catch {
    return null;
  }
}
