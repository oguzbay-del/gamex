import type { Level, MoverDef, Particle, Rect } from "@/game/types";
import { Sfx } from "@/game/audio";

export const PLAYER_W = 26;
export const PLAYER_H = 44;

const SPEED = 268;
const ACCEL_G = 2600;
const ACCEL_A = 1700;
const FRIC = 2400;
const AIR_DRAG = 280;
const JUMP_V = 620;
const DJUMP_V = 640;
const G_UP = 1700;
const G_FALL = 3100;
const G_APEX = 980;
const APEX = 85;
const TERM = 880;
const COYOTE = 0.12;
const BUFFER = 0.13;

const GAME_KEYS = new Set([
  "KeyA",
  "KeyD",
  "KeyW",
  "KeyS",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Space",
]);

type Mover = MoverDef & { prevX: number; prevY: number };

export type Player = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  airJumps: number;
  riding: number | null;
};

export type Snap = {
  coins: number;
  total: number;
  time: number;
  checkpoint: number;
  deaths: number;
  note: string;
};

function moverAt(m: MoverDef, time: number) {
  const s = Math.sin((time * Math.PI * 2) / m.period + (m.phase ?? 0));
  return {
    x: m.x + (m.axis === "x" ? s * m.amp : 0),
    y: m.y + (m.axis === "y" ? s * m.amp : 0),
  };
}

function overlap(a: Rect, b: Rect) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function radial(x: number, y: number, dz = 0.18) {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scale = (m - dz) / (1 - dz) / m;
  return { x: x * scale, y: y * scale };
}

export class GameSim {
  readonly level: Level;
  player: Player;
  movers: Mover[];
  coins: { x: number; y: number; got: boolean }[];
  time = 0;
  mode: "play" | "pause" | "win" | "dead" = "play";
  cpIndex = -1;
  deaths = 0;
  deadTimer = 0;
  invuln = 0;
  flash = 0;
  shake = 0;
  note = "";
  noteTimer = 0;
  particles: Particle[] = [];
  squashX = 1;
  squashY = 1;
  pose: "idle" | "run" | "jump" | "fall" = "idle";
  runPhase = 0;
  keys = new Set<string>();
  injected: Set<string> | null = null;
  touch = { left: false, right: false, jump: false, drop: false };
  private coyote = COYOTE;
  private buffer = 0;
  private jumpPrev = false;
  private jumpHeld = 0;
  private foot = 0;
  private sfx: Sfx;
  private onSnap: (s: Snap, kind: string) => void;

  constructor(level: Level, sfx: Sfx, onSnap: (s: Snap, kind: string) => void) {
    this.level = level;
    this.sfx = sfx;
    this.onSnap = onSnap;
    this.movers = level.movers.map((m) => {
      const p = moverAt(m, 0);
      return { ...m, x: p.x, y: p.y, prevX: p.x, prevY: p.y };
    });
    this.coins = level.coins.map((c) => ({ ...c, got: false }));
    this.player = this.makePlayer(level.spawn.x, level.spawn.y);
  }

  setKeys(codes: string[]) {
    this.injected = codes.length ? new Set(codes) : null;
  }

  down(code: string) {
    if (this.injected) return this.injected.has(code);
    return this.keys.has(code);
  }

  snapshot(): Snap {
    return {
      coins: this.coins.filter((c) => c.got).length,
      total: this.coins.length,
      time: this.time,
      checkpoint: this.cpIndex,
      deaths: this.deaths,
      note: this.noteTimer > 0 ? this.note : "",
    };
  }

  restart() {
    this.coins.forEach((c) => {
      c.got = false;
    });
    this.time = 0;
    this.cpIndex = -1;
    this.mode = "play";
    this.deadTimer = 0;
    this.note = "";
    this.player = this.makePlayer(this.level.spawn.x, this.level.spawn.y);
    this.particles = [];
    this.emit("restart");
  }

  respawn() {
    const cp = this.cpIndex >= 0 ? this.level.checkpoints[this.cpIndex] : this.level.spawn;
    this.player = this.makePlayer(cp?.x ?? this.level.spawn.x, cp?.y ?? this.level.spawn.y);
    this.invuln = 0.85;
    this.mode = "play";
  }

