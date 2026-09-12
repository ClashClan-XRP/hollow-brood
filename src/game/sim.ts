import {
  BURROW_POS,
  HUMAN_SPAWN,
  NEST_POS,
  TREE_SPOTS,
  WALK_MARGIN,
  WORLD_H,
  WORLD_W,
  type Ent,
  type Faction,
  type Floater,
  type GameMode,
  type HudSnap,
  type Kind,
  type Particle,
  type Ticker,
  type UpgradeId,
} from "./types";
import type { Actions } from "./input";
import type { GameAudio } from "./audio";

const SAVE_KEY = "hollow-brood-v1";

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
function dist2(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
function ang(from: { x: number; y: number }, to: { x: number; y: number }) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

const COMBAT: Kind[] = ["queen", "brood", "human", "scorpion"];
const STRUCTURE: Kind[] = ["egg", "nest"];

function isHostile(a: Faction, b: Faction) {
  if (a === "none" || b === "none" || a === b) return false;
  return true;
}

function loadBest(): number {
  try {
    if (typeof window === "undefined") return 0;
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return 0;
    const p = JSON.parse(raw) as { bestWave?: number };
    return p.bestWave ?? 0;
  } catch {
    return 0;
  }
}

export class Sim {
  ents: Ent[] = [];
  particles: Particle[] = [];
  floaters: Floater[] = [];
  tickers: Ticker[] = [];
  nextId = 1;
  mode: GameMode = "title";
  overReason = "";
  meat = 18;
  wave = 1;
  waveClear = 0;
  spawnLeft = 0;
  spawnCd = 0;
  scorpCd = 8;
  queenId = 0;
  nestId = 0;
  fang = 0;
  carapace = 0;
  silk = 0;
  broodLv = 0;
  webCd = 0;
  venomCd = 0;
  trauma = 0;
  hitstop = 0;
  camX = NEST_POS.x;
  camY = NEST_POS.y;
  time = 0;
  killsHuman = 0;
  killsScorpion = 0;
  scorpionOnHuman = 0;
  bestWave = 0;
  reducedMotion = false;
  audio: GameAudio | null = null;
  aimWx = NEST_POS.x;
  aimWy = NEST_POS.y;
  hasAim = false;
  lastQueenSpeed = 0;

  constructor() {
    this.bestWave = loadBest();
    if (typeof window !== "undefined") {
      this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    }
  }

  private make(
    kind: Kind,
    faction: Faction,
    x: number,
    y: number,
    extra: Partial<Ent> = {},
  ): Ent {
    const e: Ent = {
      id: this.nextId++,
      kind,
      faction,
      x,
      y,
      vx: 0,
      vy: 0,
      r: 16,
      hp: 1,
      maxHp: 1,
      facing: 0,
      speed: 80,
      dmg: 6,
      range: 22,
      cd: 0,
      atkT: 0,
      wrapT: 0,
      flash: 0,
      knock: 0,
      targetId: 0,
      carryId: 0,
      alive: true,
      anim: 0,
      age: 0,
      role: "raider",
      meat: 1,
      ttl: 0,
      poison: 0,
      z: 0,
      draw: 48,
      ...extra,
    };
    this.ents.push(e);
    return e;
  }

  reset() {
    this.ents = [];
    this.particles = [];
    this.floaters = [];
    this.tickers = [];
    this.nextId = 1;
    this.meat = 18;
    this.wave = 1;
    this.waveClear = 0;
    this.spawnLeft = 5;
    this.spawnCd = 1.8;
    this.scorpCd = 6;
    this.fang = 0;
    this.carapace = 0;
    this.silk = 0;
    this.broodLv = 0;
    this.webCd = 0;
    this.venomCd = 0;
    this.trauma = 0;
    this.hitstop = 0;
    this.time = 0;
    this.killsHuman = 0;
    this.killsScorpion = 0;
    this.scorpionOnHuman = 0;
    this.overReason = "";
    this.bestWave = loadBest();

    const nest = this.make("nest", "spider", NEST_POS.x, NEST_POS.y, {
      r: 58,
      hp: 420,
      maxHp: 420,
      speed: 0,
      draw: 210,
    });
    this.nestId = nest.id;

    const queen = this.make("queen", "spider", NEST_POS.x, NEST_POS.y + 70, {
      r: 26,
      hp: 260,
      maxHp: 260,
      speed: 188,
      dmg: 24,
      range: 46,
      draw: 92,
    });
    this.queenId = queen.id;

    this.make("burrow", "none", BURROW_POS.x, BURROW_POS.y, {
      r: 28,
      hp: 9999,
      maxHp: 9999,
      speed: 0,
      draw: 88,
    });
    for (const t of TREE_SPOTS) {
      this.make("tree", "none", t.x, t.y, { r: 18, hp: 9999, maxHp: 9999, speed: 0, draw: 150 });
    }

    this.camX = queen.x;
    this.camY = queen.y;
    this.mode = "playing";
    this.note("Raiders on the east path. Scorpions will not hunt you alone.");
    this.audio?.wave();
  }

  queen() {
    return this.ents.find((e) => e.id === this.queenId && e.alive);
  }
  nest() {
    return this.ents.find((e) => e.id === this.nestId && e.alive);
  }

  broodMax() {
    return 3 + this.broodLv * 2;
  }
  broodCount() {
    return this.ents.filter((e) => e.alive && (e.kind === "brood" || e.kind === "egg")).length;
  }
  eggCost() {
    return 12 + this.broodLv * 2;
  }
  costs(): Record<UpgradeId, number> {
    return {
      fang: 16 + this.fang * 14,
      carapace: 16 + this.carapace * 14,
      silk: 14 + this.silk * 12,
      brood: 22 + this.broodLv * 18,
    };
  }

  buy(id: UpgradeId) {
    const c = this.costs()[id];
    if (this.meat < c) return false;
    this.meat -= c;
    if (id === "fang") this.fang++;
    if (id === "carapace") {
      this.carapace++;
      const q = this.queen();
      if (q) {
        q.maxHp += 28;
        q.hp = Math.min(q.maxHp, q.hp + 28);
      }
    }
    if (id === "silk") this.silk++;
    if (id === "brood") this.broodLv++;
    this.note("The brood thickens.");
    this.audio?.hatch();
    return true;
  }

  note(text: string) {
    this.tickers.unshift({ text, life: 3.4 });
    if (this.tickers.length > 4) this.tickers.length = 4;
  }

  pop(x: number, y: number, text: string, color: string) {
    this.floaters.push({ x, y, text, life: 0.9, color });
  }

  burst(x: number, y: number, color: string, n = 8, force = 80) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = force * (0.4 + Math.random());
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.35 + Math.random() * 0.25,
        max: 0.6,
        size: 2 + Math.random() * 3,
        color,
      });
    }
  }

  shake(amt: number) {
    if (this.reducedMotion) return;
    this.trauma = Math.min(1, this.trauma + amt);
  }

  freeze(t: number) {
    if (this.reducedMotion) return;
    this.hitstop = Math.max(this.hitstop, t);
  }

  private clampEnt(e: Ent) {
    e.x = clamp(e.x, WALK_MARGIN + e.r, WORLD_W - WALK_MARGIN - e.r);
    e.y = clamp(e.y, WALK_MARGIN + e.r, WORLD_H - WALK_MARGIN - e.r);
  }

  private find(id: number) {
    return this.ents.find((e) => e.id === id && e.alive);
  }

  /**
   * Three-way war: scorpions pick the nearest living non-scorpion
   * (raiders, queen, brood, eggs, nest) with NO queen bias.
   * Spiders hunt humans and scorpions. Humans hunt spiders and scorpions,
   * and pressure eggs/nest if they close in.
   */
  private pickTarget(e: Ent): Ent | undefined {
    let best: Ent | undefined;
    let bestScore = Infinity;
    for (const o of this.ents) {
      if (!o.alive || o.id === e.id) continue;
      if (!isHostile(e.faction, o.faction)) continue;
      const combat = COMBAT.includes(o.kind) || STRUCTURE.includes(o.kind);
      if (!combat) continue;
      let score = dist2(e, o);
      if (e.kind === "human" && (o.kind === "egg" || o.kind === "nest")) score *= 0.55;
      if (e.kind === "scorpion" && o.kind === "nest") score *= 1.35;
      if (e.kind === "scorpion" && o.kind === "queen") score *= 1.05;
      if (score < bestScore) {
        bestScore = score;
        best = o;
      }
    }
    return best;
  }

  private spawnHuman() {
    const torch = this.wave >= 3 && Math.random() < 0.28;
    const jitter = (Math.random() - 0.5) * 80;
    const e = this.make("human", "human", HUMAN_SPAWN.x, HUMAN_SPAWN.y + jitter, {
      r: 14,
      hp: 22 + this.wave * 3,
      maxHp: 22 + this.wave * 3,
      speed: torch ? 74 : 62,
      dmg: torch ? 6 : 4,
      range: 22,
      draw: 50,
      role: torch ? "torch" : "raider",
      meat: 2,
      facing: Math.PI,
    });
    return e;
  }

  private spawnScorpion() {
    const jitterX = (Math.random() - 0.5) * 40;
    const jitterY = (Math.random() - 0.5) * 40;
    const e = this.make("scorpion", "scorpion", BURROW_POS.x + jitterX, BURROW_POS.y + jitterY, {
      r: 20,
      hp: 54 + this.wave * 8,
      maxHp: 54 + this.wave * 8,
      speed: 92 + Math.min(20, this.wave * 2),
      dmg: 11 + Math.floor(this.wave * 0.6),
      range: 30,
      draw: 70,
      meat: 3,
    });
    this.note("A scorpion crawls from the ash burrow.");
    this.audio?.sting();
    return e;
  }

  private spawnEgg(x: number, y: number) {
    this.make("egg", "spider", x, y, {
      r: 16,
      hp: 22,
      maxHp: 22,
      speed: 0,
      ttl: 9,
      draw: 46,
    });
  }

  private hatch(egg: Ent) {
    egg.alive = false;
    this.make("brood", "spider", egg.x, egg.y, {
      r: 12,
      hp: 32 + this.broodLv * 6,
      maxHp: 32 + this.broodLv * 6,
      speed: 150,
      dmg: 8 + this.fang,
      range: 20,
      draw: 36,
    });
    this.burst(egg.x, egg.y, "#e8ebe4", 10, 70);
    this.pop(egg.x, egg.y, "Hatch", "#e8ebe4");
    this.audio?.hatch();
  }

  private hit(target: Ent, dmg: number, from: Ent | null, color: string) {
    if (!target.alive) return;
    target.hp -= dmg;
    target.flash = 0.12;
    if (from) {
      const a = ang(from, target);
      target.knock = 1;
      target.vx += Math.cos(a) * 90;
      target.vy += Math.sin(a) * 90;
    }
    this.burst(target.x, target.y, color, 6, 70);
    this.pop(target.x, target.y - 18, `${Math.round(dmg)}`, color);
    this.shake(target.kind === "queen" || target.kind === "nest" ? 0.28 : 0.12);
    this.freeze(0.04);
    this.audio?.hit();

    if (from?.kind === "scorpion" && target.kind === "human") {
      this.scorpionOnHuman++;
      if (Math.random() < 0.35) this.note("A scorpion turns its sting on a raider.");
    }
    if (from?.kind === "scorpion" && (target.kind === "queen" || target.kind === "brood")) {
      if (Math.random() < 0.3) this.note("A scorpion strikes the brood.");
    }
    if (from?.kind === "human" && target.kind === "scorpion") {
      if (Math.random() < 0.25) this.note("Raiders clash with a scorpion.");
    }

    if (target.hp <= 0) this.kill(target, from);
  }

  private kill(target: Ent, from: Ent | null) {
    target.alive = false;
    this.burst(target.x, target.y, target.faction === "scorpion" ? "#c46a3a" : "#c45c4c", 14, 110);
    this.shake(0.22);

    if (target.kind === "human") {
      this.killsHuman++;
      if (from && from.faction === "spider") {
        this.make("cocoon", "none", target.x, target.y, {
          r: 14,
          hp: 12,
          maxHp: 12,
          speed: 0,
          meat: target.meat,
          draw: 40,
        });
        this.pop(target.x, target.y, "Cocoon", "#e8ebe4");
        this.audio?.wrap();
      } else if (from?.kind === "scorpion") {
        this.pop(target.x, target.y, "Stolen", "#c46a3a");
        this.note("A scorpion claimed the kill — no silk, no meat.");
      }
    }
    if (target.kind === "scorpion") {
      this.killsScorpion++;
      this.make("pickup", "none", target.x, target.y, {
        r: 10,
        hp: 1,
        maxHp: 1,
        speed: 0,
        meat: 3 + Math.floor(this.wave / 3),
        draw: 22,
        ttl: 18,
      });
      this.pop(target.x, target.y, "Ichor", "#c46a3a");
    }
    if (target.kind === "queen") {
      this.mode = "over";
      this.overReason = "The Matriarch fell.";
      this.persist();
      this.audio?.lose();
    }
    if (target.kind === "nest") {
      this.mode = "over";
      this.overReason = "The hollow nest was ruined.";
      this.persist();
      this.audio?.lose();
    }
  }

  persist() {
    const best = Math.max(this.bestWave, this.wave);
    this.bestWave = best;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ bestWave: best, version: 1 }));
    } catch {
      /* ignore */
    }
  }

  private tryAttack(e: Ent, target: Ent) {
    if (e.cd > 0 || e.atkT > 0) return;
    const d = Math.hypot(target.x - e.x, target.y - e.y);
    if (d > e.range + target.r) return;
    e.atkT = 0.38;
    e.cd = e.kind === "queen" ? 0.36 : e.kind === "scorpion" ? 0.78 : 0.72;
    e.facing = ang(e, target);
  }

  private resolveAttack(e: Ent) {
    const t = this.find(e.targetId);
    if (!t) return;
    const d = Math.hypot(t.x - e.x, t.y - e.y);
    if (d > e.range + t.r + 8) return;
    let dmg = e.dmg;
    if (e.kind === "queen") dmg += this.fang * 5;
    this.hit(t, dmg, e, e.faction === "scorpion" ? "#c46a3a" : e.faction === "human" ? "#c45c4c" : "#b7c96a");
    if (e.kind === "queen") this.audio?.bite();
    if (e.kind === "scorpion") this.audio?.sting();
  }

  private seek(e: Ent, target: Ent, dt: number) {
    const a = ang(e, target);
    e.facing = a;
    let spd = e.speed;
    for (const w of this.ents) {
      if (!w.alive || w.kind !== "web") continue;
      if (Math.hypot(e.x - w.x, e.y - w.y) < w.r) {
        if (e.faction === "human") spd *= 0.38;
        else if (e.faction === "scorpion") spd *= 0.68;
        if (e.role === "torch") w.hp -= 18 * dt;
      }
    }
    e.vx += Math.cos(a) * spd * 3.2 * dt;
    e.vy += Math.sin(a) * spd * 3.2 * dt;
    const drag = Math.exp(-5.5 * dt);
    e.vx *= drag;
    e.vy *= drag;
    const cap = spd;
    const m = Math.hypot(e.vx, e.vy);
    if (m > cap) {
      e.vx = (e.vx / m) * cap;
      e.vy = (e.vy / m) * cap;
    }
  }

  private separate(e: Ent) {
    let ox = 0;
    let oy = 0;
    for (const o of this.ents) {
      if (!o.alive || o.id === e.id) continue;
      if (!COMBAT.includes(o.kind) && o.kind !== "egg" && o.kind !== "cocoon") continue;
      const dx = e.x - o.x;
      const dy = e.y - o.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const min = e.r + o.r - 2;
      if (d < min) {
        const p = (min - d) / min;
        ox += (dx / d) * p * 28;
        oy += (dy / d) * p * 28;
      }
    }
    e.x += ox * 0.08;
    e.y += oy * 0.08;
  }

  private depositCocoon(carrier: Ent, cocoon: Ent) {
    const nest = this.nest();
    if (!nest) return;
    if (Math.hypot(carrier.x - nest.x, carrier.y - nest.y) > 92) return;
    this.meat += cocoon.meat;
    cocoon.alive = false;
    carrier.carryId = 0;
    this.pop(nest.x, nest.y - 40, `+${cocoon.meat} meat`, "#e8ebe4");
    this.burst(nest.x, nest.y, "#e8ebe4", 10, 60);
    this.audio?.deposit();
  }

  step(dt: number, actions: Actions, aimWorld: { x: number; y: number; has: boolean }) {
    if (this.mode !== "playing") return;
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    this.time += dt;
    this.aimWx = aimWorld.x;
    this.aimWy = aimWorld.y;
    this.hasAim = aimWorld.has;
    this.webCd = Math.max(0, this.webCd - dt);
    this.venomCd = Math.max(0, this.venomCd - dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.waveClear = Math.max(0, this.waveClear - dt);

    this.spawnCd -= dt;
    if (this.spawnLeft > 0 && this.spawnCd <= 0) {
      this.spawnHuman();
      this.spawnLeft--;
      this.spawnCd = Math.max(0.55, 1.35 - this.wave * 0.06);
    }

    this.scorpCd -= dt;
    const liveScorp = this.ents.filter((e) => e.alive && e.kind === "scorpion").length;
    const scorpCap = Math.min(6, this.wave);
    if (liveScorp < scorpCap && this.scorpCd <= 0) {
      this.spawnScorpion();
      this.scorpCd = Math.max(4.5, 11 - this.wave * 0.6);
    }

    const liveHumans = this.ents.filter((e) => e.alive && e.kind === "human").length;
    if (this.spawnLeft <= 0 && liveHumans === 0 && this.waveClear <= 0) {
      this.wave++;
      this.waveClear = 2.2;
      this.spawnLeft = 4 + this.wave * 2;
      this.spawnCd = 1.4;
      this.meat += 4;
      this.note(`Wave ${this.wave} — the hollow stirs.`);
      this.audio?.wave();
      this.persist();
    }

    const q = this.queen();
    if (q) {
      this.controlQueen(q, actions, dt);
      const nest = this.nest();
      if (nest && Math.hypot(q.x - nest.x, q.y - nest.y) < 120) {
        q.hp = Math.min(q.maxHp, q.hp + 10 * dt);
      }
    }

    for (const e of this.ents) {
      if (!e.alive) continue;
      e.age += dt;
      e.anim += dt;
      e.cd = Math.max(0, e.cd - dt);
      e.flash = Math.max(0, e.flash - dt);
      e.knock = Math.max(0, e.knock - dt * 3);
      if (e.poison > 0) {
        e.poison -= dt;
        e.hp -= 6 * dt;
        if (e.hp <= 0) this.kill(e, null);
      }
      if (e.kind === "web") {
        e.ttl -= dt;
        if (e.ttl <= 0 || e.hp <= 0) e.alive = false;
      }
      if (e.kind === "shot") {
        e.ttl -= dt;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.ttl <= 0) e.alive = false;
        else this.shotCollide(e);
      }
      if (e.kind === "fx") {
        e.ttl -= dt;
        if (e.ttl <= 0) e.alive = false;
      }
      if (e.kind === "egg") {
        e.ttl -= dt;
        if (e.ttl <= 0) this.hatch(e);
      }
      if (e.kind === "pickup") {
        e.ttl -= dt;
        if (e.ttl <= 0) e.alive = false;
        if (q && Math.hypot(q.x - e.x, q.y - e.y) < q.r + e.r + 8) {
          this.meat += e.meat;
          e.alive = false;
          this.pop(e.x, e.y, `+${e.meat}`, "#c46a3a");
          this.audio?.deposit();
        }
      }
      if (e.kind === "cocoon" && q && !q.carryId && Math.hypot(q.x - e.x, q.y - e.y) < q.r + e.r + 6) {
        q.carryId = e.id;
      }

      if (COMBAT.includes(e.kind) && e.kind !== "queen") this.aiUnit(e, dt);

      if (e.atkT > 0) {
        const before = e.atkT;
        e.atkT -= dt;
        if (before > 0.2 && e.atkT <= 0.2) this.resolveAttack(e);
      }
    }

    if (q && q.carryId) {
      const c = this.find(q.carryId);
      if (c) {
        c.x += (q.x - Math.cos(q.facing) * 28 - c.x) * 8 * dt;
        c.y += (q.y - Math.sin(q.facing) * 28 - c.y) * 8 * dt;
        this.depositCocoon(q, c);
      } else q.carryId = 0;
    }

    for (const e of this.ents) {
      if (!e.alive) continue;
      if (COMBAT.includes(e.kind) || e.kind === "cocoon") this.separate(e);
      if (e.kind !== "shot" && e.kind !== "nest" && e.kind !== "tree" && e.kind !== "burrow") {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        if (e.kind !== "web" && e.kind !== "egg" && e.kind !== "pickup") this.clampEnt(e);
      }
    }

    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
    this.particles = this.particles.filter((p) => p.life > 0).slice(-180);
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= 22 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const t of this.tickers) t.life -= dt;
    this.tickers = this.tickers.filter((t) => t.life > 0);

    this.ents = this.ents.filter((e) => e.alive);


    if (q) {
      const k = 1 - Math.exp(-5.2 * dt);
      this.camX += (q.x - this.camX) * k;
      this.camY += (q.y - this.camY) * k;
    }
  }

  private shotCollide(shot: Ent) {
    for (const o of this.ents) {
      if (!o.alive) continue;
      if (o.faction === shot.faction) continue;
      if (!COMBAT.includes(o.kind) && o.kind !== "egg") continue;
      if (Math.hypot(o.x - shot.x, o.y - shot.y) < o.r + shot.r) {
        this.hit(o, shot.dmg, shot, "#b7c96a");
        o.poison = Math.max(o.poison, 1.6);
        shot.alive = false;
        this.make("fx", "none", shot.x, shot.y, { r: 8, ttl: 0.28, draw: 36, speed: 0 });
        break;
      }
    }
  }

  private aiUnit(e: Ent, dt: number) {
    let t = this.find(e.targetId);
    if (!t || e.age % 0.35 < dt) {
      t = this.pickTarget(e);
      e.targetId = t?.id ?? 0;
    }
    if (!t) {
      e.vx *= 0.9;
      e.vy *= 0.9;
      return;
    }
    this.seek(e, t, dt);
    this.tryAttack(e, t);

    if (e.kind === "brood") {
      const nearCocoon = this.ents.find(
        (c) => c.alive && c.kind === "cocoon" && Math.hypot(c.x - e.x, c.y - e.y) < 40,
      );
      const nest = this.nest();
      if (nearCocoon && nest && !e.carryId && e.cd <= 0) {
        e.carryId = nearCocoon.id;
      }
      if (e.carryId) {
        const c = this.find(e.carryId);
        if (c && nest) {
          c.x += (e.x - c.x) * 10 * dt;
          c.y += (e.y - c.y) * 10 * dt;
          this.depositCocoon(e, c);
        }
      }
    }
  }

  private controlQueen(q: Ent, actions: Actions, dt: number) {
    let mx = actions.moveX;
    let my = actions.moveY;
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    let spd = q.speed * (q.carryId ? 0.82 : 1);
    q.vx = mx * spd;
    q.vy = my * spd;
    this.lastQueenSpeed = Math.hypot(q.vx, q.vy);

    if (this.hasAim) q.facing = Math.atan2(this.aimWy - q.y, this.aimWx - q.x);
    else if (mag > 0.15) q.facing = Math.atan2(my, mx);

    if (actions.attack) {
      const t = this.closestHostile(q, q.range + 18);
      if (t) {
        q.targetId = t.id;
        this.tryAttack(q, t);
      }
    }

    if (actions.justWeb && this.webCd <= 0) {
      const d = 48;
      const x = q.x + Math.cos(q.facing) * d;
      const y = q.y + Math.sin(q.facing) * d;
      this.make("web", "none", x, y, {
        r: 54 + this.silk * 8,
        hp: 40 + this.silk * 10,
        maxHp: 40,
        ttl: 9 + this.silk,
        draw: 110,
        speed: 0,
      });
      this.webCd = Math.max(2.4, 4.2 - this.silk * 0.35);
      this.audio?.web();
    }

    if (actions.justVenom && this.venomCd <= 0) {
      const a = q.facing;
      this.make("shot", "spider", q.x + Math.cos(a) * 28, q.y + Math.sin(a) * 28, {
        r: 7,
        dmg: 10 + this.fang * 3,
        vx: Math.cos(a) * 320,
        vy: Math.sin(a) * 320,
        ttl: 0.9,
        draw: 22,
        facing: a,
        faction: "spider",
      });
      this.venomCd = Math.max(0.7, 1.15 - this.fang * 0.08);
      this.audio?.bite();
    }

    if (actions.justEgg) {
      const nest = this.nest();
      const cost = this.eggCost();
      if (
        nest &&
        this.meat >= cost &&
        this.broodCount() < this.broodMax() &&
        Math.hypot(q.x - nest.x, q.y - nest.y) < 140
      ) {
        this.meat -= cost;
        const ox = (Math.random() - 0.5) * 70;
        const oy = (Math.random() - 0.5) * 70;
        this.spawnEgg(nest.x + ox, nest.y + 36 + oy);
        this.note("An egg is laid in the silk.");
      }
    }
  }

  private closestHostile(e: Ent, maxR: number): Ent | undefined {
    let best: Ent | undefined;
    let bestD = maxR * maxR;
    for (const o of this.ents) {
      if (!o.alive || o.id === e.id) continue;
      if (!isHostile(e.faction, o.faction)) continue;
      if (!COMBAT.includes(o.kind)) continue;
      const d = dist2(e, o);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  hud(): HudSnap {
    const q = this.queen();
    const n = this.nest();
    return {
      mode: this.mode,
      queenHp: q?.hp ?? 0,
      queenMax: q?.maxHp ?? 160,
      nestHp: n?.hp ?? 0,
      nestMax: n?.maxHp ?? 420,
      meat: this.meat,
      wave: this.wave,
      brood: this.ents.filter((e) => e.alive && e.kind === "brood").length,
      broodMax: this.broodMax(),
      carrying: Boolean(q?.carryId),
      webCd: this.webCd,
      venomCd: this.venomCd,
      eggCost: this.eggCost(),
      waveClear: this.waveClear,
      ticker: this.tickers[0]?.text ?? "",
      fang: this.fang,
      carapace: this.carapace,
      silk: this.silk,
      broodLv: this.broodLv,
      costs: this.costs(),
      killsHuman: this.killsHuman,
      killsScorpion: this.killsScorpion,
      scorpionOnHuman: this.scorpionOnHuman,
      bestWave: this.bestWave,
      overReason: this.overReason,
    };
  }
}
