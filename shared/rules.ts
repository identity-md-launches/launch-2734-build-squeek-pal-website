// Pure game rules. No DOM, no storage, no clock: callers pass `now` and random numbers.
import type { ChestKind, Quest, QuestId, Stats, WheelSnapshot } from "./state";

export const HOUR = 3_600_000;
export const MINUTE = 60_000;
export const MAX_DRIFT_MS = 12 * HOUR;
export const TWEETS_PER_CHEST = 20;
export const CHESTS_PER_HOUR = 12;
export const RUN_SEEDS_PER_HOUR = 300;
export const FESTIVAL_MS = HOUR;
export const X_TAB_FRESH_MS = 90_000;

/** Points lost (or gained) per real hour. */
export const DRIFT_PER_HOUR: Stats = { hunger: -6, happiness: -4, energy: -3, cleanliness: -3 };
export const NAP_ENERGY_PER_HOUR = 6;

const clamp = (n: number) => Math.min(100, Math.max(0, n));

export interface DriftOptions {
  napping: boolean;
  /** the real wheel is IDLE: naps recover twice as fast */
  idleBoost: boolean;
}

/** Stats drift slowly with time; at most 12 h of drift is applied at once. */
export function drift(stats: Stats, elapsedMs: number, opts: DriftOptions): Stats {
  const hours = Math.min(Math.max(0, elapsedMs), MAX_DRIFT_MS) / HOUR;
  const energyRate = opts.napping ? NAP_ENERGY_PER_HOUR * (opts.idleBoost ? 2 : 1) : DRIFT_PER_HOUR.energy;
  return {
    hunger: clamp(stats.hunger + DRIFT_PER_HOUR.hunger * hours),
    happiness: clamp(stats.happiness + DRIFT_PER_HOUR.happiness * hours),
    energy: clamp(stats.energy + energyRate * hours),
    cleanliness: clamp(stats.cleanliness + DRIFT_PER_HOUR.cleanliness * hours),
  };
}

export type Mood = "happy" | "ok" | "grumpy";

/** The pal never dies; neglect only makes it grumpy. */
export function mood(stats: Stats): Mood {
  const avg = (stats.hunger + stats.happiness + stats.energy + stats.cleanliness) / 4;
  const low = Math.min(stats.hunger, stats.happiness, stats.energy, stats.cleanliness);
  if (avg < 35 || low < 15) return "grumpy";
  if (avg >= 70) return "happy";
  return "ok";
}

export type Stage = "pup" | "junior" | "adult" | "legend";
export const STAGES: { id: Stage; xp: number }[] = [
  { id: "pup", xp: 0 },
  { id: "junior", xp: 120 },
  { id: "adult", xp: 450 },
  { id: "legend", xp: 1500 },
];

export function stageFor(xp: number): Stage {
  let s: Stage = "pup";
  for (const st of STAGES) if (xp >= st.xp) s = st.id;
  return s;
}

export function nextStageXp(xp: number): number | null {
  const next = STAGES.find((s) => s.xp > xp);
  return next ? next.xp : null;
}

// ---------- Squeekchain wheel ----------

export type WheelMode = "running" | "idle" | "unknown";

export function isOnline(snap: WheelSnapshot): boolean {
  return (snap.freshness ?? "").toLowerCase() === "online";
}

/** ACTIVE + fresh = the pal runs; IDLE = it naps; anything else is unknown, never zero. */
export function wheelMode(snap: WheelSnapshot, now: number): WheelMode {
  if (snap.reach !== "ok" || now - snap.fetchedAt > 5 * MINUTE) return "unknown";
  if (snap.coreStatus === "ACTIVE" && isOnline(snap)) return "running";
  if (snap.coreStatus === "IDLE") return "idle";
  return "unknown";
}

function big(s: string | null): bigint | null {
  if (s === null || !/^\d+$/.test(s)) return null;
  return BigInt(s);
}

export interface EarnInput {
  prev: WheelSnapshot;
  next: WheelSnapshot;
  now: number;
  /** a visible x.com tab (or the website demo) reported within the last 90 s */
  xTabOpen: boolean;
  hourStart: number;
  earnedThisHour: number;
}

export interface EarnResult {
  seeds: number;
  hourStart: number;
  earnedThisHour: number;
}

/**
 * 1 Seed per new real magnet pass (difference in cumulativeWorkUnits between polls),
 * only while ACTIVE + online and an x.com tab is open, at most 300 Seeds per real hour.
 */
export function syncEarnings(inp: EarnInput): EarnResult {
  let { hourStart, earnedThisHour } = inp;
  if (inp.now - hourStart >= HOUR) {
    hourStart = inp.now;
    earnedThisHour = 0;
  }
  const none = { seeds: 0, hourStart, earnedThisHour };
  if (!inp.xTabOpen) return none;
  if (inp.next.coreStatus !== "ACTIVE" || !isOnline(inp.next)) return none;
  const a = big(inp.prev.cumulativeWorkUnits);
  const b = big(inp.next.cumulativeWorkUnits);
  if (a === null || b === null || b <= a) return none;
  const passes = b - a;
  const room = BigInt(Math.max(0, RUN_SEEDS_PER_HOUR - earnedThisHour));
  const seeds = Number(passes < room ? passes : room);
  return { seeds, hourStart, earnedThisHour: earnedThisHour + seeds };
}

