import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronRight,
  Coins,
  Flag,
  Lock,
  Pause,
  Play,
  RotateCcw,
  Timer,
  Volume2,
  VolumeX,
} from "lucide-react";
import { LEVELS } from "@/game/levels";
import { Sfx } from "@/game/audio";
import { GameSim, PLAYER_H, PLAYER_W, type Snap } from "@/game/sim";
import { drawBackdrop, drawWorld, viewScale } from "@/game/draw";
import { formatTime, loadSave, writeSave } from "@/game/save";
import type { Save, Screen } from "@/game/types";

const emptySnap: Snap = { coins: 0, total: 0, time: 0, checkpoint: -1, deaths: 0, note: "" };

export function PlatformGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<GameSim | null>(null);
  const sfxRef = useRef<Sfx | null>(null);
  const screenRef = useRef<Screen>("select");
  const camRef = useRef({ x: 0, y: 0, snap: true });
  const [screen, setScreen] = useState<Screen>("select");
  const [levelIndex, setLevelIndex] = useState(0);
  const [hud, setHud] = useState<Snap>(emptySnap);
  const [save, setSave] = useState<Save | null>(null);
  const [coarse, setCoarse] = useState(false);
  const level = LEVELS[levelIndex] ?? LEVELS[0]!;
  screenRef.current = screen;

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    const stored = loadSave();
    setSave(stored);
    const sfx = new Sfx();
    sfx.muted = stored.mute;
    sfxRef.current = sfx;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mq = window.matchMedia("(pointer: coarse), (max-width: 820px)");
    const onMq = () => setCoarse(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);

    const unlock = () => sfx.unlock();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    const onVis = () => {
      if (document.visibilityState === "visible") sfx.unlock();
    };
    document.addEventListener("visibilitychange", onVis);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let hudTick = 0;
    let clock = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      clock += dt;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const pw = Math.max(1, Math.round(rect.width * dpr));
        const ph = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== pw || canvas.height !== ph) {
          canvas.width = pw;
          canvas.height = ph;
        }
        const sim = simRef.current;
        const mode = screenRef.current;
        if (sim && mode !== "select") {
          acc += dt;
          let steps = 0;
          while (acc >= 1 / 60 && steps < 8) {
            sim.update(1 / 60);
            acc -= 1 / 60;
            steps += 1;
          }
          if (steps === 8) acc = 0;
          sfx.tick(dt);
          const scale = viewScale(rect.width);
          const viewW = rect.width / scale;
          const viewH = rect.height / scale;
          const look = sim.player.facing * 78;
          let tx = sim.player.x + PLAYER_W / 2 - viewW * 0.36 + look;
          let ty = sim.player.y + PLAYER_H / 2 - viewH * 0.46;
          tx = clamp(tx, 0, Math.max(0, sim.level.width - viewW));
          ty = clamp(ty, 0, Math.max(0, sim.level.height - viewH));
          if (camRef.current.snap) {
            camRef.current.x = tx;
            camRef.current.y = ty;
            camRef.current.snap = false;
          } else {
            const k = 1 - Math.exp(-7 * dt);
            camRef.current.x += (tx - camRef.current.x) * k;
            camRef.current.y += (ty - camRef.current.y) * k;
          }
          drawWorld(ctx, sim, rect.width, rect.height, dpr, camRef.current.x, camRef.current.y, scale, reduce, clock);
          hudTick += dt;
          if (hudTick > 0.2 && mode === "play") {
            hudTick = 0;
            setHud(sim.snapshot());
          }
        } else {
          sfx.tick(dt);
          drawBackdrop(ctx, rect.width, rect.height, dpr, clock);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onKeyDown = (e: KeyboardEvent) => {
      const sim = simRef.current;
      if (sim && GameSim.isGameKey(e.code) && screenRef.current === "play") e.preventDefault();
      sim?.keys.add(e.code);
      if (e.code === "Escape") {
        const mode = screenRef.current;
        if (mode === "play") setScreen("pause");
        else if (mode === "pause") setScreen("play");
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      simRef.current?.keys.delete(e.code);
    };
    const clearKeys = () => simRef.current?.keys.clear();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);

    window.__controlsTest = {
      getYaw: () => 0,
      getSpeed: () => Math.abs(simRef.current?.player.vx ?? 0),
      getX: () => simRef.current?.player.x ?? 0,
      getY: () => simRef.current?.player.y ?? 0,
      getFacing: () => simRef.current?.player.facing ?? 1,
      getCoins: () => simRef.current?.snapshot().coins ?? 0,
      setKeys: (codes: string[]) => simRef.current?.setKeys(codes),
    };

    return () => {
      cancelAnimationFrame(raf);
      mq.removeEventListener("change", onMq);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
      delete window.__controlsTest;
    };
  }, []);

  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    if (screen === "pause") sim.mode = "pause";
    if (screen === "play" && sim.mode === "pause") sim.mode = "play";
  }, [screen]);

  function persist(next: Save) {
    setSave(next);
    writeSave(next);
    if (sfxRef.current) sfxRef.current.setMuted(next.mute);
  }

  function boot(index: number) {
    const sfx = sfxRef.current ?? new Sfx();
    sfxRef.current = sfx;
    sfx.unlock();
    const sim = new GameSim(LEVELS[index]!, sfx, (snap, kind) => {
      setHud(snap);
      if (kind === "win") {
        setScreen("win");
        setSave((prev) => {
          const base = prev ?? loadSave();
          const row = base.levels[index] ?? { bestCoins: 0, bestTime: null, cleared: false };
          const levels = base.levels.slice();
          levels[index] = {
            cleared: true,
            bestCoins: Math.max(row.bestCoins, snap.coins),
            bestTime: row.bestTime == null ? snap.time : Math.min(row.bestTime, snap.time),
          };
          const next: Save = {
            ...base,
            unlocked: Math.max(base.unlocked, Math.min(LEVELS.length - 1, index + 1)),
            levels,
          };
          writeSave(next);
          return next;
        });
      }
    });
    simRef.current = sim;
    camRef.current.snap = true;
    setLevelIndex(index);
    setHud(sim.snapshot());
    setScreen("play");
  }

  function toggleMute() {
    setSave((prev) => {
      const base = prev ?? loadSave();
      const next = { ...base, mute: !base.mute };
      writeSave(next);
      sfxRef.current?.unlock();
      sfxRef.current?.setMuted(next.mute);
      return next;
    });
  }

  const record = save?.levels[levelIndex];
  const showTouch = coarse && (screen === "play" || screen === "pause");

  return (
    <main className="relative h-dvh overflow-hidden bg-ink text-cream select-none">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" aria-hidden />

      {screen !== "select" && (
        <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="pointer-events-auto min-w-0 rounded-card border border-cream/15 bg-ink/80 px-3 py-2 backdrop-blur-md">
            <p className="truncate font-display text-lg leading-none">{level.name}</p>
            <p className="mt-1 flex items-center gap-3 text-sm text-cream/75">
              <span className="inline-flex items-center gap-1">
                <Coins className="size-4 text-amber" aria-hidden />
                {hud.coins}/{hud.total}
              </span>
              <span className="inline-flex items-center gap-1">
                <Timer className="size-4" aria-hidden />
                {formatTime(hud.time)}
              </span>
            </p>
          </div>
          <div className="pointer-events-auto flex gap-2">
            <IconButton label={save?.mute ? "Sesi aç" : "Sesi kapat"} onClick={toggleMute}>
              {save?.mute ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </IconButton>
            {screen === "play" && (
              <IconButton label="Duraklat" onClick={() => setScreen("pause")}>
                <Pause className="size-5" />
              </IconButton>
            )}
          </div>
        </header>
      )}

      {screen === "play" && hud.note && (
        <p className="pointer-events-none absolute top-24 left-1/2 z-10 -translate-x-1/2 rounded-full bg-ink/80 px-4 py-2 text-sm text-cream">
          {hud.note}
        </p>
      )}

      {showTouch && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex gap-3">
            <HoldButton label="Sol" onHold={(v) => simRef.current && (simRef.current.touch.left = v)}>
              <ChevronRight className="size-7 rotate-180" />
            </HoldButton>
            <HoldButton label="Sağ" onHold={(v) => simRef.current && (simRef.current.touch.right = v)}>
              <ChevronRight className="size-7" />
            </HoldButton>
          </div>
          <HoldButton
            label="Zıpla"
            large
            onHold={(v) => simRef.current && (simRef.current.touch.jump = v)}
          >
            <span className="font-display text-lg">Zıpla</span>
          </HoldButton>
        </div>
      )}

      {screen === "select" && (
        <section className="absolute inset-0 z-20 overflow-y-auto px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-36">
          <div className="mx-auto flex w-full max-w-md flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm tracking-wide text-amber uppercase">Üç parkur</p>
                <h1 className="font-display text-4xl leading-none text-cream">Zirve Koşusu</h1>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-cream/75">
                  Koş, zıpla, havada bir kez daha zıpla. Fenerler seni bekler, bayrak parkuru bitirir.
                </p>
              </div>
              <IconButton label={save?.mute ? "Sesi aç" : "Sesi kapat"} onClick={toggleMute}>
                {save?.mute ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
              </IconButton>
            </div>

            <ul className="flex flex-col gap-2">
              {LEVELS.map((entry, i) => {
                const unlocked = i <= (save?.unlocked ?? 0);
                const row = save?.levels[i];
                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      disabled={!unlocked}
                      onClick={() => boot(i)}
                      className="flex min-h-16 w-full items-center gap-3 rounded-card border border-cream/15 bg-ink/75 px-3 py-3 text-left backdrop-blur-md transition motion-safe:duration-200 enabled:hover:border-amber/70 disabled:opacity-55"
                    >
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-amber font-display text-xl text-ink">
                        {unlocked ? i + 1 : <Lock className="size-5" aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-display text-xl leading-tight">{entry.name}</span>
                        <span className="block truncate text-sm text-cream/70">{entry.blurb}</span>
                        {row?.cleared && (
                          <span className="mt-1 block text-xs text-amber">
                            Zirve · {row.bestCoins} para
                            {row.bestTime != null ? ` · ${formatTime(row.bestTime)}` : ""}
                          </span>
                        )}
                      </span>
                      {unlocked ? (
                        <ChevronRight className="size-5 shrink-0 text-amber" aria-hidden />
                      ) : (
                        <span className="text-xs text-cream/60">Kilitli</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="rounded-card border border-cream/15 bg-ink/60 px-4 py-3 text-sm leading-relaxed text-cream/80">
              <p className="font-display text-base text-cream">Kontroller</p>
              <p className="mt-1">A D veya oklar koşar. W, yukarı ok ya da boşluk zıplatır. Basılı tutunca daha yükseğe çıkar, havada bir kez daha bas.</p>
              <p className="mt-1">S veya aşağı, ince zeminlerden düşürür. Ölünce son fenerden devam edersin.</p>
            </div>
          </div>
        </section>
      )}

      {screen === "pause" && (
        <Overlay title="Durdu" lede={level.name}>
          <button type="button" className="btn-primary" onClick={() => setScreen("play")}>
            <Play className="size-5" aria-hidden />
            Devam
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              simRef.current?.restart();
              camRef.current.snap = true;
              setHud(simRef.current?.snapshot() ?? emptySnap);
              setScreen("play");
            }}
          >
            <RotateCcw className="size-5" aria-hidden />
            Baştan başla
          </button>
          <button type="button" className="btn-ghost" onClick={() => setScreen("select")}>
            Seviyeler
          </button>
        </Overlay>
      )}

      {screen === "win" && (
        <Overlay title="Zirve senin" lede={`${level.name} bitti`}>
          <p className="flex items-center justify-center gap-4 text-sm text-cream/80">
            <span className="inline-flex items-center gap-1">
              <Coins className="size-4 text-amber" aria-hidden />
              {hud.coins}/{hud.total}
            </span>
            <span className="inline-flex items-center gap-1">
              <Timer className="size-4" aria-hidden />
              {formatTime(hud.time)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Flag className="size-4 text-amber" aria-hidden />
              {record?.bestTime != null ? formatTime(record.bestTime) : "ilk"}
            </span>
          </p>
          {levelIndex < LEVELS.length - 1 && (
            <button type="button" className="btn-primary" onClick={() => boot(levelIndex + 1)}>
              Sonraki parkur
            </button>
          )}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              simRef.current?.restart();
              camRef.current.snap = true;
              setHud(simRef.current?.snapshot() ?? emptySnap);
              setScreen("play");
            }}
          >
            <RotateCcw className="size-5" aria-hidden />
            Tekrar koş
          </button>
          <button type="button" className="btn-ghost" onClick={() => setScreen("select")}>
            Seviyeler
          </button>
        </Overlay>
      )}
    </main>
  );
}

function Overlay({ title, lede, children }: { title: string; lede: string; children: ReactNode }) {
  return (
    <section className="absolute inset-0 z-20 grid place-items-center bg-ink/55 px-4 backdrop-blur-[2px]">
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-card border border-cream/15 bg-ink/90 p-5 text-center">
        <h2 className="font-display text-3xl leading-none">{title}</h2>
        <p className="text-sm text-cream/70">{lede}</p>
        {children}
      </div>
    </section>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-full border border-cream/20 bg-ink/80 text-cream backdrop-blur-md"
    >
      {children}
    </button>
  );
}

function HoldButton({
  label,
  onHold,
  children,
  large,
}: {
  label: string;
  onHold: (held: boolean) => void;
  children: ReactNode;
  large?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={
        large
          ? "grid h-20 min-w-24 place-items-center rounded-full border border-amber/40 bg-amber text-ink shadow-lg"
          : "grid size-16 place-items-center rounded-full border border-cream/20 bg-ink/80 text-cream backdrop-blur-md"
      }
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onHold(true);
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
      onLostPointerCapture={() => onHold(false)}
    >
      {children}
    </button>
  );
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
