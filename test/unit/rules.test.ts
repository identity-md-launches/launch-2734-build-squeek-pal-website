import { describe, expect, it } from "vitest";
import { parseEvents, parseStatus, readValue, retryAfterMs } from "../../shared/api";
import { reduce } from "../../shared/game";
import {
  applyFestival, chestAllowed, chestKindFor, drift, HOUR, mentionsSqueekchain, mood, nextQuestReset,
  questsForDay, squeekDay, stageFor, syncEarnings, wheelMode,
} from "../../shared/rules";
import { defaultState, emptySnapshot, exportCode, importCode, migrate, type WheelSnapshot } from "../../shared/state";

const T0 = Date.UTC(2026, 9, 30, 15, 0, 0);
const snap = (p: Partial<WheelSnapshot>): WheelSnapshot => ({ ...emptySnapshot(), reach: "ok", fetchedAt: T0, ...p });
const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

describe("drift", () => {
  it("lowers stats slowly with time", () => {
    const s = drift({ hunger: 80, happiness: 80, energy: 80, cleanliness: 80 }, HOUR, { napping: false, idleBoost: false });
    expect(s).toEqual({ hunger: 74, happiness: 76, energy: 77, cleanliness: 77 });
  });
  it("caps at 12 hours of drift while the browser was closed", () => {
    const a = drift({ hunger: 100, happiness: 100, energy: 100, cleanliness: 100 }, 12 * HOUR, { napping: false, idleBoost: false });
    const b = drift({ hunger: 100, happiness: 100, energy: 100, cleanliness: 100 }, 72 * HOUR, { napping: false, idleBoost: false });
    expect(b).toEqual(a);
    expect(a.hunger).toBe(28);
  });
  it("never goes below 0 and naps recover energy 2x when IDLE", () => {
    expect(drift({ hunger: 1, happiness: 1, energy: 1, cleanliness: 1 }, 10 * HOUR, { napping: false, idleBoost: false }).hunger).toBe(0);
    const nap = drift({ hunger: 50, happiness: 50, energy: 20, cleanliness: 50 }, HOUR, { napping: true, idleBoost: false }).energy;
    const idle = drift({ hunger: 50, happiness: 50, energy: 20, cleanliness: 50 }, HOUR, { napping: true, idleBoost: true }).energy;
    expect(idle - 20).toBe(2 * (nap - 20));
  });
  it("neglect makes it grumpy, not dead", () => {
    expect(mood({ hunger: 0, happiness: 0, energy: 0, cleanliness: 0 })).toBe("grumpy");
    expect(stageFor(0)).toBe("pup");
    expect(stageFor(1500)).toBe("legend");
  });
});

describe("sync earnings", () => {
  const base = { now: T0, xTabOpen: true, hourStart: T0, earnedThisHour: 0 };
  it("earns 1 Seed per new magnet pass while ACTIVE and online", () => {
    const r = syncEarnings({ ...base, prev: snap({ cumulativeWorkUnits: "1000" }), next: snap({ coreStatus: "ACTIVE", freshness: "online", cumulativeWorkUnits: "1042" }) });
    expect(r.seeds).toBe(42);
  });
  it("earns nothing when IDLE, offline, without an x.com tab, or on the first poll", () => {
    const prev = snap({ cumulativeWorkUnits: "1000" });
    expect(syncEarnings({ ...base, prev, next: snap({ coreStatus: "IDLE", freshness: "online", cumulativeWorkUnits: "1100" }) }).seeds).toBe(0);
    expect(syncEarnings({ ...base, prev, next: snap({ coreStatus: "ACTIVE", freshness: "stale", cumulativeWorkUnits: "1100" }) }).seeds).toBe(0);
    expect(syncEarnings({ ...base, xTabOpen: false, prev, next: snap({ coreStatus: "ACTIVE", freshness: "online", cumulativeWorkUnits: "1100" }) }).seeds).toBe(0);
    expect(syncEarnings({ ...base, prev: snap({}), next: snap({ coreStatus: "ACTIVE", freshness: "online", cumulativeWorkUnits: "1100" }) }).seeds).toBe(0);
  });
  it("caps at 300 Seeds per real hour and resets after the hour", () => {
    const next = snap({ coreStatus: "ACTIVE", freshness: "online", cumulativeWorkUnits: "99999999999999999999" });
    const r = syncEarnings({ ...base, earnedThisHour: 250, prev: snap({ cumulativeWorkUnits: "1" }), next });
    expect(r.seeds).toBe(50);
    expect(r.earnedThisHour).toBe(300);
    const again = syncEarnings({ ...base, earnedThisHour: 300, prev: snap({ cumulativeWorkUnits: "1" }), next });
    expect(again.seeds).toBe(0);
    const later = syncEarnings({ ...base, now: T0 + HOUR, earnedThisHour: 300, prev: snap({ cumulativeWorkUnits: "1" }), next });
    expect(later.seeds).toBe(300);
  });
  it("treats unavailable as unknown, never zero", () => {
    expect(readValue({ status: "unavailable" })).toBeNull();
    expect(readValue("12345678901234567890")).toBe("12345678901234567890");
    const p = parseStatus({ measurement: { coreStatus: "ACTIVE", freshness: "online", cumulativeWorkUnits: { status: "unavailable" } }, builder: { anchor: { blockHeight: "77" } } }, T0);
    expect(p.cumulativeWorkUnits).toBeNull();
    expect(p.blockHeight).toBe("77");
    expect(wheelMode(p, T0)).toBe("running");
    expect(wheelMode({ ...p, reach: "error" }, T0)).toBe("unknown");
  });
  it("honours Retry-After", () => {
    expect(retryAfterMs("30", T0)).toBe(30_000);
    expect(retryAfterMs(new Date(T0 + 90_000).toUTCString(), T0)).toBe(90_000);
  });
});

