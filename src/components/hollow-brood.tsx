import { useEffect, useRef, useState, type HTMLAttributes, type PointerEvent, type ReactNode } from "react";
import { Bug, Crosshair, Egg, Pause, Play, Swords, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameAudio } from "@/game/audio";
import { loadAssets, type SpriteBook } from "@/game/assets";
import { Input } from "@/game/input";
import { render } from "@/game/render";
import { Sim } from "@/game/sim";
import { FIXED_DT, type HudSnap, type UpgradeId } from "@/game/types";
import { cn } from "@/lib/utils";

const UPGRADE_META: { id: UpgradeId; label: string; blurb: string }[] = [
  { id: "fang", label: "Fang", blurb: "Bite and venom" },
  { id: "carapace", label: "Carapace", blurb: "Matriarch health" },
  { id: "silk", label: "Silk", blurb: "Webs last longer" },
  { id: "brood", label: "Brood", blurb: "More spiderlings" },
];

function emptyHud(): HudSnap {
  return {
    mode: "title",
    queenHp: 260,
    queenMax: 260,
    nestHp: 420,
    nestMax: 420,
    meat: 18,
    wave: 1,
    brood: 0,
    broodMax: 3,
    carrying: false,
    webCd: 0,
    venomCd: 0,
    eggCost: 12,
    waveClear: 0,
    ticker: "",
    fang: 0,
    carapace: 0,
    silk: 0,
    broodLv: 0,
    costs: { fang: 16, carapace: 16, silk: 14, brood: 22 },
    killsHuman: 0,
    killsScorpion: 0,
    scorpionOnHuman: 0,
    bestWave: 0,
    overReason: "",
  };
}

export function HollowBrood() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef(new Sim());
  const inputRef = useRef(new Input());
  const audioRef = useRef(new GameAudio());
  const spritesRef = useRef<SpriteBook | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [hud, setHud] = useState<HudSnap>(emptyHud);
  const [shop, setShop] = useState(false);
  const hudTimer = useRef(0);

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
        if (sim.mode === "title") begin();
        input.setKeys(codes);
      },
      setSteer: (v: number) => {
        input.steerOverride = v;
      },
    };
    window.__controlsTest = probe;

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
      const aim = screenToWorld(actions.pointerX, actions.pointerY, sim.camX, sim.camY, cssW, cssH);
      while (acc >= FIXED_DT) {
        if (sim.mode === "playing") {
          sim.step(FIXED_DT, actions, { x: aim.x, y: aim.y, has: actions.hasAim });
        }
        acc -= FIXED_DT;
      }
      const sprites = spritesRef.current;
      if (sprites) render(ctx, sim, sprites, cssW, cssH);
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
    };
  }, [ready]);

  function begin() {
    audioRef.current.unlock();
    simRef.current.reset();
    setShop(false);
    setHud(simRef.current.hud());
  }

  function hold(name: string, down: boolean) {
    inputRef.current.holdButton(name, down);
  }

  const playing = hud.mode === "playing";
  const paused = hud.mode === "paused";
  const over = hud.mode === "over";
  const title = hud.mode === "title";

  return (
    <div
      ref={wrapRef}
      className="relative h-dvh w-full overflow-hidden bg-bg text-foreground touch-none select-none"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {!ready && loadError && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-bg">
          <p className="font-display text-xl tracking-tight text-muted">{loadError}</p>
        </div>
      )}

      {title && !loadError && (
        <TitleOverlay best={hud.bestWave} onStart={begin} disabled={!ready} />
      )}

      {(playing || paused) && (
        <Hud
          hud={hud}
          shop={shop}
          onShop={() => setShop((s) => !s)}
          onBuy={(id) => {
            simRef.current.buy(id);
            setHud(simRef.current.hud());
          }}
          onPause={() => {
            simRef.current.mode = paused ? "playing" : "paused";
            setHud(simRef.current.hud());
          }}
        />
      )}

      {playing && (
        <>
          <p className="pointer-events-none absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 rounded-full border border-border bg-surface/80 px-3 py-1 text-xs text-muted sm:block">
            WASD move · click bite · V venom · Q web · E egg · Esc pause
          </p>
          <TouchPad
            onHold={hold}
            webCd={hud.webCd}
            venomCd={hud.venomCd}
            eggCost={hud.eggCost}
            meat={hud.meat}
          />
        </>
      )}

      {paused && (
        <Modal
          title="Paused"
          body="The hollow waits. Scorpions still pick the nearest prey when you return — raiders included."
          action="Resume"
          onAction={() => {
            simRef.current.mode = "playing";
            setHud(simRef.current.hud());
          }}
        />
      )}

      {over && (
        <Modal
          title="The hollow falls"
          body={`${hud.overReason} Wave ${hud.wave}. Scorpions stole ${hud.scorpionOnHuman} strikes from the raiders.`}
          action="Spin again"
          onAction={begin}
        />
      )}
    </div>
  );
}

function screenToWorld(
  px: number,
  py: number,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
) {
  return {
    x: camX - viewW / 2 + px,
    y: camY - viewH / 2 + py,
  };
}

