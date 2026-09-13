import { FOG_CELL, WORLD_H, WORLD_W } from "./types";

export class Fog {
  cols = Math.ceil(WORLD_W / FOG_CELL);
  rows = Math.ceil(WORLD_H / FOG_CELL);
  explored = new Uint8Array(this.cols * this.rows);
  visible = new Uint8Array(this.cols * this.rows);

  reset() {
    this.explored.fill(0);
    this.visible.fill(0);
  }

  clearVisible() {
    this.visible.fill(0);
  }

  private idx(cx: number, cy: number) {
    return cy * this.cols + cx;
  }

  reveal(x: number, y: number, radius: number) {
    const r = Math.max(1, Math.ceil(radius / FOG_CELL));
    const cx = Math.floor(x / FOG_CELL);
    const cy = Math.floor(y / FOG_CELL);
    const r2 = r * r;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x2 = cx + dx;
        const y2 = cy + dy;
        if (x2 < 0 || y2 < 0 || x2 >= this.cols || y2 >= this.rows) continue;
        const i = this.idx(x2, y2);
        this.explored[i] = 1;
        this.visible[i] = 1;
      }
    }
  }

  seen(x: number, y: number) {
    const cx = Math.floor(x / FOG_CELL);
    const cy = Math.floor(y / FOG_CELL);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return false;
    return this.explored[this.idx(cx, cy)] === 1;
  }

  vis(x: number, y: number) {
    const cx = Math.floor(x / FOG_CELL);
    const cy = Math.floor(y / FOG_CELL);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return false;
    return this.visible[this.idx(cx, cy)] === 1;
  }

  exploredFrac() {
    let n = 0;
    for (let i = 0; i < this.explored.length; i++) n += this.explored[i];
    return n / this.explored.length;
  }
}
