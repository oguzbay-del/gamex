import type { Rect } from "@/game/types";
import { PLAYER_H, PLAYER_W, type GameSim } from "@/game/sim";

export type Pose = "idle" | "run" | "jump" | "fall";

const INK = "#1a1430";

export function viewScale(cssW: number) {
  return Math.min(1.55, Math.max(1, cssW / 430));
}

export function drawBackdrop(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  dpr: number,
  time: number,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintSky(ctx, cssW, cssH, time, 0);
  drawMascot(ctx, cssW * 0.78, cssH - 18, time);
}

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  sim: GameSim,
  cssW: number,
  cssH: number,
  dpr: number,
  camX: number,
  camY: number,
  scale: number,
  reduce: boolean,
  clock: number,
) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintSky(ctx, cssW, cssH, clock, camX);

  const shake = reduce ? 0 : sim.shake;
  const sx = Math.sin(clock * 48) * shake;
  const sy = Math.cos(clock * 37) * shake * 0.6;

  ctx.save();
  ctx.translate(Math.round(-camX * scale) + sx, Math.round(-camY * scale) + sy);
  ctx.scale(scale, scale);

  const level = sim.level;
  ridge(ctx, 560, "#2a2144", level.width, 1.1, 46);
  ridge(ctx, 620, "#3a2a3c", level.width, 1.7, 28);
  ridge(ctx, 700, "#243028", level.width, 2.3, 18);

  lava(ctx, level.width, level.height);

  for (const s of level.solids) drawBlock(ctx, s, "stone");
  for (const o of level.oneways) drawBlock(ctx, o, "thin");
  for (const m of sim.movers) drawBlock(ctx, m, "wood");
  for (const sp of level.spikes) drawSpikes(ctx, sp);

  level.checkpoints.forEach((cp, i) => {
    drawLantern(ctx, cp.x, cp.y, i <= sim.cpIndex, clock);
  });
  drawFlag(ctx, level.flag.x, level.flag.y, clock);

  sim.coins.forEach((c, i) => {
    if (!c.got) drawCoin(ctx, c.x, c.y, clock, i);
  });

  for (const h of level.hints) drawHint(ctx, h.x, h.y, h.text);

  for (const p of sim.particles) {
    const a = Math.max(0, p.life / p.max);
    if (p.text) {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.font = "700 14px Outfit, ui-sans-serif, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  const blink = sim.invuln > 0 && Math.floor(clock * 14) % 2 === 0;
  if (!blink) {
    drawRunner(
      ctx,
      sim.player.x,
      sim.player.y,
      sim.player.facing,
      sim.pose,
      sim.runPhase,
      reduce ? 1 : sim.squashX,
      reduce ? 1 : sim.squashY,
      sim.player.grounded,
    );
  }

  ctx.restore();

  const vignette = ctx.createRadialGradient(cssW / 2, cssH / 2, cssW * 0.25, cssW / 2, cssH / 2, cssW * 0.75);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(12,8,18,0.38)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, cssW, cssH);

  if (sim.flash > 0) {
    ctx.fillStyle = `rgba(225, 91, 74, ${Math.min(0.45, sim.flash)})`;
    ctx.fillRect(0, 0, cssW, cssH);
  }
}