function TitleOverlay({
  best,
  onStart,
  disabled,
}: {
  best: number;
  onStart: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-bg/80 px-5 py-8 sm:px-10">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8">
        <header className="max-w-xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted">A three-way war</p>
          <h1 className="mt-3 font-display text-5xl leading-tight tracking-tight text-foreground sm:text-7xl">
            Hollow Brood
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
            Command the Matriarch of a moonlit forest hollow. Wrap raiders in silk, feed the nest,
            and grow a brood. Wild scorpions hunt{" "}
            <span className="text-foreground">anyone</span> — villagers, spiderlings, and you —
            never just the queen.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-3">
          <Fact k="Move" v="WASD or left stick" />
          <Fact k="Bite / venom" v="Click or Space · V" />
          <Fact k="Silk & eggs" v="Q webs · E near nest" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={onStart} disabled={disabled}>
            {disabled ? "Spinning silk…" : "Enter the hollow"}
          </Button>
          {best > 0 && (
            <p className="text-sm text-muted">
              Best wave <span className="font-medium text-foreground tabular-nums">{best}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{k}</p>
      <p className="mt-1 text-sm text-foreground">{v}</p>
    </div>
  );
}

function Hud({
  hud,
  shop,
  onShop,
  onBuy,
  onPause,
}: {
  hud: HudSnap;
  shop: boolean;
  onShop: () => void;
  onBuy: (id: UpgradeId) => void;
  onPause: () => void;
}) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:p-4">
        <div className="pointer-events-auto flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface/90 px-3 py-2">
            <span className="text-xs uppercase tracking-wider text-muted">Wave</span>
            <span className="font-display text-xl tabular-nums leading-none">{hud.wave}</span>
            <span className="mx-1 h-4 w-px bg-border" />
            <span className="text-xs text-muted">Meat</span>
            <span className="text-sm font-medium tabular-nums">{hud.meat}</span>
            <span className="mx-1 h-4 w-px bg-border" />
            <Bug className="size-3.5 text-muted" />
            <span className="text-sm tabular-nums">
              {hud.brood}/{hud.broodMax}
            </span>
          </div>
          {hud.ticker && (
            <p className="max-w-xs truncate rounded-lg bg-surface/80 px-3 py-1.5 text-xs text-accent">
              {hud.ticker}
            </p>
          )}
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <Meter label="Matriarch" value={hud.queenHp} max={hud.queenMax} />
          <Meter label="Nest" value={hud.nestHp} max={hud.nestMax} warn />
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={onShop}>
              Evolve
            </Button>
            <Button size="icon" variant="secondary" onClick={onPause} aria-label="Pause">
              {hud.mode === "paused" ? <Play /> : <Pause />}
            </Button>
          </div>
        </div>
      </div>

      {hud.waveClear > 0 && (
        <p className="pointer-events-none absolute left-1/2 top-[28%] z-10 -translate-x-1/2 font-display text-3xl tracking-tight text-foreground">
          Wave {hud.wave}
        </p>
      )}

      {hud.carrying && (
        <p className="pointer-events-none absolute bottom-28 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
          Haul the cocoon to the nest
        </p>
      )}

      {shop && (
        <div className="absolute bottom-24 left-1/2 z-20 w-[min(92vw,28rem)] -translate-x-1/2 rounded-2xl border border-border bg-surface p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg">Evolve</h2>
            <Button size="sm" variant="ghost" onClick={onShop}>
              Close
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {UPGRADE_META.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => onBuy(u.id)}
                disabled={hud.meat < hud.costs[u.id]}
                className="rounded-xl border border-border bg-surface-elevated p-3 text-left disabled:opacity-40"
              >
                <p className="text-sm font-medium">{u.label}</p>
                <p className="text-xs text-muted">{u.blurb}</p>
                <p className="mt-2 text-xs tabular-nums text-accent">{hud.costs[u.id]} meat</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
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
    <div className="w-40 rounded-xl border border-border bg-surface/90 px-3 py-2">
      <div className="flex justify-between text-[11px] uppercase tracking-wider text-muted">
        <span>{label}</span>
        <span className="tabular-nums text-foreground">
          {Math.ceil(value)}/{max}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-bg">
        <div
          className={cn("h-full rounded-full", warn ? "bg-danger" : "bg-accent")}
          style={{ width: `${p * 100}%` }}
        />
      </div>
    </div>
  );
}

function TouchPad({
  onHold,
  webCd,
  venomCd,
  eggCost,
  meat,
}: {
  onHold: (name: string, down: boolean) => void;
  webCd: number;
  venomCd: number;
  eggCost: number;
  meat: number;
}) {
  const press = (name: string) => ({
    onPointerDown: (e: PointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      onHold(name, true);
    },
    onPointerUp: () => onHold(name, false),
    onPointerCancel: () => onHold(name, false),
  });
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-between p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
      <div className="pointer-events-none size-28 rounded-full border border-border/80 bg-surface/40" />
      <div className="pointer-events-auto grid grid-cols-2 gap-2">
        <RoundBtn label="Bite" icon={<Swords />} {...press("bite")} />
        <RoundBtn label="Venom" icon={<Crosshair />} cool={venomCd} {...press("venom")} />
        <RoundBtn label="Silk" icon={<Webhook />} cool={webCd} {...press("web")} />
        <RoundBtn label="Egg" icon={<Egg />} disabled={meat < eggCost} {...press("egg")} />
      </div>
    </div>
  );
}

function RoundBtn({
  label,
  icon,
  cool = 0,
  disabled,
  ...rest
}: {
  label: string;
  icon: ReactNode;
  cool?: number;
  disabled?: boolean;
} & HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      className="relative flex size-14 flex-col items-center justify-center rounded-full border border-border bg-surface text-foreground disabled:opacity-40"
      {...rest}
    >
      {icon}
      {cool > 0 && (
        <span className="absolute inset-0 grid place-items-center rounded-full bg-bg/60 text-xs tabular-nums">
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
    <div className="absolute inset-0 z-30 grid place-items-center bg-bg/70 px-4">
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
