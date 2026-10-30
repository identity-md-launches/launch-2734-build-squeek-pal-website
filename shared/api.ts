// Squeekchain public read-only API. No key, CORS open. The only host this code calls.
import type { WheelEvent } from "./rules";
import { emptySnapshot, type WheelSnapshot } from "./state";

export const API_BASE = "https://api.squeekchain.com/v1";

type Json = Record<string, unknown>;

function get(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Json)[key];
  }
  return cur;
}

/** Big numbers arrive as decimal strings; {"status":"unavailable"} means unknown, never zero. */
export function readValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.toLowerCase() === "unavailable" ? null : v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "object") {
    const o = v as Json;
    if (typeof o.status === "string" && o.status.toLowerCase() === "unavailable") return null;
    if ("value" in o) return readValue(o.value);
  }
  return null;
}

/** Reads the documented fields; tolerates a {data: ...} envelope. */
export function parseStatus(body: unknown, now: number): WheelSnapshot {
  const root = body && typeof body === "object" && "data" in (body as Json) && !("measurement" in (body as Json)) ? (body as Json).data : body;
  const f = (p: string) => readValue(get(root, p));
  return {
    fetchedAt: now,
    coreStatus: f("measurement.coreStatus"),
    freshness: f("measurement.freshness"),
    rpmMilli: f("measurement.rpmMilli"),
    speedMmPerSecond: f("measurement.speedMmPerSecond"),
    distanceMm: f("measurement.distanceMm"),
    cumulativeWorkUnits: f("measurement.cumulativeWorkUnits"),
    blockHeight: f("builder.anchor.blockHeight"),
    blockProgress: f("builder.anchor.blockProgress"),
    reach: "ok",
    retryAfter: 0,
  };
}

function toMs(v: unknown): number {
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v;
  if (typeof v === "string") {
    if (/^\d+$/.test(v)) return toMs(Number(v));
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

export function parseEvents(body: unknown): WheelEvent[] {
  const root = body as Json | unknown[];
  const list = Array.isArray(root) ? root : ((get(root, "events") ?? get(root, "data") ?? get(root, "items")) as unknown);
  if (!Array.isArray(list)) return [];
  const out: WheelEvent[] = [];
  for (const e of list) {
    if (!e || typeof e !== "object") continue;
    const o = e as Json;
    const id = o.id ?? o.eventId;
    const type = o.type ?? o.kind ?? o.name;
    const at = toMs(o.timestamp ?? o.createdAt ?? o.time ?? o.observedAt);
    if ((typeof id === "string" || typeof id === "number") && typeof type === "string" && at > 0) {
      out.push({ id: String(id), type, at });
    }
  }
  return out;
}

/** Retry-After in seconds or as an HTTP date. Defaults to 2 minutes. */
export function retryAfterMs(header: string | null, now: number): number {
  if (!header) return 120_000;
  if (/^\d+$/.test(header.trim())) return Number(header.trim()) * 1000;
  const t = Date.parse(header);
  return Number.isNaN(t) ? 120_000 : Math.max(0, t - now);
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** One /status read. Never throws: failures come back as reach "error". */
export async function fetchStatus(fetcher: FetchLike, now: number): Promise<WheelSnapshot> {
  const fail = (retryAfter = 0): WheelSnapshot => ({ ...emptySnapshot(), reach: "error", retryAfter });
  try {
    const res = await fetcher(`${API_BASE}/status`, { cache: "no-store", credentials: "omit" });
    if (res.status === 429) return fail(now + retryAfterMs(res.headers.get("Retry-After"), now));
    if (!res.ok) return fail();
    return parseStatus(await res.json(), now);
  } catch {
    return fail();
  }
}

export async function fetchEvents(fetcher: FetchLike, now: number): Promise<{ events: WheelEvent[]; retryAfter: number } | null> {
  try {
    const res = await fetcher(`${API_BASE}/events?category=measurement&limit=20`, { cache: "no-store", credentials: "omit" });
    if (res.status === 429) return { events: [], retryAfter: now + retryAfterMs(res.headers.get("Retry-After"), now) };
    if (!res.ok) return null;
    return { events: parseEvents(await res.json()), retryAfter: 0 };
  } catch {
    return null;
  }
}