describe("chest rate limits", () => {
  it("needs 20 posts seen and allows at most 12 per hour", () => {
    expect(chestAllowed({ seenSinceLast: 19, placedTimes: [], now: T0 })).toBe(false);
    expect(chestAllowed({ seenSinceLast: 20, placedTimes: [], now: T0 })).toBe(true);
    const twelve = Array.from({ length: 12 }, (_, i) => T0 - i * 60_000);
    expect(chestAllowed({ seenSinceLast: 500, placedTimes: twelve, now: T0 })).toBe(false);
    expect(chestAllowed({ seenSinceLast: 500, placedTimes: twelve, now: T0 + HOUR })).toBe(true);
  });
  it("reducer never places more than 1 per 20 posts or 12 per hour", () => {
    let s = defaultState(T0);
    let placed = 0;
    for (let i = 0; i < 2000; i++) {
      const r = reduce(s, { type: "tweetSeen", mention: false }, { now: T0 + i * 1000, rand: () => 0 });
      s = r.state;
      if (r.fx.chest) placed++;
    }
    // 2000 s is within one hour: capped at 12
    expect(placed).toBe(12);
    let s2 = defaultState(T0);
    let gaps = 0;
    for (let i = 0; i < 100; i++) {
      const r = reduce(s2, { type: "tweetSeen", mention: false }, { now: T0 + i, rand: () => 0 });
      s2 = r.state;
      if (r.fx.chest) gaps++;
    }
    expect(gaps).toBe(5); // posts 20, 40, 60, 80, 100
  });
  it("places nothing when chest placement is off, and opens only real chests", () => {
    let s = defaultState(T0);
    s.settings.chestsOn = false;
    for (let i = 0; i < 50; i++) s = reduce(s, { type: "tweetSeen", mention: true }, { now: T0 + i, rand: () => 0 }).state;
    expect(s.chests.pending.length).toBe(0);
    expect(reduce(s, { type: "openChest", id: "nope" }, { now: T0, rand: Math.random }).fx.error).toBe("noChest");
  });
  it("detects Squeekchain mentions in visible text, case-insensitive", () => {
    for (const t of ["I love squeekchain", "hi @SqueekChain", "buy $sqk? no", "#Squeekchain rocks"]) expect(mentionsSqueekchain(t)).toBe(true);
    for (const t of ["squeekchainz", "nothing here", "$SQKX"]) expect(mentionsSqueekchain(t)).toBe(false);
    expect(chestKindFor(true, false, 0.1)).toBe("golden");
    expect(chestKindFor(false, false, 0.1)).toBe("normal");
    expect(chestKindFor(false, true, 0.9)).toBe("golden");
  });
  it("doubles chest Seeds while the wheel is running", () => {
    const mk = (running: boolean) => {
      let s = defaultState(T0);
      s.chests.pending = [{ id: "x", kind: "normal", createdAt: T0 }];
      if (running) s.sync = snap({ coreStatus: "ACTIVE", freshness: "online" });
      return reduce(s, { type: "openChest", id: "x" }, { now: T0, rand: seq(0.5, 0.99, 0) }).fx.opened!.seeds;
    };
    expect(mk(true)).toBe(2 * mk(false));
  });
});

