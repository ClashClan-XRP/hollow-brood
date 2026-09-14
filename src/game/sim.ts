import {
  HARVEST_R,
  FEED_NEST_R,
  DIFFICULTIES,
  NEST_PERIM,
  NEST_POS,
  SILK_LINK_RANGE,
  SILK_STAND,
  SITES,
  TOWER_PERIM,
  UPKEEP_RATES,
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
  type CommandOpt,
} from "./types";
import type { Actions } from "./input";
import type { GameAudio } from "./audio";
import { Fog } from "./fog";
import { Nav, type Route } from "./path";

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
	nav = new Nav();
	routes = new Map<number, Route>();
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
	selectedIds: number[] = [];
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
	dropTick = 0;
	dropCount = 0;
	homeRegen = 0;
	nestAlarm = 0;
	hiveId = 0;
	incomeLog: { t: number; f: number; m: number }[] = [];
	fullNote = 0;
	constructor() {
		const save = loadSave();
		this.bestReach = save.bestReach;
		this.bestByDiff = save.bestByDiff;
		if (typeof window !== "undefined") this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
	}
	tune() {
		return DIFFICULTIES[this.difficulty];
	}
	silkCost() {
		return this.tune().silkCost;
	}
	yieldAmt(base: number) {
		return Math.max(1, Math.round(base * this.tune().yieldMul));
	}
	foodPrice(base: number) {
		return Math.max(1, Math.round(base * this.tune().costMul));
	}
	matPrice(base: number) {
		return Math.max(1, Math.round(base * this.tune().costMul));
	}
	gainFood(n: number) {
		if (n <= 0) return 0;
		const room = Math.min(n, Math.max(0, this.cap("food") - this.food));
		this.food += room;
		if (room > 0) this.incomeLog.push({ t: this.time, f: room, m: 0 });
		if (room < n && this.time - this.fullNote > 6) {
			this.fullNote = this.time;
			this.note("Larder is full. Expand the food chamber below.");
		}
		return room;
	}
	gainMat(n: number) {
		if (n <= 0) return 0;
		const room = Math.min(n, Math.max(0, this.cap("material") - this.material));
		this.material += room;
		if (room > 0) this.incomeLog.push({ t: this.time, f: 0, m: room });
		if (room < n && this.time - this.fullNote > 6) {
			this.fullNote = this.time;
			this.note("Material bins are full. Expand them below.");
		}
		return room;
	}
	spendFood(n: number) {
		if (this.food < n) return false;
		this.food -= n;
		return true;
	}
	spendMat(n: number) {
		if (this.material < n) return false;
		this.material -= n;
		return true;
	}
	incomeRate() {
		const from = this.time - 8;
		this.incomeLog = this.incomeLog.filter((e) => e.t > from);
		if (this.time < 1) return 0;
		const span = Math.min(8, Math.max(1, this.time));
		return this.incomeLog.reduce((s, e) => s + e.f, 0) / span;
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
			skill: 0,
			drops: 0,
			unearthed: false,
			buried: 0,
			garrisonId: 0,
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
		this.selectedIds = [];
		this.selectedRoom = "hatchery";
		this.looking = 0;
		this.marking = false;
		this.dropTick = 0;
		this.dropCount = 0;
		this.homeRegen = 0;
		this.nestAlarm = 0;
		this.hiveId = 0;
		this.incomeLog = [];
		this.fullNote = 0;
		this.fog.reset();
		this.nav.clear();
		this.routes.clear();
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
				cap: t.foodCap,
				stored: t.food
			},
			{
				type: "material",
				level: 1,
				cap: t.matCap,
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
		this.seedHomeEconomy();
		this.make("node", "none", SITES.berries.x, SITES.berries.y, {
			r: 22,
			hp: 40,
			maxHp: 40,
			speed: 0,
			meat: this.yieldAmt(16),
			draw: 36,
			site: "berries",
		});
		this.make("fruit", "none", NEST_POS.x + 360, NEST_POS.y - 200, {
			r: 20,
			hp: 36,
			maxHp: 36,
			speed: 0,
			meat: this.yieldAmt(18),
			draw: 84,
			site: "berries",
		});
		this.make("fruit", "none", SITES.berries.x - 40, SITES.berries.y + 30, {
			r: 22,
			hp: 40,
			maxHp: 40,
			speed: 0,
			meat: this.yieldAmt(16),
			draw: 90,
			site: "berries",
		});
		this.make("solar", "none", 1760, 1380, {
			r: 16,
			hp: 30,
			maxHp: 30,
			speed: 0,
			meat: 0,
			haul: this.yieldAmt(12),
			draw: 40,
			buried: 0.4,
			site: "unique",
		});
		this.make("battery", "none", 1280, 1500, {
			r: 14,
			hp: 24,
			maxHp: 24,
			speed: 0,
			meat: this.yieldAmt(10),
			haul: 0,
			draw: 34,
			buried: 0.5,
			site: "unique",
		});
		this.make("battery", "none", 2060, 1080, {
			r: 14,
			hp: 24,
			maxHp: 24,
			speed: 0,
			meat: this.yieldAmt(8),
			haul: 0,
			draw: 34,
			buried: 0.35,
			site: "unique",
		});
		for (const [x, y, meat] of [
			[1480, 1280, 8],
			[SITES.meadow.x, SITES.meadow.y, 14],
		] as const) {
			this.make("node", "none", x, y, {
				r: 18,
				hp: 28,
				maxHp: 28,
				speed: 0,
				meat: this.yieldAmt(meat),
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
			[1180, 1080],
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
		this.bakeNav();
		this.clampCamera();
		this.mode = "playing";
		this.selectOnly(queen.id);
		this.note("Grove and scrap sit inside the silk. Harvest, raise a tower, then march when the hollow cannot feed more.");
		this.audio?.wave();
	}
	seedHomeEconomy() {
		const n = NEST_POS;
		const fruits: [number, number, number, number][] = [
			[n.x + 200, n.y - 28, 40, 96],
			[n.x + 55, n.y - 195, 36, 88],
			[n.x + 175, n.y + 125, 32, 84],
		];
		for (const [x, y, meat, draw] of fruits) {
			this.make("fruit", "none", x, y, {
				r: 22,
				hp: meat,
				maxHp: meat,
				speed: 0,
				meat: this.yieldAmt(meat),
				draw,
				site: "home",
			});
		}
		const scraps: [number, number, number, number][] = [
			[n.x - 200, n.y + 24, 28, 32],
			[n.x - 80, n.y + 185, 22, 30],
		];
		for (const [x, y, haul, draw] of scraps) {
			this.make("scrap", "none", x, y, {
				r: 16,
				hp: haul,
				maxHp: haul,
				speed: 0,
				meat: 0,
				haul: this.yieldAmt(haul),
				draw,
				unearthed: true,
				site: "home",
			});
		}
		this.make("solar", "none", n.x - 210, n.y - 95, {
			r: 16,
			hp: 22,
			maxHp: 22,
			speed: 0,
			meat: 0,
			haul: this.yieldAmt(18),
			draw: 42,
			unearthed: true,
			buried: 0,
			site: "home",
		});
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
		const q = this.queen();
		const home = this.linkedNodes()[0] ?? NEST_POS;
		const hx = extra.homeX ?? home.x;
		const hy = extra.homeY ?? home.y;
		const k = this.casteCount(caste);
		const sx = q ? q.x + 30 + (k % 3) * 24 : x;
		const sy = q ? q.y - 48 - Math.floor(k / 3) * 20 : y;
		if (caste === "worker") {
			const w = this.make("brood", "spider", sx, sy, {
			r: 16,
			hp: 22,
			maxHp: 22,
			speed: 62,
			dmg: 0,
			range: 0,
			draw: 36,
			caste: "worker",
			evo: "none",
			job: "none",
			foodMeter: 56,
			foodMax: 56,
			homeX: hx,
			homeY: hy,
			...extra
			});
			this.selectOnly(w.id);
			return w;
		}
		if (caste === "defender") {
			const d = this.make("brood", "spider", sx, sy, {
			r: 16,
			hp: 40,
			maxHp: 40,
			speed: 70,
			dmg: 7,
			range: 20,
			draw: 40,
			caste: "defender",
			evo: "biter",
			job: "guard",
			foodMeter: 48,
			foodMax: 48,
			homeX: hx,
			homeY: hy,
			...extra
			});
			this.selectOnly(d.id);
			return d;
		}
		const a = this.make("brood", "spider", sx, sy, {
			r: 16,
			hp: 30,
			maxHp: 30,
			speed: 88,
			dmg: 8,
			range: 20,
			draw: 38,
			caste: "attacker",
			evo: "biter",
			job: "rove",
			foodMeter: 44,
			foodMax: 44,
			homeX: hx,
			homeY: hy,
			...extra
		});
		this.selectOnly(a.id);
		return a;
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
		let u = UPKEEP_RATES.nest;
		for (const e of this.ents) {
			if (!e.alive || e.faction !== "spider" || e.hibernating) continue;
			if (e.kind === "queen" && e.stage === "adult") u += UPKEEP_RATES.queen;
			else if (e.kind === "queen") u += UPKEEP_RATES.teen;
			else if (e.caste === "worker") {
				u += e.evo === "harvester" ? UPKEEP_RATES.harvester : e.evo === "engineer" ? UPKEEP_RATES.engineer : e.evo === "builder" ? UPKEEP_RATES.builder : UPKEEP_RATES.worker;
			} else if (e.evo === "tank") u += UPKEEP_RATES.tank;
			else if (e.evo === "siege") u += UPKEEP_RATES.siege;
			else if (e.caste === "defender") u += UPKEEP_RATES.defender;
			else if (e.caste === "attacker") u += UPKEEP_RATES.attacker;
			if (e.winged) u += UPKEEP_RATES.air;
		}
		return u * this.tune().upkeepMul;
	}
	unitUpkeep(e: Ent) {
		if (e.kind === "queen" && e.stage === "adult") return UPKEEP_RATES.queen;
		if (e.kind === "queen") return UPKEEP_RATES.teen;
		if (e.caste === "worker") return e.evo === "harvester" ? UPKEEP_RATES.harvester : e.evo === "engineer" ? UPKEEP_RATES.engineer : e.evo === "builder" ? UPKEEP_RATES.builder : UPKEEP_RATES.worker;
		if (e.evo === "tank") return UPKEEP_RATES.tank + (e.winged ? UPKEEP_RATES.air : 0);
		if (e.evo === "siege") return UPKEEP_RATES.siege + (e.winged ? UPKEEP_RATES.air : 0);
		if (e.caste === "defender") return UPKEEP_RATES.defender + (e.winged ? UPKEEP_RATES.air : 0);
		if (e.caste === "attacker") return UPKEEP_RATES.attacker + (e.winged ? UPKEEP_RATES.air : 0);
		return 0.1;
	}
	workerCost() {
		return 3;
	}
	attackCost() {
		return this.foodPrice(8 + this.casteCount("attacker") * 2);
	}
	defendCost() {
		return this.foodPrice(6);
	}
	queenCost() {
		return this.foodPrice(24 + this.ents.filter((e) => e.alive && e.kind === "queen").length * 12);
	}
	towerCost() {
		return this.matPrice(10 + this.ents.filter((e) => e.alive && e.kind === "tower").length * 5);
	}
	electricCost() {
		return this.matPrice(12);
	}
	siegeholdCost() {
		return this.matPrice(16);
	}
	roomCost(level: number) {
		return this.matPrice(8 + level * 6);
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
		return this.inOrderNet(x, y);
	}
	inOrderNet(x: number, y: number) {
		const nest = this.nest();
		if (nest && Math.hypot(x - nest.x, y - nest.y) < NEST_PERIM) return true;
		for (const tw of this.ents) {
			if (!tw.alive || tw.kind !== "tower" || !this.silkPowered(tw.id)) continue;
			if (Math.hypot(x - tw.x, y - tw.y) < TOWER_PERIM) return true;
		}
		for (const l of this.links) {
			const a = this.find(l.a);
			const b = this.find(l.b);
			if (!a || !b) continue;
			if (!this.silkPowered(a.id) && !(nest && a.id === nest.id)) continue;
			if (!this.silkPowered(b.id) && !(nest && b.id === nest.id)) continue;
			if (this.segDist(x, y, a.x, a.y, b.x, b.y) < 58) return true;
		}
		return false;
	}
	segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
		const dx = bx - ax;
		const dy = by - ay;
		const l2 = dx * dx + dy * dy;
		if (l2 < 1) return Math.hypot(px - ax, py - ay);
		const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
		return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
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
		let fallback: { x: number; y: number; id: number } | undefined;
		let fallD = Infinity;
		const range2 = SILK_LINK_RANGE * SILK_LINK_RANGE;
		for (const n of this.linkedNodes()) {
			if (n.id === tower.id) continue;
			const d = dist2(tower, n);
			if (d < fallD) {
				fallD = d;
				fallback = n;
			}
			if (d <= range2 && d < bestD) {
				bestD = d;
				best = n;
			}
		}
		return best ?? fallback;
	}
	hasLink(a: number, b: number) {
		return this.links.some((l) => (l.a === a && l.b === b) || (l.b === a && l.a === b));
	}
	silkQuery(from: Ent | undefined = this.queen()) {
		const empty = {
			tower: undefined as Ent | undefined,
			anchor: undefined as { x: number; y: number; id: number } | undefined,
			standOk: false,
			reachOk: false,
			costOk: this.material >= this.silkCost(),
			ready: false,
			dist: 0,
			hint: "",
		};
		if (!from) return empty;
		const mutes = this.ents.filter((e) => e.alive && e.kind === "tower" && !this.silkPowered(e.id));
		const liveAtFeet = this.linkedNodes().find((n) => Math.hypot(from.x - n.x, from.y - n.y) <= SILK_STAND);
		const muteAtFeet = mutes.reduce<Ent | undefined>((best, e) => {
			const d = dist2(from, e);
			if (d > (SILK_STAND + 240) ** 2) return best;
			if (!best || d < dist2(from, best)) return e;
			return best;
		}, undefined);

		const readyHint = (toNest: boolean, web: boolean) => {
			if (this.material < this.silkCost()) return `Need ${this.silkCost()} material to spin the strand.`;
			if (toNest) return `Silk ready · ${this.silkCost()} mat. Q splices this tower to the hollow — defenders will hear it.`;
			if (web) return `Silk ready · ${this.silkCost()} mat. Q weaves tower to tower. The web carries alerts and harvest orders.`;
			return `Silk ready · ${this.silkCost()} mat. Q knits into the tower net — the perimeter grows.`;
		};

		if (muteAtFeet) {
			const tower = muteAtFeet;
			const standOk = Math.hypot(from.x - tower.x, from.y - tower.y) <= SILK_STAND;
			const anchor = this.silkAnchor(tower);
			const dist = anchor ? Math.hypot(tower.x - anchor.x, tower.y - anchor.y) : 0;
			const reachOk = Boolean(anchor) && dist <= SILK_LINK_RANGE;
			let hint = "Mute tower. Stand on the post to splice silk.";
			if (!standOk) hint = "Move onto the mute tower. Silk splices at the post, not from range.";
			else if (!reachOk) hint = `Too far from the net. Need a live node within ${SILK_LINK_RANGE} paces.`;
			else hint = readyHint(this.nest()?.id === anchor!.id, Boolean(anchor && this.find(anchor.id)?.kind === "tower"));
			return {
				tower,
				anchor,
				standOk,
				reachOk,
				costOk: this.material >= this.silkCost(),
				ready: standOk && reachOk && this.material >= this.silkCost(),
				dist,
				hint,
			};
		}

		if (liveAtFeet) {
			let mute: Ent | undefined;
			let muteD = Infinity;
			for (const e of mutes) {
				const d = Math.hypot(e.x - liveAtFeet.x, e.y - liveAtFeet.y);
				if (d <= SILK_LINK_RANGE && d < muteD) {
					muteD = d;
					mute = e;
				}
			}
			if (mute) {
				const costOk = this.material >= this.silkCost();
				return {
					tower: mute,
					anchor: liveAtFeet,
					standOk: true,
					reachOk: true,
					costOk,
					ready: costOk,
					dist: muteD,
					hint: readyHint(false, true),
				};
			}
			let peer: { x: number; y: number; id: number } | undefined;
			let peerD = Infinity;
			for (const n of this.linkedNodes()) {
				if (n.id === liveAtFeet.id) continue;
				if (this.hasLink(liveAtFeet.id, n.id)) continue;
				const d = Math.hypot(n.x - liveAtFeet.x, n.y - liveAtFeet.y);
				if (d <= SILK_LINK_RANGE && d < peerD) {
					peerD = d;
					peer = n;
				}
			}
			if (peer) {
				const liveTower = this.find(liveAtFeet.id);
				const costOk = this.material >= this.silkCost();
				return {
					tower: liveTower?.kind === "tower" ? liveTower : this.find(peer.id),
					anchor: liveTower?.kind === "tower" ? peer : liveAtFeet,
					standOk: true,
					reachOk: true,
					costOk,
					ready: Boolean(liveTower || this.find(peer.id)) && costOk,
					dist: peerD,
					hint: readyHint(this.nest()?.id === peer.id || this.nest()?.id === liveAtFeet.id, true),
				};
			}
			return {
				...empty,
				hint: `Live node. Raise the next tower inside ${SILK_LINK_RANGE} paces. Q weaves mute posts into this web.`,
			};
		}

		if (mutes.length) return { ...empty, hint: "A mute tower waits. Walk onto the post, then Q — or stand on a live post to pull it in." };
		if (!this.ents.some((e) => e.alive && e.kind === "tower")) {
			return { ...empty, hint: "Raise a tower (B), stand on the post, then Q to splice silk." };
		}
		return empty;
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
		let spd = this.moveSpeed(e);
		e.vx = Math.cos(a) * spd;
		e.vy = Math.sin(a) * spd;
		void dt;
	}
	moveSpeed(e: Ent) {
		let spd = e.speed;
		if (e.winged) spd *= 1.35;
		if (e.evo === "siege") spd *= .72;
		if (e.evo === "tank") spd *= .78;
		if (e.foodMeter < e.foodMax * 0.22) spd *= 0.62;
		if (e.hibernating) spd *= 1.1;
		if (this.foodTrip(e)) spd *= 3;
		return spd;
	}
	foodTrip(e: Ent) {
		if (e.faction !== "spider") return false;
		if (e.caste !== "worker" && e.kind !== "queen") return false;
		if (!this.harvesting(e) && e.evo !== "harvester") return false;
		if (e.haul > 0) return e.meat > 0;
		if (e.job === "scavenge") return false;
		const tgt = e.targetId ? this.find(e.targetId) : undefined;
		return Boolean(tgt && tgt.meat > 0);
	}
	bakeNav() {
		this.nav.clear();
		for (const e of this.ents) {
			if (!e.alive) continue;
			if (e.kind === "tree") this.nav.stampCircle(e.x, e.y, Math.max(34, e.r + 16));
			else if (e.kind === "burrow" || e.kind === "hive") this.nav.stampCircle(e.x, e.y, e.r + 14);
			else if (e.kind === "tower") this.nav.stampCircle(e.x, e.y, e.r + 10);
		}
		this.nav.dirty = false;
		this.routes.clear();
	}
	routeTo(e: Ent, x: number, y: number, dt: number) {
		if (e.winged) {
			this.seek(e, { x, y }, dt);
			this.routes.delete(e.id);
			return;
		}
		if (this.nav.dirty) this.bakeNav();
		let route = this.routes.get(e.id);
		const far = !route || Math.hypot(route.gx - x, route.gy - y) > 28;
		const stale = !route || this.time - route.at > 1.1;
		const empty = !route || route.i >= route.pts.length;
		if (far || stale || empty || !route) {
			const pts = this.nav.path(e.x, e.y, x, y);
			route = { pts, i: 0, gx: x, gy: y, at: this.time };
			this.routes.set(e.id, route);
		}
		this.followRoute(e, route, dt);
	}
	followRoute(e: Ent, route: Route, dt: number) {
		const pts = route.pts;
		if (!pts.length) {
			this.seek(e, { x: route.gx, y: route.gy }, dt);
			return;
		}
		while (route.i < pts.length - 1 && Math.hypot(e.x - pts[route.i].x, e.y - pts[route.i].y) < 20) route.i++;
		while (
			route.i < pts.length - 1 &&
			this.nav.los(e.x, e.y, pts[route.i + 1].x, pts[route.i + 1].y)
		) {
			route.i++;
		}
		const t = pts[Math.min(route.i, pts.length - 1)];
		const last = route.i >= pts.length - 1;
		const d = Math.hypot(t.x - e.x, t.y - e.y) || 1;
		let spd = this.moveSpeed(e);
		if (last && d < 52) spd *= Math.max(0.22, d / 52);
		let fx = (t.x - e.x) / d;
		let fy = (t.y - e.y) / d;
		const shove = this.nav.avoid(e.x, e.y, fx, fy);
		fx += shove.x * 0.7;
		fy += shove.y * 0.7;
		const mag = Math.hypot(fx, fy) || 1;
		fx /= mag;
		fy /= mag;
		e.facing = Math.atan2(fy, fx);
		e.vx = fx * spd;
		e.vy = fy * spd;
		void dt;
	}
	workerPath(id: number) {
		return this.routes.get(id);
	}
	tickHomeRegen(dt: number) {
		this.homeRegen += dt;
		if (this.homeRegen < 2.2) return;
		this.homeRegen = 0;
		for (const e of this.ents) {
			if (!e.alive || !this.yieldKind(e)) continue;
			if (e.site === "unique") continue;
			if (e.site !== "home" && !this.inPerim(e.x, e.y)) continue;
			const cap = Math.max(e.maxHp, 12);
			if (e.kind === "fruit" || e.kind === "node" || e.kind === "pickup" || e.kind === "cocoon" || e.meat > 0 && e.kind === "loot") {
				if (e.meat < cap) e.meat = Math.min(cap, e.meat + this.yieldAmt(4));
			} else if (e.kind === "scrap" || e.kind === "solar" || e.kind === "battery") {
				if (e.haul < cap) e.haul = Math.min(cap, e.haul + this.yieldAmt(3));
			}
		}
	}
	tickDrops(dt: number) {
		this.dropTick += dt;
		if (this.dropTick < this.tune().dropEvery) return;
		this.dropTick = 0;
		this.dropCount += 1;
		const foodFrac = this.cap("food") ? this.food / this.cap("food") : 1;
		const matFrac = this.cap("material") ? this.material / this.cap("material") : 1;
		const wantFood = foodFrac <= matFrac;
		const x = 180 + Math.random() * (WORLD_W - 360);
		const y = 180 + Math.random() * (WORLD_H - 360);
		if (wantFood) {
			this.make("fruit", "none", x, y, { r: 16, hp: 24, maxHp: 24, speed: 0, meat: this.yieldAmt(8), draw: 64 });
			this.pop(x, y, "Forage", "#b7c96a");
		} else {
			this.make("scrap", "none", x, y, { r: 14, hp: 20, maxHp: 20, speed: 0, meat: 0, haul: this.yieldAmt(6), draw: 28 });
			this.pop(x, y, "Scrap", "#c9d0c4");
		}
		this.note(wantFood ? "Fresh forage fell in the woods." : "Scrap broke the soil.");
		for (const e of this.ents) {
			if (!e.alive || e.site !== "unique") continue;
			if (e.unearthed) continue;
			e.drops += 1;
			if (this.dropCount < 4) {
				if (e.meat > 0) e.meat = Math.max(2, e.meat - 3);
				if (e.haul > 0) e.haul = Math.max(2, e.haul - 3);
				e.buried = Math.min(0.88, e.buried + 0.18);
			} else {
				e.buried = Math.min(0.92, Math.max(e.buried, 0.72));
			}
		}
	}
	unearth() {
		const q = this.queen();
		if (!q) return;
		if (this.closestHostile(q, 240)) this.nestAlarm = Math.max(this.nestAlarm, 5);
		for (const e of this.ents) {
			if (!e.alive || e.unearthed) continue;
			if (e.kind !== "solar" && e.kind !== "battery") continue;
			if (Math.hypot(q.x - e.x, q.y - e.y) < 88) {
				e.unearthed = true;
				this.note(e.kind === "solar" ? "A solar plate, half in the dirt." : "A battery, still warm under the soil.");
			}
		}
	}
	zapElectric(dt: number) {
		void dt;
		for (const tw of this.ents) {
			if (!tw.alive || tw.kind !== "tower") continue;
			if (tw.dmg <= 0 && tw.evo !== "electric" && tw.evo !== "siegehold") continue;
			if (!this.silkPowered(tw.id)) continue;
			if (tw.cd > 0) continue;
			const sting = Math.max(4, tw.dmg || 7);
			let hit = false;
			for (const o of this.ents) {
				if (!o.alive || !isHostile("spider", o.faction)) continue;
				if (!COMBAT.includes(o.kind)) continue;
				if (Math.hypot(o.x - tw.x, o.y - tw.y) < tw.r + o.r + 10) {
					this.hit(o, sting, tw, "#b7c96a");
					hit = true;
				}
			}
			for (const l of this.links) {
				if (l.a !== tw.id && l.b !== tw.id) continue;
				const a = this.find(l.a);
				const b = this.find(l.b);
				if (!a || !b) continue;
				for (const o of this.ents) {
					if (!o.alive || !isHostile("spider", o.faction) || !COMBAT.includes(o.kind)) continue;
					if (this.distToSeg(o.x, o.y, a.x, a.y, b.x, b.y) < 12) {
						this.hit(o, Math.max(3, sting * 0.7), tw, "#e8ebe4");
						hit = true;
					}
				}
			}
			if (hit) tw.cd = 0.45;
		}
	}
	distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
		const abx = bx - ax;
		const aby = by - ay;
		const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / ((abx * abx + aby * aby) || 1)));
		return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
	}
	threat() {
		const n = this.nest();
		if (n) {
			const atNest = this.closestHostile(n, NEST_PERIM + 50);
			if (atNest) return atNest;
		}
		const q = this.queen();
		if (q) {
			const seen = this.closestHostile(q, 240);
			if (seen) return seen;
		}
		if (this.nestAlarm > 0 && n) {
			const any = this.closestHostile(n, 520);
			if (any) return any;
		}
		return this.alertTarget();
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
		this.nestAlarm = Math.max(0, this.nestAlarm - dt);
		this.tickDrops(dt);
		this.tickHomeRegen(dt);
		this.unearth();
		this.zapElectric(dt);
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
			if (e.kind !== "shot" && e.kind !== "nest" && e.kind !== "tree" && e.kind !== "burrow" && e.kind !== "hive" && e.kind !== "tower" && e.kind !== "node" && e.kind !== "fruit" && e.kind !== "solar" && e.kind !== "battery" && e.kind !== "loot" && e.kind !== "scrap") {
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
		for (const id of [...this.routes.keys()]) {
			if (!this.find(id)) this.routes.delete(id);
		}
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
				this.gainFood(this.yieldAmt(14));
				this.gainMat(this.yieldAmt(10));
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
			const sleepers = this.ents.filter((e) => e.alive && e.hibernating && e.faction === "spider");
			sleepers.sort((a, b) => this.unitUpkeep(a) - this.unitUpkeep(b));
			if (sleepers[0] && this.food > need * 4) {
				sleepers[0].hibernating = false;
				if (sleepers[0].job === "hibernate") sleepers[0].job = sleepers[0].caste === "worker" ? "none" : "rove";
			}
		} else {
			this.food = Math.max(0, this.food - need * 0.2);
			const extras = this.ents.filter((e) => e.alive && e.faction === "spider" && e.kind === "brood" && !e.hibernating && e.caste !== "worker");
			extras.sort((a, b) => this.unitUpkeep(b) - this.unitUpkeep(a));
			const e = extras[0];
			if (e) {
				e.hibernating = true;
				e.job = "hibernate";
				this.note("Stores run thin. The hungriest brood sleeps in the hollow.");
			} else if (this.food < need * 3) {
				this.note("Larder is thin. Harvest, or the army will starve into sleep.");
			}
		}
		this.tickHunger();
	}
	hungerDrain(e: Ent) {
		let d = 0.4;
		if (e.kind === "queen") d = 0.55;
		else if (e.caste === "worker") d = e.evo === "harvester" ? 0.38 : 0.32;
		else if (e.caste === "defender") d = 0.42;
		else if (e.evo === "tank" || e.evo === "siege") d = 0.62;
		else if (e.caste === "attacker") d = 0.48;
		if (e.winged) d += 0.1;
		return d;
	}
	nestBound(e: Ent) {
		if (e.kind === "queen") return false;
		if (e.caste === "defender") return true;
		if (e.caste === "worker" && (e.job === "none" || e.job === "build" || e.job === "guard")) return true;
		if (e.caste === "attacker" && (e.job === "guard" || e.garrisonId)) return true;
		return false;
	}
	atNest(e: Ent) {
		const n = this.nest();
		return Boolean(n && Math.hypot(e.x - n.x, e.y - n.y) < FEED_NEST_R);
	}
	needsFeed(e: Ent) {
		return e.foodMax > 0 && e.foodMeter < e.foodMax * 0.42;
	}
	starving(e: Ent) {
		return e.foodMax > 0 && e.foodMeter < e.foodMax * 0.16;
	}
	canEatKill(e: Ent) {
		if (this.nestBound(e) && this.inPerim(e.x, e.y)) return false;
		return true;
	}
	tickHunger() {
		for (const e of this.ents) {
			if (!e.alive || e.faction !== "spider") continue;
			if (e.kind !== "brood" && e.kind !== "queen") continue;
			if (e.hibernating) {
				if (this.atNest(e)) this.sipNest(e);
				if (e.foodMeter > e.foodMax * 0.55) {
					e.hibernating = false;
					if (e.job === "hibernate") e.job = e.caste === "worker" ? "none" : e.caste === "defender" ? "guard" : "rove";
				}
				continue;
			}
			if (e.stage === "chrysalis") continue;
			e.foodMeter = Math.max(0, e.foodMeter - this.hungerDrain(e));
			if (e.foodMeter <= 0 && e.kind === "brood") {
				e.hibernating = true;
				e.job = "hibernate";
				this.note("A brood starved and crawled home to sleep.");
			}
			if (this.atNest(e) && e.foodMeter < e.foodMax) this.sipNest(e);
		}
	}
	sipNest(e: Ent) {
		if (!this.atNest(e) || e.foodMeter >= e.foodMax - 0.5) return false;
		if (this.food < 1) return false;
		this.food -= 1;
		e.foodMeter = Math.min(e.foodMax, e.foodMeter + 16);
		this.pop(e.x, e.y - 18, "Feed", "#c9a227");
		return true;
	}
	eatKill(e: Ent, meat: Ent) {
		if (!meat.alive || (meat.kind !== "pickup" && meat.kind !== "cocoon")) return false;
		if (!this.canEatKill(e)) return false;
		const need = e.foodMax - e.foodMeter;
		if (need <= 0.5) return false;
		const bite = Math.min(need, Math.max(8, meat.meat * 10));
		e.foodMeter = Math.min(e.foodMax, e.foodMeter + bite);
		meat.meat -= Math.max(1, Math.round(bite / 10));
		this.pop(e.x, e.y - 16, "Feed", "#c9a227");
		this.audio?.deposit();
		if (meat.meat <= 0) meat.alive = false;
		return true;
	}
	closestKill(e: Ent) {
		let best: Ent | undefined;
		let bd = Infinity;
		for (const o of this.ents) {
			if (!o.alive || o.kind !== "pickup" && o.kind !== "cocoon") continue;
			if ((o.meat || 0) <= 0) continue;
			const d = dist2(e, o);
			if (d < bd) {
				bd = d;
				best = o;
			}
		}
		return best;
	}
	playerLed(e: Ent) {
		return this.selectedIds.includes(e.id) || e.id === this.selectedId;
	}
	haulCap(e: Ent, food = true) {
		const g = this.tune().gather;
		const workerAmt = food ? g * 3 : g * 5;
		if (e.kind === "queen") return workerAmt * 5;
		return workerAmt + (e.transCap > 0 ? 4 : 0);
	}
	seekFeed(e: Ent, dt: number) {
		if (!this.needsFeed(e) || e.hibernating || e.stage === "chrysalis") return false;
		if (this.playerLed(e)) return false;
		if (e.job === "hold" || e.job === "follow" || this.harvesting(e) || e.job === "rove" || e.job === "build") return false;
		if (this.canEatKill(e)) {
			const kill = this.closestKill(e);
			if (kill) {
				if (Math.hypot(e.x - kill.x, e.y - kill.y) < e.r + kill.r + 10) this.eatKill(e, kill);
				else this.seek(e, kill, dt);
				return true;
			}
		}
		if (this.nestBound(e) || this.starving(e)) {
			const n = this.nest();
			if (!n) return false;
			if (this.atNest(e)) {
				this.hold(e, dt);
				return true;
			}
			this.seek(e, n, dt);
			return true;
		}
		return false;
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
		if (!q) return;
		if (this.view === "nest" || this.view === "hive") {
			this.view = "world";
			return;
		}
		const hive = this.ents.find((e) => e.alive && e.kind === "hive" && Math.hypot(q.x - e.x, q.y - e.y) < 90);
		if (hive && this.hiveOpen(hive)) {
			this.selectedId = hive.id;
			this.enterSelectedHive();
			return;
		}
		if (!n) return;
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
		if (!this.spendFood(cost)) {
			this.note(kind === "worker" ? "Need 3 food for a worker egg." : "Not enough food.");
			return;
		}
		const hatch = this.room("hatchery");
		if (hatch) hatch.stored += 1;
		this.make("egg", "spider", n.x + (Math.random() - .5) * 50, n.y + 30 + (Math.random() - .5) * 40, {
			r: 14,
			hp: 20,
			maxHp: 20,
			speed: 0,
			ttl: kind === "worker" ? 3.2 : kind === "defender" ? 4.2 : this.tune().hatch + (kind === "queen" ? 6 : 0),
			draw: 44,
			caste: kind === "queen" ? "queen" : kind,
			role: kind
		});
		this.note(kind === "queen" ? "A queen egg rests in the chamber." : `A ${kind} egg is nested.`);
	}
	tryBuildTower() {
		const b = this.selectedBuilder();
		if (!b) {
			this.note("Select a builder or the queen, then raise a post.");
			return;
		}
		const cost = this.towerCost();
		if (!this.spendMat(cost)) {
			this.note(`Need ${cost} material. Only builders spend material.`);
			return;
		}
		const facing = b.facing || 0;
		this.make("tower", "spider", b.x + Math.cos(facing) * 46, b.y + Math.sin(facing) * 46, {
			r: 18,
			hp: 80,
			maxHp: 80,
			speed: 0,
			draw: 78,
			linked: false,
			evo: "none",
		});
		b.skill += 1;
		if (b.kind === "queen") b.job = "hold";
		else b.job = "build";
		this.note("Builder raises a mute post. Any queen can silk it online.");
		this.bakeNav();
		this.pop(b.x, b.y - 24, "Tower", "#e8ebe4");
	}
	isBuilder(e: Ent) {
		return e.caste === "worker" && (e.evo === "builder" || e.evo === "engineer");
	}
	harvesting(e: Ent) {
		return e.job === "harvest" || e.job === "forage" || e.job === "scavenge";
	}
	harvestWant(e: Ent): "food" | "mat" | "any" {
		if (e.job === "forage") return "food";
		if (e.job === "scavenge") return "mat";
		return "any";
	}
	unitKey(e: Ent) {
		const duty = e.job === "scavenge" ? "m" : e.job === "forage" || e.job === "harvest" ? "f" : e.job === "build" ? "b" : "-";
		if (e.kind === "queen") return `queen:${e.evo}:${duty}:${e.winged ? "w" : "-"}`;
		return `${e.caste}:${e.evo}:${duty}:${e.winged ? "w" : "-"}`;
	}
	unitGroupLabel(e: Ent) {
		if (e.kind === "queen") return e.stage === "adolescent" ? "Princess" : "Queen";
		if (e.evo === "harvester") return e.job === "scavenge" ? "Scrap crew" : "Foragers";
		if (e.evo === "engineer") return "Engineers";
		if (e.evo === "builder") return "Builders";
		if (e.evo === "tank") return "Tanks";
		if (e.evo === "siege") return "Siege";
		if (e.caste === "attacker") return e.winged ? "Air attackers" : "Attackers";
		if (e.caste === "defender") return "Defenders";
		return "Workers";
	}
	toggleGroup(key: string, mode: "one" | "some" | "all" | "none" | "cycle" = "cycle") {
		const members = this.ents.filter((e) => e.alive && e.faction === "spider" && (e.kind === "brood" || e.kind === "queen" && e.stage === "adult") && this.unitKey(e) === key);
		if (!members.length) return;
		const n = members.filter((e) => this.selectedIds.includes(e.id) || e.id === this.selectedId).length;
		const total = members.length;
		const some = Math.max(1, Math.ceil(total / 2));
		let want = n;
		if (mode === "cycle") {
			if (n <= 0) want = 1;
			else if (n < some && some !== 1) want = some;
			else if (n < total) want = total;
			else want = 0;
		} else if (mode === "none") want = 0;
		else if (mode === "one") want = 1;
		else if (mode === "some") want = some;
		else want = total;
		const ranked = [...members].sort((a, b) => {
			const as = this.selectedIds.includes(a.id) ? 0 : 1;
			const bs = this.selectedIds.includes(b.id) ? 0 : 1;
			if (want > n) {
				const ai = a.job === "none" || a.job === "hold" ? 0 : 1;
				const bi = b.job === "none" || b.job === "hold" ? 0 : 1;
				return ai - bi || as - bs;
			}
			return as - bs;
		});
		const keep = new Set(ranked.slice(0, want).map((e) => e.id));
		this.selectedIds = this.selectedIds.filter((id) => !members.some((m) => m.id === id)).concat([...keep]);
		this.selectedId = this.selectedIds[this.selectedIds.length - 1] ?? 0;
		this.marking = false;
	}
	fortifyCost(tw: Ent) {
		return this.matPrice(3 + tw.evoHp * 2);
	}
	tryRemoveTower() {
		const builder = this.selection().find((e) => this.isBuilder(e))
			?? this.ents.find((e) => e.alive && this.isBuilder(e) && e.job !== "hold")
			?? this.ents.find((e) => e.alive && this.isBuilder(e));
		if (!builder) {
			this.note("Need a builder to pull a post.");
			return;
		}
		let tw = this.selection().find((e) => e.kind === "tower");
		if (!tw) tw = this.find(this.selectedId)?.kind === "tower" ? this.find(this.selectedId) : undefined;
		if (!tw) {
			let best = Infinity;
			for (const e of this.ents) {
				if (!e.alive || e.kind !== "tower") continue;
				const d = dist2(builder, e);
				if (d < best) {
					best = d;
					tw = e;
				}
			}
		}
		if (!tw) {
			this.note("No tower to pull.");
			return;
		}
		const refund = Math.max(1, Math.floor(this.towerCost() / 2 + tw.evoHp * 2));
		this.gainMat(refund);
		tw.alive = false;
		this.pruneSilk();
		this.bakeNav();
		this.pop(tw.x, tw.y - 20, `+${refund}m`, "#e8ebe4");
		this.note("The post is pulled. Silk that hung from it goes dark.");
	}
	holdBuilders() {
		let n = 0;
		for (const e of this.ents) {
			if (!e.alive || !this.isBuilder(e)) continue;
			e.job = "hold";
			this.routes.delete(e.id);
			n++;
		}
		this.marking = false;
		this.note(n ? `${n} builders hold. Repairs and upgrades pause.` : "No builders to hold.");
	}
	fortifyTower(tw: Ent, who: Ent) {
		const cost = this.fortifyCost(tw);
		if (!this.spendMat(cost)) return false;
		tw.evoHp += 1;
		tw.maxHp += 40;
		tw.hp += 40;
		tw.dmg = Math.max(tw.dmg, 4) + 3;
		tw.draw += 4;
		who.skill += 1;
		this.pop(tw.x, tw.y - 22, "Fortify", "#b7c96a");
		this.note("Engineer hardens the post. It bites anything that strikes it or walks the silk.");
		return true;
	}
	selectedBuilder() {
		for (const id of this.selectedIds.length ? this.selectedIds : [this.selectedId]) {
			const e = this.find(id);
			if (e && e.alive && this.isBuilder(e)) return e;
			if (e && e.alive && e.kind === "queen") return e;
		}
		return this.ents.find((e) => e.alive && this.isBuilder(e) && e.job === "build");
	}
	bestBuilderSkill() {
		let s = 0;
		for (const e of this.ents) if (e.alive && this.isBuilder(e)) s = Math.max(s, e.skill);
		return s;
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
		if (!tower.alive || tower.kind !== "tower") return;
		if (tower.id === anchor.id) return;
		if (this.hasLink(tower.id, anchor.id)) return;
		if (who === "queen") this.spendMat(this.silkCost());
		tower.linked = true;
		const other = this.find(anchor.id);
		if (other && other.kind === "tower") other.linked = true;
		this.links.push({ a: anchor.id, b: tower.id });
		const toNest = this.nest()?.id === anchor.id;
		this.note(
			who === "teen"
				? toNest
					? "A princess splices the tower to the hollow. Defenders hear the ring."
					: "A princess stretches the net. Air will answer this ring."
				: toNest
					? "Silk sings to the hollow. Nest defenders will answer this tower."
					: "Silk knits tower to tower. Alerts and harvest orders ride the web.",
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
	assignWorker(kind: "harvester" | "forage" | "scavenge" | "builder") {
		const targets = this.selection().filter((e) => e.kind === "queen" || e.caste === "worker");
		if (!targets.length) {
			this.note("Select the queen or a worker first.");
			return;
		}
		const harvest = kind === "harvester" || kind === "forage" || kind === "scavenge";
		for (const e of targets) {
			if (e.hibernating) continue;
			if (harvest) {
				if (this.isBuilder(e)) continue;
				if (e.caste === "worker" && e.evo !== "harvester") {
					e.evo = "harvester";
					e.evoSpd += 1;
					e.foodMax += 20;
					e.speed += 10;
				}
				e.job = kind === "scavenge" ? "scavenge" : "forage";
				e.assignR = 0;
			} else {
				if (e.caste === "worker" && e.evo !== "builder" && e.evo !== "engineer") {
					e.evo = "builder";
					e.maxHp += 10;
					e.hp += 10;
				}
				e.job = e.kind === "queen" ? "hold" : "build";
				e.assignR = 0;
			}
		}
		this.marking = false;
		this.note(
			kind === "scavenge"
				? "Scrap crew. They pull material in the silk ring the moment it shows."
				: harvest
					? "Foragers. They pull food in the silk ring the moment it shows."
					: "Building. They repair, and engineers fortify, until you Hold them.",
		);
	}
	assignAttacker(job: Job) {
		this.assignDuty(job);
	}
	assignHold() {
		const targets = this.selection().filter((e) => e.alive && e.faction === "spider" && (e.kind === "brood" || e.kind === "queen"));
		if (!targets.length) {
			this.note("Toggle a unit in Assign, then Hold.");
			return;
		}
		for (const e of targets) {
			if (e.hibernating) continue;
			e.job = "hold";
			this.routes.delete(e.id);
		}
		this.marking = false;
		this.note("Holding. They will not walk home until you order them.");
	}
	assignDuty(job: Job) {
		const targets = this.selection().filter((e) => e.kind === "queen" || e.caste === "attacker" || e.caste === "defender");
		if (!targets.length) {
			this.note("Select the queen, an attacker, or a defender.");
			return;
		}
		for (const e of targets) e.job = job;
		this.marking = false;
		this.note(job === "follow" ? "They attend the queen." : job === "guard" ? "They hold the nest." : "They hunt.");
	}
	queenHarvestSelected() {
		const res = this.find(this.selectedId);
		const q = this.queen();
		if (!q || !res || !this.isResource(res)) {
			this.note("Select forage first.");
			return;
		}
		q.job = res.meat > 0 ? "forage" : "scavenge";
		q.assignX = res.x;
		q.assignY = res.y;
		q.assignR = 80;
		q.targetId = res.id;
		this.note(res.meat > 0 ? "The queen walks the fruit." : "The queen hauls scrap.");
	}
	beginMarkHarvest() {
		const e = this.selection().find((s) => s.kind === "queen" || s.caste === "worker");
		if (!e) {
			this.note("Select the queen or a harvester, then mark a patch.");
			return;
		}
		if (e.caste === "worker" && e.evo !== "harvester" && !this.harvesting(e)) {
			e.evo = "harvester";
			e.job = "forage";
		} else if (e.kind === "queen" && !this.harvesting(e)) e.job = "forage";
		this.marking = true;
		this.note("Click the woods. They will harvest that patch and walk it home.");
	}
	clearMark() {
		this.marking = false;
	}
	selectOnly(id: number) {
		this.selectedId = id;
		this.selectedIds = id ? [id] : [];
		this.marking = false;
	}
	toggleUnit(id: number) {
		if (this.selectedIds.includes(id)) {
			this.selectedIds = this.selectedIds.filter((x) => x !== id);
			this.selectedId = this.selectedIds[this.selectedIds.length - 1] ?? 0;
		} else {
			this.selectedIds = [...this.selectedIds, id];
			this.selectedId = id;
		}
		this.marking = false;
	}
	selection() {
		const ids = this.selectedIds.length ? this.selectedIds : this.selectedId ? [this.selectedId] : [];
		return ids.map((id) => this.find(id)).filter((e): e is Ent => Boolean(e));
	}
	harvestersOf(list: Ent[]) {
		return list.filter((e) => e.alive && (e.kind === "queen" || e.caste === "worker" && !this.isBuilder(e)));
	}
	sendHarvest(crew: Ent[], res: Ent) {
		for (const e of crew) {
			if (e.caste === "worker" && e.evo !== "harvester") {
				e.evo = "harvester";
				e.evoSpd += 1;
				e.foodMax += 20;
				e.speed += 10;
			}
			e.job = res.meat > 0 ? "forage" : "scavenge";
			e.assignX = res.x;
			e.assignY = res.y;
			e.assignR = Math.max(90, HARVEST_R);
			e.targetId = res.id;
			e.haul = 0;
		}
		this.marking = false;
		this.note(res.meat > 0 ? "Foragers take the fruit." : "Scrap crew takes the haul.");
		this.pop(res.x, res.y - 24, res.meat > 0 ? "Food" : "Scrap", "#b7c96a");
	}
	deselect() {
		this.selectedId = 0;
		this.selectedIds = [];
		this.marking = false;
	}
	clickWorld(x: number, y: number) {
		if (this.view === "nest") return;
		if (this.view === "hive") {
			this.clickHive(x, y);
			return;
		}
		if (this.marking) {
			const crew = this.harvestersOf(this.selection());
			const e = crew[0] ?? this.selection().find((s) => s.kind === "queen" || s.caste === "worker");
			if (e) {
				for (const w of crew.length ? crew : [e]) {
					if (w.caste === "worker" && w.evo !== "harvester") {
						w.evo = "harvester";
					}
					w.job = w.job === "scavenge" ? "scavenge" : "forage";
					w.assignX = x;
					w.assignY = y;
					w.assignR = HARVEST_R;
					w.targetId = 0;
				}
				this.marking = false;
				this.note("Harvest marked. They walk the patch and bring it home.");
				this.pop(x, y, "Harvest", "#b7c96a");
				return;
			}
			this.marking = false;
		}
		const hit = this.pickClick(x, y);
		if (hit && this.isResource(hit)) {
			let crew = this.harvestersOf(this.selection());
			if (!crew.length) {
				const q = this.queen();
				if (q) crew = [q];
			}
			if (crew.length) {
				this.sendHarvest(crew, hit);
				if (!this.selection().some((e) => e.kind === "queen" || e.caste === "worker")) this.selectOnly(crew[0].id);
				return;
			}
			this.selectOnly(hit.id);
			return;
		}
		if (hit && (hit.kind === "brood" || hit.kind === "queen" || hit.kind === "tower" || hit.kind === "hive" || hit.kind === "nest")) {
			this.selectOnly(hit.id);
			if (hit.kind === "hive" && this.hiveOpen(hit)) this.note("Hive stands empty. Enter to take what they stored.");
			return;
		}
	}
	pickClick(x: number, y: number) {
		let best: Ent | undefined;
		let bestScore = Infinity;
		for (const e of this.ents) {
			if (!e.alive) continue;
			const resource = this.isResource(e);
			const unit = e.faction === "spider" && (e.kind === "brood" || e.kind === "queen");
			const nest = e.kind === "nest";
			const tower = e.kind === "tower";
			const hive = e.kind === "hive";
			if (!resource && !unit && !nest && !tower && !hive) continue;
			const visY = resource && (e.kind === "fruit" || e.kind === "node") ? e.y - e.draw * 0.32 : e.y;
			const reach = e.kind === "brood"
				? Math.max(e.draw * 0.7, e.r + 56)
				: unit
					? e.r + 46
					: resource
						? Math.max(e.r + 48, e.draw * 0.55)
						: nest
							? 28
							: e.r + 18;
			const d = Math.hypot(e.x - x, visY - y);
			if (d > reach) continue;
			let score = d;
			if (e.kind === "brood") score -= 90;
			else if (e.kind === "queen") score -= 20;
			else if (resource) score -= 10;
			else if (tower) score += 8;
			else if (hive) score += 14;
			else if (nest) score += 120;
			if (score < bestScore) {
				bestScore = score;
				best = e;
			}
		}
		return best;
	}
	clickHive(nx: number, ny: number) {
		const h = this.find(this.hiveId);
		if (!h) return;
		const loot = this.ents.filter((e) => e.alive && e.kind === "loot" && e.site === h.site);
		if (!loot.length) {
			this.deselect();
			return;
		}
		let best = loot[0];
		let bd = 9;
		loot.forEach((e, i) => {
			const x = 0.34 + i * 0.32;
			const y = 0.5;
			const d = (x - nx) ** 2 + (y - ny) ** 2;
			if (d < bd) {
				bd = d;
				best = e;
			}
		});
		if (bd < 0.08) this.selectOnly(best.id);
		else this.deselect();
	}
	evolveSelected(evo: Evo) {
		const targets = this.selection().filter((e) => e.alive && e.faction === "spider" && (e.kind === "brood" || e.kind === "queen"));
		if (!targets.length) {
			this.note("Toggle a brood in Assign, then pick an evo.");
			return;
		}
		let n = 0;
		for (const e of targets) {
			if (this.tryEvo(e, evo)) n++;
		}
		if (!n) this.note("None of the toggled brood can take that evo.");
		else this.note(n === 1 ? "The chrysalis begins." : `${n} brood take that path.`);
	}
	tryEvo(e: Ent, evo: Evo) {
		if (e.stage === "chrysalis") return false;
		const opt = this.evoFor(e).find((o) => o.id === evo);
		if (!opt) return false;
		if (this.food < opt.costF || this.material < opt.costM) {
			this.note("The chrysalis needs more stores.");
			return false;
		}
		this.spendFood(opt.costF);
		this.spendMat(opt.costM);
		if (e.kind === "queen") {
			e.evo = evo;
			if (evo === "air") {
				e.winged = true;
				e.speed += 28;
			}
			if (evo === "melee") {
				e.evoBite += 1;
				e.dmg += 5;
				e.speed += 8;
			}
			if (evo === "tank") {
				e.evoHp += 1;
				e.maxHp += 40;
				e.hp += 40;
			}
			this.pop(e.x, e.y, opt.label, "#b7c96a");
			return true;
		}
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
			e.job = "forage";
			if (e.winged) this.grantTransporters();
		}
		if (evo === "builder") {
			e.job = "build";
			e.maxHp += 10;
			if (e.winged) this.grantTransporters();
		}
		if (evo === "engineer") {
			e.job = "build";
			e.maxHp += 16;
			e.hp += 16;
			e.skill += 1;
			e.draw += 4;
		}
		this.pop(e.x, e.y, opt.label, "#b7c96a");
		return true;
	}
	grantTransporters() {
		const builders = this.ents.filter((e) => e.alive && e.caste === "worker" && this.isBuilder(e) && e.winged);
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
		if (e.kind === "queen" && e.stage === "adult") {
			const out = [];
			if (e.evoBite < 2) out.push({ id: "melee", label: "Fangs", costF: this.foodPrice(8), costM: 0 });
			if (e.evoHp < 2) out.push({ id: "tank", label: "Carapace", costF: this.foodPrice(10), costM: 0 });
			if (!e.winged) out.push({ id: "air", label: "Wings", costF: this.foodPrice(12), costM: 0 });
			return out;
		}
		if (e.caste === "worker") {
			const out = [];
			if (e.evo !== "builder" && e.evo !== "engineer") out.push({
				id: "builder",
				label: "Builder",
				costF: 0,
				costM: 0
			});
			if (e.evo !== "harvester" && e.evo !== "engineer") out.push({
				id: "harvester",
				label: "Harvester",
				costF: 0,
				costM: 0
			});
			if (e.evo === "builder") out.push({
				id: "engineer",
				label: "Engineer",
				costF: this.foodPrice(6),
				costM: this.matPrice(4),
			});
			if (!e.winged) out.push({
				id: "air",
				label: "Wings",
				costF: this.foodPrice(6),
				costM: 0
			});
			return out;
		}
		const out = [];
		if (e.evo === "biter" || e.evo === "melee") out.push({
			id: "melee",
			label: "Melee fangs",
			costF: this.foodPrice(8),
			costM: 0
		});
		if (e.caste === "defender" && e.evo !== "tank") out.push({
			id: "tank",
			label: "Tank",
			costF: this.foodPrice(10),
			costM: 0
		});
		if (e.caste === "attacker" && e.evo !== "siege") out.push({
			id: "siege",
			label: "Siege",
			costF: this.foodPrice(10),
			costM: 0
		});
		if (e.caste === "attacker" && !e.winged) out.push({
			id: "air",
			label: "Wings",
			costF: this.foodPrice(10),
			costM: 0
		});
		if (e.evo === "tank") out.push({
			id: "tank",
			label: "Armor / splash",
			costF: this.foodPrice(8),
			costM: 0
		});
		if (e.evo === "siege" || e.winged && e.caste === "attacker") out.push({
			id: "siege",
			label: "Heavy / sniper",
			costF: this.foodPrice(10),
			costM: 0
		});
		return out;
	}
	opt(id: string, label: string, group: CommandOpt["group"], enabled: boolean, reason: string, costF = 0, costM = 0): CommandOpt {
		return { id, label, group, enabled, reason, costF, costM };
	}
	harvesterRoster(): { id: number; label: string; busy: boolean }[] {
		return this.ents
			.filter((e) => e.alive && e.caste === "worker")
			.map((e) => ({
				id: e.id,
				label: e.evo === "harvester" ? `Harvester ${e.id}` : e.evo === "engineer" ? `Engineer ${e.id}` : e.evo === "builder" ? `Builder ${e.id}` : `Worker ${e.id}`,
				busy: this.harvesting(e) && (e.assignR > 0 || e.haul > 0) || this.isBuilder(e) && e.job === "build",
			}));
	}
	commandsForSelection() {
		const list = this.selection().filter((e) => e.alive && e.faction === "spider" && (e.kind === "brood" || e.kind === "queen"));
		if (!list.length) return [] as CommandOpt[];
		const caste = list.every((e) => e.caste === list[0].caste) ? list[0].caste : "";
		if (!caste) {
			const out: CommandOpt[] = [];
			if (list.some((e) => e.kind === "queen" || e.caste === "worker")) {
				out.push(this.opt("hold", "Hold", "order", true, ""));
				out.push(this.opt("harvest-food", "Harvest food", "order", true, ""));
				out.push(this.opt("harvest-mat", "Harvest scrap", "order", true, ""));
				out.push(this.opt("builder", "Build", "order", true, ""));
				out.push(this.opt("hold-builders", "Hold builders", "order", true, ""));
				out.push(this.opt("remove-tower", "Pull tower", "build", this.ents.some((t) => t.alive && t.kind === "tower"), "No towers to pull."));
			}
			if (list.some((e) => e.kind === "queen" || e.caste === "attacker" || e.caste === "defender")) {
				out.push(this.opt("hold", "Hold", "order", true, ""));
				out.push(this.opt("guard", "Defend", "order", true, ""));
				out.push(this.opt("rove", "Attack", "order", true, ""));
				out.push(this.opt("follow", "Follow", "order", true, ""));
			}
			return out;
		}
		return this.commandsFor(list[0]);
	}
	commandsFor(e: Ent): CommandOpt[] {
		const q = this.queen();
		const n = this.nest();
		const atNest = Boolean(q && n && Math.hypot(q.x - n.x, q.y - n.y) < 170);
		const food = this.food;
		const mat = this.material;
		const broodFull = this.allyCount() >= this.broodMax();
		if (this.isResource(e)) {
			const out: CommandOpt[] = [];
			const q = this.queen();
			out.push(this.opt(
				"queen-harvest",
				"Queen harvests",
				"order",
				Boolean(q),
				q ? "" : "No queen.",
			));
			if (!this.ents.some((w) => w.alive && w.caste === "worker")) {
				out.push(this.opt(
					"lay-worker",
					"Lay worker",
					"order",
					atNest && food >= this.workerCost() && !broodFull,
					!atNest ? "Return to the hollow to lay." : broodFull ? "Hatchery is full." : food < this.workerCost() ? `Need ${this.workerCost()} food.` : "",
					this.workerCost(),
					0,
				));
			} else {
				for (const w of this.harvesterRoster()) {
					out.push(this.opt(
						`assign:${w.id}`,
						w.busy ? `${w.label} · working` : `Send ${w.label}`,
						"roster",
						!w.busy || w.label.startsWith("Harvester") || w.label.startsWith("Worker"),
						w.busy && w.label.startsWith("Builder") ? "Builder is on a post." : "",
					));
				}
			}
			return out;
		}
		if (e.kind === "tower") {
			const live = this.silkPowered(e.id);
			const costE = this.electricCost();
			const costS = this.siegeholdCost();
			const skill = this.bestBuilderSkill();
			const hasBuilder = Boolean(this.ents.find((w) => w.alive && this.isBuilder(w)));
			const out: CommandOpt[] = [
					this.opt(
						"electric",
						"Electric evo",
						"build",
						live && e.evo !== "electric" && e.evo !== "siegehold" && mat >= costE,
						!live ? "Silk the post to the net first." : e.evo === "electric" || e.evo === "siegehold" ? "Already evolved." : `Need ${costE} material.`,
						0,
						costE,
					),
					this.opt(
						"siegehold",
						"Siege nest",
						"build",
						live && e.evo === "electric" && skill >= 3 && mat >= costS,
						skill < 3 ? "A builder must reach skill 3 (raise and repair posts)." : e.evo !== "electric" ? "Evolve electric first." : !live ? "Silk the post online." : `Need ${costS} material.`,
						0,
						costS,
					),
					this.opt(
						"garrison",
						"Assign siege",
						"order",
						e.evo === "siegehold" && Boolean(this.ents.find((a) => a.alive && a.caste === "attacker")),
						e.evo !== "siegehold" ? "Upgrade to a siege nest first." : "No attackers to station.",
					),
					this.opt(
						"remove-tower",
						"Pull tower",
						"build",
						hasBuilder,
						hasBuilder ? "" : "Need a builder to pull the post.",
					),
				];
				return out;
		}
		if (e.kind === "hive") {
			const open = this.hiveOpen(e);
			return [
				this.opt("enter-hive", "Enter hive", "order", open, open ? "" : "Defenders still hold this nest."),
			];
		}
		if (e.kind === "nest") {
			return [
				this.opt("lay-worker", "Lay worker", "order", atNest && food >= this.workerCost() && !broodFull, !atNest ? "Queen must be at the hollow." : broodFull ? "Hatchery is full." : `Need ${this.workerCost()} food.`, this.workerCost(), 0),
				this.opt("lay-defender", "Lay defender", "order", atNest && food >= this.defendCost() && !broodFull, !atNest ? "Queen must be at the hollow." : broodFull ? "Hatchery is full." : `Need ${this.defendCost()} food.`, this.defendCost(), 0),
			];
		}
		if (e.kind === "queen" && e.stage === "adult") {
			const out: CommandOpt[] = [
				this.opt("hold", "Hold", "order", true, ""),
				this.opt("harvest-food", "Harvest food", "order", true, ""),
				this.opt("harvest-mat", "Harvest scrap", "order", true, ""),
				this.opt("builder", "Build", "order", true, ""),
				this.opt("hold-builders", "Hold builders", "order", true, ""),
				this.opt("guard", "Defend", "order", true, ""),
				this.opt("rove", "Attack", "order", true, ""),
				this.opt("mark", "Mark patch", "order", true, ""),
				this.opt(
					"raise-tower",
					"Raise tower",
					"build",
					mat >= this.towerCost(),
					mat >= this.towerCost() ? "" : `Need ${this.towerCost()} material.`,
					0,
					this.towerCost(),
				),
				this.opt("lay-worker", "Lay worker", "order", atNest && food >= this.workerCost() && !broodFull, !atNest ? "Queen must be at the hollow." : broodFull ? "Hatchery is full." : `Need ${this.workerCost()} food.`, this.workerCost(), 0),
				this.opt("lay-defender", "Lay defender", "order", atNest && food >= this.defendCost() && !broodFull, !atNest ? "Queen must be at the hollow." : broodFull ? "Hatchery is full." : `Need ${this.defendCost()} food.`, this.defendCost(), 0),
				this.opt("lay-attacker", "Lay attacker", "order", atNest && food >= this.attackCost() && !broodFull, !atNest ? "Queen must be at the hollow." : broodFull ? "Hatchery is full." : `Need ${this.attackCost()} food.`, this.attackCost(), 0),
				this.opt("below", "Go below", "order", atNest || this.view === "nest", "Stand at the hollow."),
			];
			for (const ev of this.evoFor(e)) {
				const ok = food >= ev.costF && mat >= ev.costM;
				out.push(this.opt(`evo:${ev.id}`, ev.label, "evo", ok, ok ? "" : `Need ${ev.costF} food.`, ev.costF, ev.costM));
			}
			return out;
		}
		if (e.caste === "worker") {
			const out: CommandOpt[] = [
				this.opt("hold", "Hold", "order", true, ""),
				this.opt("harvest-food", "Harvest food", "order", !this.isBuilder(e), this.isBuilder(e) ? "This brood builds." : ""),
				this.opt("harvest-mat", "Harvest scrap", "order", !this.isBuilder(e), this.isBuilder(e) ? "This brood builds." : ""),
				this.opt("builder", "Builder", "order", true, ""),
				this.opt("hold-builders", "Hold builders", "order", this.isBuilder(e) || e.kind === "queen", "Toggle builders first."),
				this.opt("mark", "Mark patch", "order", this.harvesting(e) || e.evo === "harvester", "Assign a harvest crew first."),
				this.opt(
					"raise-tower",
					"Raise tower",
					"build",
					this.isBuilder(e) && mat >= this.towerCost(),
					!this.isBuilder(e) ? "Assign as builder first." : `Need ${this.towerCost()} material.`,
					0,
					this.towerCost(),
				),
				this.opt(
					"remove-tower",
					"Pull tower",
					"build",
					this.isBuilder(e) && this.ents.some((t) => t.alive && t.kind === "tower"),
					!this.isBuilder(e) ? "Assign as builder first." : "No towers to pull.",
				),
			];
			for (const ev of this.evoFor(e)) {
				if (ev.id === "harvester" || ev.id === "builder") continue;
				const ok = food >= ev.costF && mat >= ev.costM;
				out.push(this.opt(`evo:${ev.id}`, ev.label, "evo", ok, ok ? "" : ev.costM > 0 ? `Need ${ev.costF} food and ${ev.costM} material.` : `Need ${ev.costF} food.`, ev.costF, ev.costM));
			}
			return out;
		}
		if (e.caste === "attacker") {
			const hold = this.ents.find((t) => t.alive && t.kind === "tower" && t.evo === "siegehold");
			const out: CommandOpt[] = [
				this.opt("hold", "Hold", "order", true, ""),
				this.opt("follow", "Follow queen", "order", true, ""),
				this.opt("rove", "Rove", "order", true, ""),
				this.opt("guard", "Guard", "order", true, ""),
				this.opt("garrison", "Station at tower", "order", Boolean(hold), "Upgrade a tower to a siege nest first."),
			];
			for (const ev of this.evoFor(e)) {
				const ok = food >= ev.costF && mat >= ev.costM;
				out.push(this.opt(`evo:${ev.id}`, ev.label, "evo", ok, ok ? "" : `Need ${ev.costF} food.`, ev.costF, ev.costM));
			}
			return out;
		}
		if (e.caste === "defender") {
			const out: CommandOpt[] = [
				this.opt("hold", "Hold", "order", true, ""),
				this.opt("guard", "Hold nest", "order", true, ""),
			];
			for (const ev of this.evoFor(e)) {
				const ok = food >= ev.costF && mat >= ev.costM;
				out.push(this.opt(`evo:${ev.id}`, ev.label, "evo", ok, ok ? "" : `Need ${ev.costF} food.`, ev.costF, ev.costM));
			}
			return out;
		}
		return [];
	}
	isResource(e: Ent) {
		return e.kind === "fruit" || e.kind === "node" || e.kind === "solar" || e.kind === "battery" || e.kind === "scrap" || e.kind === "loot" || e.kind === "pickup";
	}
	runCommand(id: string) {
		if (id.startsWith("assign:")) {
			this.sendHarvester(+id.slice(7));
			return;
		}
		if (id.startsWith("evo:")) {
			this.evolveSelected(id.slice(4) as Evo);
			return;
		}
		if (id === "harvest" || id === "harvest-food") this.assignWorker("forage");
		else if (id === "harvest-mat") this.assignWorker("scavenge");
		else if (id === "builder") this.assignWorker("builder");
		else if (id === "mark") this.beginMarkHarvest();
		else if (id === "follow") this.assignAttacker("follow");
		else if (id === "hold") this.assignHold();
		else if (id === "hold-builders") this.holdBuilders();
		else if (id === "remove-tower") this.tryRemoveTower();
		else if (id === "rove") this.assignDuty("rove");
		else if (id === "guard") this.assignDuty("guard");
		else if (id === "raise-tower") this.tryBuildTower();
		else if (id === "lay-worker") this.tryLay("worker");
		else if (id === "lay-defender") this.tryLay("defender");
		else if (id === "lay-attacker") this.tryLay("attacker");
		else if (id === "electric") this.evolveTower("electric");
		else if (id === "siegehold") this.evolveTower("siegehold");
		else if (id === "garrison") this.garrisonSelected();
		else if (id === "enter-hive") this.enterSelectedHive();
		else if (id === "queen-harvest") this.queenHarvestSelected();
		else if (id === "below") this.toggleNest();
	}
	sendHarvester(id: number) {
		const res = this.find(this.selectedId);
		const w = this.find(id);
		if (!res || !this.isResource(res) && res.kind !== "loot") {
			this.note("Select forage first.");
			return;
		}
		if (!w || w.caste !== "worker") return;
		if (w.evo === "builder" || w.evo === "engineer") {
			this.note("Builders do not harvest.");
			return;
		}
		if (w.evo !== "harvester") {
			w.evo = "harvester";
			w.evoSpd += 1;
			w.foodMax += 20;
			w.speed += 10;
		}
		w.job = res.meat > 0 ? "forage" : "scavenge";
		w.assignX = res.x;
		w.assignY = res.y;
		w.assignR = 70;
		w.targetId = res.id;
		const q = this.queen();
		const gated = res.kind === "loot" && q && !this.inPerim(q.x, q.y);
		if (gated) this.note("Harvester waits until the queen is back inside the silk net.");
		else this.note("Harvester takes the assignment.");
	}
	evolveTower(evo: Evo) {
		const e = this.find(this.selectedId);
		if (!e || e.kind !== "tower") {
			this.note("Select a tower.");
			return;
		}
		if (!this.silkPowered(e.id)) {
			this.note("Silk the post to the hollow first.");
			return;
		}
		if (evo === "electric") {
			const cost = this.electricCost();
			if (!this.spendMat(cost)) {
				this.note(`Need ${cost} material.`);
				return;
			}
			e.evo = "electric";
			e.maxHp += 90;
			e.hp += 90;
			e.dmg = 8;
			e.draw += 8;
			this.note("The post drinks lightning. Anything that touches it — or its silk — burns.");
			return;
		}
		if (evo === "siegehold") {
			if (e.evo !== "electric") {
				this.note("Electric first.");
				return;
			}
			if (this.bestBuilderSkill() < 3) {
				this.note("A builder must reach skill 3.");
				return;
			}
			const cost = this.siegeholdCost();
			if (!this.spendMat(cost)) {
				this.note(`Need ${cost} material.`);
				return;
			}
			e.evo = "siegehold";
			e.maxHp += 40;
			this.note("Siege nest ready. Assign an attacker to the post.");
		}
	}
	garrisonSelected() {
		const sel = this.find(this.selectedId);
		let tower = sel?.kind === "tower" ? sel : this.ents.find((t) => t.alive && t.kind === "tower" && t.evo === "siegehold");
		let atk = sel?.caste === "attacker" ? sel : this.ents.find((a) => a.alive && a.caste === "attacker" && a.job !== "follow");
		if (sel?.caste === "attacker") {
			tower = this.ents.find((t) => t.alive && t.kind === "tower" && t.evo === "siegehold" && Math.hypot(t.x - sel.x, t.y - sel.y) < 280) ?? tower;
			atk = sel;
		}
		if (!tower || tower.evo !== "siegehold" || !atk) {
			this.note("Need a siege nest and an attacker.");
			return;
		}
		atk.garrisonId = tower.id;
		atk.job = "guard";
		atk.homeX = tower.x;
		atk.homeY = tower.y;
		this.note("Attacker stations the siege nest.");
	}
	hiveOpen(h: Ent) {
		return !this.ents.some((e) => e.alive && e.site === h.site && (e.kind === "bee" || e.kind === "wasp" || e.kind === "scorpion" || e.kind === "egg" && e.faction !== "spider"));
	}
	enterSelectedHive() {
		const h = this.find(this.selectedId);
		if (!h || h.kind !== "hive") return;
		if (!this.hiveOpen(h)) {
			this.note("Drive the defenders out first.");
			return;
		}
		const q = this.queen();
		if (!q || Math.hypot(q.x - h.x, q.y - h.y) > 90) {
			this.note("The queen must stand in the undefended nest.");
			return;
		}
		this.seedHiveLoot(h);
		this.view = "hive";
		this.hiveId = h.id;
		this.note("Stores in the dark. Click a cache, then a harvester.");
	}
	seedHiveLoot(h: Ent) {
		if (this.ents.some((e) => e.alive && e.kind === "loot" && e.site === h.site)) return;
		this.make("loot", "none", h.x - 18, h.y + 8, { r: 12, hp: 20, maxHp: 20, speed: 0, meat: this.yieldAmt(14), draw: 26, site: h.site });
		this.make("loot", "none", h.x + 22, h.y - 6, { r: 12, hp: 20, maxHp: 20, speed: 0, meat: 0, haul: this.yieldAmt(10), draw: 26, site: h.site, role: "pack" });
	}
	expandRoom(type: RoomType) {
		const r = this.room(type);
		if (!r) return;
		const cost = this.roomCost(r.level);
		if (!this.spendMat(cost)) {
			this.note(`Builders need ${cost} material.`);
			return;
		}
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
		} else if (q.haul > 0 && q.haul >= this.haulCap(q, q.meat > 0) && this.harvesting(q)) {
			const n = this.nest();
			if (n) this.seek(q, n, dt);
			else this.hold(q, dt);
		} else if (this.harvesting(q)) {
			this.queenForage(q, dt);
		} else if (q.job === "hold" || q.job === "none" || q.job === "build") {
			this.hold(q, dt);
		} else if (q.job === "guard") {
			const n = this.nest();
			const foe = n ? this.closestHostile(n, NEST_PERIM + 40) : this.closestHostile(q, 180);
			if (foe) {
				this.seek(q, foe, dt);
				this.tryAttack(q, foe);
			} else if (n && Math.hypot(q.x - n.x, q.y - n.y) > 80) this.seek(q, n, dt);
			else this.hold(q, dt);
		} else if (q.job === "rove") {
			const foe = this.closestHostile(q, 260);
			if (foe) {
				this.seek(q, foe, dt);
				this.tryAttack(q, foe);
			} else this.hold(q, dt);
		} else this.hold(q, dt);
		this.queenGather(q);
		this.depositQueen(q);
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
	queenGather(q: Ent) {
		const foodLoad = q.haul > 0 ? q.meat > 0 : true;
		const cap = this.haulCap(q, foodLoad);
		if (q.haul >= cap && foodLoad === (q.meat > 0)) return;
		for (const o of this.ents) {
			if (!o.alive || !this.yieldKind(o)) continue;
			if ((o.meat || 0) <= 0 && (o.haul || 0) <= 0) continue;
			if (Math.hypot(q.x - o.x, q.y - o.y) > q.r + o.r + 18) continue;
			const food = o.meat > 0;
			if (q.haul > 0 && Boolean(q.meat) !== food) continue;
			const room = this.haulCap(q, food) - q.haul;
			const take = Math.min(room, food ? o.meat : o.haul || 4);
			if (take <= 0) continue;
			if (food) {
				o.meat -= take;
				q.meat = 1;
			} else {
				o.haul = Math.max(0, o.haul - take);
				q.meat = 0;
			}
			q.haul += take;
			this.pop(o.x, o.y - 20, food ? `+${take}f` : `+${take}m`, food ? "#b7c96a" : "#e8ebe4");
			this.audio?.deposit();
			if (o.meat <= 0 && o.haul <= 0 && o.site !== "unique" && o.site !== "home") o.alive = false;
			break;
		}
	}
	depositQueen(q: Ent) {
		if (q.haul <= 0) return;
		const n = this.nest();
		if (!n || Math.hypot(q.x - n.x, q.y - n.y) > 70) return;
		if (q.meat > 0) this.gainFood(q.haul);
		else this.gainMat(q.haul);
		this.pop(n.x, n.y - 30, `+${q.haul}`, "#e8ebe4");
		q.haul = 0;
		q.meat = 0;
		q.foodMeter = q.foodMax;
		this.audio?.deposit();
		this.note("The queen unloads at the hollow.");
	}
	queenForage(q: Ent, dt: number) {
		let node = q.assignR > 0 ? this.closestYield(q, q.assignX, q.assignY, q.assignR) : this.closestYieldInNet(q);
		if (!node && q.targetId) node = this.find(q.targetId);
		if (!node) {
			this.hold(q, dt);
			return;
		}
		if (Math.hypot(q.x - node.x, q.y - node.y) < 28) this.hold(q, dt);
		else this.seek(q, node, dt);
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
		if (this.playerLed(e) && (e.job === "hold" || e.job === "none")) {
			this.hold(e, dt);
			return;
		}
		if (e.job === "hold") {
			this.hold(e, dt);
			return;
		}
		const alert = this.threat();
		if (!(this.playerLed(e) || alert && !this.starving(e) && (e.caste === "defender" || e.caste === "attacker"))) {
			if (this.seekFeed(e, dt)) return;
		}
		if (e.caste === "worker") {
			this.aiWorker(e, dt);
			return;
		}
		if (e.caste === "defender") {
			if (alert) {
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
			if (Math.hypot(e.x - rest.x, e.y - rest.y) > 24) this.seek(e, rest, dt);
			else this.hold(e, dt);
			return;
		}
		if (e.garrisonId) {
			const tw = this.find(e.garrisonId);
			if (tw) {
				const rest = { x: tw.x + 18, y: tw.y + 12 };
				if (Math.hypot(e.x - rest.x, e.y - rest.y) > 16) this.seek(e, rest, dt);
				else this.hold(e, dt);
				const foe = this.closestHostile(tw, tw.evo === "siegehold" ? 280 : 160);
				if (foe) this.tryAttack(e, foe);
				return;
			}
			e.garrisonId = 0;
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
		if (alert && (e.job === "rove" || e.job === "none") && this.inPerim(e.x, e.y)) {
			this.seek(e, alert, dt);
			this.tryAttack(e, alert);
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
		if (e.job === "hold") {
			this.hold(e, dt);
			this.routes.delete(e.id);
			return;
		}
		if (this.isBuilder(e)) {
			this.aiBuilder(e, dt, n);
			return;
		}
		if (e.haul > 0) {
			const foodLoad = e.meat > 0;
			const cap = this.haulCap(e, foodLoad);
			const node = e.assignR > 0 ? this.closestYield(e, e.assignX, e.assignY, e.assignR) : this.closestYieldInNet(e);
			const sameKind = node && (foodLoad ? node.meat > 0 : (node.haul || 0) > 0 && node.meat <= 0);
			if (e.haul < cap - 0.2 && sameKind) {
				this.routeTo(e, node!.x, node!.y, dt);
				if (Math.hypot(e.x - node!.x, e.y - node!.y) < 32) {
					this.hold(e, dt);
					this.siphonYield(e, node!, dt);
				}
				return;
			}
			this.routeTo(e, n.x, n.y, dt);
			if (Math.hypot(e.x - n.x, e.y - n.y) < 70) {
				if (e.meat > 0) this.gainFood(e.haul);
				else this.gainMat(e.haul);
				this.pop(n.x, n.y - 30, `+${Math.round(e.haul)}`, "#e8ebe4");
				e.haul = 0;
				e.targetId = 0;
				e.foodMeter = e.foodMax;
				this.audio?.deposit();
				if (e.assignR > 0 && !this.patchHasYield(e)) {
					e.assignR = 0;
					this.routes.delete(e.id);
					this.note("Patch stripped. Harvester works the silk ring.");
				}
			}
			return;
		}
		if (e.job === "none") {
			this.hold(e, dt);
			this.routes.delete(e.id);
			return;
		}
		if (e.job !== "harvest" && e.job !== "forage" && e.job !== "scavenge" && e.evo !== "harvester") {
			if (Math.hypot(e.x - n.x, e.y - n.y) > 90) this.routeTo(e, n.x, n.y, dt);
			else {
				this.routes.delete(e.id);
				this.hold(e, dt);
			}
			return;
		}
		const q = this.queen();
		const tgt = e.targetId ? this.find(e.targetId) : undefined;
		if (tgt?.kind === "loot" && q && !this.inPerim(q.x, q.y)) {
			if (Math.hypot(e.x - n.x, e.y - n.y) > 90) this.routeTo(e, n.x, n.y, dt);
			else this.hold(e, dt);
			return;
		}
		let node = e.assignR > 0 ? this.closestYield(e, e.assignX, e.assignY, e.assignR) : this.closestYieldInNet(e);
		if (!node && tgt && this.yieldKind(tgt) && ((tgt.meat || 0) > 0 || (tgt.haul || 0) > 0)) node = tgt;
		if (!node) {
			if (Math.hypot(e.x - n.x, e.y - n.y) > 90) this.routeTo(e, n.x, n.y, dt);
			else {
				this.routes.delete(e.id);
				this.hold(e, dt);
			}
			return;
		}
		e.targetId = node.id;
		this.routeTo(e, node.x, node.y, dt);
		if (Math.hypot(e.x - node.x, e.y - node.y) < 32) {
			this.hold(e, dt);
			this.siphonYield(e, node, dt);
		}
	}
	aiBuilder(e: Ent, dt: number, n: Ent) {
		if (e.job === "hold") {
			this.hold(e, dt);
			this.routes.delete(e.id);
			return;
		}
		e.job = "build";
		const dmg = this.ents
			.filter((o) => o.alive && (o.kind === "nest" || o.kind === "tower") && o.hp < o.maxHp - 1)
			.sort((a, b) => {
				if (a.kind === "nest" && b.kind !== "nest") return -1;
				if (b.kind === "nest" && a.kind !== "nest") return 1;
				return Math.hypot(a.x - n.x, a.y - n.y) - Math.hypot(b.x - n.x, b.y - n.y);
			});
		const t = dmg[0];
		if (t) {
			this.routeTo(e, t.x, t.y, dt);
			if (Math.hypot(e.x - t.x, e.y - t.y) < 36) {
				t.hp = Math.min(t.maxHp, t.hp + 18 * dt);
				if (t.hp >= t.maxHp - 0.2) {
					e.skill += 1;
					this.pop(t.x, t.y - 20, "Repaired", "#e8ebe4");
				}
				this.hold(e, dt);
			}
			return;
		}
		if (e.evo === "engineer") {
			let tw: Ent | undefined;
			let best = Infinity;
			for (const o of this.ents) {
				if (!o.alive || o.kind !== "tower" || !this.silkPowered(o.id)) continue;
				if (o.evoHp >= 4) continue;
				if (this.material < this.fortifyCost(o)) continue;
				const d = dist2(e, o);
				if (d < best) {
					best = d;
					tw = o;
				}
			}
			if (tw) {
				this.routeTo(e, tw.x, tw.y, dt);
				if (Math.hypot(e.x - tw.x, e.y - tw.y) < 36) {
					this.hold(e, dt);
					if (e.cd <= 0) {
						if (this.fortifyTower(tw, e)) e.cd = 1.2;
					}
				}
				return;
			}
		}
		if (Math.hypot(e.x - n.x, e.y - n.y) > 80) this.routeTo(e, n.x, n.y, dt);
		else {
			this.routes.delete(e.id);
			this.hold(e, dt);
		}
	}
	siphonYield(e: Ent, node: Ent, dt: number) {
		const food = node.meat > 0;
		if (e.haul > 0 && food !== (e.meat > 0)) return;
		const store = food ? node.meat : node.haul;
		const cap = this.haulCap(e, food);
		const room = cap - e.haul;
		if (store <= 0 || room <= 0) return;
		const rate = food ? 16 : 10;
		const take = Math.min(room, store, rate * dt);
		if (take <= 0) return;
		if (food) {
			node.meat -= take;
			e.meat = 1;
		} else {
			node.haul = Math.max(0, node.haul - take);
			e.meat = 0;
		}
		e.haul += take;
		if (e.cd <= 0) {
			this.pop(node.x, node.y - 18, food ? `+${Math.max(1, Math.round(take * 4))}f` : `+${Math.max(1, Math.round(take * 4))}m`, food ? "#b7c96a" : "#e8ebe4");
			e.cd = 0.4;
			this.audio?.deposit();
		}
		this.clearEmptyYield(node);
	}
	takeYield(e: Ent, node: Ent) {
		const food = node.meat > 0;
		const store = food ? node.meat : node.haul;
		const take = Math.min(this.haulCap(e, food) - e.haul, store || 4);
		if (take <= 0) return;
		if (node.meat > 0) {
			node.meat -= take;
			e.haul += take;
			e.meat = 1;
		} else {
			node.haul = Math.max(0, node.haul - take);
			e.haul += take;
			e.meat = 0;
		}
		e.targetId = 0;
		this.clearEmptyYield(node);
	}
	clearEmptyYield(node: Ent) {
		const empty = node.meat <= 0 && node.haul <= 0;
		if (!empty) return;
		if (node.site === "home" || this.inPerim(node.x, node.y)) return;
		if (node.site === "unique") {
			node.buried = Math.max(node.buried, 0.8);
			node.meat = 0;
			return;
		}
		if (node.kind === "pickup" || node.kind === "cocoon" || node.kind === "scrap" || node.kind === "loot" || node.kind === "fruit" || node.kind === "node") node.alive = false;
	}
	yieldKind(o: Ent) {
		return o.kind === "node" || o.kind === "pickup" || o.kind === "cocoon" || o.kind === "fruit" || o.kind === "scrap" || o.kind === "solar" || o.kind === "battery" || o.kind === "loot";
	}
	closestYieldInNet(e: Ent) {
		let node;
		let best = Infinity;
		const foodFull = this.food >= this.cap("food") - 0.4;
		const matFull = this.material >= this.cap("material") - 0.4;
		for (const o of this.ents) {
			if (!o.alive || !this.yieldKind(o)) continue;
			if ((o.meat || 0) <= 0 && (o.haul || 0) <= 0) continue;
			if (!this.inPerim(o.x, o.y)) continue;
			const food = o.meat > 0;
			if (food && foodFull) continue;
			if (!food && matFull) continue;
			const want = this.harvestWant(e);
			if (want === "food" && !food) continue;
			if (want === "mat" && food) continue;
			if (this.claimedYield(o.id, e.id)) continue;
			const d = dist2(e, o);
			if (d < best) {
				best = d;
				node = o;
			}
		}
		return node;
	}
	closestYield(e: Ent, x: number, y: number, r: number) {
		let node;
		let best = Infinity;
		const r2 = r * r;
		for (const o of this.ents) {
			if (!o.alive || !this.yieldKind(o)) continue;
			if ((o.meat || 0) <= 0 && (o.haul || 0) <= 0) continue;
			const inPatch = (o.x - x) ** 2 + (o.y - y) ** 2;
			if (inPatch > r2) continue;
			if (this.claimedYield(o.id, e.id)) continue;
			const d = dist2(e, o);
			if (d < best) {
				best = d;
				node = o;
			}
		}
		return node;
	}
	claimedYield(nodeId: number, selfId: number) {
		const node = this.find(nodeId);
		const store = node ? Math.max(node.meat || 0, node.haul || 0) : 0;
		if (store > this.tune().gather * 5) return false;
		for (const w of this.ents) {
			if (!w.alive || w.id === selfId || w.caste !== "worker") continue;
			if (w.haul > 0) continue;
			if (w.targetId === nodeId) return true;
		}
		return false;
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
		void dt;
		for (const meat of this.ents) {
			if (!meat.alive || meat.kind !== "pickup" && meat.kind !== "cocoon") continue;
			let eater: Ent | undefined;
			let best = 40 * 40;
			for (const e of this.ents) {
				if (!e.alive || e.faction !== "spider") continue;
				if (e.kind !== "brood" && e.kind !== "queen") continue;
				if (!this.canEatKill(e) || e.foodMeter >= e.foodMax - 1) continue;
				const d = dist2(e, meat);
				if (d < best) {
					best = d;
					eater = e;
				}
			}
			if (eater && Math.hypot(eater.x - meat.x, eater.y - meat.y) < eater.r + meat.r + 12) {
				this.eatKill(eater, meat);
				continue;
			}
			const q = this.queen();
			if (q && !this.needsFeed(q) && Math.hypot(q.x - meat.x, q.y - meat.y) < q.r + meat.r + 8) {
				this.gainFood(this.yieldAmt(meat.meat));
				this.gainMat(this.yieldAmt(Math.max(1, Math.floor(meat.meat / 3))));
				meat.alive = false;
				this.pop(meat.x, meat.y, `+${meat.meat}`, "#e8ebe4");
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
		if (target.kind === "nest") this.nestAlarm = 8;
		if (target.kind === "tower" && from && from.kind !== "tower" && isHostile(from.faction, "spider") && target.dmg > 0 && this.silkPowered(target.id) && target.cd <= 0) {
			target.cd = 0.35;
			this.hit(from, target.dmg, target, "#b7c96a");
		}
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
			income: Math.round(this.incomeRate() * 10) / 10,
			net: Math.round((this.incomeRate() - this.upkeep()) * 10) / 10,
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
			selected: sel ? this.selectLabel(sel) : "",
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
			silkCost: this.silkCost(),
			ally: sel ? {
				id: sel.id,
				kind: sel.kind,
				caste: sel.caste,
				evo: sel.evo,
				job: sel.job,
				hp: Math.ceil(sel.hp),
				maxHp: sel.maxHp,
				winged: sel.winged,
				marked: sel.assignR > 0,
				label: this.selectLabel(sel),
				skill: sel.skill,
				meat: Math.max(sel.meat, sel.haul),
				unearthed: sel.unearthed,
				food: Math.ceil(sel.foodMeter),
				foodMax: sel.foodMax,
				commands: this.selection().some((e) => e.id === sel.id && (e.kind === "brood" || e.kind === "queen"))
					? this.commandsForSelection()
					: this.commandsFor(sel),
				roster: this.isResource(sel) ? this.harvesterRoster() : [],
			} : this.selection().some((e) => e.kind === "brood" || e.kind === "queen")
				? {
					id: this.selectedId,
					kind: "brood" as const,
					caste: this.find(this.selectedId)?.caste ?? "none",
					evo: "none" as const,
					job: "none" as const,
					hp: 0,
					maxHp: 0,
					winged: false,
					marked: false,
					label: `${this.selection().length} selected`,
					skill: 0,
					meat: 0,
					unearthed: false,
					food: 0,
					foodMax: 0,
					commands: this.commandsForSelection(),
					roster: [],
				}
				: null,
			marking: this.marking,
			builderSel: Boolean(this.selectedBuilder()),
			hiveName: this.view === "hive" ? "Taken hive" : "",
			units: this.ents
				.filter((e) => e.alive && e.faction === "spider" && (e.kind === "queen" && e.stage === "adult" || e.kind === "brood"))
				.map((e) => ({
					id: e.id,
					label: e.kind === "queen" ? "Queen" : e.evo !== "none" && e.evo !== "biter" ? `${e.caste} · ${e.evo}` : e.caste,
					caste: e.caste,
					job: e.job,
					evo: e.evo,
					hp: Math.ceil(e.hp),
					maxHp: e.maxHp,
					winged: e.winged,
					selected: this.selectedIds.includes(e.id) || e.id === this.selectedId,
					food: Math.ceil(e.foodMeter),
					foodMax: e.foodMax,
				})),
			groups: (() => {
				const map = new Map<string, { e: Ent; ids: number[]; selected: number }>();
				for (const e of this.ents) {
					if (!e.alive || e.faction !== "spider") continue;
					if (!(e.kind === "queen" && e.stage === "adult" || e.kind === "brood")) continue;
					const key = this.unitKey(e);
					const g = map.get(key);
					const on = this.selectedIds.includes(e.id) || e.id === this.selectedId;
					if (!g) map.set(key, { e, ids: [e.id], selected: on ? 1 : 0 });
					else {
						g.ids.push(e.id);
						if (on) g.selected += 1;
					}
				}
				return [...map.entries()].map(([key, g]) => ({
					key,
					label: this.unitGroupLabel(g.e),
					caste: g.e.caste,
					evo: g.e.evo,
					winged: g.e.winged,
					count: g.ids.length,
					selected: g.selected,
					job: g.e.job,
				}));
			})(),
			eggs: this.ents
				.filter((e) => e.alive && e.kind === "egg" && e.faction === "spider")
				.map((e) => ({
					id: e.id,
					label: e.caste === "queen" ? "Queen egg" : `${e.caste} egg`,
					caste: e.caste,
					ttl: Math.max(0, e.ttl),
				})),
			orders: this.commandsForSelection(),
		};
	}
	selectLabel(sel: Ent) {
		if (sel.kind === "fruit") return "Fruit tree";
		if (sel.kind === "solar") return sel.unearthed ? "Solar plate" : "Buried plate";
		if (sel.kind === "battery") return sel.unearthed ? "Battery" : "Buried cell";
		if (sel.kind === "scrap") return "Scrap";
		if (sel.kind === "loot") return sel.meat > 0 ? "Hive food" : "Hive material";
		if (sel.kind === "node") return "Forage";
		if (sel.kind === "pickup") return "Kill meat";
		if (sel.kind === "tower") return sel.evo === "siegehold" ? "Siege nest" : sel.evo === "electric" ? "Electric post" : sel.linked ? "Silk post" : "Mute post";
		if (sel.kind === "queen") return sel.stage === "adolescent" ? "Princess" : "Matriarch";
		if (sel.kind === "hive") return this.hiveOpen(sel) ? "Empty hive" : "Enemy hive";
		if (sel.kind === "nest") return "The hollow";
		return `${sel.caste}${sel.evo !== "none" && sel.evo !== "biter" ? ` · ${sel.evo}` : ""}${sel.winged ? " · wings" : ""}`;
	}
}
