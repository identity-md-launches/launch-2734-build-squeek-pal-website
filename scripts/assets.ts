// Renders the extension icons and the site's og:image from the same pixel art code,
// using a tiny pixel buffer instead of a browser canvas. Run by build-extension.mjs.
import { deflateSync } from "node:zlib";
import { drawChest, drawPal, SPRITE_H, SPRITE_W } from "../shared/art";

class PixelCtx {
  data: Uint8Array;
  fillStyle = "#000000";
  imageSmoothingEnabled = false;
  private sx = 1;
  private sy = 1;
  private tx = 0;
  private ty = 0;
  private stack: number[][] = [];
  constructor(public w: number, public h: number) {
    this.data = new Uint8Array(w * h * 4);
  }
  scale(x: number, y: number) {
    this.sx *= x;
    this.sy *= y;
  }
  translate(x: number, y: number) {
    this.tx += x * this.sx;
    this.ty += y * this.sy;
  }
  setTransform(a: number, _b: number, _c: number, d: number, e: number, f: number) {
    this.sx = a;
    this.sy = d;
    this.tx = e;
    this.ty = f;
  }
  save() {
    this.stack.push([this.sx, this.sy, this.tx, this.ty]);
  }
  restore() {
    const s = this.stack.pop();
    if (s) [this.sx, this.sy, this.tx, this.ty] = s;
  }
  fillRect(x: number, y: number, w: number, h: number) {
    const hex = this.fillStyle.replace("#", "");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const x0 = Math.round(this.tx + x * this.sx);
    const y0 = Math.round(this.ty + y * this.sy);
    const x1 = Math.round(this.tx + (x + w) * this.sx);
    const y1 = Math.round(this.ty + (y + h) * this.sy);
    for (let yy = Math.max(0, y0); yy < Math.min(this.h, y1); yy++)
      for (let xx = Math.max(0, x0); xx < Math.min(this.w, x1); xx++) {
        const i = (yy * this.w + xx) * 4;
        this.data.set([r, g, b, 255], i);
      }
  }
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf: Uint8Array): number {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function png(ctx: PixelCtx): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ctx.w, 0);
  ihdr.writeUInt32BE(ctx.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((ctx.w * 4 + 1) * ctx.h);
  for (let y = 0; y < ctx.h; y++) Buffer.from(ctx.data.buffer, y * ctx.w * 4, ctx.w * 4).copy(raw, y * (ctx.w * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array())]);
}

type Ctx2D = CanvasRenderingContext2D;

export function icon(size: number): Buffer {
  const ctx = new PixelCtx(size, size);
  const scale = size / 16;
  ctx.scale(scale, scale);
  ctx.translate(0, -10);
  drawPal(ctx as unknown as Ctx2D, { pose: "sit", frame: 0, hat: null, wheel: null, mood: "ok", x: 0 });
  return png(ctx);
}

// 3x5 pixel letters for the share image title
const FONT: Record<string, string[]> = {
  S: ["###", "#..", "###", "..#", "###"],
  Q: ["###", "#.#", "#.#", "###", "..#"],
  U: ["#.#", "#.#", "#.#", "#.#", "###"],
  E: ["###", "#..", "##.", "#..", "###"],
  K: ["#.#", "#.#", "##.", "#.#", "#.#"],
  P: ["###", "#.#", "###", "#..", "#.."],
  A: ["###", "#.#", "###", "#.#", "#.#"],
  L: ["#..", "#..", "#..", "#..", "###"],
  " ": ["...", "...", "...", "...", "..."],
};

function text(ctx: PixelCtx, s: string, x: number, y: number, unit: number, color: string) {
  ctx.fillStyle = color;
  [...s].forEach((ch, i) => {
    const g = FONT[ch];
    if (!g) return;
    g.forEach((row, ry) =>
      [...row].forEach((c, rx) => {
        if (c === "#") ctx.fillRect(x + (i * 4 + rx) * unit, y + ry * unit, unit, unit);
      }),
    );
  });
}

export function ogImage(): Buffer {
  const ctx = new PixelCtx(1200, 630);
  ctx.fillStyle = "#fffaf2";
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "#f6ecdc";
  ctx.fillRect(0, 500, 1200, 130);
  ctx.fillStyle = "#e3d3bb";
  for (let x = 0; x < 1200; x += 40) ctx.fillRect(x, 500, 20, 10);
  ctx.save();
  ctx.translate(90, 500 - SPRITE_H * 16);
  ctx.scale(16, 16);
  drawPal(ctx as unknown as Ctx2D, { pose: "run", frame: 2, hat: "party", wheel: "sunset", mood: "happy" });
  ctx.restore();
  text(ctx, "SQUEEK PAL", 600, 170, 14, "#2b1d14");
  ctx.save();
  ctx.translate(640, 330);
  ctx.scale(14, 14);
  drawChest(ctx as unknown as Ctx2D, "golden", 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(840, 330);
  ctx.scale(14, 14);
  drawChest(ctx as unknown as Ctx2D, "normal", 0, 0);
  ctx.restore();
  void SPRITE_W;
  return png(ctx);
}