describe("quests", () => {
  it("reset at 12:00 UTC", () => {
    const before = Date.UTC(2026, 9, 30, 11, 59, 59);
    const after = Date.UTC(2026, 9, 30, 12, 0, 0);
    expect(squeekDay(after)).toBe(squeekDay(before) + 1);
    expect(squeekDay(Date.UTC(2026, 9, 31, 11, 0))).toBe(squeekDay(after));
    expect(nextQuestReset(before)).toBe(after);
  });
  it("gives 3 of the 4 quests per day and resets progress on a new day", () => {
    expect(questsForDay(5)).toHaveLength(3);
    let s = defaultState(Date.UTC(2026, 9, 30, 11, 0));
    s = reduce(s, { type: "feed" }, { now: Date.UTC(2026, 9, 30, 11, 0), rand: Math.random }).state;
    s = reduce(s, { type: "feed" }, { now: Date.UTC(2026, 9, 30, 11, 1), rand: Math.random }).state;
    const feed = s.quests.list.find((q) => q.id === "feed2");
    if (feed) expect(feed.done).toBe(true);
    const next = reduce(s, { type: "tick" }, { now: Date.UTC(2026, 9, 30, 12, 0), rand: Math.random }).state;
    expect(next.quests.list.every((q) => q.progress === 0)).toBe(true);
  });
});

describe("festival", () => {
  const ev = (id: string, at: number, type = "measurement.speed_record") => ({ id, type, at });
  it("starts a 1-hour festival on a new record and dedupes by id", () => {
    const r = applyFestival({ events: [ev("a", T0 - 60_000)], seenIds: [], installedAt: T0 - HOUR * 5, until: 0, now: T0 });
    expect(r.started).toBe(true);
    expect(r.until).toBe(T0 - 60_000 + HOUR);
    const again = applyFestival({ events: [ev("a", T0 - 60_000)], seenIds: r.seenIds, installedAt: T0, until: 0, now: T0 });
    expect(again.started).toBe(false);
  });
  it("ignores events older than 1 hour on a fresh install and non-festival types", () => {
    const r = applyFestival({ events: [ev("old", T0 - 2 * HOUR), ev("x", T0, "measurement.sample")], seenIds: [], installedAt: T0, until: 0, now: T0 });
    expect(r.started).toBe(false);
    expect(r.seenIds).toContain("old");
    const parsed = parseEvents({ events: [{ id: 7, type: "measurement.distance_milestone", timestamp: new Date(T0).toISOString() }] });
    expect(parsed[0]).toEqual({ id: "7", type: "measurement.distance_milestone", at: T0 });
  });
});

describe("save", () => {
  it("migrates v1 saves and round-trips export codes", () => {
    const m = migrate({ version: 1, name: "Bun", stats: { hunger: 20 }, seeds: 99, lang: "vi" }, T0);
    expect(m.version).toBe(2);
    expect(m.pet.name).toBe("Bun");
    expect(m.pet.stats.hunger).toBe(20);
    expect(m.seeds).toBe(99);
    expect(m.settings.lang).toBe("vi");
    const code = exportCode(m);
    const back = importCode(code, T0)!;
    expect(back.pet.name).toBe("Bun");
    expect(importCode(code.slice(0, -1) + "z", T0)).toBeNull();
    expect(importCode("garbage", T0)).toBeNull();
  });
  it("a new block drops one bonus chest while browsing", () => {
    let s = defaultState(T0);
    s = reduce(s, { type: "heartbeat" }, { now: T0, rand: Math.random }).state;
    s = reduce(s, { type: "status", snap: snap({ blockHeight: "10" }) }, { now: T0, rand: Math.random }).state;
    s = reduce(s, { type: "status", snap: snap({ blockHeight: "11" }) }, { now: T0 + 60_000, rand: Math.random }).state;
    expect(s.chests.pending.filter((c) => c.kind === "bonus")).toHaveLength(1);
    const r = reduce(s, { type: "tweetSeen", mention: false }, { now: T0 + 61_000, rand: () => 0.9 });
    expect(r.fx.chest?.kind).toBe("bonus");
  });
});
