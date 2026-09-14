import type { SpriteBook } from "./assets";
import type { Sim } from "./sim";
import type { Ent } from "./types";
import { FOG_CELL, LANDSCAPE_H, LANDSCAPE_W, MIN_ZOOM, NEST_PERIM, SILK_LINK_RANGE, SILK_STAND, TOWER_PERIM, WORLD_H, WORLD_W } from "./types";

/** Fill the screen with a 16:9 widescreen follow-cam. No letterbox. */
export function cameraZoom(cssW: number, cssH: number) {
  const cover = Math.max(cssW / LANDSCAPE_W, cssH / LANDSCAPE_H);
  return Math.max(MIN_ZOOM, cover);
}

export function viewWorldSize(cssW: number, cssH: number) {
  const z = cameraZoom(cssW, cssH);
  return { z, w: cssW / z, h: cssH / z };
}

export function screenToWorld(
  px: number,
  py: number,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
) {
  const { z, w, h } = viewWorldSize(viewW, viewH);
  return {
    x: camX - w / 2 + px / z,
    y: camY - h / 2 + py / z,
  };
}

/** Original-style 4-dir sheets: left is a horizontal mirror of the right row. */
function facingDraw(angle: number): { row: number; flip: boolean } {
  const tau = Math.PI * 2;
  const a = ((angle % tau) + tau) % tau;
  const sector = Math.round(a / (Math.PI / 2)) % 4;
  if (sector === 0) return { row: 2, flip: false };
  if (sector === 1) return { row: 0, flip: false };
  if (sector === 2) return { row: 2, flip: true };
  return { row: 3, flip: false };
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
  flip = false,
) {
  if (!img.complete || img.naturalWidth === 0) return;
  const cw = img.naturalWidth / cols;
  const ch = img.naturalHeight / rows;
  const sx = col * cw;
  const sy = row * ch;
  ctx.save();
  if (flash > 0) ctx.globalCompositeOperation = "lighter";
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, sx, sy, cw, ch, -size / 2, -size / 2, size, size);
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
  const w = Math.max(22, e.draw * 0.55);
  const h = 4;
  const x = e.x - w / 2;
  const y = e.y + yOff;
  if (e.hp < e.maxHp * 0.98) {
    ctx.fillStyle = "rgba(11,16,14,0.7)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * clamp01(e.hp / e.maxHp), h);
  }
  if (e.faction === "spider" && (e.kind === "brood" || e.kind === "queen") && e.foodMax > 0 && e.foodMeter < e.foodMax * 0.96) {
    const fy = y + (e.hp < e.maxHp * 0.98 ? 5 : 0);
    ctx.fillStyle = "rgba(11,16,14,0.7)";
    ctx.fillRect(x, fy, w, 3);
    ctx.fillStyle = e.foodMeter < e.foodMax * 0.22 ? "#c45c4c" : "#c9a227";
    ctx.fillRect(x, fy, w * clamp01(e.foodMeter / e.foodMax), 3);
  }
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function walkFrame(anim: number, moving: boolean) {
  if (!moving) return 0;
  return Math.floor(anim * 8) % 4;
}

function walk2x2(angle: number): { row: number; flip: boolean } {
  const tau = Math.PI * 2;
  const a = ((angle % tau) + tau) % tau;
  const sector = Math.round(a / (Math.PI / 2)) % 4;
  if (sector === 0) return { row: 0, flip: false };
  if (sector === 1) return { row: 1, flip: false };
  if (sector === 2) return { row: 0, flip: true };
  return { row: 1, flip: false };
}

