import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const NOW = Date.UTC(2026, 9, 30, 15);
const statusBody = { measurement: { coreStatus: "IDLE", freshness: "online", distanceMm: "12345" }, builder: { anchor: { blockHeight: "10" } } };
let fetcher: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal("window", { setInterval, clearInterval });
  vi.stubGlobal("document", { hidden: false });
  const saved = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
  fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("/events") ? { events: [] } : statusBody), { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const statusCalls = () => fetcher.mock.calls.filter(([url]) => url.endsWith("/status")).length;

describe("site polling across navigation", () => {
  it("keeps the last reading and the minute schedule across home/language remounts", async () => {
    const { liveOnly } = await import("../../site/src/demoStore");
    let stop = liveOnly(() => {}, "en");
    await vi.advanceTimersByTimeAsync(0);
    expect(statusCalls()).toBe(1);
    for (let i = 0; i < 4; i++) {
      stop();
      const show = vi.fn();
      stop = liveOnly(show, i % 2 ? "en" : "vi");
      expect(show.mock.calls[0][0].sync.distanceMm).toBe("12345");
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(statusCalls()).toBe(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(statusCalls()).toBe(2);
    stop();
  });

  it("shares an in-flight status read with the demo", async () => {
    const { liveOnly, demoStore } = await import("../../site/src/demoStore");
    const stop = liveOnly(() => {}, "en");
    const demo = demoStore("en");
    await vi.advanceTimersByTimeAsync(0);
    expect(statusCalls()).toBe(1);
    expect(demo.get()?.sync.coreStatus).toBe("IDLE");
    stop(); demo.stop();
  });

  it("honours /status Retry-After through repeated remounts and resumes afterwards", async () => {
    fetcher.mockImplementation(async (url: string) => url.includes("/events")
      ? new Response(JSON.stringify({ events: [] }), { status: 200 })
      : new Response("", { status: 429, headers: { "Retry-After": "3600" } }));
    const { liveOnly, demoStore } = await import("../../site/src/demoStore");
    let stop = liveOnly(() => {}, "en");
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 4; i++) { stop(); stop = liveOnly(() => {}, "vi"); }
    const demo = demoStore("en");
    await vi.advanceTimersByTimeAsync(3_599_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(demo.get()?.sync.retryAfter).toBe(NOW + 3_600_000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(statusCalls()).toBe(2);
    stop(); demo.stop();
  });

  it("preserves an /events 429 even if a successful status read arrives concurrently", async () => {
    fetcher.mockImplementation(async (url: string) => url.includes("/events")
      ? new Response("", { status: 429, headers: { "Retry-After": "3600" } })
      : new Response(JSON.stringify(statusBody), { status: 200 }));
    const { demoStore, liveOnly } = await import("../../site/src/demoStore");
    const demo = demoStore("en");
    await vi.advanceTimersByTimeAsync(0);
    expect(demo.get()?.sync.retryAfter).toBe(NOW + 3_600_000);
    expect(demo.get()?.sync.reach).toBe("error");
    let stop = liveOnly(() => {}, "en");
    for (let i = 0; i < 4; i++) { stop(); stop = liveOnly(() => {}, "vi"); }
    await vi.advanceTimersByTimeAsync(3_599_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockImplementation(async (url: string) => new Response(JSON.stringify(url.includes("/events") ? { events: [] } : statusBody), { status: 200 }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(statusCalls()).toBe(2);
    expect(demo.get()?.sync.reach).toBe("ok");
    stop(); demo.stop();
  });
});
