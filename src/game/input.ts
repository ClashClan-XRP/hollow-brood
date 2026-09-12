export type Actions = {
  moveX: number;
  moveY: number;
  attack: boolean;
  wrap: boolean;
  web: boolean;
  egg: boolean;
  venom: boolean;
  pause: boolean;
  justAttack: boolean;
  justWeb: boolean;
  justEgg: boolean;
  justVenom: boolean;
  justPause: boolean;
  pointerX: number;
  pointerY: number;
  hasAim: boolean;
};

const empty = (): Actions => ({
  moveX: 0,
  moveY: 0,
  attack: false,
  wrap: false,
  web: false,
  egg: false,
  venom: false,
  pause: false,
  justAttack: false,
  justWeb: false,
  justEgg: false,
  justVenom: false,
  justPause: false,
  pointerX: 0,
  pointerY: 0,
  hasAim: false,
});

function radial(x: number, y: number, dz = 0.18) {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const s = (m - dz) / (1 - dz) / m;
  return { x: x * s, y: y * s };
}

export class Input {
  keys = new Set<string>();
  injected: string[] | null = null;
  steerOverride: number | null = null;
  actions = empty();
  prev = empty();
  pointerX = 0;
  pointerY = 0;
  hasPointer = false;
  joy = { x: 0, y: 0, active: false, id: -1 };
  joyOrigin = { x: 0, y: 0 };
  private buttons = new Set<string>();

  attach(el: HTMLElement) {
    const onDown = (e: KeyboardEvent) => {
      this.keys.add(e.code);
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(
          e.code,
        )
      ) {
        e.preventDefault();
      }
    };
    const onUp = (e: KeyboardEvent) => this.keys.delete(e.code);
    const clear = () => this.keys.clear();
    const onPtr = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      this.pointerX = e.clientX - r.left;
      this.pointerY = e.clientY - r.top;
      this.hasPointer = true;
      if (e.pointerType === "mouse" && e.buttons & 1) this.buttons.add("mouse");
      if (e.pointerType === "mouse" && e.buttons & 2) this.buttons.add("rmouse");
    };
    const onPtrDown = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      this.pointerX = x;
      this.pointerY = y;
      this.hasPointer = e.pointerType === "mouse";
      if (e.pointerType === "touch" && x < r.width * 0.46) {
        this.joy.active = true;
        this.joy.id = e.pointerId;
        this.joyOrigin.x = x;
        this.joyOrigin.y = y;
        this.joy.x = 0;
        this.joy.y = 0;
        el.setPointerCapture(e.pointerId);
      } else if (e.pointerType === "mouse") {
        if (e.button === 0) this.buttons.add("mouse");
        if (e.button === 2) this.buttons.add("rmouse");
      }
    };
    const onPtrMove = (e: PointerEvent) => {
      onPtr(e);
      if (this.joy.active && e.pointerId === this.joy.id) {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const dx = x - this.joyOrigin.x;
        const dy = y - this.joyOrigin.y;
        const v = radial(dx / 56, dy / 56, 0.12);
        this.joy.x = v.x;
        this.joy.y = v.y;
      }
    };
    const onPtrUp = (e: PointerEvent) => {
      if (e.pointerId === this.joy.id) {
        this.joy.active = false;
        this.joy.id = -1;
        this.joy.x = 0;
        this.joy.y = 0;
      }
      if (e.pointerType === "mouse") {
        if (e.button === 0) this.buttons.delete("mouse");
        if (e.button === 2) this.buttons.delete("rmouse");
      }
    };
    const onCtx = (e: Event) => e.preventDefault();
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    el.addEventListener("pointerdown", onPtrDown);
    el.addEventListener("pointermove", onPtrMove);
    el.addEventListener("pointerup", onPtrUp);
    el.addEventListener("pointercancel", onPtrUp);
    el.addEventListener("contextmenu", onCtx);
    this.detach = () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
      el.removeEventListener("pointerdown", onPtrDown);
      el.removeEventListener("pointermove", onPtrMove);
      el.removeEventListener("pointerup", onPtrUp);
      el.removeEventListener("pointercancel", onPtrUp);
      el.removeEventListener("contextmenu", onCtx);
    };
  }

  detach = () => {};

  holdButton(name: string, down: boolean) {
    if (down) this.buttons.add(name);
    else this.buttons.delete(name);
  }

  setKeys(codes: string[]) {
    this.injected = codes;
  }

  poll() {
    this.prev = this.actions;
    const a = empty();
    const src = this.injected ?? [...this.keys];
    const has = (c: string) =>
      this.injected ? this.injected.includes(c) : this.keys.has(c);

    let mx = 0;
    let my = 0;
    if (has("KeyA") || has("ArrowLeft")) mx -= 1;
    if (has("KeyD") || has("ArrowRight")) mx += 1;
    if (has("KeyW") || has("ArrowUp")) my -= 1;
    if (has("KeyS") || has("ArrowDown")) my += 1;
    if (this.steerOverride !== null) mx += this.steerOverride < 0 ? 1 : this.steerOverride > 0 ? -1 : 0;

    if (this.joy.active) {
      mx += this.joy.x;
      my += this.joy.y;
    }

    const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() : [];
    if (pads) {
      for (const p of pads) {
        if (!p || p.mapping !== "standard") continue;
        const st = radial(p.axes[0] ?? 0, p.axes[1] ?? 0);
        mx += st.x;
        my += st.y;
        if (p.buttons[0]?.pressed) a.attack = true;
        if (p.buttons[1]?.pressed) a.wrap = true;
        if (p.buttons[2]?.pressed) a.web = true;
        if (p.buttons[3]?.pressed) a.egg = true;
        if (p.buttons[7]?.pressed) a.venom = true;
        if (p.buttons[9]?.pressed) a.pause = true;
      }
    }

    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    a.moveX = mx;
    a.moveY = my;

    a.attack = a.attack || has("Space") || this.buttons.has("mouse") || this.buttons.has("bite");
    a.wrap = a.wrap || has("KeyF") || this.buttons.has("wrap");
    a.web = a.web || has("KeyQ") || this.buttons.has("web");
    a.egg = a.egg || has("KeyE") || this.buttons.has("egg");
    a.venom = a.venom || has("KeyV") || has("KeyR") || this.buttons.has("rmouse") || this.buttons.has("venom");
    a.pause = a.pause || has("Escape") || has("KeyP");
    a.pointerX = this.pointerX;
    a.pointerY = this.pointerY;
    a.hasAim = this.hasPointer && !this.joy.active;

    a.justAttack = a.attack && !this.prev.attack;
    a.justWeb = a.web && !this.prev.web;
    a.justEgg = a.egg && !this.prev.egg;
    a.justVenom = a.venom && !this.prev.venom;
    a.justPause = a.pause && !this.prev.pause;
    this.actions = a;
    void src;
    return a;
  }
}