function paintSky(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, camX: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#141028");
  g.addColorStop(0.45, "#5c3048");
  g.addColorStop(0.78, "#e08a55");
  g.addColorStop(1, "#f2c194");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "rgba(244, 220, 180, 0.9)";
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.18, Math.min(w, h) * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(244, 196, 140, 0.35)";
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.18, Math.min(w, h) * 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f4efe4";
  for (let i = 0; i < 28; i++) {
    const sx = ((i * 137 - camX * 0.05) % (w + 30)) + ((i * 13) % 7);
    const sy = (i * 47) % (h * 0.42);
    const tw = 0.4 + Math.sin(time * 1.5 + i) * 0.3;
    ctx.globalAlpha = 0.35 + tw * 0.4;
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = "rgba(255,255,255,0.14)";
  for (let i = 0; i < 4; i++) {
    const x = ((i * 280 - camX * 0.12 + time * 8) % (w + 180)) - 40;
    const y = 30 + i * 28;
    ctx.beginPath();
    ctx.ellipse(x, y, 36, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 24, y + 4, 26, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function ridge(
  ctx: CanvasRenderingContext2D,
  y: number,
  color: string,
  width: number,
  seed: number,
  amp: number,
) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, y + 180);
  for (let x = 0; x <= width; x += 64) {
    const n = Math.sin(x * 0.007 * seed) * amp + Math.sin(x * 0.017 + seed) * amp * 0.4;
    ctx.lineTo(x, y - n);
  }
  ctx.lineTo(width, y + 220);
  ctx.closePath();
  ctx.fill();
}

function lava(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const g = ctx.createLinearGradient(0, height - 70, 0, height);
  g.addColorStop(0, "rgba(225, 91, 74, 0)");
  g.addColorStop(1, "rgba(180, 50, 36, 0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, height - 70, width, 70);
}

function drawBlock(ctx: CanvasRenderingContext2D, r: Rect, kind: "stone" | "wood" | "thin") {
  const rad = Math.min(8, r.h / 2);
  ctx.fillStyle = "rgba(18, 10, 16, 0.28)";
  ctx.beginPath();
  ctx.roundRect(r.x + 2, r.y + 5, r.w, r.h, rad);
  ctx.fill();

  const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  if (kind === "wood") {
    g.addColorStop(0, "#d39255");
    g.addColorStop(1, "#6d3f24");
  } else if (kind === "thin") {
    g.addColorStop(0, "#e6c27a");
    g.addColorStop(1, "#a8743a");
  } else {
    g.addColorStop(0, "#6d5c4c");
    g.addColorStop(1, "#2c241c");
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(r.x, r.y, r.w, Math.max(r.h, 8), rad);
  ctx.fill();

  ctx.fillStyle = kind === "stone" ? "#e2c48a" : "#f0d2a4";
  ctx.fillRect(r.x + 4, r.y + 1, Math.max(0, r.w - 8), Math.min(5, r.h));

  if (kind === "wood") {
    ctx.strokeStyle = "rgba(70, 32, 16, 0.45)";
    ctx.lineWidth = 2;
    const planks = Math.max(2, Math.floor(r.w / 28));
    for (let i = 1; i < planks; i++) {
      const x = r.x + (r.w / planks) * i;
      ctx.beginPath();
      ctx.moveTo(x, r.y + 3);
      ctx.lineTo(x, r.y + r.h - 2);
      ctx.stroke();
    }
  }

  if (kind === "stone" && r.h > 30) {
    const n = Math.max(2, Math.floor(r.w / 48));
    ctx.fillStyle = "rgba(255, 244, 220, 0.12)";
    for (let i = 0; i < n; i++) {
      const px = r.x + 14 + ((i * 67 + Math.floor(r.y)) % Math.max(8, r.w - 24));
      const py = r.y + 14 + ((i * 29) % Math.max(8, r.h - 18));
      ctx.beginPath();
      ctx.ellipse(px, py, 3, 1.6, 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawSpikes(ctx: CanvasRenderingContext2D, r: Rect) {
  const count = Math.max(1, Math.round(r.w / 16));
  const sw = r.w / count;
  for (let i = 0; i < count; i++) {
    const x = r.x + i * sw;
    ctx.beginPath();
    ctx.moveTo(x + 1, r.y + r.h);
    ctx.lineTo(x + sw / 2, r.y);
    ctx.lineTo(x + sw - 1, r.y + r.h);
    ctx.closePath();
    ctx.fillStyle = "#4c5460";
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + sw / 2, r.y + 4);
    ctx.lineTo(x + sw * 0.72, r.y + r.h);
    ctx.lineTo(x + sw / 2, r.y + r.h - 1);
    ctx.closePath();
    ctx.fillStyle = "#e15b4a";
    ctx.fill();
  }
}

function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, time: number, i: number) {
  const spin = Math.cos(time * 4.2 + i * 0.7);
  ctx.save();
  ctx.translate(x, y + Math.sin(time * 3 + i) * 2);
  ctx.scale(Math.max(0.2, Math.abs(spin)), 1);
  ctx.fillStyle = "#a87414";
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2c14b";
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  if (spin > 0.35) {
    ctx.fillStyle = "#fff6d2";
    star(ctx, 0, 0, 4, 2);
    ctx.fill();
  }
  ctx.restore();
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, outer: number, inner: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawLantern(ctx: CanvasRenderingContext2D, x: number, y: number, lit: boolean, time: number) {
  ctx.fillStyle = "#6b442c";
  ctx.fillRect(x + 8, y - 48, 6, 48);
  if (lit) {
    const pulse = 26 + Math.sin(time * 5) * 3;
    const glow = ctx.createRadialGradient(x + 11, y - 60, 2, x + 11, y - 60, pulse);
    glow.addColorStop(0, "rgba(246, 211, 107, 0.85)");
    glow.addColorStop(1, "rgba(246, 211, 107, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x + 11, y - 60, pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = lit ? "#f6d36b" : "#8d8478";
  ctx.beginPath();
  ctx.roundRect(x, y - 74, 22, 26, 4);
  ctx.fill();
  ctx.fillStyle = lit ? "#fff4c8" : "#3a342c";
  ctx.fillRect(x + 5, y - 68, 12, 12);
  ctx.fillStyle = "#3a2a18";
  ctx.fillRect(x + 6, y - 78, 10, 6);
}

function drawFlag(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  ctx.fillStyle = "#6b442c";
  ctx.fillRect(x, y - 82, 5, 82);
  ctx.fillStyle = "#c9a36a";
  ctx.beginPath();
  ctx.arc(x + 2.5, y - 84, 4, 0, Math.PI * 2);
  ctx.fill();
  const wave = Math.sin(time * 5) * 4;
  ctx.fillStyle = "#e8a317";
  ctx.beginPath();
  ctx.moveTo(x + 5, y - 78);
  ctx.quadraticCurveTo(x + 24, y - 70 + wave, x + 40, y - 64);
  ctx.lineTo(x + 36, y - 50);
  ctx.quadraticCurveTo(x + 20, y - 58 - wave, x + 5, y - 54);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f4efe4";
  ctx.beginPath();
  ctx.moveTo(x + 5, y - 66);
  ctx.quadraticCurveTo(x + 18, y - 62 + wave * 0.4, x + 30, y - 58);
  ctx.lineTo(x + 28, y - 54);
  ctx.quadraticCurveTo(x + 16, y - 58, x + 5, y - 56);
  ctx.fill();
}

function drawHint(ctx: CanvasRenderingContext2D, x: number, y: number, text: string) {
  ctx.font = "600 13px Outfit, ui-sans-serif, sans-serif";
  const w = ctx.measureText(text).width + 16;
  ctx.fillStyle = "rgba(22, 19, 31, 0.82)";
  ctx.beginPath();
  ctx.roundRect(x, y - 24, w, 22, 7);
  ctx.fill();
  ctx.fillStyle = "#f4efe4";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 8, y - 12);
}

function drawMascot(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  drawBlock(ctx, { x: x - 70, y: y - 16, w: 150, h: 22 }, "stone");
  drawRunner(ctx, x - 16, y - 16 - PLAYER_H, 1, "run", time * 8, 1, 1, true);
}

export function drawRunner(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  facing: number,
  pose: Pose,
  phase: number,
  squashX: number,
  squashY: number,
  grounded: boolean,
) {
  ctx.save();
  ctx.translate(x + PLAYER_W / 2, y + PLAYER_H);
  if (grounded && pose !== "jump") {
    ctx.fillStyle = "rgba(20, 10, 16, 0.28)";
    ctx.beginPath();
    ctx.ellipse(0, 3, 12, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.scale((facing < 0 ? -1 : 1) * squashX, squashY);
  const bob = pose === "run" ? Math.abs(Math.sin(phase)) * -3 : Math.sin(phase * 0.45) * -1.2;
  ctx.translate(0, bob);

  const swing = pose === "run" ? Math.sin(phase) * 0.7 : pose === "jump" ? -0.85 : pose === "fall" ? 0.4 : Math.sin(phase) * 0.06;
  leg(ctx, -3.5, swing);
  leg(ctx, 3.5, -swing * 0.92);

  ctx.fillStyle = "#7d4034";
  round(ctx, -8, -18, 16, 8, 4);
  ctx.fill();

  ctx.fillStyle = "#3e4f8c";
  round(ctx, -12, -38, 24, 24, 8);
  ctx.fill();
  ctx.fillStyle = "#f4efe4";
  ctx.beginPath();
  ctx.moveTo(-4, -36);
  ctx.lineTo(4, -28);
  ctx.lineTo(-4, -22);
  ctx.fill();

  arm(ctx, 7, -swing * 0.8);
  arm(ctx, -9, swing * 0.5);

  const scarf = Math.sin(phase * (pose === "run" ? 1.1 : 0.6)) * 7;
  ctx.fillStyle = "#e8a317";
  ctx.beginPath();
  ctx.moveTo(-2, -34);
  ctx.quadraticCurveTo(-18 - scarf * 0.3, -30, -14 - scarf, -16);
  ctx.quadraticCurveTo(-8, -24, 2, -32);
  ctx.fill();

  ctx.fillStyle = "#f0c7a4";
  ctx.beginPath();
  ctx.arc(1, -48, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2418";
  ctx.beginPath();
  ctx.arc(0, -52, 9, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-8, -52, 16, 5);

  ctx.strokeStyle = "#c9a36a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(2, -50, 6, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  ctx.fillStyle = "#8fd0e0";
  ctx.beginPath();
  ctx.ellipse(6, -48, 3.2, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(7, -48, 1.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function leg(ctx: CanvasRenderingContext2D, side: number, angle: number) {
  ctx.save();
  ctx.translate(side, -16);
  ctx.rotate(angle);
  ctx.fillStyle = "#7d4034";
  round(ctx, -3.4, 0, 7, 12, 3);
  ctx.fill();
  ctx.translate(0, 11);
  ctx.rotate(angle > 0 ? -0.35 : 0.15);
  round(ctx, -3.2, 0, 6.5, 10, 3);
  ctx.fill();
  ctx.fillStyle = "#2a211c";
  round(ctx, -5, 7, 12, 6, 2);
  ctx.fill();
  ctx.restore();
}

function arm(ctx: CanvasRenderingContext2D, side: number, angle: number) {
  ctx.save();
  ctx.translate(side, -32);
  ctx.rotate(angle);
  ctx.fillStyle = "#3e4f8c";
  round(ctx, -3, 0, 6, 12, 3);
  ctx.fill();
  ctx.fillStyle = "#f0c7a4";
  ctx.beginPath();
  ctx.arc(0, 12, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function round(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}
