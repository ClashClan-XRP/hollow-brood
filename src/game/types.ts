export const WORLD_W = 3600;
export const WORLD_H = 2200;
export const LANDSCAPE_W = 820;
export const LANDSCAPE_H = 460;
export const MIN_ZOOM = 1.15;
export const NEST_POS = { x: 1080, y: 1180 };
export const FIXED_DT = 1 / 60;
export const WALK_MARGIN = 80;
export const FOG_CELL = 48;
export const NEST_PERIM = 320;
export const TOWER_PERIM = 260;
export const SILK_LINK_RANGE = 420;
/** Queen / heir must stand this close to a mute tower to splice silk. */
export const SILK_STAND = 78;
export const SILK_COST = 2;
export const HARVEST_R = 170;
export const FEED_NEST_R = 78;

/** Per-second food drain. Difficulty multiplies the total. */
export const UPKEEP_RATES = {
  nest: 0.15,
  queen: 0.4,
  teen: 0.2,
  worker: 0.07,
  harvester: 0.09,
  builder: 0.09,
  defender: 0.2,
  attacker: 0.26,
  tank: 0.48,
  siege: 0.42,
  air: 0.12,
} as const;

export const SITES = {
  meadow: { x: 2140, y: 720, r: 180 },
  bee: { x: 2860, y: 520, r: 150 },
  wasp: { x: 3020, y: 1640, r: 160 },
  scorpion: { x: 420, y: 1720, r: 140 },
  berries: { x: 1560, y: 640, r: 90 },
} as const;

export type Faction = "spider" | "human" | "scorpion" | "bee" | "wasp" | "herbivore" | "none";
export type Kind =
  | "queen"
  | "brood"
  | "human"
  | "scorpion"
  | "bee"
  | "wasp"
  | "herbivore"
  | "egg"
  | "cocoon"
  | "nest"
  | "hive"
  | "tower"
  | "web"
  | "shot"
  | "fx"
  | "tree"
  | "burrow"
  | "pickup"
  | "node"
  | "fruit"
  | "scrap"
  | "solar"
  | "battery"
  | "loot";

export type Caste = "worker" | "attacker" | "defender" | "queen" | "none";
export type Job = "none" | "harvest" | "build" | "guard" | "rove" | "follow" | "hibernate" | "haul" | "hold";
export type Evo =
  | "biter"
  | "melee"
  | "tank"
  | "siege"
  | "air"
  | "harvester"
  | "builder"
  | "electric"
  | "siegehold"
  | "none";
export type Stage = "adult" | "adolescent" | "chrysalis";
export type UnitRole = Caste | "raider" | "torch" | "pack" | "siege" | "none";
export type GameMode = "title" | "playing" | "paused" | "over" | "succession";
export type ViewMode = "world" | "nest" | "hive";
export type Difficulty = "easy" | "standard" | "difficult";
export type RoomType = "hatchery" | "food" | "material" | "chrysalis" | "chamber";
export type EggKind = "worker" | "attacker" | "defender" | "queen";

export type Room = {
  type: RoomType;
  level: number;
  cap: number;
  stored: number;
};

export type Site = {
  id: string;
  kind: "home" | "meadow" | "bee" | "wasp" | "scorpion" | "berries";
  x: number;
  y: number;
  r: number;
  discovered: boolean;
  cleared: boolean;
  eggs: number;
  pop: number;
};

export type SilkLink = { a: number; b: number };

export type DifficultyTune = {
  id: Difficulty;
  label: string;
  blurb: string;
  food: number;
  material: number;
  foodCap: number;
  matCap: number;
  nestHp: number;
  queenHp: number;
  enemyHp: number;
  enemySpd: number;
  hatch: number;
  upkeepMul: number;
  broodCap: number;
  yieldMul: number;
  costMul: number;
  dropEvery: number;
  gather: number;
  silkCost: number;
};

export const DIFFICULTIES: Record<Difficulty, DifficultyTune> = {
  easy: {
    id: "easy",
    label: "Easy",
    blurb: "Fat larders, sleepy hives, cheap silk.",
    food: 48,
    material: 22,
    foodCap: 96,
    matCap: 48,
    nestHp: 640,
    queenHp: 360,
    enemyHp: 0.78,
    enemySpd: 0.86,
    hatch: 6,
    upkeepMul: 0.72,
    broodCap: 12,
    yieldMul: 1.25,
    costMul: 0.85,
    dropEvery: 24,
    gather: 6,
    silkCost: 1,
  },
  standard: {
    id: "standard",
    label: "Standard",
    blurb: "The hollow as an empire, not a raid.",
    food: 36,
    material: 16,
    foodCap: 72,
    matCap: 36,
    nestHp: 480,
    queenHp: 280,
    enemyHp: 1,
    enemySpd: 1,
    hatch: 8,
    upkeepMul: 1,
    broodCap: 8,
    yieldMul: 1,
    costMul: 1,
    dropEvery: 30,
    gather: 5,
    silkCost: 2,
  },
  difficult: {
    id: "difficult",
    label: "Difficult",
    blurb: "Thin stores. Far hives wake hungry.",
    food: 22,
    material: 10,
    foodCap: 56,
    matCap: 28,
    nestHp: 380,
    queenHp: 220,
    enemyHp: 1.28,
    enemySpd: 1.1,
    hatch: 10,
    upkeepMul: 1.28,
    broodCap: 6,
    yieldMul: 0.8,
    costMul: 1.15,
    dropEvery: 36,
    gather: 4,
    silkCost: 3,
  },
};

