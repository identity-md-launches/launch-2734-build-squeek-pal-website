// Original pixel art, drawn in code. No image files, no fonts.
import { DEFAULT_WHEEL_COLORS, itemById } from "./catalog";
import type { Mood } from "./rules";
import type { ChestKind } from "./state";

export type Pose = "walk" | "eat" | "nap" | "run" | "sit";

const PAL: Record<string, string> = {
  o: "#e39a4b", // fur
  O: "#c9762f", // fur shade
  c: "#fbe3c0", // belly
  p: "#f2a3a8", // ear and paw pink
  k: "#2b1d14", // eye
  w: "#ffffff", // eye shine
  n: "#e86f86", // nose
};
const OUTLINE = "#4a2a12";

// 16 x 12, facing right.
const BODY = [
  "..........oo....",
  ".........oppo...",
  "....ooooooooo...",
  "...ooooooooooo..",
  "..OoooooooookwO.",
  "..Ooooooooookkon",
  ".OOoocccccccooo.",
  ".OOocccccccccoo.",
  ".OOocccccccccco.",
  "..OOccccccccoo..",
];
const FEET_A = ["...pp.....pp....", "................"];
const FEET_B = ["....pp...pp.....", "................"];
const FEET_SIT = ["..pppp...pppp...", "................"];

export const SPRITE_W = 28;
export const SPRITE_H = 26;

function px(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

function drawMap(ctx: CanvasRenderingContext2D, rows: string[], ox: number, oy: number, palette: Record<string, string>, flip = false) {
  const w = rows[0].length;
  const filled = new Set<string>();
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== ".") filled.add(`${flip ? w - 1 - x : x},${y}`);
    }),
  );
  // outline pass
  for (const key of filled) {
    const [x, y] = key.split(",").map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!filled.has(`${x + dx},${y + dy}`)) px(ctx, ox + x + dx, oy + y + dy, OUTLINE);
    }
  }
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      px(ctx, ox + (flip ? w - 1 - x : x), oy + y, palette[ch] ?? ch);
    }),
  );
}

function drawHat(ctx: CanvasRenderingContext2D, hat: string, ox: number, oy: number, flip: boolean) {
  const item = itemById(hat);
  if (!item?.colors) return;
  const [a, b] = item.colors;
  const maps: Record<string, string[]> = {
    acorn: ["..bbbb..", ".aaaaaa.", "aaaaaaaa", ".aaaaaa."],
    beanie: ["...bb...", "..aaaa..", ".aaaaaa.", "bbbbbbbb"],
    party: ["...b....", "...a....", "..aba...", ".aaaab..", "abaaaaab"],
    crown: ["a..a..a.", "ab.a.ba.", "aaaaaaaa", "abababa."],
  };
  const rows = maps[hat];
  if (!rows) return;
  const pal = { a, b };
  const x = flip ? ox + 16 - 13 : ox + 5;
  drawMap(ctx, rows, x, oy - rows.length + 2, pal, flip);
}

export interface PalDraw {
  pose: Pose;
  frame: number;
  hat: string | null;
  wheel: string | null;
  mood: Mood;
  flip?: boolean;
  /** horizontal offset of the pal inside the sprite box, in sprite pixels */
  x?: number;
}

function drawWheel(ctx: CanvasRenderingContext2D, wheel: string | null, frame: number) {
  const colors = (wheel && itemById(wheel)?.colors) || DEFAULT_WHEEL_COLORS;
  const cx = 14;
  const cy = 12.5;
  const r = 12;
  ctx.fillStyle = colors[1];
  for (let a = 0; a < 360; a += 4) {
    const rad = (a * Math.PI) / 180;
    ctx.fillRect(Math.round(cx + Math.cos(rad) * r - 0.5), Math.round(cy + Math.sin(rad) * r - 0.5), 1, 1);
  }
  ctx.fillStyle = colors[0];
  for (let a = 0; a < 360; a += 3) {
    const rad = (a * Math.PI) / 180;
    ctx.fillRect(Math.round(cx + Math.cos(rad) * (r - 1) - 0.5), Math.round(cy + Math.sin(rad) * (r - 1) - 0.5), 1, 1);
  }
  // rungs turn with the frame
  for (let i = 0; i < 8; i++) {
    const rad = ((i * 45 + frame * 11) * Math.PI) / 180;
    ctx.fillRect(Math.round(cx + Math.cos(rad) * (r - 2.5) - 0.5), Math.round(cy + Math.sin(rad) * (r - 2.5) - 0.5), 1, 1);
  }
  // stand
  ctx.fillStyle = colors[0];
  ctx.fillRect(cx - 1, cy, 2, 1);
  ctx.fillRect(cx - 5, SPRITE_H - 1, 10, 1);
}

