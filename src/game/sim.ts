import {
  HARVEST_R,
  DIFFICULTIES,
  NEST_PERIM,
  NEST_POS,
  SILK_COST,
  SILK_LINK_RANGE,
  SILK_STAND,
  SITES,
  TOWER_PERIM,
  WALK_MARGIN,
  WORLD_H,
  WORLD_W,
  LANDSCAPE_H,
  LANDSCAPE_W,
  type Caste,
  type Difficulty,
  type EggKind,
  type Ent,
  type Evo,
  type Faction,
  type Floater,
  type GameMode,
  type HudSnap,
  type Job,
  type Kind,
  type Particle,
  type Room,
  type RoomType,
  type SilkLink,
  type Site,
  type Ticker,
  type ViewMode,
} from "./types";
import type { Actions } from "./input";
import type { GameAudio } from "./audio";
import { Fog } from "./fog";

const SAVE_KEY = "hollow-brood-v3";
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
const COMBAT: Kind[] = [
	"queen",
	"brood",
	"human",
	"scorpion",
	"bee",
	"wasp",
	"herbivore"
];
const STRUCTURE: Kind[] = [
	"egg",
	"nest",
	"hive",
	"tower"
];
function isHostile(a: Faction, b: Faction) {
	if (a === "none" || b === "none" || a === b) return false;
	if (a === "herbivore" || b === "herbivore") return a === "spider" || b === "spider" || a === "scorpion" || b === "scorpion";
	if (a === "bee" && b === "wasp" || a === "wasp" && b === "bee") return false;
	return true;
}
function loadSave() {
	const bestByDiff = {
		easy: 0,
		standard: 0,
		difficult: 0
	};
	try {
		if (typeof window === "undefined") return {
			bestReach: 0,
			bestByDiff
		};
		const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem("hollow-brood-v2");
		if (!raw) return {
			bestReach: 0,
			bestByDiff
		};
		const p = JSON.parse(raw) as { bestReach?: number; bestWave?: number; bestByDiff?: Partial<Record<Difficulty, number>> };
		if (p.bestByDiff) {
			bestByDiff.easy = p.bestByDiff.easy ?? 0;
			bestByDiff.standard = p.bestByDiff.standard ?? 0;
			bestByDiff.difficult = p.bestByDiff.difficult ?? 0;
		}
		return {
			bestReach: p.bestReach ?? p.bestWave ?? 0,
			bestByDiff
		};
	} catch {
		return {
			bestReach: 0,
			bestByDiff
		};
	}
}
export class Sim {
	ents: Ent[] = [];
	particles: Particle[] = [];
	floaters: Floater[] = [];
	tickers: Ticker[] = [];
	sites: Site[] = [];
	rooms: Room[] = [];
	links: SilkLink[] = [];
	teenSilkNote = 0;
	fog = new Fog();
	nextId = 1;
	mode: GameMode = "title";
	view: ViewMode = "world";
	overReason = "";
	difficulty: Difficulty = "standard";
	food = 40;
	material = 16;
	queenId = 0;
	nestId = 0;
	selectedId = 0;
	selectedRoom: RoomType = "hatchery";
	webCd = 0;
	venomCd = 0;
	trauma = 0;
	hitstop = 0;
	camX = NEST_POS.x;
	camY = NEST_POS.y;
	viewW = LANDSCAPE_W;
	viewH = LANDSCAPE_H;
	time = 0;
	upkeepTick = 0;
	respawnTick = 0;
	rallyX = 0;
	rallyY = 0;
	hasRally = false;
	bestReach = 0;
	bestByDiff: Record<Difficulty, number> = { easy: 0, standard: 0, difficult: 0 };
	reducedMotion = false;
	audio: GameAudio | null = null;
	aimWx = NEST_POS.x;
	aimWy = NEST_POS.y;
	hasAim = false;
	lastQueenSpeed = 0;
	lookX = 0;
	lookY = 0;
	looking = 0;
	marking = false;
	constructor() {
		const save = loadSave();
		this.bestReach = save.bestReach;
		this.bestByDiff = save.bestByDiff;
		if (typeof window !== "undefined") this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
	}
	tune() {
		return DIFFICULTIES[this.difficulty];
	}
	make(kind: Kind, faction: Faction, x: number, y: number, extra: Partial<Ent> = {}) {
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
			speed: 70,
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
			role: "none",
			meat: 1,
			ttl: 0,
			poison: 0,
			z: 0,
			draw: 48,
			caste: "none",
			job: "none",
			evo: "none",
			stage: "adult",
			winged: false,
			foodMeter: 40,
			foodMax: 40,
			homeX: NEST_POS.x,
			homeY: NEST_POS.y,
			site: "",
			linked: false,
			alert: false,
			hibernating: false,
			evoBite: 0,
			evoHp: 0,
			evoSpd: 0,
			splash: 0,
			chain: 0,
			roll: 0,
			sniper: 0,
			transCap: 0,
			haul: 0,
			assignX: 0,
			assignY: 0,
			assignR: 0,
			...extra
		};
		this.ents.push(e);
		return e;
	}
	reset(difficulty: Difficulty = this.difficulty) {
		const t = DIFFICULTIES[difficulty];
		this.difficulty = difficulty;
		this.ents = [];
		this.particles = [];
		this.floaters = [];
		this.tickers = [];
		this.links = [];
		this.teenSilkNote = 0;
		this.nextId = 1;
		this.food = t.food;
		this.material = t.material;
		this.webCd = 0;
		this.venomCd = 0;
		this.trauma = 0;
		this.hitstop = 0;
		this.time = 0;
		this.upkeepTick = 0;
		this.respawnTick = 0;
		this.hasRally = false;
		this.overReason = "";
		this.view = "world";
		this.selectedId = 0;
		this.selectedRoom = "hatchery";
		this.looking = 0;
		this.marking = false;
		this.fog.reset();
		const save = loadSave();
		this.bestReach = save.bestReach;
		this.bestByDiff = save.bestByDiff;
		this.rooms = [
			{
				type: "chamber",
				level: 1,
				cap: 1,
				stored: 0
			},
			{
				type: "hatchery",
				level: 1,
				cap: 6,
				stored: 0
			},
			{
				type: "food",
				level: 1,
				cap: 80,
				stored: t.food
			},
			{
				type: "material",
				level: 1,
				cap: 40,
				stored: t.material
			},
			{
				type: "chrysalis",
				level: 1,
				cap: 2,
				stored: 0
			}
		];
		const nest = this.make("nest", "spider", NEST_POS.x, NEST_POS.y, {
			r: 62,
			hp: t.nestHp,
			maxHp: t.nestHp,
			speed: 0,
			draw: 210,
			linked: true
		});
		this.nestId = nest.id;
		const queen = this.make("queen", "spider", NEST_POS.x, NEST_POS.y + 64, {
			r: 26,
			hp: t.queenHp,
			maxHp: t.queenHp,
			speed: 96,
			dmg: 22,
			range: 44,
			draw: 88,
			caste: "queen",
			foodMeter: 80,
			foodMax: 80
		});
		this.queenId = queen.id;
		this.spawnAlly("worker", NEST_POS.x - 40, NEST_POS.y + 90);
		this.spawnAlly("worker", NEST_POS.x + 46, NEST_POS.y + 86);
		this.spawnAlly("defender", NEST_POS.x, NEST_POS.y + 120);
		this.sites = [
			{
				id: "home",
				kind: "home",
				x: NEST_POS.x,
				y: NEST_POS.y,
				r: 320,
				discovered: true,
				cleared: true,
				eggs: 0,
				pop: 0
			},
			{
				id: "berries",
				kind: "berries",
				x: SITES.berries.x,
				y: SITES.berries.y,
				r: SITES.berries.r,
				discovered: false,
				cleared: false,
				eggs: 0,
				pop: 0
			},
			{
				id: "meadow",
				kind: "meadow",
				x: SITES.meadow.x,
				y: SITES.meadow.y,
				r: SITES.meadow.r,
				discovered: false,
				cleared: false,
				eggs: 0,
				pop: 6
			},
			{
				id: "bee",
				kind: "bee",
				x: SITES.bee.x,
				y: SITES.bee.y,
				r: SITES.bee.r,
				discovered: false,
				cleared: false,
				eggs: 3,
				pop: 5
			},
			{
				id: "wasp",
				kind: "wasp",
				x: SITES.wasp.x,
				y: SITES.wasp.y,
				r: SITES.wasp.r,
				discovered: false,
				cleared: false,
				eggs: 3,
				pop: 4
			},
			{
				id: "scorpion",
				kind: "scorpion",
				x: SITES.scorpion.x,
				y: SITES.scorpion.y,
				r: SITES.scorpion.r,
				discovered: false,
				cleared: false,
				eggs: 2,
				pop: 2
			}
		];
		this.make("node", "none", SITES.berries.x, SITES.berries.y, {
			r: 22,
			hp: 40,
			maxHp: 40,
			speed: 0,
			meat: 18,
			draw: 36,
			site: "berries"
		});
		for (const [x, y, meat] of [
			[1280, 980, 12],
			[SITES.meadow.x, SITES.meadow.y, 16],
			[1480, 1280, 10],
		] as const) {
			this.make("node", "none", x, y, {
				r: 18,
				hp: 28,
				maxHp: 28,
				speed: 0,
				meat,
				draw: 30,
				site: "berries",
			});
		}
		this.seedHive("meadow");
		this.seedHive("bee");
		this.seedHive("wasp");
		this.seedHive("scorpion");
		for (const [x, y] of [
			[760, 900],
			[1400, 980],
			[980, 1480],
			[1680, 1320],
			[2040, 880],
			[2480, 700],
			[2760, 1480],
			[620, 1500],
			[1900, 1700],
			[3200, 900]
		]) this.make("tree", "none", x, y, {
			r: 18,
			hp: 9999,
			maxHp: 9999,
			speed: 0,
			draw: 150
		});
		this.make("burrow", "none", SITES.scorpion.x, SITES.scorpion.y, {
			r: 28,
			hp: 9999,
			maxHp: 9999,
			speed: 0,
			draw: 88
		});
		this.camX = queen.x;
		this.camY = queen.y;
		this.fog.reveal(NEST_POS.x, NEST_POS.y, 380);
		this.clampCamera();
		this.mode = "playing";
		this.note("Explore. Lay workers. Silk-link a tower before the hives wake.");
		this.audio?.wave();
	}
	seedHive(id: string) {
		const s = this.sites.find((x) => x.id === id);
		if (!s) return;
		const t = this.tune();
		if (id === "meadow") {
			for (let i = 0; i < 6; i++) {
				const a = i / 6 * Math.PI * 2;
				this.spawnHerb(s.x + Math.cos(a) * 70, s.y + Math.sin(a) * 50);
			}
			return;
		}
		if (id === "bee") {
			this.make("hive", "bee", s.x, s.y, {
				r: 36,
				hp: 90 * t.enemyHp,
				maxHp: 90 * t.enemyHp,
				speed: 0,
				draw: 96,
				site: id
			});
			for (let i = 0; i < 4; i++) this.spawnBee(s.x + (Math.random() - .5) * 80, s.y + (Math.random() - .5) * 80, id);
			for (let i = 0; i < 3; i++) this.spawnEnemyEgg(s.x, s.y + 20, "bee", id);
		}
		if (id === "wasp") {
			this.make("hive", "wasp", s.x, s.y, {
				r: 34,
				hp: 110 * t.enemyHp,
				maxHp: 110 * t.enemyHp,
				speed: 0,
				draw: 92,
				site: id
			});
			for (let i = 0; i < 3; i++) this.spawnWasp(s.x + (Math.random() - .5) * 90, s.y + (Math.random() - .5) * 90, id);
			for (let i = 0; i < 3; i++) this.spawnEnemyEgg(s.x, s.y + 18, "wasp", id);
		}
		if (id === "scorpion") {
			for (let i = 0; i < 2; i++) this.spawnScorp(s.x, s.y, id);
			for (let i = 0; i < 2; i++) this.spawnEnemyEgg(s.x, s.y, "scorpion", id);
		}
	}
	spawnHerb(x: number, y: number) {
		return this.make("herbivore", "herbivore", x, y, {
			r: 16,
			hp: 28,
			maxHp: 28,
			speed: 54,
			dmg: 0,
			range: 0,
			draw: 52,
			meat: 8,
			site: "meadow"
		});
	}
	spawnBee(x: number, y: number, site: string) {
		const t = this.tune();
		return this.make("bee", "bee", x, y, {
			r: 12,
			hp: 18 * t.enemyHp,
			maxHp: 18 * t.enemyHp,
			speed: 96 * t.enemySpd,
			dmg: 5,
			range: 20,
			draw: 36,
			winged: true,
			site
		});
	}
	spawnWasp(x: number, y: number, site: string) {
		const t = this.tune();
		return this.make("wasp", "wasp", x, y, {
			r: 14,
			hp: 26 * t.enemyHp,
			maxHp: 26 * t.enemyHp,
			speed: 108 * t.enemySpd,
			dmg: 8,
			range: 22,
			draw: 42,
			winged: true,
			site
		});
	}
	spawnScorp(x: number, y: number, site: string) {
		const t = this.tune();
		return this.make("scorpion", "scorpion", x, y, {
			r: 20,
			hp: 48 * t.enemyHp,
			maxHp: 48 * t.enemyHp,
			speed: 72 * t.enemySpd,
			dmg: 10,
			range: 28,
			draw: 68,
			site
		});
	}
	spawnEnemyEgg(x: number, y: number, kind: string, site: string) {
		this.make("egg", kind === "bee" ? "bee" : kind === "wasp" ? "wasp" : "scorpion", x + (Math.random() - .5) * 40, y + (Math.random() - .5) * 30, {
			r: 12,
			hp: 16,
			maxHp: 16,
			speed: 0,
			ttl: 22 + Math.random() * 10,
			draw: 32,
			site,
			role: kind === "bee" ? "raider" : kind === "wasp" ? "torch" : "none"
		});
	}
	spawnAlly(caste: Caste, x: number, y: number, extra: Partial<Ent> = {}) {
		const home = this.linkedNodes()[0] ?? NEST_POS;
		const hx = extra.homeX ?? home.x;
		const hy = extra.homeY ?? home.y;
		if (caste === "worker") return this.make("brood", "spider", x, y, {
			r: 11,
			hp: 22,
			maxHp: 22,
			speed: 62,
			dmg: 0,
			range: 0,
			draw: 32,
			caste: "worker",
			evo: "none",
			job: "none",
			foodMeter: 56,
			foodMax: 56,
			homeX: hx,
			homeY: hy,
			...extra
		});
		if (caste === "defender") return this.make("brood", "spider", x, y, {
			r: 13,
			hp: 40,
			maxHp: 40,
			speed: 70,
			dmg: 7,
			range: 20,
			draw: 38,
			caste: "defender",
			evo: "biter",
			job: "guard",
			homeX: hx,
			homeY: hy,
			...extra
		});
		return this.make("brood", "spider", x, y, {
			r: 12,
			hp: 30,
			maxHp: 30,
			speed: 88,
			dmg: 8,
			range: 20,
			draw: 36,
			caste: "attacker",
			evo: "biter",
			job: "rove",
			homeX: hx,
			homeY: hy,
			...extra
		});
	}
	queen() {
		return this.ents.find((e) => e.id === this.queenId && e.alive);
	}
	nest() {
		return this.ents.find((e) => e.id === this.nestId && e.alive);
	}
	broodMax() {
		const hatch = this.rooms.find((r) => r.type === "hatchery");
		return this.tune().broodCap + (hatch?.level ?? 1) * 3;
	}
	room(type: RoomType) {
		return this.rooms.find((r) => r.type === type);
	}
	cap(type: "food" | "material") {
		return this.room(type)?.cap ?? 40;
	}
	allyCount() {
		return this.ents.filter((e) => e.alive && e.faction === "spider" && (e.kind === "brood" || e.kind === "queen" && e.stage === "adolescent" || e.kind === "egg")).length;
	}
	casteCount(c: Caste) {
		return this.ents.filter((e) => e.alive && e.caste === c && e.kind !== "egg").length;
	}
	upkeep() {
		let u = .4;
		for (const e of this.ents) {
			if (!e.alive || e.faction !== "spider") continue;
			if (e.kind === "queen" && e.stage === "adult") u += .7;
			else if (e.kind === "queen") u += .35;
			else if (e.caste === "worker") u += .12;
			else if (e.evo === "tank") u += .7;
			else if (e.evo === "siege") u += .55;
			else if (e.winged) u += .22;
			else if (e.caste === "defender") u += .38;
			else if (e.caste === "attacker") u += .32;
		}
		return u * this.tune().upkeepMul;
	}
	workerCost() {
		return 6 + this.casteCount("worker");
	}
	attackCost() {
		return 10 + this.casteCount("attacker") * 2;
	}
	defendCost() {
		return 10 + this.casteCount("defender") * 2;
	}
	queenCost() {
		return 40 + this.ents.filter((e) => e.alive && e.kind === "queen").length * 20;
	}
	towerCost() {
		return 18 + this.ents.filter((e) => e.alive && e.kind === "tower").length * 8;
	}
	note(text: string) {
		this.tickers.unshift({
			text,
			life: 3.6
		});
		if (this.tickers.length > 4) this.tickers.length = 4;
	}
	pop(x: number, y: number, text: string, color: string) {
		this.floaters.push({
			x,
			y,
			text,
			life: .9,
			color
		});
	}
	burst(x: number, y: number, color: string, n = 8, force = 80) {
		for (let i = 0; i < n; i++) {
			const a = Math.random() * Math.PI * 2;
			const s = force * (.4 + Math.random());
			this.particles.push({
				x,
				y,
				vx: Math.cos(a) * s,
				vy: Math.sin(a) * s,
				life: .35 + Math.random() * .25,
				max: .6,
				size: 2 + Math.random() * 3,
				color
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
	clampEnt(e: Ent) {
		e.x = clamp(e.x, 80 + e.r, WORLD_W - 80 - e.r);
		e.y = clamp(e.y, 80 + e.r, WORLD_H - 80 - e.r);
	}
	find(id: number) {
		return this.ents.find((e) => e.id === id && e.alive);
	}
	inPerim(x: number, y: number) {
		const nest = this.nest();
		if (nest && Math.hypot(x - nest.x, y - nest.y) < NEST_PERIM) return true;
		for (const tw of this.ents) {
			if (!tw.alive || tw.kind !== "tower" || !this.silkPowered(tw.id)) continue;
			if (Math.hypot(x - tw.x, y - tw.y) < TOWER_PERIM) return true;
		}
		return false;
	}
	linkedNodes() {
		const out: { x: number; y: number; id: number }[] = [];
		const n = this.nest();
		if (n) out.push({ x: n.x, y: n.y, id: n.id });
		for (const e of this.ents) {
			if (e.alive && e.kind === "tower" && this.silkPowered(e.id)) out.push({ x: e.x, y: e.y, id: e.id });
		}
		return out;
	}
	silkPowered(id: number) {
		return this.silkPoweredSet().has(id);
	}
	silkPoweredSet() {
		const adj = new Map<number, number[]>();
		const add = (a: number, b: number) => {
			if (!adj.has(a)) adj.set(a, []);
			adj.get(a)!.push(b);
		};
		for (const l of this.links) {
			if (!this.find(l.a) || !this.find(l.b)) continue;
			add(l.a, l.b);
			add(l.b, l.a);
		}
		const n = this.nest();
		const q: number[] = n ? [n.id] : [];
		const seen = new Set(q);
		while (q.length) {
			const id = q.pop()!;
			for (const nxt of adj.get(id) ?? []) {
				if (seen.has(nxt)) continue;
				seen.add(nxt);
				q.push(nxt);
			}
		}
		return seen;
	}
	silkAnchor(tower: Ent) {
		let best: { x: number; y: number; id: number } | undefined;
		let bestD = Infinity;
		for (const n of this.linkedNodes()) {
			if (n.id === tower.id) continue;
			const d = dist2(tower, n);
			if (d < bestD) {
				bestD = d;
				best = n;
			}
		}
		return best;
	}
	silkQuery(from: Ent | undefined = this.queen()) {
		const empty = {
			tower: undefined as Ent | undefined,
			anchor: undefined as { x: number; y: number; id: number } | undefined,
			standOk: false,
			reachOk: false,
			costOk: this.material >= SILK_COST,
			ready: false,
			dist: 0,
			hint: "",
		};
		if (!from) return empty;
		const mutes = this.ents.filter((e) => e.alive && e.kind === "tower" && !e.linked);
		const towers = this.ents.filter((e) => e.alive && e.kind === "tower");
		const detect = (SILK_STAND + 240) * (SILK_STAND + 240);
		let tower: Ent | undefined;
		let best = detect;
		for (const e of mutes) {
			const d = dist2(from, e);
			if (d < best) {
				best = d;
				tower = e;
			}
		}
		if (!tower) {
			if (mutes.length) {
				return { ...empty, hint: "A mute tower waits. Walk onto the post, then Q." };
			}
			const nearLive = this.linkedNodes().find((n) => Math.hypot(from.x - n.x, from.y - n.y) < 170);
			if (nearLive) {
				return {
					...empty,
					hint: `Live node. Raise the next tower inside ${SILK_LINK_RANGE} paces, then stand on it.`,
				};
			}
			if (!towers.length) {
				return { ...empty, hint: "Raise a tower (B), stand on the post, then Q to splice silk." };
			}
			return empty;
		}
		const standOk = Math.hypot(from.x - tower.x, from.y - tower.y) <= SILK_STAND;
		const anchor = this.silkAnchor(tower);
		const dist = anchor ? Math.hypot(tower.x - anchor.x, tower.y - anchor.y) : 0;
		const reachOk = Boolean(anchor) && dist <= SILK_LINK_RANGE;
		let hint = "Mute tower. Stand on the post to splice silk.";
		if (!standOk) hint = "Move onto the mute tower. Silk splices at the post, not from range.";
		else if (!reachOk) hint = `Too far from the net. Need a live node within ${SILK_LINK_RANGE} paces.`;
		else if (this.material < SILK_COST) hint = `Need ${SILK_COST} material to spin the strand.`;
		else {
			const toNest = this.nest()?.id === anchor!.id;
			hint = toNest
				? `Silk ready · ${SILK_COST} mat. Q splices this tower to the hollow — defenders will hear it.`
				: `Silk ready · ${SILK_COST} mat. Q knits into the tower net — air will answer this ring.`;
		}
		return {
			tower,
			anchor,
			standOk,
			reachOk,
			costOk: this.material >= SILK_COST,
			ready: standOk && reachOk && this.material >= SILK_COST,
			dist,
			hint,
		};
	}
	silkPreview() {
		const s = this.silkQuery(this.queen());
		if (!s.tower) return null;
		const bx = s.anchor?.x ?? this.nest()?.x;
		const by = s.anchor?.y ?? this.nest()?.y;
		if (bx == null || by == null) return null;
		return {
			ax: s.tower.x,
			ay: s.tower.y,
			bx,
			by,
			ready: s.ready,
			standOk: s.standOk,
			reachOk: s.reachOk,
			dist: s.dist || Math.hypot(s.tower.x - bx, s.tower.y - by),
		};
	}
	pruneSilk() {
		this.links = this.links.filter((l) => this.find(l.a) && this.find(l.b));
		const powered = this.silkPoweredSet();
		this.links = this.links.filter((l) => powered.has(l.a) && powered.has(l.b));
		for (const e of this.ents) {
			if (e.kind !== "tower" || !e.alive) continue;
			const live = powered.has(e.id);
			if (e.linked && !live) this.note("Silk went dark. That tower is mute until spliced again.");
			e.linked = live;
		}
	}
	persist() {
		const reach = Math.round(this.fog.exploredFrac() * 100);
		this.bestReach = Math.max(this.bestReach, reach);
		this.bestByDiff[this.difficulty] = Math.max(this.bestByDiff[this.difficulty], reach);
		try {
			localStorage.setItem(SAVE_KEY, JSON.stringify({
				bestReach: this.bestReach,
				bestByDiff: this.bestByDiff,
				version: 3
			}));
		} catch {}
	}
	seek(e: Ent, target: { x: number; y: number }, dt: number) {
		const a = ang(e, target);
		e.facing = a;
		let spd = e.speed;
		if (e.winged) spd *= 1.35;
		if (e.evo === "siege") spd *= .72;
		if (e.evo === "tank") spd *= .78;
		if (e.foodMeter < 12 && e.caste === "worker") spd *= .55;
		if (e.hibernating) spd *= 1.1;
		e.vx = Math.cos(a) * spd;
		e.vy = Math.sin(a) * spd;
	}
	hold(e: Ent, dt: number) {
		e.vx *= Math.pow(.02, dt);
		e.vy *= Math.pow(.02, dt);
	}
	separate(e: Ent) {
		for (const o of this.ents) {
			if (!o.alive || o.id === e.id) continue;
			if (o.kind === "tree" || o.kind === "nest" || o.kind === "hive") continue;
			const dx = e.x - o.x;
			const dy = e.y - o.y;
			const d = Math.hypot(dx, dy) || .01;
			const min = e.r + o.r - 2;
			if (d < min) {
				const p = (min - d) / d * .35;
				e.x += dx * p;
				e.y += dy * p;
			}
		}
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
		this.looking = Math.max(0, this.looking - dt);
		if (actions.justNest) this.toggleNest();
		if (actions.justEgg) this.tryLay("worker");
		if (actions.justAttackEgg) this.tryLay("attacker");
		if (actions.justDefend) this.tryLay("defender");
		if (actions.justQueenEgg) this.tryLay("queen");
		if (actions.justTower) this.tryBuildTower();
		if (actions.justFollow) this.assignFollow();
		const q = this.queen();
		if (q) this.controlQueen(q, actions, dt);
		this.discover();
		this.tickUpkeep(dt);
		this.tickHives(dt);
		this.refreshFog();
		for (const e of this.ents) {
			if (!e.alive) continue;
			e.age += dt;
			e.anim += dt;
			e.cd = Math.max(0, e.cd - dt);
			e.flash = Math.max(0, e.flash - dt);
			e.knock = Math.max(0, e.knock - dt * 3);
			if (e.poison > 0) {
				e.poison -= dt;
				e.hp -= 4 * dt;
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
			}
			if (e.stage === "chrysalis") {
				e.ttl -= dt;
				e.vx = 0;
				e.vy = 0;
				if (e.ttl <= 0) {
					e.stage = "adult";
					this.pop(e.x, e.y, e.evo, "#b7c96a");
					this.audio?.hatch();
				}
			}
			if (e.kind === "brood" || e.kind === "queen" && e.stage === "adolescent") this.aiAlly(e, dt);
			if (e.kind === "bee" || e.kind === "wasp" || e.kind === "scorpion" || e.kind === "human") this.aiEnemy(e, dt);
			if (e.kind === "herbivore") this.aiHerb(e, dt);
			if (e.kind === "tower") this.aiTower(e);
			if (e.atkT > 0) {
				const before = e.atkT;
				e.atkT -= dt;
				if (before > .2 && e.atkT <= .2) {
					if (e.evo === "siege" || e.kind === "bee" || e.kind === "wasp") this.fireRanged(e);
					else this.resolveAttack(e);
				}
			}
		}
		this.gatherPickups(dt);
		for (const e of this.ents) {
			if (!e.alive) continue;
			if (COMBAT.includes(e.kind)) this.separate(e);
			if (e.kind !== "shot" && e.kind !== "nest" && e.kind !== "tree" && e.kind !== "burrow" && e.kind !== "hive" && e.kind !== "tower" && e.kind !== "node") {
				e.x += e.vx * dt;
				e.y += e.vy * dt;
				if (e.kind !== "web" && e.kind !== "egg" && e.kind !== "pickup") this.clampEnt(e);
			}
		}
		for (const p of this.particles) {
			p.life -= dt;
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.vx *= .92;
			p.vy *= .92;
		}
		this.particles = this.particles.filter((p) => p.life > 0).slice(-160);
		for (const f of this.floaters) {
			f.life -= dt;
			f.y -= 22 * dt;
		}
		this.floaters = this.floaters.filter((f) => f.life > 0);
		for (const tk of this.tickers) tk.life -= dt;
		this.tickers = this.tickers.filter((tk) => tk.life > 0);
		this.ents = this.ents.filter((e) => e.alive);
		const follow = this.queen();
		if (follow) {
			const tx = this.looking > 0 ? this.lookX : follow.x;
			const ty = this.looking > 0 ? this.lookY : follow.y;
			const k = 1 - Math.exp(-4.2 * dt);
			this.camX += (tx - this.camX) * k;
			this.camY += (ty - this.camY) * k;
			this.clampCamera();
		}
		this.syncStores();
	}
	syncStores() {
		const food = this.room("food");
		const mat = this.room("material");
		if (food) {
			food.stored = clamp(this.food, 0, food.cap);
			this.food = food.stored;
		}
		if (mat) {
			mat.stored = clamp(this.material, 0, mat.cap);
			this.material = mat.stored;
		}
	}
	refreshFog() {
		this.pruneSilk();
		this.fog.clearVisible();
		for (const e of this.ents) {
			if (!e.alive || e.faction !== "spider") continue;
			if (e.kind === "shot" || e.kind === "web" || e.kind === "fx" || e.kind === "egg") continue;
			let r = e.kind === "queen" ? 240 : e.kind === "tower" && this.silkPowered(e.id) ? 280 : e.winged ? 200 : 140;
			if (e.kind === "nest") r = 300;
			this.fog.reveal(e.x, e.y, r);
		}
	}
	discover() {
		const q = this.queen();
		if (!q) return;
		for (const s of this.sites) {
			if (s.discovered) continue;
			if (Math.hypot(q.x - s.x, q.y - s.y) < s.r + 80) {
				s.discovered = true;
				this.note(s.kind === "meadow" ? "A grazing meadow — food on the hoof." : s.kind === "bee" ? "A bee hive. Their sting ignores light armor." : s.kind === "wasp" ? "Wasps. They spear winged brood out of the air." : s.kind === "scorpion" ? "Ash burrow. Scorpions hunt anyone." : "Wild forage.");
				this.persist();
			}
		}
		for (const s of this.sites) {
			if (!s.discovered || s.cleared || s.kind !== "bee" && s.kind !== "wasp" && s.kind !== "scorpion") continue;
			if (this.ents.filter((e) => e.alive && e.site === s.id && (e.kind === "bee" || e.kind === "wasp" || e.kind === "scorpion" || e.kind === "egg" && e.faction !== "spider" || e.kind === "hive")).length === 0 && Math.hypot(q.x - s.x, q.y - s.y) < s.r) {
				s.cleared = true;
				this.note("The hollow is scoured. Lay a tower and an adolescent queen to hold it.");
				this.food = Math.min(this.cap("food"), this.food + 12);
				this.material = Math.min(this.cap("material"), this.material + 10);
			}
		}
	}
	tickUpkeep(dt: number) {
		this.upkeepTick += dt;
		if (this.upkeepTick < 1) return;
		this.upkeepTick = 0;
		const need = this.upkeep();
		if (this.food >= need) {
			this.food -= need;
			for (const e of this.ents) if (e.hibernating && e.faction === "spider") e.hibernating = false;
		} else {
			this.food = Math.max(0, this.food - need * .25);
			const extras = this.ents.filter((e) => e.alive && e.faction === "spider" && e.kind === "brood" && !e.hibernating && e.caste !== "worker");
			extras.sort((a, b) => b.maxHp - a.maxHp);
			let n = 0;
			for (const e of extras) {
				if (n > 2) break;
				e.hibernating = true;
				e.job = "hibernate";
				n++;
			}
			if (n) this.note("Stores run thin. Brood returns to the hollow to sleep.");
		}
		for (const e of this.ents) if (e.caste === "worker" && e.job !== "hibernate") e.foodMeter = Math.max(0, e.foodMeter - (e.evoSpd > 0 ? .35 : .55));
	}
	tickHives(dt: number) {
		this.respawnTick += dt;
		if (this.respawnTick < 14) return;
		this.respawnTick = 0;
		for (const s of this.sites) {
			if (s.cleared || !s.discovered) continue;
			if (s.kind === "bee" || s.kind === "wasp" || s.kind === "scorpion") {
				const eggs = this.ents.filter((e) => e.alive && e.kind === "egg" && e.site === s.id).length;
				const live = this.ents.filter((e) => e.alive && e.site === s.id && (e.kind === "bee" || e.kind === "wasp" || e.kind === "scorpion")).length;
				if (eggs < 2 && live < 6) this.spawnEnemyEgg(s.x, s.y, s.kind, s.id);
			}
			if (s.kind === "meadow") {
				if (this.ents.filter((e) => e.alive && e.kind === "herbivore").length < 4) this.spawnHerb(s.x + (Math.random() - .5) * 80, s.y + (Math.random() - .5) * 80);
			}
		}
	}
	toggleNest() {
		const q = this.queen();
		const n = this.nest();
		if (!q || !n) return;
		if (this.view === "nest") {
			this.view = "world";
			return;
		}
		if (Math.hypot(q.x - n.x, q.y - n.y) > 160) {
			this.note("The queen must be at the hollow to go below.");
			return;
		}
		this.view = "nest";
	}
	tryLay(kind: EggKind) {
		const q = this.queen();
		const n = this.nest();
		if (!q || !n) return;
		if (Math.hypot(q.x - n.x, q.y - n.y) > 170 && this.view !== "nest") {
			this.note("Return to the hollow to lay.");
			return;
		}
		if (this.allyCount() >= this.broodMax()) {
			this.note("Hatchery is full. Expand it.");
			return;
		}
		const cost = kind === "worker" ? this.workerCost() : kind === "attacker" ? this.attackCost() : kind === "defender" ? this.defendCost() : this.queenCost();
		if (this.food < cost) {
			this.note("Not enough food.");
			return;
		}
		this.food -= cost;
		const hatch = this.room("hatchery");
		if (hatch) hatch.stored += 1;
		this.make("egg", "spider", n.x + (Math.random() - .5) * 50, n.y + 30 + (Math.random() - .5) * 40, {
			r: 14,
			hp: 20,
			maxHp: 20,
			speed: 0,
			ttl: this.tune().hatch + (kind === "queen" ? 6 : 0),
			draw: 44,
			caste: kind === "queen" ? "queen" : kind,
			role: kind
		});
		this.note(kind === "queen" ? "A queen egg rests in the chamber." : `A ${kind} egg is nested.`);
	}
	tryBuildTower() {
		const q = this.queen();
		if (!q) return;
		const builders = this.ents.filter((e) => e.alive && e.caste === "worker" && (e.evo === "builder" || e.evo === "harvester"));
		if (!(builders.find((b) => Math.hypot(b.x - q.x, b.y - q.y) < 140) || (this.casteCount("worker") > 0 ? q : null))) {
			this.note("A worker must be near the queen to raise a tower.");
			return;
		}
		const cost = this.towerCost();
		if (this.material < cost) {
			this.note("Need material for a tower.");
			return;
		}
		this.material -= cost;
		this.make("tower", "spider", q.x + Math.cos(q.facing) * 50, q.y + Math.sin(q.facing) * 50, {
			r: 18,
			hp: 80,
			maxHp: 80,
			speed: 0,
			draw: 78,
			linked: false
		});
		this.note("Tower raised — mute until silk splices it to a live node.");
		const b = builders.find((w) => Math.hypot(w.x - q.x, w.y - q.y) < 160);
		if (b) {
			b.evo = "builder";
			b.job = "build";
		}
	}
	tryLink(): "spliced" | "blocked" | "none" {
		const q = this.queen();
		if (!q) return "none";
		const s = this.silkQuery(q);
		if (!s.tower) return "none";
		if (!s.standOk || !s.reachOk || !s.anchor || !s.costOk) {
			this.note(s.hint);
			return "blocked";
		}
		this.spliceSilk(s.tower, s.anchor, "queen");
		return "spliced";
	}
	spliceSilk(tower: Ent, anchor: { id: number; x: number; y: number }, who: "queen" | "teen") {
		if (!tower.alive || tower.kind !== "tower" || tower.linked) return;
		if (this.links.some((l) => (l.a === tower.id && l.b === anchor.id) || (l.b === tower.id && l.a === anchor.id))) return;
		if (who === "queen") this.material = Math.max(0, this.material - SILK_COST);
		tower.linked = true;
		this.links.push({ a: anchor.id, b: tower.id });
		const toNest = this.nest()?.id === anchor.id;
		this.note(
			who === "teen"
				? toNest
					? "A princess splices the tower to the hollow. Defenders hear the ring."
					: "A princess stretches the net. Air will answer this ring."
				: toNest
					? "Silk sings to the hollow. Nest defenders will answer this tower."
					: "Silk knits tower to tower. The perimeter grows; air answers without orders.",
		);
		this.audio?.web();
		this.pop(tower.x, tower.y - 28, toNest ? "Hive net" : "Tower net", "#e8ebe4");
		this.burst(tower.x, tower.y, "#e8ebe4", 14, 90);
	}
	assignFollow() {
		const q = this.queen();
		if (!q) return;
		const sel = this.find(this.selectedId);
		if (sel && sel.alive && sel.caste === "attacker") {
			sel.job = "follow";
			this.note("This attacker attends the queen.");
			return;
		}
		let n = 0;
		for (const e of this.ents) {
			if (!e.alive || e.caste !== "attacker") continue;
			if (Math.hypot(e.x - q.x, e.y - q.y) < 180) {
				e.job = "follow";
				n++;
			}
		}
		this.note(n ? `${n} attackers attend the queen.` : "No attackers nearby to assign.");
	}
	assignWorker(kind: "harvester" | "builder") {
		const e = this.find(this.selectedId);
		if (!e || !e.alive || e.faction !== "spider" || e.caste !== "worker") {
			this.note("Select a worker first.");
			return;
		}
		if (e.hibernating) {
			this.note("Sleeping brood will not take orders.");
			return;
		}
		if (kind === "harvester") {
			if (e.evo !== "harvester") {
				e.evo = "harvester";
				e.evoSpd += 1;
				e.foodMax += 20;
				e.speed += 10;
			}
			e.job = "harvest";
			e.assignR = 0;
			this.marking = true;
			this.note("Harvester ready. Click a patch of woods to send them.");
			return;
		}
		if (e.evo !== "builder") {
			e.evo = "builder";
			e.maxHp += 10;
			e.hp += 10;
		}
		e.job = "build";
		e.assignR = 0;
		this.marking = false;
		this.note("Builder holds the hollow and raises silk posts.");
	}
	assignAttacker(job: Job) {
		const e = this.find(this.selectedId);
		if (!e || !e.alive || e.caste !== "attacker") {
			this.note("Select an attacker first.");
			return;
		}
		e.job = job;
		this.marking = false;
		this.note(job === "follow" ? "Attacker attends the queen." : job === "guard" ? "Attacker holds this ground." : "Attacker roves the perimeter.");
	}
	beginMarkHarvest() {
		const e = this.find(this.selectedId);
		if (!e || e.caste !== "worker" || (e.evo !== "harvester" && e.job !== "harvest")) {
			this.note("Select a harvester, then mark a patch.");
			return;
		}
		this.marking = true;
		this.note("Click the woods. They will harvest that patch and walk it home.");
	}
	clearMark() {
		this.marking = false;
	}
	deselect() {
		this.selectedId = 0;
		this.marking = false;
	}
	clickWorld(x: number, y: number) {
		if (this.view === "nest") return;
		if (this.marking) {
			const e = this.find(this.selectedId);
			if (e && e.alive && e.caste === "worker") {
				if (e.evo !== "harvester") {
					e.evo = "harvester";
					e.job = "harvest";
				}
				e.assignX = x;
				e.assignY = y;
				e.assignR = HARVEST_R;
				e.job = "harvest";
				this.marking = false;
				this.note("Harvester walks the patch. When it is stripped, they return home.");
				this.pop(x, y, "Harvest", "#b7c96a");
				return;
			}
			this.marking = false;
		}
		let best;
		let bestD = 52 * 52;
		for (const e of this.ents) {
			if (!e.alive || e.faction !== "spider") continue;
			if (e.kind !== "brood") continue;
			const d = dist2(e, { x, y });
			if (d < bestD) {
				bestD = d;
				best = e;
			}
		}
		if (best) {
			this.selectedId = best.id;
			this.marking = false;
			return;
		}
		this.deselect();
	}
	evolveSelected(evo: Evo) {
		const e = this.find(this.selectedId);
		if (!e || e.faction !== "spider" || e.kind !== "brood") {
			this.note("Select a brood in the chrysalis chamber.");
			return;
		}
		const n = this.nest();
		if (!n || Math.hypot(e.x - n.x, e.y - n.y) > 200 && this.view !== "nest") {
			this.note("Evolution happens in the hollow.");
			return;
		}
		const opt = this.evoFor(e).find((o) => o.id === evo);
		if (!opt) return;
		if (this.food < opt.costF || this.material < opt.costM) {
			this.note("The chrysalis needs more stores.");
			return;
		}
		this.food -= opt.costF;
		this.material -= opt.costM;
		e.stage = "chrysalis";
		e.ttl = 7;
		e.evo = evo;
		if (evo === "air") {
			e.winged = true;
			e.maxHp = Math.max(16, e.maxHp * .7);
			e.hp = Math.min(e.hp, e.maxHp);
			e.speed += 40;
			if (e.caste === "worker") this.grantTransporters();
		}
		if (evo === "melee") {
			e.evoBite += 1;
			e.evoSpd += 1;
			e.dmg += 4;
			e.speed += 12;
		}
		if (evo === "tank") {
			e.evoHp += 1;
			e.maxHp += 36;
			e.hp += 36;
			e.draw += 10;
			e.r += 3;
			e.speed -= 16;
			e.splash += 1;
			if (e.evoHp >= 2) {
				e.chain += 1;
				e.roll += 1;
			}
		}
		if (evo === "siege") {
			e.dmg += 8;
			e.range = 210;
			e.speed -= 22;
			e.splash += 1;
			if (e.splash >= 2) e.sniper += 1;
		}
		if (evo === "harvester") {
			e.evoSpd += 1;
			e.foodMax += 20;
			e.speed += 10;
			e.job = "harvest";
			if (e.winged) this.grantTransporters();
		}
		if (evo === "builder") {
			e.job = "build";
			e.maxHp += 10;
			if (e.winged) this.grantTransporters();
		}
		this.note(`${opt.label} takes the chrysalis.`);
	}
	grantTransporters() {
		const builders = this.ents.filter((e) => e.alive && e.caste === "worker" && e.evo === "builder" && e.winged);
		if (!builders.length) return;
		const cap = 8 + builders.length * 6;
		for (const h of this.ents) {
			if (!h.alive || h.caste !== "worker" || !h.winged) continue;
			if (h.evo !== "harvester" && h.evo !== "none") continue;
			h.transCap = Math.max(h.transCap, cap);
		}
		this.note("Winged builders hitch transporters to the harvest.");
	}
	evoFor(e: Ent) {
		if (e.caste === "worker") {
			const out = [];
			if (e.evo !== "builder") out.push({
				id: "builder",
				label: "Builder",
				costF: 4,
				costM: 8
			});
			if (e.evo !== "harvester") out.push({
				id: "harvester",
				label: "Harvester",
				costF: 6,
				costM: 2
			});
			if (!e.winged) out.push({
				id: "air",
				label: "Wings",
				costF: 8,
				costM: 6
			});
			return out;
		}
		const out = [];
		if (e.evo === "biter" || e.evo === "melee") out.push({
			id: "melee",
			label: "Melee fangs",
			costF: 8,
			costM: 4
		});
		if (e.caste === "defender" && e.evo !== "tank") out.push({
			id: "tank",
			label: "Tank",
			costF: 10,
			costM: 10
		});
		if (e.caste === "attacker" && e.evo !== "siege") out.push({
			id: "siege",
			label: "Siege",
			costF: 10,
			costM: 8
		});
		if (e.caste === "attacker" && !e.winged) out.push({
			id: "air",
			label: "Wings",
			costF: 10,
			costM: 6
		});
		if (e.evo === "tank") out.push({
			id: "tank",
			label: "Armor / splash",
			costF: 8,
			costM: 10
		});
		if (e.evo === "siege" || e.winged && e.caste === "attacker") out.push({
			id: "siege",
			label: "Heavy / sniper",
			costF: 10,
			costM: 8
		});
		return out;
	}
	expandRoom(type: RoomType) {
		const r = this.room(type);
		if (!r) return;
		const cost = 10 + r.level * 8;
		if (this.material < cost) {
			this.note("Builders need more material.");
			return;
		}
		this.material -= cost;
		r.level += 1;
		r.cap = Math.round(r.cap * 1.35);
		this.note(`${type} chamber grows.`);
	}
	matureTeen(id: number) {
		const e = this.find(id);
		if (!e || e.kind !== "queen" || e.stage !== "adolescent") return;
		e.stage = "adult";
		e.caste = "queen";
		e.maxHp += 80;
		e.hp = e.maxHp;
		e.draw = 88;
		e.r = 26;
		e.speed = 96;
		e.dmg = 22;
		this.queenId = e.id;
		this.mode = "playing";
		this.note("A new Matriarch takes the hollow.");
	}
	clickNest(nx: number, ny: number) {
		const rooms: { type: RoomType; x: number; y: number }[] = [
			{
				type: "material",
				x: .28,
				y: .3
			},
			{
				type: "chrysalis",
				x: .72,
				y: .28
			},
			{
				type: "chamber",
				x: .5,
				y: .5
			},
			{
				type: "hatchery",
				x: .3,
				y: .72
			},
			{
				type: "food",
				x: .72,
				y: .7
			}
		];
		let best = rooms[0];
		let bd = 9;
		for (const r of rooms) {
			const d = (r.x - nx) ** 2 + (r.y - ny) ** 2;
			if (d < bd) {
				bd = d;
				best = r;
			}
		}
		this.selectedRoom = best.type;
		if (!this.nest()) return;
		const brood = this.ents.filter((e) => e.alive && e.faction === "spider" && e.kind === "brood");
		if (best.type === "chrysalis" && brood[0]) this.selectedId = brood[0].id;
	}
	glance(x: number, y: number) {
		if (this.marking) {
			this.clickWorld(x, y);
			return;
		}
		this.lookX = x;
		this.lookY = y;
		this.looking = 2.4;
		this.hasRally = true;
		this.rallyX = x;
		this.rallyY = y;
	}
	hatch(egg: Ent) {
		egg.alive = false;
		if (egg.faction !== "spider") {
			if (egg.role === "raider") this.spawnBee(egg.x, egg.y, egg.site);
			else if (egg.role === "torch") this.spawnWasp(egg.x, egg.y, egg.site);
			else this.spawnScorp(egg.x, egg.y, egg.site);
			this.note("Enemy eggs hatch from below.");
			return;
		}
		if (egg.caste === "queen") {
			this.make("queen", "spider", egg.x, egg.y, {
				r: 18,
				hp: 90,
				maxHp: 90,
				speed: 96,
				dmg: 12,
				range: 32,
				draw: 56,
				caste: "queen",
				stage: "adolescent",
				job: "guard"
			});
			this.pop(egg.x, egg.y, "Princess", "#e8ebe4");
		} else {
			this.spawnAlly(egg.caste === "none" ? "worker" : egg.caste, egg.x, egg.y);
			this.pop(egg.x, egg.y, egg.caste, "#e8ebe4");
		}
		const hatch = this.room("hatchery");
		if (hatch) hatch.stored = Math.max(0, hatch.stored - 1);
		this.burst(egg.x, egg.y, "#e8ebe4", 10, 70);
		this.audio?.hatch();
	}
	controlQueen(q: Ent, actions: Actions, dt: number) {
		let mx = actions.moveX;
		let my = actions.moveY;
		const mag = Math.hypot(mx, my);
		if (mag > 1) {
			mx /= mag;
			my /= mag;
		}
		if (mag > .08) {
			this.hasRally = false;
			q.vx = mx * q.speed;
			q.vy = my * q.speed;
			if (!this.hasAim) q.facing = Math.atan2(my, mx);
		} else if (this.hasRally) {
			if (Math.hypot(this.rallyX - q.x, this.rallyY - q.y) < 18) this.hasRally = false;
			else this.seek(q, {
				x: this.rallyX,
				y: this.rallyY
			}, dt);
		} else this.hold(q, dt);
		this.lastQueenSpeed = Math.hypot(q.vx, q.vy);
		if (this.hasAim && this.view === "world") q.facing = Math.atan2(this.aimWy - q.y, this.aimWx - q.x);
		if (actions.attack && this.view === "world") {
			const tgt = this.closestHostile(q, q.range + 22);
			if (tgt) {
				q.targetId = tgt.id;
				this.tryAttack(q, tgt);
			}
		}
		if (actions.justWeb && this.webCd <= 0) {
			const r = this.tryLink();
			if (r === "spliced") this.webCd = 1.6;
			else if (r === "blocked") this.webCd = 0.4;
			else {
				const d = 48;
				this.make("web", "none", q.x + Math.cos(q.facing) * d, q.y + Math.sin(q.facing) * d, {
					r: 50,
					hp: 36,
					maxHp: 36,
					ttl: 8,
					draw: 100,
					speed: 0
				});
				this.webCd = 3.6;
				this.audio?.web();
			}
		}
		if (actions.justVenom && this.venomCd <= 0) {
			const tgt = this.closestHostile(q, 240);
			const a = tgt ? ang(q, tgt) : q.facing;
			q.facing = a;
			this.make("shot", "spider", q.x + Math.cos(a) * 28, q.y + Math.sin(a) * 28, {
				r: 7,
				dmg: 11,
				vx: Math.cos(a) * 280,
				vy: Math.sin(a) * 280,
				ttl: 1,
				draw: 22,
				facing: a,
				faction: "spider"
			});
			this.venomCd = 1.2;
			this.audio?.bite();
		}
	}
	aiAlly(e: Ent, dt: number) {
		if (e.hibernating) {
			const n = this.nest();
			if (n) this.seek(e, n, dt);
			return;
		}
		if (e.stage === "chrysalis") {
			this.hold(e, dt);
			return;
		}
		if (e.kind === "queen" && e.stage === "adolescent") {
			this.aiTeen(e, dt);
			return;
		}
		if (e.caste === "worker") {
			this.aiWorker(e, dt);
			return;
		}
		const alert = this.alertTarget();
		if (e.caste === "defender") {
			if (alert && this.inPerim(alert.x, alert.y)) {
				this.seek(e, alert, dt);
				this.tryAttack(e, alert);
				return;
			}
			if (!this.nest()) return;
			const nodes = this.linkedNodes();
			const node = nodes[e.id % Math.max(1, nodes.length)];
			const rest = {
				x: (node?.x ?? e.homeX) + Math.cos(e.age * .25 + e.id) * 110,
				y: (node?.y ?? e.homeY) + Math.sin(e.age * .25 + e.id) * 86
			};
			const foe = this.closestHostile(e, 160);
			if (foe && this.inPerim(foe.x, foe.y)) {
				this.seek(e, foe, dt);
				this.tryAttack(e, foe);
			} else if (Math.hypot(e.x - rest.x, e.y - rest.y) > 24) this.seek(e, rest, dt);
			else this.hold(e, dt);
			return;
		}
		if (e.job === "follow") {
			const q = this.queen();
			if (q) {
				const foe = this.closestHostile(e, e.winged ? 260 : 140);
				if (foe) {
					this.seek(e, foe, dt);
					this.tryAttack(e, foe);
				} else this.seek(e, {
					x: q.x - 36,
					y: q.y + 24
				}, dt);
			}
			return;
		}
		if (alert && e.winged && e.caste === "attacker") {
			const air = this.ents.filter((o) => o.alive && o.winged && o.caste === "attacker" && !o.hibernating).sort((a, b) => a.hp - b.hp);
			const cut = Math.max(3, Math.ceil(air.length * .65));
			if (air.findIndex((o) => o.id === e.id) < cut) {
				this.seek(e, alert, dt);
				this.tryAttack(e, alert);
				return;
			}
		}
		const foe = this.closestHostile(e, e.winged ? 300 : 200);
		if (foe && (this.inPerim(foe.x, foe.y) || e.job === "rove")) {
			this.seek(e, foe, dt);
			this.tryAttack(e, foe);
			return;
		}
		const n = this.nest();
		if (!n) return;
		const rest = {
			x: n.x + Math.cos(e.age * .2 + e.id) * 180,
			y: n.y + Math.sin(e.age * .2 + e.id) * 140
		};
		if (Math.hypot(e.x - rest.x, e.y - rest.y) > 28) this.seek(e, rest, dt);
		else this.hold(e, dt);
	}
	aiTeen(e: Ent, dt: number) {
		let tower;
		let best = 0xe8d4a51000;
		for (const tw of this.ents) {
			if (!tw.alive || tw.kind !== "tower" || tw.linked) continue;
			const d = dist2(e, tw);
			if (d < best) {
				best = d;
				tower = tw;
			}
		}
		if (tower) {
			this.seek(e, tower, dt);
			if (Math.hypot(e.x - tower.x, e.y - tower.y) < SILK_STAND) {
				const anchor = this.silkAnchor(tower);
				const reach = anchor ? Math.hypot(tower.x - anchor.x, tower.y - anchor.y) <= SILK_LINK_RANGE : false;
				if (anchor && reach) this.spliceSilk(tower, anchor, "teen");
				else if (this.time - this.teenSilkNote > 4) {
					this.teenSilkNote = this.time;
					this.note("The princess is at the post, but the net is out of strand range.");
				}
			}
			return;
		}
		const n = this.nest();
		if (n && Math.hypot(e.x - n.x, e.y - n.y) > 90) this.seek(e, n, dt);
		else this.hold(e, dt);
	}
	aiWorker(e: Ent, dt: number) {
		const n = this.nest();
		if (!n) return;
		if (e.evo === "builder" && e.job === "build") {
			if (Math.hypot(e.x - n.x, e.y - n.y) > 80) this.seek(e, n, dt);
			else this.hold(e, dt);
			return;
		}
		if (e.haul > 0) {
			this.seek(e, n, dt);
			if (Math.hypot(e.x - n.x, e.y - n.y) < 70) {
				if (e.meat >= e.haul) this.food = Math.min(this.cap("food"), this.food + e.haul);
				else this.material = Math.min(this.cap("material"), this.material + e.haul);
				this.pop(n.x, n.y - 30, `+${e.haul}`, "#e8ebe4");
				e.haul = 0;
				e.foodMeter = e.foodMax;
				this.audio?.deposit();
				if (e.assignR > 0 && !this.patchHasYield(e)) {
					e.assignR = 0;
					this.note("Patch stripped. Harvester is home.");
				}
			}
			return;
		}
		if (e.job !== "harvest") {
			if (Math.hypot(e.x - n.x, e.y - n.y) > 90) this.seek(e, n, dt);
			else this.hold(e, dt);
			return;
		}
		if (e.assignR <= 0) {
			if (Math.hypot(e.x - n.x, e.y - n.y) > 90) this.seek(e, n, dt);
			else this.hold(e, dt);
			return;
		}
		const node = this.closestYield(e, e.assignX, e.assignY, e.assignR);
		if (!node) {
			this.seek(e, n, dt);
			if (Math.hypot(e.x - n.x, e.y - n.y) < 70) {
				e.assignR = 0;
				this.note("Nothing left on the patch. Harvester rests.");
			}
			return;
		}
		this.seek(e, node, dt);
		if (Math.hypot(e.x - node.x, e.y - node.y) < 28) {
			const take = Math.min(6, node.meat || 4);
			node.meat -= take;
			e.haul = take + (e.transCap > 0 ? 6 : 0);
			e.meat = node.kind === "node" ? take : 0;
			if (node.kind === "pickup" || node.kind === "cocoon" || node.meat <= 0) node.alive = false;
		}
	}
	yieldKind(o: Ent) {
		return o.kind === "node" || o.kind === "pickup" || o.kind === "cocoon";
	}
	closestYield(e: Ent, x: number, y: number, r: number) {
		let node;
		let best = r * r;
		for (const o of this.ents) {
			if (!o.alive || !this.yieldKind(o)) continue;
			const d = (o.x - x) ** 2 + (o.y - y) ** 2;
			if (d < best) {
				best = d;
				node = o;
			}
		}
		void e;
		return node;
	}
	patchHasYield(e: Ent) {
		if (e.assignR <= 0) return false;
		return Boolean(this.closestYield(e, e.assignX, e.assignY, e.assignR));
	}
	alertTarget() {
		for (const tw of this.ents) {
			if (!tw.alive || tw.kind !== "tower" || !this.silkPowered(tw.id)) continue;
			const foe = this.closestHostile(tw, TOWER_PERIM);
			if (foe) {
				tw.alert = true;
				return foe;
			}
			tw.alert = false;
		}
	}
	aiTower(e: Ent) {
		e.alert = Boolean(this.silkPowered(e.id) && this.closestHostile(e, TOWER_PERIM));
	}
	aiHerb(e: Ent, dt: number) {
		const threat = this.ents.find((o) => o.alive && o.faction === "spider" && Math.hypot(o.x - e.x, o.y - e.y) < 120);
		if (threat) {
			this.seek(e, {
				x: e.x * 2 - threat.x,
				y: e.y * 2 - threat.y
			}, dt);
			return;
		}
		const s = this.sites.find((x) => x.id === "meadow");
		if (!s) return;
		const rest = {
			x: s.x + Math.cos(e.age * .15 + e.id) * 60,
			y: s.y + Math.sin(e.age * .15 + e.id) * 40
		};
		if (Math.hypot(e.x - rest.x, e.y - rest.y) > 20) this.seek(e, rest, dt);
		else this.hold(e, dt);
	}
	aiEnemy(e: Ent, dt: number) {
		const site = this.sites.find((s) => s.id === e.site);
		if (site && !site.discovered) {
			const rest = {
				x: site.x + Math.cos(e.age * .3 + e.id) * 50,
				y: site.y + Math.sin(e.age * .3 + e.id) * 40
			};
			if (Math.hypot(e.x - rest.x, e.y - rest.y) > 18) this.seek(e, rest, dt);
			else this.hold(e, dt);
			return;
		}
		let t = this.find(e.targetId);
		if (!t || e.age % .4 < dt) {
			t = this.pickTarget(e);
			e.targetId = t?.id ?? 0;
		}
		if (!t) {
			this.hold(e, dt);
			return;
		}
		this.seek(e, t, dt);
		this.tryAttack(e, t);
	}
	pickTarget(e: Ent) {
		let best;
		let bestScore = Infinity;
		for (const o of this.ents) {
			if (!o.alive || o.id === e.id) continue;
			if (!isHostile(e.faction, o.faction)) continue;
			if (!(COMBAT.includes(o.kind) || STRUCTURE.includes(o.kind))) continue;
			if (o.kind === "herbivore" && e.faction !== "spider" && e.kind !== "scorpion") continue;
			if (e.kind === "wasp" && o.winged) {}
			let score = dist2(e, o);
			if (e.kind === "wasp" && o.winged) score *= .45;
			if (e.kind === "bee" && o.evo === "tank") score *= .7;
			if (e.kind === "scorpion") score *= o.kind === "queen" ? 1.05 : 1;
			if (score < bestScore) {
				bestScore = score;
				best = o;
			}
		}
		return best;
	}
	closestHostile(e: Ent, maxR: number) {
		let best;
		let bestD = maxR * maxR;
		for (const o of this.ents) {
			if (!o.alive || o.id === e.id) continue;
			if (!isHostile(e.faction, o.faction)) continue;
			if (!COMBAT.includes(o.kind) && o.kind !== "hive") continue;
			const d = dist2(e, o);
			if (d < bestD) {
				bestD = d;
				best = o;
			}
		}
		return best;
	}
	tryAttack(e: Ent, target: Ent) {
		if (e.cd > 0 || e.atkT > 0 || e.dmg <= 0) return;
		if (Math.hypot(target.x - e.x, target.y - e.y) > e.range + target.r + 8) return;
		e.atkT = e.evo === "siege" ? .44 : .36;
		e.cd = e.kind === "queen" ? .42 : e.evo === "melee" ? .48 : e.evo === "tank" ? .9 : .7;
		e.facing = ang(e, target);
		e.targetId = target.id;
	}
	fireRanged(e: Ent) {
		const t = this.find(e.targetId);
		const a = t ? ang(e, t) : e.facing;
		const spd = e.sniper ? 380 : 240;
		this.make("shot", e.faction, e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 20, {
			r: 7,
			dmg: e.dmg + e.evoBite * 2,
			vx: Math.cos(a) * spd,
			vy: Math.sin(a) * spd,
			ttl: e.sniper ? 1.3 : .9,
			draw: 22,
			facing: a,
			faction: e.faction,
			role: e.evo === "siege" ? "siege" : "none"
		});
	}
	resolveAttack(e: Ent, t = this.find(e.targetId)) {
		if (!t) return;
		if (Math.hypot(t.x - e.x, t.y - e.y) > e.range + t.r + 10) return;
		if (e.winged && t.kind !== "wasp" && t.evo !== "siege") {}
		if (!e.winged && t.winged && t.kind !== "bee") {
			this.pop(t.x, t.y, "miss", "#8a9388");
			return;
		}
		let dmg = e.dmg + e.evoBite * 3;
		if (e.caste === "attacker" && e.winged) {
			const swarm = this.ents.filter((o) => o.alive && o.winged && o.caste === "attacker").length;
			dmg *= 1 + .08 * Math.min(8, swarm);
		}
		this.hit(t, dmg, e, e.faction === "spider" ? "#b7c96a" : "#c46a3a");
		if (e.roll) {
			e.x += Math.cos(e.facing) * 26;
			e.y += Math.sin(e.facing) * 26;
		}
		if (e.splash || e.roll) for (const o of this.ents) {
			if (!o.alive || o.id === t.id) continue;
			if (!isHostile(e.faction, o.faction)) continue;
			if (Math.hypot(o.x - t.x, o.y - t.y) < 42) this.hit(o, dmg * .45, e, "#b7c96a");
		}
		if (e.chain) {
			const nxt = this.closestHostile(t, 90);
			if (nxt && nxt.id !== t.id) this.hit(nxt, dmg * .5, e, "#b7c96a");
		}
		if (e.kind === "queen") this.audio?.bite();
	}
	shotCollide(shot: Ent) {
		for (const o of this.ents) {
			if (!o.alive) continue;
			if (o.faction === shot.faction) continue;
			if (!COMBAT.includes(o.kind) && o.kind !== "egg" && o.kind !== "hive") continue;
			if (Math.hypot(o.x - shot.x, o.y - shot.y) < o.r + shot.r) {
				this.hit(o, shot.dmg, shot, shot.faction === "spider" ? "#b7c96a" : "#c9a227");
				if (shot.faction === "bee") o.poison = Math.max(o.poison, 2.4);
				shot.alive = false;
				this.make("fx", "none", shot.x, shot.y, {
					r: 8,
					ttl: .28,
					draw: 36,
					speed: 0
				});
				break;
			}
		}
	}
	gatherPickups(dt: number) {
		const q = this.queen();
		for (const e of this.ents) {
			if (!e.alive || e.kind !== "pickup" && e.kind !== "cocoon") continue;
			if (q && Math.hypot(q.x - e.x, q.y - e.y) < q.r + e.r + 8) {
				this.food = Math.min(this.cap("food"), this.food + e.meat);
				this.material = Math.min(this.cap("material"), this.material + Math.max(1, Math.floor(e.meat / 3)));
				e.alive = false;
				this.pop(e.x, e.y, `+${e.meat}`, "#e8ebe4");
				this.audio?.deposit();
			}
		}
	}
	hit(target: Ent, dmg: number, from: Ent | null, color: string) {
		if (!target.alive) return;
		if (from?.kind === "bee" && target.evo !== "tank") dmg *= 1.25;
		if (from?.kind === "wasp" && target.winged) dmg *= 1.45;
		target.hp -= dmg;
		target.flash = .12;
		if (from) {
			const a = ang(from, target);
			target.vx += Math.cos(a) * 70;
			target.vy += Math.sin(a) * 70;
		}
		this.burst(target.x, target.y, color, 5, 60);
		this.pop(target.x, target.y - 16, `${Math.round(dmg)}`, color);
		this.shake(target.kind === "queen" || target.kind === "nest" ? .24 : .1);
		if (target.hp <= 0) this.kill(target, from);
	}
	kill(target: Ent, from: Ent | null) {
		target.alive = false;
		this.burst(target.x, target.y, "#c45c4c", 12, 100);
		if (target.kind === "herbivore") {
			this.make("pickup", "none", target.x, target.y, {
				r: 10,
				hp: 1,
				maxHp: 1,
				speed: 0,
				meat: 8,
				draw: 22,
				ttl: 40
			});
			this.make("node", "none", target.x + 10, target.y, {
				r: 12,
				hp: 8,
				maxHp: 8,
				speed: 0,
				meat: 5,
				draw: 20,
				ttl: 40
			});
		}
		if (target.kind === "bee" || target.kind === "wasp" || target.kind === "scorpion" || target.kind === "human") this.make("pickup", "none", target.x, target.y, {
			r: 10,
			hp: 1,
			maxHp: 1,
			speed: 0,
			meat: target.kind === "scorpion" ? 5 : 3,
			draw: 20,
			ttl: 28
		});
		if (target.kind === "queen" && target.stage === "adult") {
			if (this.ents.filter((e) => e.alive && e.kind === "queen" && e.stage === "adolescent").length) {
				this.mode = "succession";
				this.note("The Matriarch fell. Choose an adolescent to rise.");
			} else {
				this.mode = "over";
				this.overReason = "The Matriarch fell, and no heir remains.";
				this.persist();
				this.audio?.lose();
			}
		}
		if (target.kind === "nest") {
			this.mode = "over";
			this.overReason = "The hollow nest was ruined.";
			this.persist();
			this.audio?.lose();
		}
	}
	setView(w: number, h: number) {
		this.viewW = Math.max(1, w);
		this.viewH = Math.max(1, h);
		this.clampCamera();
	}
	clampCamera() {
		const halfW = this.viewW / 2;
		const halfH = this.viewH / 2;
		this.camX = 3600 <= this.viewW ? WORLD_W / 2 : clamp(this.camX, halfW, WORLD_W - halfW);
		this.camY = 2200 <= this.viewH ? WORLD_H / 2 : clamp(this.camY, halfH, WORLD_H - halfH);
	}
	hud() {
		const q = this.queen();
		const n = this.nest();
		const sel = this.find(this.selectedId);
		const teens = this.ents.filter((e) => e.alive && e.kind === "queen" && e.stage === "adolescent");
		const silk = this.silkQuery(q);
		return {
			mode: this.mode,
			view: this.view,
			difficulty: this.difficulty,
			queenHp: q?.hp ?? 0,
			queenMax: q?.maxHp ?? 160,
			nestHp: n?.hp ?? 0,
			nestMax: n?.maxHp ?? 420,
			food: Math.floor(this.food),
			foodCap: this.cap("food"),
			material: Math.floor(this.material),
			matCap: this.cap("material"),
			upkeep: Math.round(this.upkeep() * 10) / 10,
			hibernating: this.ents.filter((e) => e.alive && e.hibernating).length,
			workers: this.casteCount("worker"),
			attackers: this.casteCount("attacker"),
			defenders: this.casteCount("defender"),
			air: this.ents.filter((e) => e.alive && e.winged && e.faction === "spider").length,
			teens: teens.length,
			brood: this.allyCount(),
			broodMax: this.broodMax(),
			carrying: Boolean(q?.carryId),
			webCd: this.webCd,
			venomCd: this.venomCd,
			workerCost: this.workerCost(),
			attackCost: this.attackCost(),
			defendCost: this.defendCost(),
			queenCost: this.queenCost(),
			towerCost: this.towerCost(),
			ticker: this.tickers[0]?.text ?? "",
			selected: sel ? `${sel.caste} ${sel.evo}${sel.winged ? " winged" : ""}` : "",
			room: this.selectedRoom,
			rooms: this.rooms.map((r) => ({ ...r })),
			evoOptions: sel && sel.kind === "brood"
				? this.evoFor(sel).filter((o) => sel.caste !== "worker" || o.id === "air")
				: [],
			succession: teens.map((e, i) => ({
				id: e.id,
				label: `Heir ${i + 1} · ${Math.ceil(e.hp)} hp`
			})),
			discovered: this.sites.filter((s) => s.discovered).map((s) => s.id),
			fogReady: true,
			bestReach: this.bestByDiff[this.difficulty] || this.bestReach,
			bestByDiff: { ...this.bestByDiff },
			overReason: this.overReason,
			nestNear: Boolean(q && n && Math.hypot(q.x - n.x, q.y - n.y) < 160),
			canLink: silk.ready,
			silkHint: this.view === "world" ? silk.hint : "",
			silkNodes: this.linkedNodes().length,
			silkDist: Math.round(silk.dist),
			silkMax: SILK_LINK_RANGE,
			silkCost: SILK_COST,
			ally: sel && sel.kind === "brood" ? {
				id: sel.id,
				caste: sel.caste,
				evo: sel.evo,
				job: sel.job,
				hp: Math.ceil(sel.hp),
				maxHp: sel.maxHp,
				winged: sel.winged,
				marked: sel.assignR > 0,
				label: `${sel.caste}${sel.evo !== "none" && sel.evo !== "biter" ? ` · ${sel.evo}` : ""}${sel.winged ? " · wings" : ""}`,
			} : null,
			marking: this.marking,
		};
	}
}