function wings(ctx: CanvasRenderingContext2D, e: Ent) {
  if (!e.winged) return;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.facing);
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = "#e8ebe4";
  ctx.beginPath();
  ctx.ellipse(-6, -10, 12, 6, -0.4, 0, Math.PI * 2);
  ctx.ellipse(-6, 10, 12, 6, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function render(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  sprites: SpriteBook,
  viewW: number,
  viewH: number,
) {
  if (sim.view === "hive") {
    renderHive(ctx, sim, sprites, viewW, viewH);
    return;
  }
  if (sim.view === "nest") {
    renderNest(ctx, sim, sprites, viewW, viewH);
    return;
  }

  const { z, w: visW, h: visH } = viewWorldSize(viewW, viewH);
  const shake = sim.trauma * sim.trauma;
  const jx = (Math.random() * 2 - 1) * 10 * shake;
  const jy = (Math.random() * 2 - 1) * 10 * shake;
  const originX = sim.camX - visW / 2 + jx;
  const originY = sim.camY - visH / 2 + jy;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.fillStyle = "#0b100e";
  ctx.fillRect(0, 0, viewW, viewH);

  ctx.setTransform(z, 0, 0, z, 0, 0);
  ctx.save();
  ctx.translate(-originX, -originY);

  const fw = sprites.floor.naturalWidth || 1792;
  const fh = sprites.floor.naturalHeight || 1008;
  for (let y = 0; y < WORLD_H; y += fh) {
    for (let x = 0; x < WORLD_W; x += fw) {
      ctx.drawImage(sprites.floor, x, y, fw, fh);
    }
  }

  ctx.strokeStyle = "rgba(232,235,228,0.18)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 10]);
  const nest = sim.nest();
  if (nest) {
    ctx.beginPath();
    ctx.arc(nest.x, nest.y, NEST_PERIM, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([3, 16]);
    ctx.strokeStyle = "rgba(232,235,228,0.14)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(nest.x, nest.y, SILK_LINK_RANGE, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const n of sim.linkedNodes()) {
    if (nest && n.id === nest.id) continue;
    ctx.setLineDash([5, 12]);
    ctx.strokeStyle = "rgba(183,201,106,0.28)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(n.x, n.y, TOWER_PERIM, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([3, 16]);
    ctx.strokeStyle = "rgba(232,235,228,0.1)";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(n.x, n.y, SILK_LINK_RANGE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function strand(ax: number, ay: number, bx: number, by: number, ready: boolean, live: boolean) {
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2 + Math.min(36, Math.hypot(bx - ax, by - ay) * 0.08);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.strokeStyle = ready ? "rgba(232,235,228,0.92)" : live ? "rgba(201,208,196,0.6)" : "rgba(196,92,76,0.5)";
    ctx.lineWidth = ready ? 4 : live ? 3 : 2;
    if (!live) ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (live || ready) {
      const pulse = sim.reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(sim.time * 3.2);
      for (let i = 1; i <= 4; i++) {
        const t = (i / 5 + (live ? sim.time * 0.08 : 0)) % 1;
        const u = 1 - t;
        const px = u * u * ax + 2 * u * t * mx + t * t * bx;
        const py = u * u * ay + 2 * u * t * my + t * t * by;
        ctx.fillStyle = ready ? `rgba(232,235,228,${0.35 + 0.5 * pulse})` : `rgba(201,208,196,${0.25 + 0.35 * pulse})`;
        ctx.beginPath();
        ctx.arc(px, py, ready ? 3.2 : 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  for (const link of sim.links) {
    const a = sim.ents.find((e) => e.id === link.a && e.alive);
    const b = sim.ents.find((e) => e.id === link.b && e.alive);
    if (!a || !b) continue;
    strand(a.x, a.y, b.x, b.y, false, true);
  }
  const preview = sim.silkPreview();
  if (preview) {
    const pulse = sim.reducedMotion ? 1 : 0.55 + 0.45 * Math.sin(sim.time * 4);
    ctx.strokeStyle = preview.standOk ? `rgba(232,235,228,${0.4 + 0.4 * pulse})` : "rgba(196,92,76,0.75)";
    ctx.lineWidth = preview.standOk ? 2.6 : 1.8;
    ctx.setLineDash(preview.standOk ? [] : [5, 5]);
    ctx.beginPath();
    ctx.arc(preview.ax, preview.ay, SILK_STAND, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = preview.reachOk ? "rgba(183,201,106,0.38)" : "rgba(196,92,76,0.42)";
    ctx.lineWidth = 2;
    ctx.setLineDash(preview.reachOk ? [4, 10] : [8, 8]);
    ctx.beginPath();
    ctx.arc(preview.bx, preview.by, SILK_LINK_RANGE, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    strand(preview.ax, preview.ay, preview.bx, preview.by, preview.ready, false);

    const mx = (preview.ax + preview.bx) / 2;
    const my = (preview.ay + preview.by) / 2 + Math.min(36, Math.hypot(preview.bx - preview.ax, preview.by - preview.ay) * 0.08);
    ctx.font = "600 12px Figtree, sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = preview.ready ? "#e8ebe4" : preview.reachOk ? "#c9d0c4" : "#c45c4c";
    ctx.fillText(`${Math.round(preview.dist)} / ${SILK_LINK_RANGE}`, mx, my - 12);
  }

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
    const dir = facingDraw(e.facing);
    const attackFlip = Math.cos(e.facing) < 0;
    switch (e.kind) {
      case "burrow":
        drawProp(ctx, sprites.burrow, e.x, e.y, e.draw, e.draw);
        break;
      case "nest": {
        const dmg = 1 - clamp01(e.hp / e.maxHp);
        ctx.save();
        if (dmg > 0.08) ctx.filter = `saturate(${1 - dmg * 0.45}) brightness(${1 - dmg * 0.35})`;
        drawProp(ctx, sprites.nest, e.x, e.y - 8, e.draw, e.draw * 0.92);
        ctx.restore();
        if (dmg > 0.12) {
          ctx.fillStyle = `rgba(196,92,76,${0.12 + dmg * 0.35})`;
          ctx.beginPath();
          ctx.ellipse(e.x, e.y + 18, e.draw * 0.28, e.draw * 0.1, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        hpBar(ctx, e, e.draw * 0.38, "#c45c4c");
        break;
      }
      case "tree":
        drawProp(ctx, sprites.tree, e.x, e.y - 28, e.draw * 0.85, e.draw);
        break;
      case "fruit": {
        drawProp(ctx, sprites.tree, e.x, e.y - 22, e.draw * 0.85, e.draw);
        ctx.fillStyle = "#c45c4c";
        for (let i = 0; i < Math.min(6, Math.max(1, Math.ceil(e.meat / 4))); i++) {
          const a = i * 1.1 + e.age * 0.2;
          ctx.beginPath();
          ctx.arc(e.x + Math.cos(a) * 14, e.y - 18 + Math.sin(a * 1.3) * 10, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "solar": {
        const bury = e.buried;
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.fillStyle = e.unearthed ? "#1c2620" : "#141c18";
        ctx.strokeStyle = "rgba(201,208,196,0.55)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(-18, -10 + bury * 14, 36, 20);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "rgba(183,201,106,0.7)";
        ctx.beginPath();
        ctx.moveTo(-14, -6 + bury * 14);
        ctx.lineTo(14, -6 + bury * 14);
        ctx.moveTo(-14, 0 + bury * 14);
        ctx.lineTo(14, 0 + bury * 14);
        ctx.stroke();
        if (bury > 0.3) {
          ctx.fillStyle = "rgba(20,28,24,0.55)";
          ctx.fillRect(-20, 6, 40, 12);
        }
        ctx.restore();
        break;
      }
      case "battery": {
        const bury = e.buried;
        ctx.save();
        ctx.translate(e.x, e.y + bury * 8);
        ctx.fillStyle = e.unearthed ? "#2a3530" : "#1c2620";
        ctx.beginPath();
        ctx.roundRect(-8, -14, 16, 26, 4);
        ctx.fill();
        ctx.fillStyle = "#b7c96a";
        ctx.fillRect(-3, -18, 6, 5);
        ctx.fillStyle = "#c45c4c";
        ctx.fillRect(-5, -4, 10, 6);
        if (bury > 0.3) {
          ctx.fillStyle = "rgba(20,28,24,0.6)";
          ctx.fillRect(-12, 8, 24, 14);
        }
        ctx.restore();
        break;
      }
      case "scrap": {
        ctx.fillStyle = "#8a9388";
        ctx.beginPath();
        ctx.moveTo(e.x - 8, e.y + 4);
        ctx.lineTo(e.x, e.y - 8);
        ctx.lineTo(e.x + 9, e.y + 3);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "loot": {
        ctx.fillStyle = e.meat > 0 ? "#c45c4c" : "#c9d0c4";
        ctx.beginPath();
        ctx.arc(e.x, e.y, 9, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "egg":
        if (e.role === "siege") ctx.filter = "hue-rotate(72deg) saturate(1.15)";
        drawProp(ctx, sprites.eggs, e.x, e.y, e.draw, e.draw);
        ctx.filter = "none";
        hpBar(ctx, e, 18, e.role === "siege" ? "#b7c96a" : "#e8ebe4");
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
            attackFlip,
          );
        } else {
          drawCell(
            ctx,
            sprites.queenWalk,
            4,
            4,
            dir.row,
            walkFrame(e.anim, moving),
            e.x,
            e.y,
            e.draw,
            e.flash,
            dir.flip,
          );
        }
        hpBar(ctx, e, e.draw * 0.42, "#b7c96a");
        break;
      }
      case "brood": {
        const moving = Math.hypot(e.vx, e.vy) > 12;
        const attacking = e.atkT > 0;
        if (e.stage === "chrysalis") {
          drawProp(ctx, sprites.cocoon, e.x, e.y, e.draw, e.draw);
          break;
        }
        if (e.caste === "worker") ctx.filter = "sepia(0.45) saturate(0.85)";
        else if (e.caste === "defender") ctx.filter = "hue-rotate(48deg) saturate(0.8)";
        if (e.hibernating) ctx.globalAlpha = 0.45;
        wings(ctx, e);
        const sheet = e.evo === "tank" || e.evo === "siege" ? sprites.siegeWalk : sprites.spiderlingWalk;
        const atk = e.evo === "tank" || e.evo === "siege" ? sprites.siegeAttack : sprites.packAttack;
        if (attacking && e.dmg > 0) {
          const f = Math.min(3, Math.floor((1 - e.atkT / 0.32) * 4));
          drawCell(ctx, atk, 2, 2, Math.floor(f / 2), f % 2, e.x, e.y, e.draw + 6, e.flash, attackFlip);
        } else if (e.evo === "tank" || e.evo === "siege") {
          drawCell(ctx, sheet, 4, 4, dir.row, walkFrame(e.anim, moving), e.x, e.y, e.draw, e.flash, dir.flip);
        } else {
          drawCell(ctx, sheet, 4, 4, dir.row, walkFrame(e.anim, moving), e.x, e.y, e.draw, e.flash, dir.flip);
        }
        ctx.filter = "none";
        ctx.globalAlpha = 1;
        hpBar(ctx, e, 16, "#b7c96a");
        break;
      }
      case "human": {
        const moving = Math.hypot(e.vx, e.vy) > 10;
        const attacking = e.atkT > 0;
        if (e.role === "torch") ctx.filter = "sepia(0.35) saturate(1.4)";
        if (attacking) {
          const f = Math.min(3, Math.floor((1 - e.atkT / 0.38) * 4));
          drawCell(
            ctx,
            sprites.humanAttack,
            2,
            2,
            Math.floor(f / 2),
            f % 2,
            e.x,
            e.y,
            e.draw,
            e.flash,
            attackFlip,
          );
        } else {
          drawCell(
            ctx,
            sprites.humanWalk,
            4,
            4,
            dir.row,
            walkFrame(e.anim, moving),
            e.x,
            e.y,
            e.draw,
            e.flash,
            dir.flip,
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
            attackFlip,
          );
        } else {
          drawCell(
            ctx,
            sprites.scorpionWalk,
            4,
            4,
            dir.row,
            walkFrame(e.anim, moving),
            e.x,
            e.y,
            e.draw,
            e.flash,
            dir.flip,
          );
        }
        const tgt = sim.ents.find((o) => o.id === e.targetId && o.alive);
        if (tgt) {
          ctx.strokeStyle =
            tgt.faction === "human" ? "rgba(196,92,76,0.45)" : "rgba(183,201,106,0.4)";
          ctx.lineWidth = 1.4;
          ctx.setLineDash([4, 5]);
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(tgt.x, tgt.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        hpBar(ctx, e, 24, "#c46a3a");
        break;
      }
      case "bee": {
        const d2 = walk2x2(e.facing);
        const moving = Math.hypot(e.vx, e.vy) > 8;
        const col = moving ? Math.floor(e.anim * 6) % 2 : 0;
        drawCell(ctx, sprites.beeWalk, 2, 2, d2.row, col, e.x, e.y, e.draw, e.flash, d2.flip);
        hpBar(ctx, e, 16, "#c9a227");
        break;
      }
      case "wasp": {
        const d2 = walk2x2(e.facing);
        const moving = Math.hypot(e.vx, e.vy) > 8;
        const col = moving ? Math.floor(e.anim * 6) % 2 : 0;
        drawCell(ctx, sprites.waspWalk, 2, 2, d2.row, col, e.x, e.y, e.draw, e.flash, d2.flip);
        hpBar(ctx, e, 16, "#c46a3a");
        break;
      }
      case "herbivore": {
        const d2 = walk2x2(e.facing);
        const moving = Math.hypot(e.vx, e.vy) > 6;
        const col = moving ? Math.floor(e.anim * 5) % 2 : 0;
        drawCell(ctx, sprites.stagWalk, 2, 2, d2.row, col, e.x, e.y, e.draw, e.flash, d2.flip);
        hpBar(ctx, e, 20, "#8a9388");
        break;
      }
      case "tower": {
        drawProp(ctx, sprites.tower, e.x, e.y - 10, e.draw * 0.7, e.draw);
        if (e.evo === "electric" || e.evo === "siegehold") {
          ctx.strokeStyle = "rgba(183,201,106,0.55)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(e.x, e.y, 22 + Math.sin(sim.time * 6) * 3, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.save();
        ctx.setLineDash(e.linked ? [] : [5, 6]);
        ctx.strokeStyle = e.linked
          ? e.alert
            ? "rgba(183,201,106,0.55)"
            : "rgba(232,235,228,0.22)"
          : "rgba(196,92,76,0.7)";
        ctx.lineWidth = e.alert ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.linked ? TOWER_PERIM : SILK_STAND, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        hpBar(ctx, e, 28, e.linked ? "#b7c96a" : "#c45c4c");
        ctx.font = "600 11px Figtree, sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = e.linked ? "#c9d0c4" : "#c45c4c";
        const tag = e.evo === "siegehold" ? "SIEGE" : e.evo === "electric" ? "VOLT" : e.linked ? (e.alert ? "ALERT" : "NET") : "MUTE";
        ctx.fillText(tag, e.x, e.y + 36);
        break;
      }
      case "hive":
        drawProp(ctx, sprites.nest, e.x, e.y, e.draw * 0.7, e.draw * 0.7);
        ctx.filter = e.faction === "bee" ? "sepia(0.8) saturate(1.6)" : "hue-rotate(-20deg) saturate(1.3)";
        ctx.filter = "none";
        hpBar(ctx, e, 28, "#c9a227");
        break;
      case "node": {
        ctx.fillStyle = "rgba(183,201,106,0.55)";
        ctx.beginPath();
        ctx.arc(e.x, e.y, 11, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      default:
        break;
    }
  }

  for (const e of sorted) {
    if (e.kind !== "shot") continue;
    const f = Math.floor(e.anim * 8) % 4;
    const img = e.role === "siege" ? sprites.siegeShot : sprites.venom;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.facing);
    drawCell(ctx, img, 2, 2, Math.floor(f / 2), f % 2, 0, 0, e.draw);
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

  for (const [id, route] of sim.routes) {
    if (route.pts.length < 2) continue;
    const on = id === sim.selectedId;
    ctx.setLineDash(on ? [7, 6] : [4, 10]);
    ctx.strokeStyle = on ? "rgba(183,201,106,0.85)" : "rgba(201,208,196,0.28)";
    ctx.lineWidth = on ? 2.25 : 1.25;
    ctx.beginPath();
    ctx.moveTo(route.pts[0].x, route.pts[0].y);
    for (let i = 1; i < route.pts.length; i++) ctx.lineTo(route.pts[i].x, route.pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (!on) continue;
    for (let i = 1; i < route.pts.length; i++) {
      const p = route.pts[i];
      ctx.fillStyle = "rgba(232,235,228,0.7)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const selected = new Set(sim.selectedIds.length ? sim.selectedIds : sim.selectedId ? [sim.selectedId] : []);
  for (const id of selected) {
    const unit = sim.find(id);
    if (!unit || !unit.alive) continue;
    ctx.strokeStyle = "rgba(183,201,106,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(unit.x, unit.y, Math.max(18, unit.r + 10), 0, Math.PI * 2);
    ctx.stroke();
  }
  const sel = sim.find(sim.selectedId);
  if (sel && sel.alive) {
    if (sel.assignR > 0) {
      ctx.setLineDash([5, 8]);
      ctx.strokeStyle = "rgba(183,201,106,0.55)";
      ctx.beginPath();
      ctx.arc(sel.assignX, sel.assignY, sel.assignR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(183,201,106,0.18)";
      ctx.beginPath();
      ctx.arc(sel.assignX, sel.assignY, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (sim.marking && sel) {
    ctx.setLineDash([4, 7]);
    ctx.strokeStyle = "rgba(232,235,228,0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sel.x, sel.y, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function renderHive(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  sprites: SpriteBook,
  viewW: number,
  viewH: number,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#0b100e";
  ctx.fillRect(0, 0, viewW, viewH);
  const img = sprites.nestInside;
  if (img.complete && img.naturalWidth) {
    const s = Math.max(viewW / img.naturalWidth, viewH / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.drawImage(img, (viewW - w) / 2, (viewH - h) / 2, w, h);
  }
  ctx.fillStyle = "rgba(11,16,14,0.35)";
  ctx.fillRect(0, 0, viewW, viewH);
  const h = sim.find(sim.hiveId);
  const loot = h ? sim.ents.filter((e) => e.alive && e.kind === "loot" && e.site === h.site) : [];
  ctx.font = "600 14px Figtree, sans-serif";
  ctx.textAlign = "center";
  loot.forEach((e, i) => {
    const x = (0.34 + i * 0.32) * viewW;
    const y = 0.5 * viewH;
    const on = sim.selectedId === e.id;
    ctx.fillStyle = on ? "rgba(183,201,106,0.28)" : "rgba(11,16,14,0.4)";
    ctx.beginPath();
    ctx.ellipse(x, y, 64, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = e.meat > 0 ? "#c45c4c" : "#c9d0c4";
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8ebe4";
    ctx.fillText(e.meat > 0 ? "Hive food" : "Hive material", x, y - 48);
    ctx.fillStyle = "#8a9388";
    ctx.fillText(e.meat > 0 ? `${Math.floor(e.meat)} food` : `${Math.floor(e.haul)} mat`, x, y + 46);
  });
  if (!loot.length) {
    ctx.fillStyle = "#8a9388";
    ctx.fillText("The caches are empty.", viewW / 2, viewH / 2);
  }
}

function renderNest(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  sprites: SpriteBook,
  viewW: number,
  viewH: number,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#0b100e";
  ctx.fillRect(0, 0, viewW, viewH);
  const img = sprites.nestInside;
  if (img.complete && img.naturalWidth) {
    const s = Math.max(viewW / img.naturalWidth, viewH / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.drawImage(img, (viewW - w) / 2, (viewH - h) / 2, w, h);
  }
  const rooms: { type: string; x: number; y: number; label: string }[] = [
    { type: "material", x: 0.28, y: 0.3, label: "Material" },
    { type: "chrysalis", x: 0.72, y: 0.28, label: "Chrysalis" },
    { type: "chamber", x: 0.5, y: 0.5, label: "Queen" },
    { type: "hatchery", x: 0.3, y: 0.72, label: "Hatchery" },
    { type: "food", x: 0.72, y: 0.7, label: "Food" },
  ];
  ctx.font = "600 14px Figtree, sans-serif";
  ctx.textAlign = "center";
  for (const r of rooms) {
    const x = r.x * viewW;
    const y = r.y * viewH;
    const on = sim.selectedRoom === r.type;
    ctx.fillStyle = on ? "rgba(183,201,106,0.28)" : "rgba(11,16,14,0.35)";
    ctx.beginPath();
    ctx.ellipse(x, y, 70, 46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e8ebe4";
    ctx.fillText(r.label, x, y - 36);
    const room = sim.rooms.find((o) => o.type === r.type);
    if (room) {
      ctx.fillStyle = "#8a9388";
      ctx.fillText(`Lv ${room.level} · ${Math.floor(room.stored)}/${room.cap}`, x, y + 48);
    }
  }
  const brood = sim.ents.filter((e) => e.alive && e.faction === "spider" && (e.kind === "brood" || e.kind === "queen" || e.kind === "egg"));
  brood.forEach((e, i) => {
    const slot = rooms[i % rooms.length];
    const x = slot.x * viewW + Math.cos(i) * 28;
    const y = slot.y * viewH + Math.sin(i * 1.3) * 18;
    const dir = facingDraw(e.facing);
    if (e.kind === "queen") {
      drawCell(ctx, sprites.queenWalk, 4, 4, dir.row, 0, x, y, e.stage === "adolescent" ? 48 : 64, 0, dir.flip);
    } else if (e.kind === "egg") {
      drawProp(ctx, sprites.eggs, x, y, 28, 28);
    } else if (e.stage === "chrysalis") {
      drawProp(ctx, sprites.cocoon, x, y, 32, 32);
    } else {
      drawCell(ctx, sprites.spiderlingWalk, 4, 4, dir.row, 0, x, y, 28, 0, dir.flip);
    }
  });
}

export function renderMinimap(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  w: number,
  h: number,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#050807";
  ctx.fillRect(0, 0, w, h);
  const sx = w / WORLD_W;
  const sy = h / WORLD_H;
  const fog = sim.fog;
  const step = 2;
  for (let cy = 0; cy < fog.rows; cy += step) {
    for (let cx = 0; cx < fog.cols; cx += step) {
      const i = cy * fog.cols + cx;
      if (!fog.explored[i]) continue;
      ctx.fillStyle = fog.visible[i] ? "#1c2620" : "#101814";
      ctx.fillRect(cx * FOG_CELL * sx, cy * FOG_CELL * sy, FOG_CELL * sx * step + 1, FOG_CELL * sy * step + 1);
    }
  }
  ctx.strokeStyle = "rgba(201,208,196,0.55)";
  ctx.lineWidth = 1;
  for (const link of sim.links) {
    const a = sim.ents.find((e) => e.id === link.a && e.alive);
    const b = sim.ents.find((e) => e.id === link.b && e.alive);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * sx, a.y * sy);
    ctx.lineTo(b.x * sx, b.y * sy);
    ctx.stroke();
  }
  for (const e of sim.ents) {
    if (!e.alive) continue;
    if (!sim.fog.seen(e.x, e.y) && e.faction !== "spider") continue;
    if (e.kind === "shot" || e.kind === "web" || e.kind === "fx") continue;
    ctx.fillStyle =
      e.kind === "queen"
        ? "#e8ebe4"
        : e.faction === "spider"
          ? "#b7c96a"
          : e.kind === "herbivore"
            ? "#8a9388"
            : e.kind === "bee"
              ? "#c9a227"
              : e.kind === "tower"
                ? e.linked
                  ? "#c9d0c4"
                  : "#c45c4c"
                : "#c45c4c";
    const s = e.kind === "queen" || e.kind === "nest" ? 3.5 : 2;
    ctx.fillRect(e.x * sx - s / 2, e.y * sy - s / 2, s, s);
  }
  ctx.strokeStyle = "#e8ebe4";
  ctx.lineWidth = 1;
  ctx.strokeRect((sim.camX - sim.viewW / 2) * sx, (sim.camY - sim.viewH / 2) * sy, sim.viewW * sx, sim.viewH * sy);
}
