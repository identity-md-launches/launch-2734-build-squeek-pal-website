// The reducer: every change to the save goes through `reduce`, in the extension's
// background worker and in the website demo alike.
import { itemById, ITEMS } from "./catalog";
import {
  applyFestival,
  bonusAllowed,
  chestAllowed,
  chestKindFor,
  chestReward,
  drift,
  newBlock,
  progressQuest,
  QUEST_REWARD,
  questsForDay,
  recentPlacements,
  squeekDay,
  stageFor,
  syncEarnings,
  wheelMode,
  X_TAB_FRESH_MS,
  type WheelEvent,
} from "./rules";
import type { ChestKind, Lang, PendingChest, QuestId, SaveState, WheelSnapshot } from "./state";

export type Action =
  | { type: "tick" }
  | { type: "heartbeat" }
  | { type: "tweetSeen"; mention: boolean }
  | { type: "openChest"; id: string }
  | { type: "feed"; food?: string }
  | { type: "play" }
  | { type: "clean" }
  | { type: "buy"; id: string }
  | { type: "equip"; id: string | null; slot: "hat" | "wheel" }
  | { type: "rename"; name: string }
  | { type: "status"; snap: WheelSnapshot }
  | { type: "events"; events: WheelEvent[] }
  | { type: "settings"; patch: Partial<SaveState["settings"]> }
  | { type: "hidePath"; path: string; hidden: boolean }
  | { type: "shared" }
  | { type: "replace"; state: SaveState };

export interface Effects {
  /** chest placed on the tweet that triggered tweetSeen */
  chest?: PendingChest;
  opened?: { kind: ChestKind; seeds: number; item: string | null };
  error?: "noSeeds" | "noChest" | "owned" | "unknownItem";
  achievements?: string[];
  quests?: QuestId[];
}

export interface Ctx {
  now: number;
  rand: () => number;
}

export const ACHIEVEMENTS = [
  "firstChest",
  "chests10",
  "chests50",
  "chests100",
  "firstGolden",
  "golden5",
  "firstFeed",
  "feeds25",
  "plays25",
  "cleans10",
  "junior",
  "adult",
  "legend",
  "firstRunSeed",
  "runSeeds500",
  "firstBuy",
  "allHats",
  "firstQuest",
  "quests10",
  "festivalChest",
  "bonusChest",
  "firstShare",
] as const;

function clone(s: SaveState): SaveState {
  return structuredClone(s);
}

function logLine(s: SaveState, now: number, key: string, n?: number) {
  s.log = [{ t: now, key, n }, ...s.log].slice(0, 12);
}

function addXp(s: SaveState, xp: number) {
  s.pet.xp += xp;
}

function addSeeds(s: SaveState, n: number) {
  s.seeds += n;
  s.counters.seedsTotal += n;
}

function quest(s: SaveState, id: QuestId, fx: Effects, by = 1) {
  const r = progressQuest(s.quests.list, id, by);
  s.quests.list = r.list;
  for (const q of r.completed) {
    addSeeds(s, QUEST_REWARD.seeds);
    addXp(s, QUEST_REWARD.xp);
    s.counters.questsDone += 1;
    fx.quests = [...(fx.quests ?? []), q];
  }
}

function checkAchievements(s: SaveState, fx: Effects, extra: string[] = []) {
  const stage = stageFor(s.pet.xp);
  const hats = ITEMS.filter((i) => i.kind === "hat").map((i) => i.id);
  const tests: Record<string, boolean> = {
    firstChest: s.chests.opened >= 1,
    chests10: s.chests.opened >= 10,
    chests50: s.chests.opened >= 50,
    chests100: s.chests.opened >= 100,
    firstGolden: s.chests.goldenOpened >= 1,
    golden5: s.chests.goldenOpened >= 5,
    firstFeed: s.counters.feeds >= 1,
    feeds25: s.counters.feeds >= 25,
    plays25: s.counters.plays >= 25,
    cleans10: s.counters.cleans >= 10,
    junior: stage !== "pup",
    adult: stage === "adult" || stage === "legend",
    legend: stage === "legend",
    firstRunSeed: s.earn.totalRunSeeds >= 1,
    runSeeds500: s.earn.totalRunSeeds >= 500,
    firstBuy: s.owned.length > 0 || s.counters.seedsTotal < 0,
    allHats: hats.every((h) => s.owned.includes(h)),
    firstQuest: s.counters.questsDone >= 1,
    quests10: s.counters.questsDone >= 10,
    firstShare: s.counters.shares >= 1,
  };
  for (const e of extra) tests[e] = true;
  for (const id of ACHIEVEMENTS) {
    if (tests[id] && !s.achievements.includes(id)) {
      s.achievements.push(id);
      fx.achievements = [...(fx.achievements ?? []), id];
    }
  }
}

