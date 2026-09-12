import type { SpriteBook } from "./assets";
import type { Sim } from "./sim";
import type { Ent } from "./types";
import { WORLD_H, WORLD_W } from "./types";

function facingRow(angle: number): number {
  const tau = Math.PI * 2;
  const a = ((angle % tau) + tau) % tau;
  const sector = Math.round(a / (Math.PI / 2)) % 4;
  return [2, 0, 1, 3][sector] ?? 0;
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rows: number,
  cols: number,
  row: number,
  col: number,
  x: number,
  y: number,
  size: number,
  flash = 0,
) {
  if (!img.complete || img.naturalWidth === 0) return;
  const cw = img.naturalWidth / cols;
  const ch = img.naturalHeight / rows;
  const sx = col * cw;
  const sy = row * ch;
  ctx.save();
  if (flash > 0) ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(img, sx, sy, cw, ch, x - size / 2, y - size / 2, size, size);
  ctx.restore();
}

function drawProp(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (!img.complete || img.naturalWidth === 0) return;
  ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
}

function hpBar(ctx: CanvasRenderingContext2D, e: Ent, yOff: number, color: string) {
  if (e.hp >= e.maxHp * 0.98) return;
  const w = Math.max(22, e.draw * 0.55);
  const h = 4;
  const x = e.x - w / 2;
  const y = e.y + yOff;
  ctx.fillStyle = "rgba(11,16,14,0.7)";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp01(e.hp / e.maxHp), h);
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function walkFrame(anim: number, moving: boolean) {
  if (!moving) return 0;
  return Math.floor(anim * 8) % 4;
}

