import { WORLD_H, WORLD_W } from "./types";

export const NAV_CELL = 40;

export type Vec2 = { x: number; y: number };

const SQRT2 = Math.SQRT2;
const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

function octile(dx: number, dy: number) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  return (ax + ay) + (SQRT2 - 2) * Math.min(ax, ay);
}

class MinHeap {
  data: number[] = [];
  f: Float32Array;
  constructor(f: Float32Array) {
    this.f = f;
  }
  get size() {
    return this.data.length;
  }
  push(i: number) {
    const d = this.data;
    d.push(i);
    this.up(d.length - 1);
  }
  pop() {
    const d = this.data;
    const top = d[0];
    const last = d.pop();
    if (d.length && last !== undefined) {
      d[0] = last;
      this.down(0);
    }
    return top;
  }
  private up(i: number) {
    const d = this.data;
    const f = this.f;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (f[d[i]] >= f[d[p]]) break;
      const t = d[i];
      d[i] = d[p];
      d[p] = t;
      i = p;
    }
  }
  private down(i: number) {
    const d = this.data;
    const f = this.f;
    const n = d.length;
    for (;;) {
      let m = i;
      const l = i * 2 + 1;
      const r = l + 1;
      if (l < n && f[d[l]] < f[d[m]]) m = l;
      if (r < n && f[d[r]] < f[d[m]]) m = r;
      if (m === i) break;
      const t = d[i];
      d[i] = d[m];
      d[m] = t;
      i = m;
    }
  }
}

export class Nav {
  cols = Math.ceil(WORLD_W / NAV_CELL);
  rows = Math.ceil(WORLD_H / NAV_CELL);
  blocked = new Uint8Array(this.cols * this.rows);
  private g = new Float32Array(this.cols * this.rows);
  private f = new Float32Array(this.cols * this.rows);
  private came = new Int32Array(this.cols * this.rows);
  private stamp = new Uint32Array(this.cols * this.rows);
  private gen = 1;
  dirty = true;