/** Advance time: drift, quest day rollover, hourly windows. */
export function advance(s: SaveState, now: number): void {
  const mode = wheelMode(s.sync, now);
  const napping = mode === "idle" || s.pet.stats.energy < 20;
  s.pet.stats = drift(s.pet.stats, now - s.lastTick, { napping, idleBoost: mode === "idle" });
  s.lastTick = Math.max(s.lastTick, now);
  const day = squeekDay(now);
  if (s.quests.day !== day) s.quests = { day, list: questsForDay(day) };
  s.chests.placedTimes = recentPlacements(s.chests.placedTimes, now);
}

export function isRunning(s: SaveState, now: number): boolean {
  return wheelMode(s.sync, now) === "running";
}

export function festivalOn(s: SaveState, now: number): boolean {
  return s.festival.until > now;
}

export function reduce(prev: SaveState, action: Action, ctx: Ctx): { state: SaveState; fx: Effects } {
  const s = clone(prev);
  const fx: Effects = {};
  const { now, rand } = ctx;
  advance(s, now);
  const st = s.pet.stats;
  const up = (k: keyof typeof st, n: number) => (st[k] = Math.min(100, Math.max(0, st[k] + n)));

  switch (action.type) {
    case "tick":
      break;
    case "heartbeat":
      s.lastXSeen = now;
      break;
    case "tweetSeen": {
      s.lastXSeen = now;
      s.chests.seenSinceLast += 1;
      if (!s.settings.chestsOn) break;
      const bonus = s.chests.pending.find((c) => c.kind === "bonus" && c.createdAt === 0);
      if (bonus && bonusAllowed(s.chests.placedTimes, now)) {
        bonus.createdAt = now;
        s.chests.placedTimes.push(now);
        fx.chest = { ...bonus };
        break;
      }
      if (chestAllowed({ seenSinceLast: s.chests.seenSinceLast, placedTimes: s.chests.placedTimes, now }) && rand() < 0.35) {
        const kind = chestKindFor(action.mention, festivalOn(s, now), rand());
        const chest: PendingChest = { id: `c${now.toString(36)}${Math.floor(rand() * 1e6).toString(36)}`, kind, createdAt: now };
        s.chests.pending = [...s.chests.pending.filter((c) => now - c.createdAt < 3_600_000 || c.createdAt === 0), chest].slice(-12);
        s.chests.placedTimes.push(now);
        s.chests.seenSinceLast = 0;
        fx.chest = chest;
      }
      break;
    }
    case "openChest": {
      const chest = s.chests.pending.find((c) => c.id === action.id && c.createdAt > 0);
      if (!chest) {
        fx.error = "noChest";
        break;
      }
      s.chests.pending = s.chests.pending.filter((c) => c.id !== chest.id);
      const r = chestReward(chest.kind, isRunning(s, now), [rand(), rand(), rand()]);
      addSeeds(s, r.seeds);
      addXp(s, r.xp);
      if (r.item) s.inventory[r.item] = (s.inventory[r.item] ?? 0) + 1;
      s.chests.opened += 1;
      up("happiness", 3);
      if (chest.kind === "golden") {
        s.chests.goldenOpened += 1;
        quest(s, "golden1", fx);
      }
      quest(s, "open5", fx);
      fx.opened = { kind: chest.kind, seeds: r.seeds, item: r.item };
      logLine(s, now, chest.kind === "golden" ? "log.golden" : "log.chest", r.seeds);
      const extra: string[] = [];
      if (chest.kind === "bonus") extra.push("bonusChest");
      if (chest.kind === "golden" && festivalOn(s, now)) extra.push("festivalChest");
      checkAchievements(s, fx, extra);
      break;
    }
    case "feed": {
      const food = action.food ?? ["yogurt", "carrot", "sunflower"].find((f) => (s.inventory[f] ?? 0) > 0);
      if (food && (s.inventory[food] ?? 0) > 0) {
        s.inventory[food] -= 1;
        const item = itemById(food);
        up("hunger", item?.power ?? 10);
        up("happiness", 4);
      } else {
        up("hunger", 10); // free pellets
      }
      s.counters.feeds += 1;
      addXp(s, 2);
      quest(s, "feed2", fx);
      checkAchievements(s, fx);
      break;
    }
    case "play": {
      const toyPower = Math.max(0, ...ITEMS.filter((i) => i.kind === "toy" && s.owned.includes(i.id)).map((i) => i.power ?? 0));
      up("happiness", 12 + toyPower);
      up("energy", -6);
      up("hunger", -3);
      s.counters.plays += 1;
      addXp(s, 3);
      checkAchievements(s, fx);
      break;
    }
    case "clean":
      up("cleanliness", 35);
      s.counters.cleans += 1;
      addXp(s, 2);
      checkAchievements(s, fx);
      break;
    case "buy": {
      const item = itemById(action.id);
      if (!item) {
        fx.error = "unknownItem";
        break;
      }
      if (item.kind !== "food" && s.owned.includes(item.id)) {
        fx.error = "owned";
        break;
      }
      if (s.seeds < item.price) {
        fx.error = "noSeeds";
        break;
      }
      s.seeds -= item.price;
      if (item.kind === "food") s.inventory[item.id] = (s.inventory[item.id] ?? 0) + 1;
      else s.owned = [...s.owned, item.id];
      if (item.kind === "hat" && !s.pet.hat) s.pet.hat = item.id;
      if (item.kind === "wheel") s.pet.wheel = item.id;
      checkAchievements(s, fx, ["firstBuy"]);
      break;
    }
    case "equip":
      if (action.id === null || s.owned.includes(action.id)) s.pet[action.slot] = action.id;
      break;
    case "rename":
      s.pet.name = action.name.trim().slice(0, 16) || s.pet.name;
      break;
    case "status": {
      const prevSnap = s.sync;
      const next = action.snap;
      if (next.reach === "ok") {
        const xTabOpen = now - s.lastXSeen < X_TAB_FRESH_MS;
        const e = syncEarnings({ prev: prevSnap, next, now, xTabOpen, hourStart: s.earn.hourStart, earnedThisHour: s.earn.earnedThisHour });
        s.earn.hourStart = e.hourStart;
        s.earn.earnedThisHour = e.earnedThisHour;
        if (e.seeds > 0) {
          addSeeds(s, e.seeds);
          s.earn.totalRunSeeds += e.seeds;
          addXp(s, Math.ceil(e.seeds / 5));
          quest(s, "runOnline", fx);
          logLine(s, now, "log.run", e.seeds);
        }
        if (newBlock(prevSnap, next) && xTabOpen && !s.chests.pending.some((c) => c.kind === "bonus" && c.createdAt === 0)) {
          s.chests.pending = [...s.chests.pending, { id: `b${next.blockHeight}`, kind: "bonus", createdAt: 0 }];
          logLine(s, now, "log.block");
        }
        s.sync = next;
      } else {
        // keep last known values, mark unreachable
        s.sync = { ...prevSnap, reach: "error", retryAfter: next.retryAfter };
      }
      checkAchievements(s, fx);
      break;
    }
    case "events": {
      const r = applyFestival({ events: action.events, seenIds: s.festival.seenIds, installedAt: s.createdAt, until: s.festival.until, now });
      s.festival = { until: r.until, seenIds: r.seenIds };
      if (r.started) logLine(s, now, "log.festival");
      break;
    }
    case "settings":
      s.settings = { ...s.settings, ...action.patch };
      break;
    case "hidePath": {
      const set = new Set(s.settings.hiddenPaths);
      if (action.hidden) set.add(action.path);
      else set.delete(action.path);
      s.settings.hiddenPaths = [...set];
      break;
    }
    case "shared":
      s.counters.shares += 1;
      checkAchievements(s, fx);
      break;
    case "replace":
      return { state: { ...action.state, lastTick: now }, fx };
  }
  return { state: s, fx };
}

export function langOf(s: SaveState): Lang {
  return s.settings.lang;
}
