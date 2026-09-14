import { useEffect, useRef, useState, type HTMLAttributes, type PointerEvent, type ReactNode, type RefObject } from "react";
import { Crown, Crosshair, Flag, Hammer, Home, Landmark, Leaf, List, MapPin, Pause, Play, Shield, Swords, Users, Webhook, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameAudio } from "@/game/audio";
import { loadAssets, type SpriteBook } from "@/game/assets";
import { Input } from "@/game/input";
import { render, renderMinimap, screenToWorld, viewWorldSize } from "@/game/render";
import { Sim } from "@/game/sim";
import { DIFFICULTIES, FIXED_DT, WORLD_H, WORLD_W, type Caste, type CommandOpt, type Difficulty, type Evo, type HudSnap, type RoomType } from "@/game/types";
import { cn } from "@/lib/utils";

function emptyHud(): HudSnap {
  return {
    mode: "title",
    view: "world",
    difficulty: "standard",
    queenHp: 280,
    queenMax: 280,
    nestHp: 480,
    nestMax: 480,
    food: 36,
    foodCap: 72,
    material: 16,
    matCap: 36,
    upkeep: 0.6,
    income: 0,
    net: 0,
    hibernating: 0,
    workers: 0,
    attackers: 0,
    defenders: 0,
    air: 0,
    teens: 0,
    brood: 0,
    broodMax: 8,
    carrying: false,
    webCd: 0,
    venomCd: 0,
    workerCost: 6,
    attackCost: 10,
    defendCost: 10,
    queenCost: 40,
    towerCost: 18,
    ticker: "",
    selected: "",
    room: "hatchery",
    rooms: [],
    evoOptions: [],
    succession: [],
    discovered: [],
    fogReady: false,
    bestReach: 0,
    bestByDiff: { easy: 0, standard: 0, difficult: 0 },
    overReason: "",
    nestNear: false,
    canLink: false,
    silkHint: "",
    silkNodes: 1,
    silkDist: 0,
    silkMax: 420,
    silkCost: 2,
    ally: null,
    marking: false,
    builderSel: false,
    hiveName: "",
    units: [],
    orders: [],
  };
}