  update(dt: number) {
    this.time += this.mode === "play" ? dt : 0;
    this.animMove(dt);
    this.syncMovers();
    if (this.mode === "pause" || this.mode === "win") return;
    if (this.mode === "dead") {
      this.deadTimer -= dt;
      this.flash = Math.max(0, this.flash - dt);
      this.shake = Math.max(0, this.shake - dt * 14);
      this.decayParticles(dt);
      if (this.deadTimer <= 0) this.respawn();
      return;
    }

    const p = this.player;
    if (p.riding != null) {
      const m = this.movers[p.riding];
      if (m) {
        p.x += m.x - m.prevX;
        p.y += m.y - m.prevY;
      }
    }

    const move = this.readMove();
    const jumpDown = this.readJump();
    const drop = this.readDrop();
    const pressed = jumpDown && !this.jumpPrev;
    this.jumpPrev = jumpDown;
    if (pressed) this.buffer = BUFFER;
    else this.buffer = Math.max(0, this.buffer - dt);

    if (p.grounded) {
      this.coyote = COYOTE;
      p.airJumps = 1;
    } else {
      this.coyote = Math.max(0, this.coyote - dt);
    }

    if (move !== 0) p.facing = move;

    const accel = p.grounded ? ACCEL_G : ACCEL_A;
    if (move !== 0) {
      const boost = p.grounded && Math.sign(p.vx) === -move ? 1.35 : 1;
      p.vx += move * accel * boost * dt;
      p.vx = Math.max(-SPEED, Math.min(SPEED, p.vx));
    } else {
      const drag = (p.grounded ? FRIC : AIR_DRAG) * dt;
      if (Math.abs(p.vx) <= drag) p.vx = 0;
      else p.vx -= Math.sign(p.vx) * drag;
    }

    let jumped = false;
    const groundJump = () => {
      if (jumped || this.buffer <= 0) return;
      if (!(p.grounded || this.coyote > 0)) return;
      this.doJump(false);
      jumped = true;
    };
    const airJump = () => {
      if (jumped || this.buffer <= 0 || p.airJumps <= 0) return;
      if (p.grounded || this.coyote > 0) return;
      this.doJump(true);
      jumped = true;
    };
    groundJump();
    airJump();

    let g = G_UP;
    if (p.vy > 30) g = G_FALL;
    else if (Math.abs(p.vy) < APEX) g = G_APEX;
    p.vy += g * dt;
    if (p.vy > TERM) p.vy = TERM;

    if (jumpDown) this.jumpHeld += 1;
    else {
      if (this.jumpHeld > 0 && p.vy < 0) p.vy *= 0.48;
      this.jumpHeld = 0;
    }

    const dist = Math.hypot(p.vx, p.vy) * dt;
    const steps = Math.max(1, Math.ceil(dist / 7));
    const h = dt / steps;
    let landedVy = 0;
    for (let i = 0; i < steps; i++) {
      this.moveX(h);
      const beforeY = p.vy;
      const hit = this.moveY(h, drop);
      if (hit === "land") landedVy = beforeY;
    }

    if (p.grounded && this.buffer > 0 && !jumped) {
      this.doJump(false);
      jumped = true;
    }

    if (landedVy > 420) {
      this.squashX = 1.22;
      this.squashY = 0.78;
      this.sfx.land();
      this.burst(p.x + PLAYER_W / 2, p.y + PLAYER_H, 5, "#d9c7a4", 40);
      this.shake = Math.min(5, this.shake + 2);
    }

    if (p.x < 0) {
      p.x = 0;
      if (p.vx < 0) p.vx = 0;
    }
    if (p.x + PLAYER_W > this.level.width) {
      p.x = this.level.width - PLAYER_W;
      if (p.vx > 0) p.vx = 0;
    }

    this.pose = !p.grounded ? (p.vy < 0 ? "jump" : "fall") : Math.abs(p.vx) > 20 ? "run" : "idle";
    if (this.pose === "run") this.runPhase += dt * 13;
    else this.runPhase += dt * 3;

    if (p.grounded && this.pose === "run") {
      this.foot -= dt;
      if (this.foot <= 0) {
        this.foot = 0.16;
        this.burst(p.x + PLAYER_W / 2, p.y + PLAYER_H, 2, "#cbb89a", 24);
      }
    }

    this.collect();
    if (this.mode === "play") this.touchCheckpoint();
    if (this.mode === "play") this.touchFlag();
    if (this.mode === "play") this.touchHazard();

    if (this.invuln > 0) this.invuln -= dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
    if (this.noteTimer > 0) this.noteTimer = Math.max(0, this.noteTimer - dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 14);

    this.decayParticles(dt);

    this.squashX += (1 - this.squashX) * Math.min(1, dt * 10);
    this.squashY += (1 - this.squashY) * Math.min(1, dt * 10);
  }

