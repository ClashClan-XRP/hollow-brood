export const WORLD_W = 1792;
export const WORLD_H = 1008;
export const NEST_POS = { x: 896, y: 520 };
export const HUMAN_SPAWN = { x: 1680, y: 510 };
export const BURROW_POS = { x: 310, y: 790 };
export const FIXED_DT = 1 / 60;
export const WALK_MARGIN = 70;

export const TREE_SPOTS = [
  { x: 430, y: 220 },
  { x: 1280, y: 200 },
  { x: 250, y: 560 },
  { x: 1540, y: 640 },
  { x: 560, y: 880 },
  { x: 1180, y: 900 },
] as const;

export type Faction = "spider" | "human" | "scorpion" | "none";
export type Kind =
  | "queen"
  | "brood"
  | "human"
  | "scorpion"
  | "egg"
  | "cocoon"
  | "nest"
  | "web"
  | "shot"
  | "fx"
  | "tree"
  | "burrow"
  | "pickup";

export type HumanRole = "raider" | "torch";

export type GameMode = "title" | "playing" | "paused" | "over";

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
  role: HumanRole;
  meat: number;
  ttl: number;
  poison: number;
  z: number;
  draw: number;
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

export type HudSnap = {
  mode: GameMode;
  queenHp: number;
  queenMax: number;
  nestHp: number;
  nestMax: number;
  meat: number;
  wave: number;
  brood: number;
  broodMax: number;
  carrying: boolean;
  webCd: number;
  venomCd: number;
  eggCost: number;
  waveClear: number;
  ticker: string;
  fang: number;
  carapace: number;
  silk: number;
  broodLv: number;
  costs: Record<UpgradeId, number>;
  killsHuman: number;
  killsScorpion: number;
  scorpionOnHuman: number;
  bestWave: number;
  overReason: string;
};

export type ControlsProbe = {
  getYaw: () => number;
  getSpeed: () => number;
  getX: () => number;
  getY: () => number;
  setKeys: (codes: string[]) => void;
  setSteer: (v: number) => void;
};

declare global {
  interface Window {
    __controlsTest?: ControlsProbe;
  }
}