/** A new real Squeek block (height goes up) drops one bonus chest. */
export function newBlock(prev: WheelSnapshot, next: WheelSnapshot): boolean {
  const a = big(prev.blockHeight);
  const b = big(next.blockHeight);
  return a !== null && b !== null && b > a;
}

// ---------- chests ----------

export interface ChestGateInput {
  seenSinceLast: number;
  placedTimes: number[];
  now: number;
}

export function recentPlacements(times: number[], now: number): number[] {
  return times.filter((t) => now - t < HOUR);
}

/** At most 1 chest per 20 tweets seen and 12 per real hour. */
export function chestAllowed(inp: ChestGateInput): boolean {
  return inp.seenSinceLast >= TWEETS_PER_CHEST && recentPlacements(inp.placedTimes, inp.now).length < CHESTS_PER_HOUR;
}

/** Bonus chests (new block) skip the 20-tweet spacing but still count toward 12 per hour. */
export function bonusAllowed(placedTimes: number[], now: number): boolean {
  return recentPlacements(placedTimes, now).length < CHESTS_PER_HOUR;
}

const MENTION = /(^|[^a-z0-9_])(@squeekchain|#squeekchain|squeekchain|\$sqk)(?![a-z0-9_])/i;

/** Only the visible tweet text is checked, locally. */
export function mentionsSqueekchain(text: string): boolean {
  return MENTION.test(text);
}

/** A chest that passes the gate: golden during a festival, or 50% on a Squeekchain mention. */
export function chestKindFor(mention: boolean, festival: boolean, roll: number): ChestKind {
  if (festival) return "golden";
  if (mention && roll < 0.5) return "golden";
  return "normal";
}

export interface ChestReward {
  seeds: number;
  item: string | null;
  xp: number;
}

const ITEM_DROPS = ["sunflower", "sunflower", "carrot", "carrot", "yogurt"];

/** Rewards; `running` (wheel ACTIVE) doubles Seeds. rolls are three numbers in [0,1). */
export function chestReward(kind: ChestKind, running: boolean, rolls: [number, number, number]): ChestReward {
  const [a, b, c] = rolls;
  const base = kind === "golden" ? 15 + Math.floor(a * 16) : kind === "bonus" ? 10 + Math.floor(a * 11) : 3 + Math.floor(a * 6);
  const itemChance = kind === "golden" ? 0.35 : kind === "bonus" ? 0.25 : 0.15;
  const item = b < itemChance ? ITEM_DROPS[Math.floor(c * ITEM_DROPS.length)] : null;
  return { seeds: base * (running ? 2 : 1), item, xp: kind === "golden" ? 10 : kind === "bonus" ? 7 : 4 };
}

// ---------- festival ----------

export interface WheelEvent {
  id: string;
  type: string;
  at: number;
}

export function isFestivalEvent(type: string): boolean {
  const t = type.toLowerCase();
  return t === "measurement.speed_record" || t.includes("distance_milestone") || t === "measurement.milestone";
}

export interface FestivalInput {
  events: WheelEvent[];
  seenIds: string[];
  installedAt: number;
  until: number;
  now: number;
}

/**
 * Dedupe by id. On a fresh install, events older than 1 hour are ignored.
 * A new qualifying event starts (or extends) a 1-hour golden-chest festival.
 */
export function applyFestival(inp: FestivalInput): { until: number; seenIds: string[]; started: boolean } {
  const seen = new Set(inp.seenIds);
  let until = inp.until;
  let started = false;
  for (const ev of inp.events) {
    if (seen.has(ev.id)) continue;
    seen.add(ev.id);
    if (!isFestivalEvent(ev.type)) continue;
    if (inp.now - ev.at > HOUR) continue; // stale (and always on fresh install)
    if (ev.at < inp.installedAt - HOUR) continue;
    const end = ev.at + FESTIVAL_MS;
    if (end > until && end > inp.now) {
      until = end;
      started = true;
    }
  }
  return { until, seenIds: [...seen].slice(-200), started };
}

// ---------- quests ----------

/** A Squeek day starts at 12:00 UTC. Returns a day number that changes at that instant. */
export function squeekDay(now: number): number {
  return Math.floor((now - 12 * HOUR) / (24 * HOUR));
}

export function nextQuestReset(now: number): number {
  return (squeekDay(now) + 1) * 24 * HOUR + 12 * HOUR;
}

const QUEST_GOALS: Record<QuestId, number> = { open5: 5, golden1: 1, runOnline: 1, feed2: 2 };
const QUEST_ORDER: QuestId[] = ["open5", "golden1", "runOnline", "feed2"];

/** 3 of the 4 quests per Squeek day, rotating so a different one rests each day. */
export function questsForDay(day: number): Quest[] {
  const rest = ((day % 4) + 4) % 4;
  return QUEST_ORDER.filter((_, i) => i !== rest).map((id) => ({ id, progress: 0, goal: QUEST_GOALS[id], done: false }));
}

export const QUEST_REWARD = { seeds: 20, xp: 15 };

export function progressQuest(list: Quest[], id: QuestId, by = 1): { list: Quest[]; completed: QuestId[] } {
  const completed: QuestId[] = [];
  const next = list.map((q) => {
    if (q.id !== id || q.done) return q;
    const progress = Math.min(q.goal, q.progress + by);
    const done = progress >= q.goal;
    if (done) completed.push(q.id);
    return { ...q, progress, done };
  });
  return { list: next, completed };
}
