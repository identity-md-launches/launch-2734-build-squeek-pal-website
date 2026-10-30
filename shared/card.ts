// 1200 x 630 PNG pet card, drawn on canvas with system fonts.
import { drawPal, SPRITE_H, SPRITE_W } from "./art";
import { t } from "./i18n";
import { mood, stageFor } from "./rules";
import type { SaveState, StatName } from "./state";

export function drawCard(canvas: HTMLCanvasElement, s: SaveState) {
  const lang = s.settings.lang;
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fffaf2";
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "#f6ecdc";
  ctx.fillRect(0, 470, 1200, 160);
  // pixel floor
  ctx.fillStyle = "#e3d3bb";
  for (let x = 0; x < 1200; x += 30) ctx.fillRect(x, 470, 15, 8);
  ctx.save();
  const scale = 16;
  ctx.translate(60, 470 - SPRITE_H * scale + 10);
  ctx.scale(scale, scale);
  drawPal(ctx, { pose: "run", frame: 1, hat: s.pet.hat, wheel: s.pet.wheel, mood: mood(s.pet.stats) });
  ctx.restore();
  void SPRITE_W;
  const sys = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const fitText = (text: string, y: number, startSize: number, weight = 400) => {
    let size = startSize;
    do {
      ctx.font = `${weight} ${size}px ${sys}`;
    } while (ctx.measureText(text).width > 600 && --size > 18);
    ctx.fillText(text, 560, y);
  };
  ctx.fillStyle = "#2b1d14";
  fitText(s.pet.name, 150, 76, 700);
  ctx.fillStyle = "#6b5544";
  fitText(`${t(lang, `stage.${stageFor(s.pet.xp)}`)} · ${s.pet.xp} ${t(lang, "label.xp")} · ${s.seeds} ${t(lang, "label.seeds")}`, 205, 36);
  const stats: StatName[] = ["hunger", "happiness", "energy", "cleanliness"];
  stats.forEach((k, i) => {
    const y = 260 + i * 56;
    ctx.fillStyle = "#2b1d14";
    ctx.font = `400 28px ${sys}`;
    ctx.fillText(t(lang, `stat.${k}`), 560, y + 24);
    ctx.fillStyle = "#e3d3bb";
    ctx.fillRect(800, y, 320, 28);
    ctx.fillStyle = "#a8481a";
    ctx.fillRect(800, y, Math.round((320 * s.pet.stats[k]) / 100), 28);
  });
  ctx.fillStyle = "#2b1d14";
  ctx.font = `700 40px ${sys}`;
  ctx.fillText("Squeek Pal", 560, 560);
  ctx.fillStyle = "#6b5544";
  fitText(t(lang, "card.tagline"), 600, 26);
}

export function downloadCard(doc: Document, s: SaveState) {
  const c = doc.createElement("canvas");
  drawCard(c, s);
  c.toBlob((blob) => {
    if (!blob) return;
    const a = doc.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `squeek-pal-${s.pet.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "card"}.png`;
    doc.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, "image/png");
}