  idx(cx: number, cy: number) {
    return cy * this.cols + cx;
  }
  cellX(x: number) {
    return Math.max(0, Math.min(this.cols - 1, Math.floor(x / NAV_CELL)));
  }
  cellY(y: number) {
    return Math.max(0, Math.min(this.rows - 1, Math.floor(y / NAV_CELL)));
  }
  world(cx: number, cy: number): Vec2 {
    return { x: (cx + 0.5) * NAV_CELL, y: (cy + 0.5) * NAV_CELL };
  }
  clear() {
    this.blocked.fill(0);
    this.dirty = true;
  }
  stampCircle(x: number, y: number, r: number) {
    const cr = Math.max(1, Math.ceil(r / NAV_CELL));
    const cx = this.cellX(x);
    const cy = this.cellY(y);
    const r2 = (r / NAV_CELL) * (r / NAV_CELL);
    for (let dy = -cr; dy <= cr; dy++) {
      for (let dx = -cr; dx <= cr; dx++) {
        if (dx * dx + dy * dy > r2 + 0.25) continue;
        const x2 = cx + dx;
        const y2 = cy + dy;
        if (x2 < 1 || y2 < 1 || x2 >= this.cols - 1 || y2 >= this.rows - 1) continue;
        this.blocked[this.idx(x2, y2)] = 1;
      }
    }
    this.dirty = true;
  }
  walkable(cx: number, cy: number) {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return false;
    return this.blocked[this.idx(cx, cy)] === 0;
  }
  walkableWorld(x: number, y: number) {
    return this.walkable(this.cellX(x), this.cellY(y));
  }
  nearestWalkable(x: number, y: number): Vec2 {
    let cx = this.cellX(x);
    let cy = this.cellY(y);
    if (this.walkable(cx, cy)) return { x, y };
    for (let r = 1; r <= 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          if (this.walkable(cx + dx, cy + dy)) return this.world(cx + dx, cy + dy);
        }
      }
    }
    return { x, y };
  }
  los(ax: number, ay: number, bx: number, by: number) {
    let cx = this.cellX(ax);
    let cy = this.cellY(ay);
    const gx = this.cellX(bx);
    const gy = this.cellY(by);
    const dx = Math.abs(gx - cx);
    const dy = Math.abs(gy - cy);
    const sx = cx < gx ? 1 : -1;
    const sy = cy < gy ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      if (!this.walkable(cx, cy)) return false;
      if (cx === gx && cy === gy) return true;
      const e2 = err * 2;
      if (e2 > -dy) {
        err -= dy;
        cx += sx;
      }
      if (e2 < dx) {
        err += dx;
        cy += sy;
      }
    }
  }
  pull(pts: Vec2[]) {
    if (pts.length < 3) return pts;
    const out: Vec2[] = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let best = i + 1;
      for (let j = pts.length - 1; j > i + 1; j--) {
        if (this.los(pts[i].x, pts[i].y, pts[j].x, pts[j].y)) {
          best = j;
          break;
        }
      }
      out.push(pts[best]);
      i = best;
    }
    return out;
  }
  path(ax: number, ay: number, bx: number, by: number): Vec2[] {
    const start = this.nearestWalkable(ax, ay);
    const goal = this.nearestWalkable(bx, by);
    const sx = this.cellX(start.x);
    const sy = this.cellY(start.y);
    const gx = this.cellX(goal.x);
    const gy = this.cellY(goal.y);
    if (sx === gx && sy === gy) return [{ x: bx, y: by }];
    if (!this.walkable(sx, sy) || !this.walkable(gx, gy)) return [{ x: bx, y: by }];

    const gen = this.gen++;
    if (this.gen > 0xffffff) {
      this.stamp.fill(0);
      this.gen = 1;
    }
    const g = this.g;
    const f = this.f;
    const came = this.came;
    const stamp = this.stamp;
    const cols = this.cols;
    const si = sy * cols + sx;
    const gi = gy * cols + gx;
    g[si] = 0;
    f[si] = octile(gx - sx, gy - sy);
    stamp[si] = gen;
    came[si] = -1;
    const open = new MinHeap(f);
    open.push(si);
    let found = false;
    let steps = 0;
    const cap = 2800;
    while (open.size && steps++ < cap) {
      const cur = open.pop();
      if (stamp[cur] !== gen) continue;
      if (cur === gi) {
        found = true;
        break;
      }
      const cx = cur % cols;
      const cy = (cur / cols) | 0;
      for (const [dx, dy, cost] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.walkable(nx, ny)) continue;
        if (dx !== 0 && dy !== 0 && (!this.walkable(cx + dx, cy) || !this.walkable(cx, cy + dy))) continue;
        const ni = ny * cols + nx;
        const ng = g[cur] + cost;
        if (stamp[ni] === gen && ng >= g[ni]) continue;
        g[ni] = ng;
        f[ni] = ng + octile(gx - nx, gy - ny);
        came[ni] = cur;
        stamp[ni] = gen;
        open.push(ni);
      }
    }
    if (!found) return [start, { x: bx, y: by }];
    const cells: Vec2[] = [];
    let c = gi;
    while (c >= 0) {
      cells.push(this.world(c % cols, (c / cols) | 0));
      c = came[c];
    }
    cells.reverse();
    cells[0] = { x: ax, y: ay };
    cells[cells.length - 1] = { x: bx, y: by };
    return this.pull(cells);
  }
  avoid(x: number, y: number, fx: number, fy: number) {
    const look = NAV_CELL * 1.1;
    const px = x + fx * look;
    const py = y + fy * look;
    if (this.walkableWorld(px, py)) return { x: 0, y: 0 };
    const lx = -fy;
    const ly = fx;
    const left = this.walkableWorld(x + lx * look, y + ly * look);
    const right = this.walkableWorld(x - lx * look, y - ly * look);
    if (left && !right) return { x: lx, y: ly };
    if (right && !left) return { x: -lx, y: -ly };
    if (left) return { x: lx, y: ly };
    return { x: -lx, y: -ly };
  }
}

export type Route = {
  pts: Vec2[];
  i: number;
  gx: number;
  gy: number;
  at: number;
};