export function HollowBrood() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef(new Sim());
  const inputRef = useRef(new Input());
  const audioRef = useRef(new GameAudio());
  const spritesRef = useRef<SpriteBook | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [hud, setHud] = useState<HudSnap>(emptyHud);
  const [assignOpen, setAssignOpen] = useState(false);
  const [casteFilter, setCasteFilter] = useState<"all" | Caste>("all");
  const hudTimer = useRef(0);

  useEffect(() => {
    setHud(simRef.current.hud());
  }, []);

  useEffect(() => {
    let alive = true;
    loadAssets()
      .then((book) => {
        if (!alive) return;
        spritesRef.current = book;
        setReady(true);
      })
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Could not load art");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !ready) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const input = inputRef.current;
    const sim = simRef.current;
    sim.audio = audioRef.current;
    input.attach(wrap);

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const mini = miniRef.current;
      if (mini) {
        const mw = 220;
        const mh = 134;
        mini.width = Math.floor(mw * dpr);
        mini.height = Math.floor(mh * dpr);
        mini.style.width = `${mw}px`;
        mini.style.height = `${mh}px`;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const probe = {
      getYaw: () => sim.queen()?.facing ?? 0,
      getSpeed: () => sim.lastQueenSpeed,
      getX: () => sim.queen()?.x ?? 0,
      getY: () => sim.queen()?.y ?? 0,
      setKeys: (codes: string[]) => {
        if (sim.mode === "title") begin("standard");
        input.setKeys(codes);
      },
      setSteer: (v: number) => {
        input.steerOverride = v;
      },
    };
    window.__controlsTest = probe;
    window.__silkTest = {
      query: () => {
        const s = sim.silkQuery();
        return {
          ready: s.ready,
          standOk: s.standOk,
          reachOk: s.reachOk,
          dist: s.dist,
          hint: s.hint,
          links: sim.links.length,
          mute: sim.ents.filter((e) => e.alive && e.kind === "tower" && !e.linked).length,
          nodes: sim.linkedNodes().length,
          material: sim.material,
          mode: sim.mode,
        };
      },
      raise: () => {
        sim.tryBuildTower();
        return sim.ents.filter((e) => e.alive && e.kind === "tower").length;
      },
      layWorker: () => {
        sim.tryLay("worker");
        return true;
      },
      spawnWorker: () => {
        const n = sim.nest();
        if (!n) return false;
        sim.spawnAlly("worker", n.x + 40, n.y);
        return true;
      },
      selectFruit: () => {
        const f = sim.ents.find((e) => e.alive && e.kind === "fruit");
        if (!f) return false;
        sim.selectedId = f.id;
        return true;
      },
      selectWorker: () => {
        const w = sim.ents.find((e) => e.alive && e.caste === "worker");
        if (!w) return false;
        sim.selectedId = w.id;
        return true;
      },
      harvestAt: (x: number, y: number) => {
        const w = sim.ents.find((e) => e.alive && e.caste === "worker") ?? sim.queen();
        if (!w) return false;
        sim.selectOnly(w.id);
        const res = sim.ents.find((e) => e.alive && Math.hypot(e.x - x, e.y - y) < 80 && sim.isResource(e));
        if (res) sim.sendHarvest([w], res);
        else {
          w.job = "harvest";
          w.assignX = x;
          w.assignY = y;
          w.assignR = 170;
        }
        return true;
      },
      clickFruit: () => {
        const f = sim.ents.find((e) => e.alive && e.kind === "fruit" && e.meat > 0);
        if (!f) return false;
        sim.clickWorld(f.x, f.y - f.draw * 0.32);
        return true;
      },
      pickAt: (x: number, y: number) => {
        const h = sim.pickClick(x, y);
        return h ? `${h.kind}:${h.id}` : "none";
      },
      starve: () => {
        for (const e of sim.ents) {
          if (e.alive && e.faction === "spider" && (e.kind === "brood" || e.kind === "queen")) e.foodMeter = 6;
        }
        return true;
      },
      dropKill: (x: number, y: number) => {
        sim.make("pickup", "none", x, y, { r: 10, hp: 1, maxHp: 1, speed: 0, meat: 5, draw: 20, ttl: 40 });
        return true;
      },
      workerPath: () => {
        const w = sim.ents.find((e) => e.alive && e.caste === "worker" && e.job === "harvest") ?? sim.find(sim.selectedId);
        const r = w ? sim.routes.get(w.id) : undefined;
        return {
          points: r?.pts.length ?? 0,
          bends: Math.max(0, (r?.pts.length ?? 1) - 2),
          gx: r?.gx ?? 0,
          gy: r?.gy ?? 0,
        };
      },
      splice: () => sim.tryLink(),
      teleportQueen: (x: number, y: number) => {
        const q = sim.queen();
        if (!q) return;
        q.x = x;
        q.y = y;
        sim.camX = x;
        sim.camY = y;
      },
      setStores: (food: number, material: number) => {
        sim.food = food;
        sim.material = material;
      },
    };

    let last = performance.now();
    let acc = 0;
    let raf = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1;
      acc += dt;
      const actions = input.poll();
      if (actions.justPause && sim.mode === "playing") {
        sim.mode = "paused";
        setHud(sim.hud());
      } else if (actions.justPause && sim.mode === "paused") {
        sim.mode = "playing";
      }
      const cssW = wrap.clientWidth;
      const cssH = wrap.clientHeight;
      const vis = viewWorldSize(cssW, cssH);
      sim.setView(vis.w, vis.h);
      const aim = screenToWorld(actions.pointerX, actions.pointerY, sim.camX, sim.camY, cssW, cssH);
      if (actions.justSelect) {
        if (sim.view === "nest") sim.clickNest(actions.pointerX / cssW, actions.pointerY / cssH);
        else if (sim.view === "hive") sim.clickHive(actions.pointerX / cssW, actions.pointerY / cssH);
        else sim.clickWorld(aim.x, aim.y);
        setHud(sim.hud());
      }
      while (acc >= FIXED_DT) {
        if (sim.mode === "playing") {
          sim.step(FIXED_DT, actions, { x: aim.x, y: aim.y, has: actions.hasAim });
        }
        acc -= FIXED_DT;
      }
      const sprites = spritesRef.current;
      if (sprites) render(ctx, sim, sprites, cssW, cssH);
      const mini = miniRef.current;
      const mctx = mini?.getContext("2d");
      if (mini && mctx && sim.mode !== "title") {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderMinimap(mctx, sim, 220, 134);
      }
      hudTimer.current += dt;
      if (hudTimer.current > 0.12) {
        hudTimer.current = 0;
        setHud(sim.hud());
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      input.detach();
      delete window.__controlsTest;
      delete window.__silkTest;
    };
  }, [ready]);

  function begin(difficulty: Difficulty) {
    audioRef.current.unlock();
    simRef.current.reset(difficulty);
    setAssignOpen(false);
    setCasteFilter("all");
    setHud(simRef.current.hud());
  }

  function hold(name: string, down: boolean) {
    inputRef.current.holdButton(name, down);
  }

  function onMini(e: PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * WORLD_W;
    const y = ((e.clientY - r.top) / r.height) * WORLD_H;
    simRef.current.glance(x, y);
  }

  const playing = hud.mode === "playing";
  const paused = hud.mode === "paused";
  const over = hud.mode === "over";
  const title = hud.mode === "title";
  const succession = hud.mode === "succession";

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative h-dvh w-full overflow-hidden bg-bg text-foreground touch-none select-none",
        hud.marking && "cursor-crosshair",
      )}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {!ready && loadError && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-bg">
          <p className="font-display text-xl tracking-tight text-muted">{loadError}</p>
        </div>
      )}

      {title && !loadError && (
        <TitleOverlay bestByDiff={hud.bestByDiff} onStart={begin} disabled={!ready} />
      )}

      {(playing || paused) && (
        <Hud
          hud={hud}
          miniRef={miniRef}
          onMini={onMini}
          onPause={() => {
            simRef.current.mode = paused ? "playing" : "paused";
            setHud(simRef.current.hud());
          }}
          onHold={hold}
          onEvo={(id) => {
            simRef.current.evolveSelected(id);
            setHud(simRef.current.hud());
          }}
          onExpand={(room) => {
            simRef.current.expandRoom(room);
            setHud(simRef.current.hud());
          }}
          onCommand={(id) => {
            simRef.current.runCommand(id);
            setHud(simRef.current.hud());
          }}
          onToggleUnit={(id) => {
            simRef.current.toggleUnit(id);
            setHud(simRef.current.hud());
          }}
          assignOpen={assignOpen}
          casteFilter={casteFilter}
          onAssign={() => setAssignOpen(true)}
          onFilter={setCasteFilter}
          onCloseAssign={() => setAssignOpen(false)}
          onDeselect={() => {
            simRef.current.deselect();
            setHud(simRef.current.hud());
          }}
        />
      )}

      {paused && (
        <Modal
          title="Paused"
          body="Silk is a chain, not a fence. Mute towers hear nothing until you stand on the post and splice to a live node. If the line back to the hollow breaks, everything downstream goes mute. Defenders hold linked ground; air answers a ringing tower."
          action="Resume"
          onAction={() => {
            simRef.current.mode = "playing";
            setHud(simRef.current.hud());
          }}
        />
      )}

      {succession && (
        <div data-ui className="absolute inset-0 z-30 grid place-items-center bg-bg/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6">
            <h2 className="font-display text-2xl tracking-tight">Choose an heir</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              The Matriarch fell. An adolescent queen can mature and hold the empire.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {hud.succession.map((s) => (
                <Button
                  key={s.id}
                  onClick={() => {
                    simRef.current.matureTeen(s.id);
                    setHud(simRef.current.hud());
                  }}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
        </div>
      )}

      {over && (
        <Modal
          title="The hollow falls"
          body={`${hud.overReason} Reach ${hud.bestReach}.`}
          action="Return to modes"
          onAction={() => {
            simRef.current.mode = "title";
            setHud(simRef.current.hud());
          }}
        />
      )}
    </div>
  );
}

function TitleOverlay({
  bestByDiff,
  onStart,
  disabled,
}: {
  bestByDiff: Record<Difficulty, number>;
  onStart: (d: Difficulty) => void;
  disabled?: boolean;
}) {
  return (
    <div data-ui className="absolute inset-0 z-10 flex flex-col bg-bg/80 px-4 py-4 sm:px-8 sm:py-6">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col justify-center gap-4 sm:gap-6">
        <header className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted">An empire in silk</p>
          <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight text-foreground sm:text-6xl">
            Hollow Brood
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
            Walk the queen into the fruit tree, or tap Harvest on her card. Toggle units below, then pick a duty.
          </p>
        </header>
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(DIFFICULTIES) as Difficulty[]).map((id) => {
            const d = DIFFICULTIES[id];
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => onStart(id)}
                className="rounded-xl border border-border bg-surface p-3 text-left transition-opacity duration-150 hover:bg-surface-elevated disabled:opacity-40 sm:p-4"
              >
                <p className="font-display text-lg tracking-tight sm:text-2xl">{d.label}</p>
                <p className="mt-1 text-xs leading-snug text-muted sm:text-sm">{d.blurb}</p>
                {bestByDiff[id] > 0 && (
                  <p className="mt-2 text-xs tabular-nums text-accent">Reach {bestByDiff[id]}</p>
                )}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted">
          WASD move · toggle units below · Harvest on the queen card starts the larder
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-border bg-surface/80 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Mute</p>
            <p className="mt-1 text-xs leading-snug text-foreground">
              A new tower is deaf. No fog, no alert, no perimeter until silk reaches it from the nest.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface/80 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Stand & splice</p>
            <p className="mt-1 text-xs leading-snug text-foreground">
              Walk onto the post — not from range — then Q. The strand must reach a live node within 420 paces and costs 2 material.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface/80 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Chain</p>
            <p className="mt-1 text-xs leading-snug text-foreground">
              Hop tower to tower. Break the line home and everything downstream goes mute. Princesses splice for free.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Hud({
  hud,
  miniRef,
  onMini,
  onPause,
  onHold,
  onEvo,
  onExpand,
  onCommand,
  onDeselect,
  onToggleUnit,
  assignOpen,
  casteFilter,
  onAssign,
  onFilter,
  onCloseAssign,
}: {
  hud: HudSnap;
  miniRef: RefObject<HTMLCanvasElement | null>;
  onMini: (e: PointerEvent<HTMLCanvasElement>) => void;
  onPause: () => void;
  onHold: (name: string, down: boolean) => void;
  onEvo: (id: Evo) => void;
  onExpand: (room: RoomType) => void;
  onCommand: (id: string) => void;
  onDeselect: () => void;
  onToggleUnit: (id: number) => void;
  assignOpen: boolean;
  casteFilter: "all" | Caste;
  onAssign: () => void;
  onFilter: (c: "all" | Caste) => void;
  onCloseAssign: () => void;
}) {
  return (
    <div data-ui className="pointer-events-none absolute inset-0 z-10">
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-surface/90 px-3 py-2">
            <span className="text-xs uppercase tracking-wider text-muted">{DIFFICULTIES[hud.difficulty].label}</span>
            <span className="h-3.5 w-px bg-border" />
            <span className="text-xs text-muted">Food</span>
            <span className="text-sm font-medium tabular-nums">
              {hud.food}/{hud.foodCap}
            </span>
            <span className={cn("text-xs tabular-nums", hud.net < 0 ? "text-danger" : "text-muted")}>
              {hud.net >= 0 ? "+" : ""}
              {hud.net.toFixed(1)}/s
            </span>
            <span className="h-3.5 w-px bg-border" />
            <span className="text-xs text-muted">Mat</span>
            <span className="text-sm font-medium tabular-nums">
              {hud.material}/{hud.matCap}
            </span>
            <span className="h-3.5 w-px bg-border" />
            <span className="text-xs text-muted">Upkeep</span>
            <span className="text-sm tabular-nums">{hud.upkeep.toFixed(1)}/s</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 rounded-lg border border-border bg-surface/90 px-3 py-1.5 text-xs tabular-nums text-muted">
            <Hammer className="size-3" /> {hud.workers}
            <Swords className="size-3" /> {hud.attackers}
            <Shield className="size-3" /> {hud.defenders}
            <span>Air {hud.air}</span>
            <span>
              Brood {hud.brood}/{hud.broodMax}
            </span>
            {hud.hibernating > 0 && <span className="text-danger">Sleep {hud.hibernating}</span>}
          </div>
          {hud.ticker && (
            <p className="max-w-md truncate rounded-md bg-surface/80 px-2.5 py-1 text-xs text-accent">{hud.ticker}</p>
          )}
          {hud.silkHint && (
            <p className="max-w-md rounded-md border border-border bg-surface/90 px-2.5 py-1 text-xs text-muted">
              Silk · {hud.silkNodes} node{hud.silkNodes === 1 ? "" : "s"}
              {hud.silkDist > 0 ? ` · ${hud.silkDist}/${hud.silkMax}` : ""} · {hud.silkHint}
            </p>
          )}
        </div>
        <div className="pointer-events-auto flex items-start gap-3">
          <div className="flex flex-col gap-2">
            <Meter label="Matriarch" value={hud.queenHp} max={hud.queenMax} />
            <Meter label="Nest" value={hud.nestHp} max={hud.nestMax} warn />
          </div>
          <Button size="icon" variant="secondary" onClick={onPause} aria-label="Pause" className="size-11">
            {hud.mode === "paused" ? <Play /> : <Pause />}
          </Button>
        </div>
      </div>

      <div className="pointer-events-auto absolute bottom-28 left-3 rounded-lg border border-border bg-surface/90 p-1">
        <canvas
          ref={miniRef}
          className="block cursor-pointer rounded-md"
          width={220}
          height={134}
          onPointerDown={onMini}
          aria-label="Minimap"
        />
        <p className="px-1 py-0.5 text-xs uppercase tracking-wider text-muted">Map</p>
      </div>

      {hud.ally && !assignOpen && <AllyCard hud={hud} onCommand={onCommand} onDeselect={onDeselect} />}

      {assignOpen && (
        <AssignPanel
          hud={hud}
          filter={casteFilter}
          onFilter={onFilter}
          onToggle={onToggleUnit}
          onCommand={onCommand}
          onClose={onCloseAssign}
        />
      )}

      {hud.view === "hive" && (
        <div className="pointer-events-auto absolute left-1/2 top-24 w-64 -translate-x-1/2 rounded-xl border border-border bg-surface p-3">
          <p className="font-display text-lg tracking-tight">Taken hive</p>
          <p className="mt-1 text-xs text-muted">
            Click a cache, then send a harvester. They walk it once the queen is back in the silk net.
          </p>
          <Button size="sm" className="mt-3 w-full" variant="secondary" {...{
            onPointerDown: (e: PointerEvent) => {
              e.stopPropagation();
              onHold("nest", true);
            },
            onPointerUp: (e: PointerEvent) => {
              e.stopPropagation();
              onHold("nest", false);
            },
          }}>
            Return to woods
          </Button>
        </div>
      )}

      {hud.view === "nest" && (
        <div className="pointer-events-auto absolute right-3 top-28 w-56 rounded-xl border border-border bg-surface p-3">
          <p className="font-display text-lg tracking-tight">Below</p>
          <p className="mt-1 text-xs text-muted">
            {hud.room || "chamber"} · {hud.selected || "no brood selected"}
          </p>
          <Button size="sm" className="mt-2 w-full" variant="secondary" onClick={() => onExpand(hud.room || "food")}>
            Expand room
          </Button>
          <div className="mt-3 flex flex-col gap-2">
            {hud.evoOptions.map((o) => (
              <Button
                key={o.id}
                size="sm"
                variant="secondary"
                disabled={hud.food < o.costF || hud.material < o.costM}
                onClick={() => onEvo(o.id as Evo)}
              >
                {o.label} · {o.costF}f {o.costM}m
              </Button>
            ))}
          </div>
        </div>
      )}

      <CommandBar hud={hud} onHold={onHold} onAssign={onAssign} />
    </div>
  );
}

function AllyCard({
  hud,
  onCommand,
  onDeselect,
}: {
  hud: HudSnap;
  onCommand: (id: string) => void;
  onDeselect: () => void;
}) {
  const a = hud.ally;
  if (!a) return null;
  const groups: { id: CommandOpt["group"]; label: string }[] = [
    { id: "order", label: "Orders" },
    { id: "roster", label: "Harvesters" },
    { id: "build", label: "Build" },
    { id: "evo", label: "Evo" },
  ];
  const portrait =
    a.kind === "fruit" ? <Leaf className="size-5" /> :
    a.kind === "tower" ? <Landmark className="size-5" /> :
    a.kind === "nest" ? <Home className="size-5" /> :
    a.caste === "defender" ? <Shield className="size-5" /> :
    a.caste === "attacker" ? <Swords className="size-5" /> :
    a.caste === "worker" && a.evo === "builder" ? <Hammer className="size-5" /> :
    a.caste === "worker" ? <Leaf className="size-5" /> :
    <Flag className="size-5" />;
  const jobLine =
    a.kind === "fruit" || a.kind === "solar" || a.kind === "battery" || a.kind === "scrap" || a.kind === "loot" || a.kind === "node"
      ? a.meat > 0
        ? `${a.meat} stores`
        : "stripped"
      : a.job === "none"
        ? "idle"
        : a.job;
  return (
    <div
      data-ui
      className="pointer-events-auto absolute right-3 top-20 w-72 rounded-xl border border-border bg-surface p-3 max-[820px]:bottom-36 max-[820px]:top-auto max-[820px]:w-64"
    >
      <div className="flex items-start gap-3">
        <div className="grid size-12 shrink-0 place-items-center rounded-lg border border-border bg-surface-elevated text-accent">
          {portrait}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg leading-tight tracking-tight">{a.label}</p>
          <p className="mt-0.5 text-xs uppercase tracking-wider text-muted">
            {jobLine}
            {a.skill > 0 ? ` · skill ${a.skill}` : ""}
            {hud.marking ? " · marking" : ""}
          </p>
          {a.maxHp > 1 && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.max(0, Math.min(1, a.hp / a.maxHp)) * 100}%` }}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label="Deselect"
          onClick={onDeselect}
          className="grid size-11 shrink-0 place-items-center rounded-lg border border-border text-muted"
        >
          <X className="size-4" />
        </button>
      </div>
          {a.maxHp > 1 && (
            <p className="mt-1 text-xs tabular-nums text-muted">
              {a.hp}/{a.maxHp} hp
              {a.foodMax > 0 ? ` · feed ${a.food}/${a.foodMax}` : ""}
            </p>
          )}

      {groups.map((g) => {
        const cmds = a.commands.filter((c) => c.group === g.id);
        if (!cmds.length) return null;
        return (
          <div key={g.id} className="mt-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{g.label}</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {cmds.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={!c.enabled}
                  title={c.enabled ? c.label : c.reason}
                  onClick={() => onCommand(c.id)}
                  className={cn(
                    "flex min-h-11 flex-col items-center justify-center rounded-lg border px-1 py-1.5 text-center text-xs leading-tight disabled:opacity-40",
                    c.enabled ? "border-border bg-surface-elevated text-foreground" : "border-border bg-bg text-muted",
                  )}
                >
                  <span className="font-medium">{c.label}</span>
                  {(c.costF > 0 || c.costM > 0) && (
                    <span className="mt-0.5 tabular-nums text-muted">
                      {c.costF > 0 ? `${c.costF}f` : ""}
                      {c.costF > 0 && c.costM > 0 ? " " : ""}
                      {c.costM > 0 ? `${c.costM}m` : ""}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {cmds.some((c) => !c.enabled && c.reason) && (
              <p className="mt-2 text-xs leading-snug text-muted">
                {cmds.find((c) => !c.enabled && c.reason)?.reason}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Meter({
  label,
  value,
  max,
  warn = false,
}: {
  label: string;
  value: number;
  max: number;
  warn?: boolean;
}) {
  const p = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <div className="w-36 rounded-lg border border-border bg-surface/90 px-2.5 py-1.5">
      <div className="flex justify-between text-xs uppercase tracking-wider text-muted">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">
          {Math.ceil(value)}/{max}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg">
        <div className={cn("h-full rounded-full", warn ? "bg-danger" : "bg-accent")} style={{ width: `${p * 100}%` }} />
      </div>
    </div>
  );
}

function CommandBar({
  hud,
  onHold,
  onAssign,
}: {
  hud: HudSnap;
  onHold: (name: string, down: boolean) => void;
  onAssign: () => void;
}) {
  const press = (name: string) => ({
    onPointerDown: (e: PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      onHold(name, true);
    },
    onPointerUp: (e: PointerEvent) => {
      e.stopPropagation();
      onHold(name, false);
    },
    onPointerCancel: () => onHold(name, false),
  });
  const picked = hud.units.filter((u) => u.selected).length;
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="pointer-events-none mb-1 size-24 shrink-0 rounded-full border-2 border-border/80 bg-surface/40" />

      <div className="pointer-events-auto flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={onAssign}
          className="flex min-h-14 min-w-36 items-center justify-center gap-2 rounded-xl border border-accent bg-surface-elevated px-4 py-2 text-sm font-medium"
        >
          <Users className="size-5 text-accent" />
          Assign
          {picked > 0 && <span className="tabular-nums text-muted">{picked}</span>}
        </button>
        <p className="text-xs uppercase tracking-[0.16em] text-muted">Brood {hud.brood}/{hud.broodMax}</p>
      </div>

      <div className="pointer-events-auto flex flex-col items-end gap-3">
        <div className="flex gap-3">
          <RoundBtn label="Attend" hotkey="C" icon={<Flag />} {...press("follow")} />
          <RoundBtn
            label={hud.canLink ? "Splice" : "Silk"}
            hotkey="Q"
            icon={<Webhook />}
            cool={hud.webCd}
            ready={hud.canLink}
            {...press("web")}
          />
          <RoundBtn label="Venom" hotkey="V" icon={<Crosshair />} cool={hud.venomCd} {...press("venom")} />
        </div>
        <RoundBtn label="Bite" hotkey="Space" icon={<Swords />} large {...press("bite")} />
      </div>
    </div>
  );
}

function AssignPanel({
  hud,
  filter,
  onFilter,
  onToggle,
  onCommand,
  onClose,
}: {
  hud: HudSnap;
  filter: "all" | Caste;
  onFilter: (c: "all" | Caste) => void;
  onToggle: (id: number) => void;
  onCommand: (id: string) => void;
  onClose: () => void;
}) {
  const tabs: { id: "all" | Caste; label: string }[] = [
    { id: "all", label: "All" },
    { id: "queen", label: "Queen" },
    { id: "worker", label: "Workers" },
    { id: "attacker", label: "Attackers" },
    { id: "defender", label: "Defenders" },
  ];
  const units = hud.units.filter((u) => filter === "all" || u.caste === filter);
  const picked = hud.units.filter((u) => u.selected);
  const orders = (hud.orders.length ? hud.orders : hud.ally?.commands ?? []).filter((c) => c.group === "order" || c.group === "build");
  const evos = (hud.orders.length ? hud.orders : hud.ally?.commands ?? []).filter((c) => c.group === "evo");
  return (
    <div
      data-ui
      className="pointer-events-auto absolute inset-x-3 bottom-32 top-20 z-20 mx-auto flex w-full max-w-lg flex-col rounded-xl border border-border bg-surface p-3 shadow-lg"
    >
      <div className="flex items-center gap-2">
        <List className="size-5 text-accent" />
        <p className="font-display text-xl tracking-tight">Assign</p>
        <p className="text-xs text-muted">
          {picked.length ? `${picked.length} toggled` : "Toggle brood, then order or evo"}
        </p>
        <button
          type="button"
          aria-label="Close assign"
          onClick={onClose}
          className="ml-auto grid size-11 place-items-center rounded-lg border border-border text-muted"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onFilter(t.id)}
            className={cn(
              "min-h-11 rounded-lg border px-3 text-xs font-medium",
              filter === t.id ? "border-accent bg-surface-elevated text-foreground" : "border-border bg-bg text-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {units.length === 0 && (
          <p className="text-xs text-muted">No brood in this caste yet. Lay eggs at the hollow.</p>
        )}
        <div className="flex flex-col gap-2">
          {units.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => onToggle(u.id)}
              className={cn(
                "flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 text-left",
                u.selected ? "border-accent bg-surface-elevated" : "border-border bg-bg",
              )}
            >
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-md border text-xs", u.selected ? "border-accent text-accent" : "border-border text-muted")}>
                {u.selected ? "●" : ""}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium capitalize">{u.label}{u.winged ? " · wings" : ""}</span>
                <span className="text-xs capitalize text-muted">{u.job === "none" ? "idle" : u.job} · feed {u.food}/{u.foodMax}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 border-t border-border pt-3">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Orders</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {orders.length === 0 && <p className="col-span-3 text-xs text-muted">Toggle at least one unit.</p>}
          {orders.map((c) => (
            <CmdBtn key={c.id} c={c} onCommand={onCommand} />
          ))}
        </div>
        {evos.length > 0 && (
          <>
            <p className="mt-3 text-xs font-medium uppercase tracking-[0.16em] text-muted">Evo path</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {evos.map((c) => (
                <CmdBtn key={c.id} c={c} onCommand={onCommand} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CmdBtn({ c, onCommand }: { c: CommandOpt; onCommand: (id: string) => void }) {
  return (
    <button
      type="button"
      disabled={!c.enabled}
      title={c.enabled ? c.label : c.reason}
      onClick={() => onCommand(c.id)}
      className={cn(
        "flex min-h-11 flex-col items-center justify-center rounded-lg border px-1 py-1.5 text-center text-xs leading-tight disabled:opacity-40",
        c.enabled ? "border-border bg-surface-elevated text-foreground" : "border-border bg-bg text-muted",
      )}
    >
      <span className="font-medium">{c.label}</span>
      {(c.costF > 0 || c.costM > 0) && (
        <span className="mt-0.5 tabular-nums text-muted">
          {c.costF > 0 ? `${c.costF}f` : ""}
          {c.costF > 0 && c.costM > 0 ? " " : ""}
          {c.costM > 0 ? `${c.costM}m` : ""}
        </span>
      )}
    </button>
  );
}

function RoundBtn({
  label,
  icon,
  hotkey,
  cool = 0,
  disabled,
  large,
  ready,
  ...rest
}: {
  label: string;
  icon: ReactNode;
  hotkey?: string;
  cool?: number;
  disabled?: boolean;
  large?: boolean;
  ready?: boolean;
} & HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-2xl border bg-surface text-foreground disabled:opacity-40",
        ready ? "border-accent" : "border-border",
        large ? "size-16" : "size-12",
      )}
      {...rest}
    >
      {icon}
      <span className="mt-0.5 text-xs uppercase tracking-wide text-muted">{label}</span>
      {hotkey && (
        <span className="absolute -top-2 right-1 rounded bg-bg px-1 text-xs tabular-nums text-muted">{hotkey}</span>
      )}
      {cool > 0 && (
        <span className="absolute inset-0 grid place-items-center rounded-2xl bg-bg/60 text-xs tabular-nums">
          {cool.toFixed(1)}
        </span>
      )}
    </button>
  );
}

function Modal({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div data-ui className="absolute inset-0 z-30 grid place-items-center bg-bg/70 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6">
        <h2 className="font-display text-2xl tracking-tight">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
        <Button className="mt-6 w-full" onClick={onAction}>
          {action}
        </Button>
      </div>
    </div>
  );
}