  private decayParticles(dt: number) {
    const next: Particle[] = [];
    for (const part of this.particles) {
      part.life -= dt;
      if (part.life <= 0) continue;
      part.x += part.vx * dt;
      part.y += part.vy * dt;
      part.vy += (part.text ? -20 : 520) * dt;
      next.push(part);
    }
    this.particles = next;
  }

  private doJump(air: boolean) {
    const p = this.player;
    p.vy = air ? -DJUMP_V : -JUMP_V;
    p.grounded = false;
    p.riding = null;
    this.coyote = 0;
    this.buffer = 0;
    this.jumpHeld = 1;
    if (air) p.airJumps = 0;
    else p.airJumps = 1;
    this.squashX = 0.82;
    this.squashY = 1.2;
    if (air) this.sfx.doubleJump();
    else this.sfx.jump();
    this.burst(p.x + PLAYER_W / 2, p.y + PLAYER_H, air ? 8 : 5, air ? "#f0c14a" : "#f4efe4", 70);
  }

  private readMove(): -1 | 0 | 1 {
    let move = 0;
    if (this.down("KeyA") || this.down("ArrowLeft") || this.touch.left) move -= 1;
    if (this.down("KeyD") || this.down("ArrowRight") || this.touch.right) move += 1;
    const stick = this.readPad();
    if (stick.x < -0.3) move = -1;
    else if (stick.x > 0.3) move = 1;
    if (move < 0) return -1;
    if (move > 0) return 1;
    return 0;
  }

  private readJump() {
    return (
      this.down("Space") ||
      this.down("KeyW") ||
      this.down("ArrowUp") ||
      this.touch.jump ||
      this.readPad().jump
    );
  }

  private readDrop() {
    return this.down("KeyS") || this.down("ArrowDown") || this.touch.drop || this.readPad().down;
  }

  private readPad() {
    let x = 0;
    let jump = false;
    let down = false;
    try {
      const pads = navigator.getGamepads?.() ?? [];
      for (const g of pads) {
        if (!g) continue;
        const stick = radial(g.axes[0] ?? 0, g.axes[1] ?? 0);
        x += stick.x;
        if (g.buttons[0]?.pressed) jump = true;
        if (g.buttons[14]?.pressed) x -= 1;
        if (g.buttons[15]?.pressed) x += 1;
        if (g.buttons[12]?.pressed) jump = true;
        if (g.buttons[13]?.pressed) down = true;
      }
    } catch {
      /* private mode / unsupported */
    }
    return { x: Math.max(-1, Math.min(1, x)), jump, down };
  }

  private syncMovers() {
    this.level.movers.forEach((def, i) => {
      const m = this.movers[i];
      if (!m) return;
      const p = moverAt(def, this.time);
      m.prevX = m.x;
      m.prevY = m.y;
      m.x = p.x;
      m.y = p.y;
    });
  }

  private solids(): { rect: Rect; mover: number | null }[] {
    const list = this.level.solids.map((rect) => ({ rect, mover: null as number | null }));
    this.movers.forEach((m, i) => list.push({ rect: m, mover: i }));
    return list;
  }

  private moveX(dt: number) {
    const p = this.player;
    p.x += p.vx * dt;
    const box = this.box();
    for (const s of this.solids()) {
      if (!overlap(box, s.rect)) continue;
      if (p.vx > 0) p.x = s.rect.x - PLAYER_W;
      else if (p.vx < 0) p.x = s.rect.x + s.rect.w;
      else {
        const penL = p.x + PLAYER_W - s.rect.x;
        const penR = s.rect.x + s.rect.w - p.x;
        p.x += penL < penR ? -penL : penR;
      }
      p.vx = 0;
      box.x = p.x;
    }
  }