export type Ent = {
  id: number;
  kind: Kind;
  faction: Faction;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
  facing: number;
  speed: number;
  dmg: number;
  range: number;
  cd: number;
  atkT: number;
  wrapT: number;
  flash: number;
  knock: number;
  targetId: number;
  carryId: number;
  alive: boolean;
  anim: number;
  age: number;
  role: UnitRole;
  meat: number;
  ttl: number;
  poison: number;
  z: number;
  draw: number;
  caste: Caste;
  job: Job;
  evo: Evo;
  stage: Stage;
  winged: boolean;
  foodMeter: number;
  foodMax: number;
  homeX: number;
  homeY: number;
  site: string;
  linked: boolean;
  alert: boolean;
  hibernating: boolean;
  evoBite: number;
  evoHp: number;
  evoSpd: number;
  splash: number;
  chain: number;
  roll: number;
  sniper: number;
  transCap: number;
  haul: number;
  assignX: number;
  assignY: number;
  assignR: number;
  skill: number;
  drops: number;
  unearthed: boolean;
  buried: number;
  garrisonId: number;
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
};

export type Floater = {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
};

export type Ticker = { text: string; life: number };

export type UpgradeId = "fang" | "carapace" | "silk" | "brood";

export type CommandOpt = {
  id: string;
  label: string;
  group: "order" | "evo" | "build" | "roster";
  enabled: boolean;
  reason: string;
  costF: number;
  costM: number;
};

export type RosterSnap = {
  id: number;
  label: string;
  busy: boolean;
};

export type EggSnap = {
  id: number;
  label: string;
  caste: Caste;
  ttl: number;
};

export type UnitSnap = {
  id: number;
  label: string;
  caste: Caste;
  job: Job;
  evo: Evo;
  hp: number;
  maxHp: number;
  winged: boolean;
  selected: boolean;
  food: number;
  foodMax: number;
};

export type AllySnap = {
  id: number;
  kind: Kind;
  caste: Caste;
  evo: Evo;
  job: Job;
  hp: number;
  maxHp: number;
  winged: boolean;
  marked: boolean;
  label: string;
  skill: number;
  meat: number;
  unearthed: boolean;
  food: number;
  foodMax: number;
  commands: CommandOpt[];
  roster: RosterSnap[];
};

export type HudSnap = {
  mode: GameMode;
  view: ViewMode;
  difficulty: Difficulty;
  queenHp: number;
  queenMax: number;
  nestHp: number;
  nestMax: number;
  food: number;
  foodCap: number;
  material: number;
  matCap: number;
  upkeep: number;
  income: number;
  net: number;
  hibernating: number;
  workers: number;
  attackers: number;
  defenders: number;
  air: number;
  teens: number;
  brood: number;
  broodMax: number;
  carrying: boolean;
  webCd: number;
  venomCd: number;
  workerCost: number;
  attackCost: number;
  defendCost: number;
  queenCost: number;
  towerCost: number;
  ticker: string;
  selected: string;
  room: RoomType | "";
  rooms: Room[];
  evoOptions: { id: string; label: string; costF: number; costM: number }[];
  succession: { id: number; label: string }[];
  discovered: string[];
  fogReady: boolean;
  bestReach: number;
  bestByDiff: Record<Difficulty, number>;
  overReason: string;
  nestNear: boolean;
  canLink: boolean;
  silkHint: string;
  silkNodes: number;
  silkDist: number;
  silkMax: number;
  silkCost: number;
  ally: AllySnap | null;
  marking: boolean;
  builderSel: boolean;
  hiveName: string;
  units: UnitSnap[];
  eggs: EggSnap[];
  orders: CommandOpt[];
};

export type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  getX: () => number;
  getY: () => number;
  setKeys: (codes: string[]) => void;
  setSteer: (v: number) => void;
};

export type SilkProbe = {
  query: () => {
    ready: boolean;
    standOk: boolean;
    reachOk: boolean;
    dist: number;
    hint: string;
    links: number;
    mute: number;
    nodes: number;
    material: number;
    mode: GameMode;
  };
  raise: () => number;
  layWorker: () => boolean;
  spawnWorker: () => boolean;
  selectFruit: () => boolean;
  selectWorker: () => boolean;
  harvestAt: (x: number, y: number) => boolean;
  clickFruit: () => boolean;
  pickAt: (x: number, y: number) => string;
  starve: () => boolean;
  dropKill: (x: number, y: number) => boolean;
  workerPath: () => { points: number; bends: number; gx: number; gy: number };
  splice: () => "spliced" | "blocked" | "none";
  teleportQueen: (x: number, y: number) => void;
  setStores: (food: number, material: number) => void;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
    __silkTest?: SilkProbe;
  }
}
