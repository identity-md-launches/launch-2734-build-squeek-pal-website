// The whole save lives under one versioned key in chrome.storage.local
// (localStorage on the website demo). Migrations upgrade older saves.
import { ITEMS, itemById } from "./catalog";
import { ACHIEVEMENTS } from "./game";
import { questsForDay, squeekDay } from "./rules";

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

function record(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];

/** Reconstruct the schema; a checksum detects typos, not malicious save contents. */
function sanitizeV2(raw: unknown, now: number): SaveState {
  const r = record(raw);
  const s = defaultState(now);
  const time = (v: unknown, fallback = 0, hi = now) => clampNum(v, 0, hi, fallback);
  const count = (v: unknown, fallback = 0, hi = 1e9) => Math.floor(clampNum(v, 0, hi, fallback));
  const pet = record(r.pet), stats = record(pet.stats);
  s.createdAt = time(r.createdAt, now);
  s.lastTick = time(r.lastTick, now);
  s.lastXSeen = time(r.lastXSeen);
  s.pet.name = typeof pet.name === "string" && pet.name.trim() ? pet.name.trim().slice(0, 16) : s.pet.name;
  for (const k of Object.keys(s.pet.stats) as StatName[]) s.pet.stats[k] = clampNum(stats[k], 0, 100, s.pet.stats[k]);
  s.pet.xp = count(pet.xp);
  for (const slot of ["hat", "wheel"] as const) {
    const id = pet[slot];
    s.pet[slot] = typeof id === "string" && itemById(id)?.kind === slot ? id : null;
  }
  s.seeds = count(r.seeds, s.seeds);
  if (r.inventory !== undefined && r.inventory !== null && typeof r.inventory === "object" && !Array.isArray(r.inventory)) {
    const inventory = record(r.inventory);
    s.inventory = Object.fromEntries(ITEMS.filter(i => i.kind === "food" && Object.hasOwn(inventory, i.id)).map(i => [i.id, count(inventory[i.id], 0, 1e6)]));
  }
  s.owned = [...new Set(list(r.owned).filter((id): id is string => typeof id === "string" && !!itemById(id) && itemById(id)!.kind !== "food"))];
  const chests = record(r.chests);
  s.chests.seenSinceLast = count(chests.seenSinceLast);
  s.chests.opened = count(chests.opened);
  s.chests.goldenOpened = count(chests.goldenOpened);
  s.chests.placedTimes = list(chests.placedTimes).filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= now - 3_600_000 && v <= now).slice(-12);
  const chestIds = new Set<string>();
  for (const entry of list(chests.pending).slice(-12)) {
    const c = record(entry);
    if (typeof c.id !== "string" || !/^[a-z0-9]{1,64}$/.test(c.id) || chestIds.has(c.id)) continue;
    if (c.kind !== "normal" && c.kind !== "golden" && c.kind !== "bonus") continue;
    if (typeof c.createdAt !== "number" || !Number.isFinite(c.createdAt) || c.createdAt < 0 || c.createdAt > now) continue;
    chestIds.add(c.id);
    s.chests.pending.push({ id: c.id, kind: c.kind, createdAt: c.createdAt });
  }
  const earn = record(r.earn);
  s.earn = { hourStart: time(earn.hourStart, now), earnedThisHour: count(earn.earnedThisHour, 0, 300), totalRunSeeds: count(earn.totalRunSeeds) };
  const counters = record(r.counters);
  for (const k of Object.keys(s.counters) as (keyof SaveState["counters"])[]) s.counters[k] = count(counters[k]);
  const quests = record(r.quests);
  if (typeof quests.day === "number" && Number.isInteger(quests.day) && quests.day >= 0 && quests.day <= squeekDay(now)) {
    s.quests.day = quests.day;
    s.quests.list = questsForDay(quests.day).map(q => {
      const saved = list(quests.list).map(record).find(v => v.id === q.id);
      const progress = count(saved?.progress, 0, q.goal);
      return { ...q, progress, done: progress >= q.goal };
    });
  }
  s.achievements = ACHIEVEMENTS.filter(id => list(r.achievements).includes(id));
  const festival = record(r.festival);
  s.festival.until = time(festival.until, 0, now + 3_600_000);
  s.festival.seenIds = [...new Set(list(festival.seenIds).filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 256))].slice(-200);
  const sync = record(r.sync);
  s.sync.fetchedAt = time(sync.fetchedAt);
  s.sync.retryAfter = time(sync.retryAfter, 0, Number.MAX_SAFE_INTEGER);
  s.sync.coreStatus = ["ACTIVE", "IDLE", "COUNTER_FAULT"].includes(sync.coreStatus as string) ? sync.coreStatus as string : null;
  s.sync.freshness = typeof sync.freshness === "string" && /^(online|stale|offline|unknown)$/i.test(sync.freshness) ? sync.freshness : null;
  for (const k of ["rpmMilli", "speedMmPerSecond", "distanceMm", "cumulativeWorkUnits", "blockHeight", "blockProgress"] as const) {
    const v = sync[k];
    s.sync[k] = typeof v === "string" && /^\d+(\.\d+)?$/.test(v) && v.length <= 100 ? v : null;
  }
  s.sync.reach = sync.reach === "ok" || sync.reach === "error" ? sync.reach : "never";
  const settings = record(r.settings);
  s.settings.lang = settings.lang === "vi" ? "vi" : "en";
  for (const k of ["chestsOn", "palOn", "minimized"] as const) if (typeof settings[k] === "boolean") s.settings[k] = settings[k];
  s.settings.hiddenPaths = [...new Set(list(settings.hiddenPaths).filter((p): p is string => typeof p === "string" && p.startsWith("/") && p.length <= 2048))].slice(-200);
  const pos = record(settings.pos);
  if (typeof pos.x === "number" && Number.isFinite(pos.x) && typeof pos.y === "number" && Number.isFinite(pos.y)) {
    s.settings.pos = { x: count(pos.x, 0, 100_000), y: count(pos.y, 0, 100_000) };
  }
  const logKeys = ["log.chest", "log.golden", "log.run", "log.block", "log.festival"];
  s.log = list(r.log).map(record).filter(l => typeof l.key === "string" && logKeys.includes(l.key)).slice(0, 12).map(l => ({ t: time(l.t), key: l.key as string, ...(l.n === undefined ? {} : { n: count(l.n) }) }));
  return s;
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
    return sanitizeV2(s, now);
  }
  if (r.version === 2) {
    return sanitizeV2(raw, now);
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