  private moveY(dt: number, drop: boolean): "land" | "ceil" | "none" {
    const p = this.player;
    const prevBottom = p.y + PLAYER_H;
    p.y += p.vy * dt;
    p.grounded = false;
    p.riding = null;
    let hit: "land" | "ceil" | "none" = "none";
    const box = this.box();

    for (const s of this.solids()) {
      if (!overlap(box, s.rect)) continue;
      if (p.vy > 0 || (p.vy === 0 && prevBottom <= s.rect.y + 4)) {
        p.y = s.rect.y - PLAYER_H;
        p.vy = 0;
        p.grounded = true;
        p.riding = s.mover;
        hit = "land";
      } else if (p.vy < 0) {
        p.y = s.rect.y + s.rect.h;
        p.vy = 0;
        hit = "ceil";
      }
      box.y = p.y;
    }

    if (!drop) {
      for (const o of this.level.oneways) {
        if (p.vy < 0) continue;
        if (prevBottom > o.y + 1) continue;
        if (!overlap(this.box(), o)) continue;
        p.y = o.y - PLAYER_H;
        p.vy = 0;
        p.grounded = true;
        p.riding = null;
        hit = "land";
      }
    }

    if (!p.grounded && p.vy >= 0) {
      const probe: Rect = { x: p.x, y: p.y + 2, w: PLAYER_W, h: PLAYER_H };
      for (const s of this.solids()) {
        if (!overlap(probe, s.rect)) continue;
        if (p.y + PLAYER_H > s.rect.y + 3) continue;
        p.y = s.rect.y - PLAYER_H;
        p.vy = 0;
        p.grounded = true;
        p.riding = s.mover;
        hit = "land";
        break;
      }
      if (!p.grounded && !drop) {
        for (const o of this.level.oneways) {
          if (!overlap(probe, o)) continue;
          if (p.y + PLAYER_H > o.y + 3) continue;
          p.y = o.y - PLAYER_H;
          p.vy = 0;
          p.grounded = true;
          hit = "land";
          break;
        }
      }
    }
    return hit;
  }

  private box(): Rect {
    return { x: this.player.x, y: this.player.y, w: PLAYER_W, h: PLAYER_H };
  }

  private collect() {
    const b = this.box();
    let got = false;
    for (const c of this.coins) {
      if (c.got) continue;
      const nx = Math.max(b.x, Math.min(c.x, b.x + b.w));
      const ny = Math.max(b.y, Math.min(c.y, b.y + b.h));
      const dx = c.x - nx;
      const dy = c.y - ny;
      if (dx * dx + dy * dy > 15 * 15) continue;
      c.got = true;
      got = true;
      this.sfx.coin();
      this.burst(c.x, c.y, 8, "#f0c14a", 90);
      this.particles.push({
        x: c.x,
        y: c.y - 8,
        vx: 0,
        vy: -30,
        life: 0.5,
        max: 0.5,
        color: "#f4efe4",
        r: 0,
        text: "+1",
      });
    }
    if (got) this.emit("coin");
  }

  private touchCheckpoint() {
    const b = this.box();
    this.level.checkpoints.forEach((cp, i) => {
      if (i <= this.cpIndex) return;
      const zone: Rect = { x: cp.x - 18, y: cp.y - 70, w: 52, h: 70 };
      if (!overlap(b, zone)) return;
      this.cpIndex = i;
      this.sfx.checkpoint();
      this.say("Fener yandı");
      this.burst(cp.x + 8, cp.y - 58, 10, "#f6d36b", 80);
      this.emit("checkpoint");
    });
  }

  private touchFlag() {
    const flag = this.level.flag;
    const zone: Rect = { x: flag.x - 6, y: flag.y - 78, w: 36, h: 78 };
    if (!overlap(this.box(), zone)) return;
    this.mode = "win";
    this.player.vx = 0;
    this.player.vy = 0;
    this.sfx.win();
    this.say("Zirve");
    this.emit("win");
  }

  private touchHazard() {
    if (this.invuln > 0) return;
    const b = this.box();
    const spiked = this.level.spikes.some((s) => overlap(b, s));
    const voided = this.player.y > this.level.height - 36;
    if (!spiked && !voided) return;
    this.deaths += 1;
    this.mode = "dead";
    this.deadTimer = 0.38;
    this.flash = 0.28;
    this.shake = 8;
    this.sfx.die();
    this.say(this.cpIndex >= 0 ? "Fenerden devam" : "En baştan");
    this.burst(this.player.x + PLAYER_W / 2, this.player.y + 16, 12, "#e15b4a", 120);
    this.emit("death");
  }

  private say(text: string) {
    this.note = text;
    this.noteTimer = 1.6;
  }

  private emit(kind: string) {
    this.onSnap(this.snapshot(), kind);
  }

  private burst(x: number, y: number, n: number, color: string, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 20,
        life: 0.35 + Math.random() * 0.3,
        max: 0.65,
        color,
        r: 1.5 + Math.random() * 2.2,
      });
    }
    if (this.particles.length > 120) this.particles.splice(0, this.particles.length - 120);
  }

  private makePlayer(x: number, feet: number): Player {
    return {
      x,
      y: feet - PLAYER_H,
      vx: 0,
      vy: 0,
      facing: 1,
      grounded: true,
      airJumps: 1,
      riding: null,
    };
  }

  private animMove(dt: number) {
    if (this.mode !== "play") this.runPhase += dt * 2;
  }

  static isGameKey(code: string) {
    return GAME_KEYS.has(code);
  }
}