export function render(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  sprites: SpriteBook,
  viewW: number,
  viewH: number,
) {
  const shake = sim.trauma * sim.trauma;
  const ox = (Math.random() * 2 - 1) * 14 * shake;
  const oy = (Math.random() * 2 - 1) * 14 * shake;
  const camX = sim.camX - viewW / 2 + ox;
  const camY = sim.camY - viewH / 2 + oy;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.fillStyle = "#0b100e";
  ctx.fillRect(0, 0, viewW, viewH);

  ctx.save();
  ctx.translate(-camX, -camY);

  ctx.drawImage(sprites.floor, 0, 0, WORLD_W, WORLD_H);

  const sorted = sim.ents.filter((e) => e.alive).sort((a, b) => a.y - b.y);

  for (const e of sorted) {
    if (e.kind !== "web") continue;
    const frame = Math.floor(e.anim * 4) % 4;
    ctx.globalAlpha = 0.82;
    drawCell(ctx, sprites.web, 2, 2, Math.floor(frame / 2), frame % 2, e.x, e.y, e.draw);
    ctx.globalAlpha = 1;
  }

  for (const e of sorted) {
    if (e.kind === "web" || e.kind === "shot" || e.kind === "fx") continue;
    switch (e.kind) {
      case "burrow":
        drawProp(ctx, sprites.burrow, e.x, e.y, e.draw, e.draw);
        break;
      case "nest":
        drawProp(ctx, sprites.nest, e.x, e.y - 8, e.draw, e.draw * 0.92);
        hpBar(ctx, e, e.draw * 0.38, "#c45c4c");
        break;
      case "tree":
        drawProp(ctx, sprites.tree, e.x, e.y - 28, e.draw * 0.85, e.draw);
        break;
      case "egg":
        drawProp(ctx, sprites.eggs, e.x, e.y, e.draw, e.draw);
        hpBar(ctx, e, 18, "#e8ebe4");
        break;
      case "cocoon":
        drawProp(ctx, sprites.cocoon, e.x, e.y, e.draw, e.draw);
        break;
      case "pickup": {
        ctx.save();
        ctx.translate(e.x, e.y + Math.sin(e.age * 5) * 3);
        ctx.fillStyle = "#c46a3a";
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case "queen": {
        const moving = Math.hypot(e.vx, e.vy) > 18;
        const attacking = e.atkT > 0;
        if (attacking) {
          const f = Math.min(3, Math.floor((1 - e.atkT / 0.38) * 4));
          drawCell(
            ctx,
            sprites.queenAttack,
            2,
            2,
            Math.floor(f / 2),
            f % 2,
            e.x,
            e.y,
            e.draw,
            e.flash,
          );
        } else {
          drawCell(
            ctx,
            sprites.queenWalk,
            4,
            4,
            facingRow(e.facing),
            walkFrame(e.anim, moving),
            e.x,
            e.y,
            e.draw,
            e.flash,
          );
        }
        hpBar(ctx, e, e.draw * 0.42, "#b7c96a");
        break;
      }
      case "brood": {
        const moving = Math.hypot(e.vx, e.vy) > 12;
        drawCell(
          ctx,
          sprites.spiderlingWalk,
          4,
          4,
          facingRow(e.facing),
          walkFrame(e.anim, moving),
          e.x,
          e.y,
          e.draw,
          e.flash,
        );
        hpBar(ctx, e, 16, "#b7c96a");
        break;
      }
      case "human": {
        const moving = Math.hypot(e.vx, e.vy) > 10;
        const attacking = e.atkT > 0;
        if (e.role === "torch") ctx.filter = "sepia(0.35) saturate(1.4)";
        if (attacking) {
          const f = Math.min(3, Math.floor((1 - e.atkT / 0.38) * 4));
          drawCell(ctx, sprites.humanAttack, 2, 2, Math.floor(f / 2), f % 2, e.x, e.y, e.draw, e.flash);
        } else {
          drawCell(
            ctx,
            sprites.humanWalk,
            4,
            4,
            facingRow(e.facing),
            walkFrame(e.anim, moving),
            e.x,
            e.y,
            e.draw,
            e.flash,
          );
        }
        ctx.filter = "none";
        hpBar(ctx, e, 22, "#c45c4c");
        break;
      }
      case "scorpion": {
        const moving = Math.hypot(e.vx, e.vy) > 10;
        const attacking = e.atkT > 0;
        if (attacking) {
          const f = Math.min(3, Math.floor((1 - e.atkT / 0.38) * 4));
          drawCell(
            ctx,
            sprites.scorpionAttack,
            2,
            2,
            Math.floor(f / 2),
            f % 2,
            e.x,
            e.y,
            e.draw,
            e.flash,
          );
        } else {
          drawCell(
            ctx,
            sprites.scorpionWalk,
            4,
            4,
            facingRow(e.facing),
            walkFrame(e.anim, moving),
            e.x,
            e.y,
            e.draw,
            e.flash,
          );
        }
        const t = sim.ents.find((o) => o.id === e.targetId && o.alive);
        if (t) {
          ctx.strokeStyle =
            t.faction === "human" ? "rgba(196,92,76,0.45)" : "rgba(183,201,106,0.4)";
          ctx.lineWidth = 1.4;
          ctx.setLineDash([4, 5]);
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(t.x, t.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        hpBar(ctx, e, 24, "#c46a3a");
        break;
      }
      default:
        break;
    }
  }

  for (const e of sorted) {
    if (e.kind !== "shot") continue;
    const f = Math.floor(e.anim * 8) % 4;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing);
    drawCell(ctx, sprites.venom, 2, 2, Math.floor(f / 2), f % 2, 0, 0, e.draw);
    ctx.restore();
  }

  for (const e of sorted) {
    if (e.kind !== "fx") continue;
    const f = Math.min(3, Math.floor((1 - e.ttl / 0.28) * 4));
    drawCell(ctx, sprites.impact, 2, 2, Math.floor(f / 2), f % 2, e.x, e.y, e.draw);
  }

  for (const p of sim.particles) {
    ctx.globalAlpha = clamp01(p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.font = "600 13px Figtree, sans-serif";
  ctx.textAlign = "center";
  for (const f of sim.floaters) {
    ctx.globalAlpha = clamp01(f.life / 0.9);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}