/** Draws the pal into a SPRITE_W x SPRITE_H box at 1 unit per pixel; scale the context first. */
export function drawPal(ctx: CanvasRenderingContext2D, d: PalDraw) {
  ctx.imageSmoothingEnabled = false;
  const flip = !!d.flip;
  if (d.pose === "run") drawWheel(ctx, d.wheel, d.frame);
  const bob = d.pose === "run" ? d.frame % 2 : d.pose === "walk" ? d.frame % 2 : 0;
  const ox = d.pose === "run" ? 6 : (d.x ?? 6);
  const oy = d.pose === "run" ? 8 + bob : 12 + bob * 0;
  let body = BODY.slice();
  if (d.pose === "nap") {
    body = body.map((r, i) => (i === 4 ? r.replace("kw", "oo") : i === 5 ? r.replace("kk", "Ok") : r));
  }
  if (d.mood === "grumpy" && d.pose !== "nap") {
    body = body.map((r, i) => (i === 3 ? r.slice(0, 11) + "kk" + r.slice(13) : r));
  }
  const feet = d.pose === "nap" || d.pose === "sit" || d.pose === "eat" ? FEET_SIT : d.frame % 2 ? FEET_B : FEET_A;
  drawMap(ctx, [...body, ...feet], ox, oy, PAL, flip);
  if (d.hat) drawHat(ctx, d.hat, ox, oy, flip);
  if (d.pose === "eat") {
    const sx = flip ? ox - 2 : ox + 16;
    const seed = d.frame % 2 ? [".s", "ss", "s."] : ["s.", "ss", ".s"];
    drawMap(ctx, seed, sx, oy + 5, { s: "#3a3a3a" });
  }
  if (d.pose === "nap") {
    const zx = flip ? ox - 3 : ox + 16;
    const zy = oy - 4 - (d.frame % 3);
    drawMap(ctx, ["zzz", "..z", ".z.", "zzz"], zx, zy, { z: "#6b7cff" });
  }
  if (d.mood === "happy" && d.pose === "sit" && d.frame % 4 === 0) {
    drawMap(ctx, [".h.h.", "hhhhh", ".hhh.", "..h.."], flip ? ox - 4 : ox + 15, oy - 6, { h: "#e0457b" });
  }
}

const CHEST_ROWS = ["..bbbbbb..", ".baaaaaab.", "bbbbbbbbbb", "baaallaaab", "baaallaaab", "baaaaaaaab", "bbbbbbbbbb"];

export function drawChest(ctx: CanvasRenderingContext2D, kind: ChestKind, ox = 1, oy = 1) {
  ctx.imageSmoothingEnabled = false;
  const pal =
    kind === "golden"
      ? { a: "#f2c230", b: "#b8860b", l: "#fff6c2" }
      : kind === "bonus"
        ? { a: "#7f8cff", b: "#3d47a8", l: "#f2c230" }
        : { a: "#b7743a", b: "#6b3f1d", l: "#f2c230" };
  drawMap(ctx, CHEST_ROWS, ox, oy, pal);
}

export function drawSeedIcon(ctx: CanvasRenderingContext2D, ox = 1, oy = 1) {
  drawMap(ctx, [".s.", "sts", "sts", ".s."], ox, oy, { s: "#3a3a3a", t: "#f4f1e8" });
}

/** A canvas element with the pal drawn at an integer scale; used for screenshots and icons. */
export function palCanvas(doc: Document, scale: number, d: PalDraw): HTMLCanvasElement {
  const c = doc.createElement("canvas");
  c.width = SPRITE_W * scale;
  c.height = SPRITE_H * scale;
  const ctx = c.getContext("2d")!;
  ctx.scale(scale, scale);
  drawPal(ctx, d);
  return c;
}
