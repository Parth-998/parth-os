/**
 * Rain: a big figure with an umbrella under one big street lamp.
 *   click   → the figure walks to where you clicked (click the lamp to switch it off and on)
 *   move    → your cursor catches a little rain of its own
 *   drag    → wind: the rain slants, the umbrella leans into it, the drips blow sideways
 *   click the sky → lightning strikes there (it also strikes on its own every so often)
 * Rain falls everywhere but is brightest inside the lamp's cone of light; it drums on the umbrella and
 * dribbles off its rim.
 * Secrets: switch the lamp 10 times fast and the bulb pops. The konami code brings a heavy storm.
 * Screensaver mode: he stands under the lamp, lights a cigarette and smokes it.
 */
import { clamp, hash3, rand } from "./math";
import { unlock } from "@/lib/secrets";
import type { Input, Scene } from "./scenes";

const RAMP = " .:-=+*#%@";
const C = (s: string) => s.charCodeAt(0);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

/** Two-bone arm: where the elbow goes for a shoulder and a hand. The elbow always bends the same
 *  way a real one does (to the same side of the shoulder→hand line), so it never flips mid-motion.
 *  `facing` is +1 facing right, -1 facing left. */
function elbow(sx: number, sy: number, hx: number, hy: number, l1: number, l2: number, facing: number): [number, number] {
  const dx = hx - sx;
  const dy = hy - sy;
  const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.001) || 1;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d;
  const uy = dy / d;
  return [sx + ux * a - uy * facing * h, sy + uy * a + ux * facing * h];
}

/** Distance to a segment measured straight out from it, with square ends (Infinity past either end). */
function bandDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1);
  if (t < 0 || t > 1) return Infinity;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

interface Drop {
  x: number;
  y: number;
  v: number;
  z: number;
}

export class Rain implements Scene {
  private w = 0;
  private h = 0;
  private cols = 0;
  private rows = 0;
  private cw = 10;
  private ch = 14;
  private ground = 0;
  private S = 300; // figure height (px)

  // lamp
  private lx = 0;
  private lampTop = 0;
  private headX = 0;
  private headY = 0;
  private lampOn = 1;
  private lampTarget = 1;
  private flickerUntil = 0;
  // easter egg: switch the lamp 10 times fast and the bulb pops
  private lampClicks: number[] = [];
  private brokenUntil = 0;
  private sparks: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  private huh = 0;
  // the "real" bulb pop
  private popFlash = 0; // the split-second over-bright pop
  private filament = 0; // the filament's dull orange afterglow
  private shards: { x: number; y: number; vx: number; vy: number }[] = [];
  // each cigarette: how many drags it lasts (6–12) and after which drags he taps the ash off (every 1–3)
  private dragsN = 8;
  private flicks = new Set<number>();
  private lastFlick = -1;
  private ash: { x: number; y: number; vx: number; vy: number; life: number; hot: boolean }[] = [];
  /** A fresh cigarette: pick its length and when the ash gets flicked. */
  /** Every drag is different: how fast the hand comes up, how long he pulls (a quick puff to a long
   *  drag), how long he waits before the next one, and now and then a quick second puff. */
  private plan: { t0: number; up: number; inhale: number; down: number; wait: number; flick: boolean }[] = [];
  private planEnd = 0;
  private newCigarette(t: number) {
    this.smokeT0 = t;
    this.dragsN = 6 + Math.floor(Math.random() * 7);
    this.flicks.clear();
    for (let i = 1 + Math.floor(Math.random() * 3); i < this.dragsN; i += 1 + Math.floor(Math.random() * 3)) this.flicks.add(i - 1);
    this.lastFlick = -1;
    this.plan = [];
    let at = Rain.START;
    for (let i = 0; i < this.dragsN; i++) {
      const d = { t0: at, up: rand(0.7, 1.1), inhale: rand(0.9, 2.5), down: rand(0.7, 1.0), wait: rand(4, 10), flick: this.flicks.has(i) };
      // sometimes a quick second puff right after (it doesn't count toward the drags)
      if (i < this.dragsN - 1 && Math.random() < 0.15) {
        const w = d.wait;
        d.wait = rand(0.5, 0.9);
        d.flick = false;
        this.plan.push(d);
        at += d.up + d.inhale + d.down + d.wait;
        this.plan.push({ t0: at, up: 0.5, inhale: rand(0.5, 0.8), down: 0.55, wait: w, flick: this.flicks.has(i) });
        at += 0.5 + this.plan[this.plan.length - 1].inhale + 0.55 + w;
        continue;
      }
      this.plan.push(d);
      at += d.up + d.inhale + d.down + d.wait;
    }
    this.planEnd = at;
  }
  /** screensaver: he stands under the lamp, lights a cigarette and smokes it */
  constructor(private saver = false) {}
  private vel = 0; // current walking speed (px/s)
  private turnT = 0;
  private settle = 1; // 1 = feet together (standing), 0 = mid-walk
  /** how far the body rises mid-step */
  private get bob() {
    return this.S * 0.009 * Math.abs(Math.sin(this.phase)) * (1 - this.settle);
  }
  /** The visible legs as segments [knee x, y, foot x, y]. */
  private legSegs(): [number, number, number, number][] {
    const S = this.S;
    const d = this.dir;
    const g = this.ground;
    const px = this.px;
    // natural: each foot is planted while the body passes over it, then lifts and swings ahead.
    // only the shins show, from just under the coat's hem down to the shoe.
    const stride = S * 0.2;
    const out: [number, number, number, number][] = [];
    for (let i = 0; i < 2; i++) {
      const u = (((this.phase / Math.PI + i) % 2) + 2) % 2;
      let off: number;
      let lift = 0;
      if (u < 1) off = stride / 2 - u * stride;
      else {
        const q = u - 1;
        off = -stride / 2 + smooth(0, 1, q) * stride;
        lift = Math.sin(Math.PI * q) * S * 0.032;
      }
      off *= 1 - this.settle;
      lift *= 1 - this.settle;
      const sep = (i ? -1 : 1) * S * 0.034; // a little gap between the legs
      const fx = px + d * off + sep;
      const fy = g - lift;
      out.push([px + d * off * 0.4 + sep, g - S * 0.25 - this.bob, fx, fy]);
    }
    return out;
  }
  private smokeT0 = 1; // when the current cigarette routine started
  private smoking = false; // wallpaper: lit one because you clicked him (the screensaver always is)
  private smoke: { x: number; y: number; vx: number; vy: number; life: number; max: number }[] = [];
  private hand = { x: 0, y: 0, ok: false }; // the free hand, when the routine is moving it
  private holding: "" | "case" | "lighter" = "";
  private flame = 0; // lighter flame strength: a local light
  private flamePos = { x: 0, y: 0 };
  private ember = 0; // cigarette tip glow: a smaller local light
  private cigPos: { x: number; y: number } | null = null;
  private dropped: { x: number; y: number; vy: number; life: number } | null = null;
  // easter egg (konami): a heavy thunderstorm for a while
  private stormUntil = 0;
  private baseDrops = 0;
  private nextPace = 0;

  // figure
  private px = 0;
  private target = 0;
  private dir = 1;
  private phase = 0;
  private moving = false;
  private tilt = 0;

  private drops: Drop[] = [];
  private drips: { x: number; y: number; vx: number; vy: number }[] = [];
  private splashes: { x: number; y: number; life: number }[] = [];
  private rimLoad = [0, 0];
  private wind = 0.08;
  private targetWind = 0.08;
  private t = 0;
  private cur = { x: -999, y: -999, on: false };

  // lightning
  flash = 0;
  private bolts: { pts: [number, number][]; t0: number }[] = [];
  private nextStrike = rand(8, 16);
  private rumbleAt = -1;
  private gust = 0;

  resize(w: number, h: number, cols: number, rows: number, cw: number, ch: number) {
    const first = this.w === 0;
    this.w = w;
    this.h = h;
    this.cols = cols;
    this.rows = rows;
    this.cw = cw;
    this.ch = ch;
    this.ground = h * 0.86;
    this.S = clamp(h * 0.46, 160, 560);
    this.lx = w * 0.56;
    this.lampTop = h * 0.13;
    this.headX = this.lx - Math.max(w * 0.07, this.S * 0.28);
    this.headY = this.lampTop + this.S * 0.06;
    if (first) {
      this.px = w * 0.34;
      this.target = this.px;
    } else {
      this.px = clamp(this.px, w * 0.05, w * 0.95);
      this.target = clamp(this.target, w * 0.05, w * 0.95);
    }
    const n = Math.round(clamp((w * h) / 1500, 200, 1600));
    this.drops = Array.from({ length: n }, () => this.spawn(true));
    this.baseDrops = n;
  }

  konami() {
    this.stormUntil = this.t + 14;
    this.nextStrike = this.t + 0.2;
    this.huh = 2.4;
    // twice the rain
    for (let i = 0; i < this.baseDrops; i++) this.drops.push(this.spawn(true));
  }

  private spawn(anywhere = false): Drop {
    const z = rand(0.25, 1);
    return { x: rand(-this.w * 0.15, this.w * 1.15), y: anywhere ? rand(-this.h, this.ground) : rand(-this.h * 0.25, -8), v: 560 + 640 * z, z };
  }

  /** Light from the lamp at (x, y): 0 outside the cone, up to 1 near the bulb. */
  private light(x: number, y: number) {
    let local = 0;
    if (this.flame > 0.01) local += this.flame * 0.9 * Math.exp(-((Math.hypot(x - this.flamePos.x, y - this.flamePos.y) / (this.S * 0.2)) ** 2));
    if (this.ember > 0.01 && this.cigPos) local += this.ember * 0.45 * Math.exp(-((Math.hypot(x - this.cigPos.x, y - this.cigPos.y) / (this.S * 0.05)) ** 2));
    return clamp(this.lampLight(x, y) + local, 0, 1);
  }
  private lampLight(x: number, y: number) {
    if (this.lampOn <= 0.01) return 0;
    const bx = this.headX;
    const by = this.headY + this.S * 0.04;
    const dy = y - by;
    if (dy < -this.S * 0.03) return 0;
    const dx = x - bx;
    const ang = Math.abs(Math.atan2(dx, Math.max(1, dy)));
    // the LED head throws a wider cone with a crisper edge
    const cone = 1 - smooth(0.32, 0.5, ang);
    const d = Math.hypot(dx, dy);
    const fall = 1 / (1 + (d / (this.h * 0.55)) ** 2);
    const glow = Math.exp(-((d / (this.S * 0.09)) ** 2));
    return clamp((cone * fall + glow) * this.lampOn, 0, 1);
  }

  // ── figure geometry ───────────────────────────────────
  private canopyCenter() {
    const S = this.S;
    const hx = this.px + this.dir * S * 0.11;
    const hy = this.ground - S * 0.6 - this.bob;
    const len = S * 0.4;
    return { hx, hy, cx: hx + Math.sin(this.tilt) * len, cy: hy - Math.cos(this.tilt) * len };
  }

  /** Is (x, y) under the umbrella canopy? Returns 0 outside, else 1 (shell) or 2 (rim/edge). */
  private inCanopy(x: number, y: number) {
    const S = this.S;
    const { cx, cy } = this.canopyCenter();
    const wx = x - cx;
    const wy = cy - y; // up
    const t = this.tilt;
    const lx = wx * Math.cos(t) - wy * Math.sin(t);
    const ly = wx * Math.sin(t) + wy * Math.cos(t);
    const rx = S * 0.36;
    const ry = S * 0.17;

    // scalloped rim: the bottom edge bows up between the ribs
    const rib = Math.abs(Math.sin((lx / rx) * Math.PI * 2.5));
    const bottom = -S * 0.01 + rib * S * 0.018;
    if (ly < bottom) return 0;
    const e = (lx / rx) ** 2 + (ly / ry) ** 2;
    if (e > 1) return 0;
    return e > 0.72 || ly < bottom + S * 0.02 ? 2 : 1;
  }

  /** Screensaver only: the arm that handles the cigarette. Shoulder, elbow (hangs below, a little in
   *  front), hand. On the wallpaper he keeps his usual arm. */
  private armJoints(): [number, number, number, number, number, number] {
    const S = this.S;
    const d = this.dir;
    const sx = this.px - d * S * 0.085;
    const sy = this.ground - S * 0.69;
    const [ex, ey] = elbow(sx, sy, this.hand.x, this.hand.y, S * 0.136, S * 0.136, d); // about his usual arm length, so at rest it hangs nearly straight
    return [sx, sy, ex, ey, this.hand.x, this.hand.y];
  }

  /** Classify a point on the figure: 0 none, 1 coat/body, 2 head, 3 legs, 4 shaft, 5 canopy shell, 6 canopy rim, 7 smoking arm (screensaver), 8 shoes. */
  private sample(x: number, y: number) {
    const c = this.inCanopy(x, y);
    if (c) return c === 2 ? 6 : 5;
    const S = this.S;
    const d = this.dir;
    const g = this.ground;
    const px = this.px;
    const { hx, hy, cx, cy } = this.canopyCenter();
    if (segDist(x, y, hx, hy, cx, cy) < S * 0.009) return 4;
    // screensaver: the smoking arm, in front of everything else on him
    if (this.hand.ok) {
      const [sx, sy, ex, ey, fx, fy] = this.armJoints();
      if (segDist(x, y, sx, sy, ex, ey) < S * 0.025 || segDist(x, y, ex, ey, fx, fy) < S * 0.022) return 7;
    }
    const gb = g - this.bob; // the upper body rides up and down with each step 
    // head
    const headX = px + d * S * 0.02;
    const headY = gb - S * 0.795;
    if (Math.hypot((x - headX) / 0.9, y - headY) < S * 0.06) return 2;
    // neck
    if (segDist(x, y, px + d * S * 0.01, gb - S * 0.74, headX, headY) < S * 0.024) return 2;
    // long coat: a trapezoid from shoulders down past the knees
    const v = gb - y;
    const lean = this.moving ? d * S * 0.015 : 0;
    if (v > S * 0.27 && v < S * 0.73) {
      const k = (v - S * 0.27) / (S * 0.46);
      const half = S * (0.135 - 0.05 * k) + (k > 0.88 ? -S * 0.03 * ((k - 0.88) / 0.12) ** 2 : 0);
      // the hem swings toward whichever leg is stepping
      const sway = Math.sin(this.phase) * S * 0.014 * (1 - this.settle) * (1 - k) ** 2;
      const mid = px + lean * k + sway;
      // coat tails flutter with the wind
      const flap = (1 - k) * this.wind * S * 0.05 * (1 + Math.sin(this.t * 7 + v * 0.05) * 0.4);
      if (Math.abs(x - mid - flap) < half) return 1;
    }
    // umbrella arm: shoulder → hand
    if (segDist(x, y, px + d * S * 0.07, gb - S * 0.69, hx, hy) < S * 0.032) return 1;
    // free arm: hangs still at his side, against the coat (in the screensaver the smoking arm replaces it)
    if (!this.hand.ok && segDist(x, y, px - d * S * 0.085, gb - S * 0.69, px - d * S * 0.1, gb - S * 0.43) < S * 0.03) return 1;
    // legs: straight trouser legs with flat ends (not rounded capsules), drawn as strokes
    const legs = this.legSegs();
    const w = S * 0.022;
    for (const [ax, ay, fx, fy] of legs) if (bandDist(x, y, ax, ay, fx, fy - S * 0.02) < w) return 3;
    // shoes: a flat sole, toe pointing the way he faces
    for (const [, , fx, fy] of legs) if (y > fy - S * 0.03 && y < fy && (x - fx) * d > -S * 0.02 && (x - fx) * d < S * 0.06) return 8;
    return 0;
  }

  // ── simulation ────────────────────────────────────────
  step(dt: number, t: number, inp: Input) {
    this.t = t;
    this.cur = { x: inp.px, y: inp.py, on: inp.hover };
    const storm = t < this.stormUntil;
    if (inp.dragging) this.targetWind = clamp(inp.dvx / 900, -1.2, 1.2) * (0.4 + 0.6 * inp.strength);
    else if (storm) this.targetWind = Math.sin(t * 0.8) * 0.9 + Math.sin(t * 2.3 + 1) * 0.35; // gusting hard both ways
    else if (this.saver) this.targetWind = 0.2 + Math.sin(t * 0.27) * 0.25 + Math.sin(t * 1.1) * 0.08;
    else this.targetWind += (0.08 - this.targetWind) * dt * 0.35;
    if (!storm && this.drops.length > this.baseDrops) this.drops.length = Math.max(this.baseDrops, this.drops.length - Math.ceil(this.baseDrops * dt));
    if (storm) {
      // the lamp can't hold steady, and he can't stand still
      if (Math.random() < dt * 1.6) this.flickerUntil = t + rand(0.15, 0.6);
      if (t > this.nextPace && Math.abs(this.target - this.px) < 4) {
        this.nextPace = t + rand(0.7, 1.6);
        this.target = clamp(this.px + rand(-1, 1) * this.S * 0.35, this.w * 0.08, this.w * 0.92);
      }
    }
    this.wind += (this.targetWind - this.wind) * Math.min(1, dt * 2.5);
    // umbrella leans into the wind
    const tiltTarget =
      clamp(-this.wind * 0.42, -0.45, 0.45) +
      (this.dir * 0.08 * (this.vel / (this.S * 0.36)) + Math.sin(this.phase) * 0.02 * (1 - this.settle)) +
      (storm ? Math.sin(t * 17) * 0.05 : 0);
    this.tilt += (tiltTarget - this.tilt) * Math.min(1, dt * 3);


    // lightning: strikes on its own now and then; the screen double-flickers, thunder follows
    if (t > this.nextStrike) {
      this.strike(rand(this.w * 0.1, this.w * 0.9));
      if (Math.random() < (storm ? 0.6 : 0.3)) window.setTimeout(() => this.strike(rand(this.w * 0.1, this.w * 0.9)), rand(250, 600));
      if (storm) this.nextStrike = t + rand(0.5, 1.5);
    }
    const last = this.bolts[this.bolts.length - 1];
    if (last) {
      const a = t - last.t0;
      this.flash = a < 0.07 ? 1 : a < 0.14 ? 0.25 : a < 0.24 ? 0.85 : 0.85 * Math.exp(-(a - 0.24) * 5);
    } else this.flash = 0;
    if (this.popFlash > 0) this.flash = Math.max(this.flash, this.popFlash * 0.18);
    this.bolts = this.bolts.filter((b) => t - b.t0 < 0.7);
    if (this.rumbleAt > 0 && t > this.rumbleAt) {
      // thunder: a gust shoves the rain and the lamp shudders
      this.rumbleAt = -1;
      this.gust = 1;
      this.targetWind += rand(-0.6, 0.6);
      if (this.lampTarget > 0.5) this.flickerUntil = t + 0.35;
    }
    this.gust = Math.max(0, this.gust - dt * 0.6);

    // a broken bulb stays dark, then gets fixed (with a flicker) after a while
    if (this.brokenUntil && t > this.brokenUntil) {
      this.brokenUntil = 0;
      this.lampTarget = 1;
      this.flickerUntil = t + 1.2;
    }
    for (const sp of this.sparks) {
      sp.vy += 900 * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.life -= dt;
    }
    this.sparks = this.sparks.filter((sp) => sp.life > 0 && sp.y < this.ground);
    for (const sh of this.shards) {
      sh.vy += 1250 * dt;
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      if (sh.y >= this.ground) this.splashes.push({ x: sh.x, y: this.ground - 2, life: 0.25 });
    }
    this.shards = this.shards.filter((sh) => sh.y < this.ground);
    this.popFlash = Math.max(0, this.popFlash - dt * 9);
    this.filament = Math.max(0, this.filament - dt * 0.8);
    this.huh = Math.max(0, this.huh - dt);

    // lamp: flicker, then settle on its target state
    if (t < this.flickerUntil) this.lampOn = hash3(Math.floor(t * 22), 5, 9) > 0.45 ? 1 : 0.15;
    else this.lampOn += (this.lampTarget - this.lampOn) * Math.min(1, dt * 10);

    if (this.saver || this.smoking) this.stepCigarette(dt, t);
    this.stepSmoke(dt, t);
    // walking
    const dx = this.target - this.px;
    this.walkNatural(dt, dx);

    // rain
    const shelter = 34 * inp.strength;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      d.y += d.v * dt * (1 + this.gust * 0.5) * (storm ? 1.35 : 1);
      d.x += this.wind * d.v * dt * 0.55;
      if (d.z > 0.45 && this.inCanopy(d.x, d.y)) {
        // drums on the umbrella; the water runs to whichever rim is downhill
        const { cx } = this.canopyCenter();
        const side = d.x + this.tilt * 40 < cx ? 0 : 1;
        this.rimLoad[side] += 1;
        this.drops[i] = this.spawn();
        continue;
      }
      if (this.cur.on && shelter > 0 && Math.hypot(d.x - this.cur.x, d.y - this.cur.y) < shelter && d.y < this.cur.y) {
        this.splashes.push({ x: d.x, y: d.y, life: 0.18 });
        this.drops[i] = this.spawn();
        continue;
      }
      if (d.y >= this.ground) {
        if (d.z > 0.55 && Math.random() < 0.6) this.splashes.push({ x: d.x, y: this.ground - 2, life: 0.22 });
        this.drops[i] = this.spawn();
      }
    }

    // drips off the rim: a steady dribble from both tips, heavier on the downhill side
    const S = this.S;
    const { cx, cy } = this.canopyCenter();
    const ct = Math.cos(this.tilt);
    const st = Math.sin(this.tilt);
    for (let side = 0; side < 2; side++) {
      const sgn = side === 0 ? -1 : 1;
      const rate = 3 + this.rimLoad[side] * 0.6 + (sgn * this.tilt > 0 ? 6 : 0);
      if (Math.random() < rate * dt) {
        const lx = sgn * S * rand(0.3, 0.355);
        const ly = -S * 0.005;
        this.drips.push({ x: cx + lx * ct + ly * st, y: cy - (-lx * st + ly * ct), vx: this.wind * 40, vy: rand(10, 60) });
      }
      this.rimLoad[side] *= Math.exp(-dt * 2);
    }
    for (const p of this.drips) {
      p.vy += 1100 * dt;
      p.vx += (this.wind * 160 - p.vx) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y >= this.ground) this.splashes.push({ x: p.x, y: this.ground - 2, life: 0.3 });
    }
    this.drips = this.drips.filter((p) => p.y < this.ground).slice(-260);
    for (const s of this.splashes) s.life -= dt;
    this.splashes = this.splashes.filter((s) => s.life > 0).slice(-500);
  }

  /** The bulb blows (the secret: switch the lamp 10 times fast). */
  popBulb() {
    this.brokenUntil = this.t + 25;
    this.lampTarget = 0;
    this.huh = 2.4;
    unlock("lamp");
    const bx = this.headX;
    const by = this.headY + this.ch;
    {
      // a bright pop, then dark at once (no flicker)
      this.popFlash = 1;
      this.lampOn = 0;
      this.flickerUntil = 0;
      this.filament = 1;
      // a short burst of hot filament bits, fewer and quicker than before
      for (let i = 0; i < 22; i++) {
        const a = rand(0.2, Math.PI - 0.2);
        const v = rand(140, 380);
        this.sparks.push({ x: bx + rand(-8, 8), y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.35 - rand(20, 140), life: rand(0.35, 0.9) });
      }
      // and the glass: heavier, dropping more or less straight into the puddles
      for (let i = 0; i < 11; i++) this.shards.push({ x: bx + rand(-this.S * 0.06, this.S * 0.06), y: by + rand(-4, 4), vx: rand(-45, 45), vy: rand(-40, 30) });
    }
  }

  /** Natural gait: eases in, slows to a stop right at the target, pauses to turn around, and the
   *  stride advances exactly with distance covered so planted feet never slide. */
  private walkNatural(dt: number, dx: number) {
    const S = this.S;
    const want = Math.abs(dx) > 3 ? Math.sign(dx) : 0;
    if (want && want !== this.dir) {
      // stop first, then turn on the spot
      if (this.vel < 2) {
        this.turnT += dt;
        if (this.turnT > 0.3) {
          this.dir = want;
          this.turnT = 0;
        }
      }
    } else this.turnT = 0;
    const accel = S * 1.1;
    const goal = want && want === this.dir ? Math.min(S * 0.36, Math.sqrt(2 * accel * Math.abs(dx))) : 0;
    this.vel += clamp(goal - this.vel, -accel * dt, accel * dt);
    const move = want === this.dir ? Math.min(Math.abs(dx), this.vel * dt) : this.vel * dt;
    this.px += this.dir * move;
    this.phase += (move / (S * 0.2)) * Math.PI;
    this.moving = this.vel > 2;
    // standing still, the feet come back together
    this.settle = this.moving ? Math.max(0, this.settle - dt * 5) : Math.min(1, this.settle + dt * 2.2);
  }

  // ── the screensaver's cigarette ───────────────────────
  /** Keyframes for the free hand: [time, forward (S), height above ground (S), holding]. */
  private static LIGHT_UP: [number, number, number, "" | "case" | "lighter"][] = [
    [0.0, -0.1, 0.43, ""], // arm at his side
    [1.5, 0.05, 0.6, ""], // slowly into the inside pocket
    [2.5, 0.14, 0.6, "case"], // case out in front of him
    [3.5, 0.14, 0.6, "case"], // opens it, takes one out
    [4.7, 0.075, 0.775, "case"], // cigarette to his lips
    [5.9, 0.05, 0.6, "case"], // case back in the pocket
    [7.1, 0.1, 0.745, "lighter"], // lighter up to the tip
    [9.2, 0.1, 0.745, "lighter"], // ...flick, flame, it catches
    [10.2, 0.05, 0.6, "lighter"], // lighter away
    [11.2, 0.075, 0.775, ""], // takes the cigarette from his lips
    [12.2, 0.13, 0.58, ""], // and holds it down by his chest
  ];
  private static readonly START = 12.2;
  private static readonly DRAG = 9; // seconds per drag
  private static readonly DRAGS = 6; // screensaver; on the wallpaper it's a shorter one
  private get drags() {
    return this.dragsN;
  }

  private handAt(fwd: number, up: number) {
    return { x: this.px + this.dir * this.S * fwd, y: this.ground - this.S * up };
  }

  private puff(x: number, y: number, n: number, vx: number, vy: number, spread: number) {
    for (let i = 0; i < n; i++)
      this.smoke.push({ x: x + rand(-2, 2), y: y + rand(-2, 2), vx: vx + rand(-spread, spread), vy: vy + rand(-spread, spread) * 0.5, life: rand(2.2, 3.6), max: 3.6 });
    if (this.smoke.length > 420) this.smoke.splice(0, this.smoke.length - 420);
  }

  private stepCigarette(dt: number, t: number) {
    const S = this.S;
    const d = this.dir;
    const a = t - this.smokeT0;
    const mouth = this.handAt(0.075, 0.775);
    const tipOff = d * S * 0.035;
    this.hand.ok = a >= 0;
    this.holding = "";
    this.flame = 0;
    let inhale = 0;
    let lit = a > 8.2;
    let inMouth = false;

    const keys = Rain.LIGHT_UP;
    if (!this.plan.length) this.newCigarette(this.smokeT0);
    const endAll = this.planEnd;
    let atLips = false;
    if (a < 0) {
      this.cigPos = null;
      this.ember = 0;
    } else if (a < Rain.START) {
      // lighting up
      let i = 0;
      while (i < keys.length - 2 && a > keys[i + 1][0]) i++;
      const [t0, f0, u0, h0] = keys[i];
      const [t1, f1, u1] = keys[i + 1];
      const k = smooth(0, 1, (a - t0) / (t1 - t0 || 1));
      const p = this.handAt(f0 + (f1 - f0) * k, u0 + (u1 - u0) * k);
      this.hand.x = p.x;
      this.hand.y = p.y;
      this.holding = h0;
      inMouth = a >= 4.7 && a < 11.2;
      // the lighter: a flick (sparks), then the flame; it catches after a moment
      if (a > 7.3 && a < 7.45 && Math.random() < 0.5) this.sparks.push({ x: p.x + d * 4, y: p.y - 6, vx: rand(-60, 60), vy: -rand(40, 120), life: 0.3 });
      if (a > 7.45 && a < 8.9) {
        this.flame = 0.85 + 0.15 * Math.sin(t * 40) * hash3(Math.floor(t * 30), 1, 2);
        this.flamePos = { x: p.x + d * S * 0.005, y: p.y - S * 0.025 };
        if (a > 8.2) inhale = 1; // drawing on it to light it
      }
      // first exhale, right after it's lit
      if (a > 9.3 && a < 10.3) this.puff(mouth.x + d * S * 0.03, mouth.y + 2, Math.random() < dt * 30 ? 1 : 0, d * 50 + this.wind * 60, -12, 18);
    } else if (a < endAll) {
      // smoking: up to the lips, a drag (each one its own length), down, exhale, wait
      let k = 0;
      while (k < this.plan.length - 1 && a >= this.plan[k + 1].t0) k++;
      const dr = this.plan[k];
      const c = a - dr.t0;
      const t1 = dr.up;
      const t2 = t1 + dr.inhale;
      const t3 = t2 + dr.down;
      const hold = this.handAt(0.13, 0.58);
      let p = hold;
      if (c < t1) {
        const q = smooth(0, 1, c / t1);
        p = { x: hold.x + (mouth.x - hold.x) * q, y: hold.y + (mouth.y - hold.y) * q };
      } else if (c < t2) {
        p = mouth;
        atLips = true;
        inhale = smooth(t1, t1 + 0.35, c) * (1 - smooth(t2 - 0.25, t2, c));
      } else if (c < t3) {
        const q = smooth(0, 1, (c - t2) / dr.down);
        p = { x: mouth.x + (hold.x - mouth.x) * q, y: mouth.y + (hold.y - mouth.y) * q };
      }
      // after some drags: one deliberate tap of the wrist, and a little ash drops off the tip
      const fl = t3 + 2;
      if (dr.flick && dr.wait > 3 && c > fl && c < fl + 0.45) {
        const q = Math.sin(((c - fl) / 0.45) * Math.PI);
        p = { x: p.x, y: p.y + S * 0.014 * q };
        if (this.lastFlick !== k && c > fl + 0.2) {
          this.lastFlick = k;
          const tx = p.x + d * S * 0.035;
          const ty = p.y;
          for (let i = 0; i < 4 + Math.floor(Math.random() * 3); i++) this.ash.push({ x: tx + rand(-3, 3), y: ty, vx: rand(-25, 25) + this.wind * 30, vy: rand(-10, 30), life: rand(0.9, 1.6), hot: Math.random() < 0.25 });
        }
      }
      this.hand.x = p.x;
      this.hand.y = p.y;
      // exhale: a plume out of the mouth, longer and bigger after a longer drag
      const exStart = t2 + dr.down * 0.6;
      const exLen = 0.6 + dr.inhale * 0.75;
      if (c > exStart && c < exStart + exLen && Math.random() < dt * (14 + dr.inhale * 14)) {
        const q = (c - exStart) / exLen;
        this.puff(mouth.x + d * S * 0.03, mouth.y + 2, 1, d * (40 + dr.inhale * 25) * (1 - q * 0.7) + this.wind * 60, -10, 16);
      }
    } else if (a < endAll + 1.2) {
      // done: flicks it away
      const k = smooth(0, 1, (a - endAll) / 0.5);
      const hold = this.handAt(0.13, 0.58);
      this.hand.x = hold.x + d * S * 0.08 * k;
      this.hand.y = hold.y + S * 0.04 * k;
      if (!this.dropped && k > 0.9 && this.cigPos) this.dropped = { x: this.cigPos.x, y: this.cigPos.y, vy: -60, life: 3 };
      lit = false;
    } else {
      // arm back down, a moment, then another one
      const k = smooth(0, 1, (a - endAll - 1.2) / 0.9);
      const from = this.handAt(0.21, 0.54);
      const rest = this.handAt(-0.1, 0.43);
      this.hand.x = from.x + (rest.x - from.x) * k;
      this.hand.y = from.y + (rest.y - from.y) * k;
      lit = false;
      // once the arm is back down it goes back to his usual one (no awkward reversed arm)
      if (a > endAll + 2.1) this.hand.ok = false;
      if (this.saver) {
        if (a > endAll + 9) this.newCigarette(t);
      } else if (a > endAll + 2.2) this.smoking = false;
    }

    // where the cigarette is: in his lips, or between his fingers
    const showCig = a >= 3.5 && a < endAll + 0.9 && !this.dropped;
    if (showCig) {
      const base = inMouth || atLips ? mouth : this.hand;
      this.cigPos = { x: base.x + tipOff, y: base.y };
    } else this.cigPos = null;
    // the ember: a soft glow, bright while he draws on it
    const target = lit && showCig ? 0.35 + 0.65 * inhale : 0;
    this.ember += (target - this.ember) * Math.min(1, dt * 5);
    // a thin ribbon of smoke rises off the tip between drags
    if (lit && showCig && this.cigPos && Math.random() < dt * 9) this.puff(this.cigPos.x, this.cigPos.y - 3, 1, this.wind * 30, -22, 5);

  }

  /** The stub and the smoke keep going after the cigarette routine ends. */
  private stepSmoke(dt: number, t: number) {
    const S = this.S;
    const d = this.dir;
    // ash: light, so it drifts with the wind as it falls; a hot fleck or two fades out on the way
    for (const a of this.ash) {
      a.vy += 380 * dt;
      a.vx += (this.wind * 50 - a.vx) * dt * 1.5;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.life -= dt;
    }
    this.ash = this.ash.filter((a) => a.life > 0 && a.y < this.ground);
    // the stub falls, bounces, and goes out in the wet
    if (this.dropped) {
      const dr = this.dropped;
      dr.vy += 900 * dt;
      dr.y = Math.min(this.ground - 2, dr.y + dr.vy * dt);
      dr.x += d * 40 * dt * (dr.y < this.ground - 2 ? 1 : 0);
      dr.life -= dt;
      if (dr.life <= 0) this.dropped = null;
    }

    // smoke drifts with the wind and rises; out in the rain it gets beaten down and breaks up fast,
    // under the umbrella it hangs around a bit longer
    const { cx, cy } = this.canopyCenter();
    for (const p of this.smoke) {
      const sheltered = Math.abs(p.x - cx) < S * 0.33 && p.y > cy;
      p.vx += (this.wind * 70 - p.vx) * dt * 0.8 + rand(-20, 20) * dt;
      p.vy += ((sheltered ? -26 : -10) - p.vy) * dt * 0.9 + rand(-14, 14) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * (sheltered ? 0.8 : 1.9 + (this.stormUntil > t ? 2 : 0));
    }
    this.smoke = this.smoke.filter((p) => p.life > 0);
  }

  private strike(x: number) {
    // a jagged bolt from the top of the sky toward the skyline, with a fork or two
    const pts: [number, number][] = [];
    let px = x;
    let py = 0;
    const end = this.ground * rand(0.5, 0.75);
    while (py < end) {
      pts.push([px, py]);
      py += rand(this.ch * 0.8, this.ch * 2.2);
      px += rand(-1, 1) * this.cw * 2.2;
    }
    pts.push([px, end]);
    this.bolts.push({ pts, t0: this.t });
    for (let f = 0; f < 2; f++) {
      const k = Math.floor(rand(2, Math.max(3, pts.length - 2)));
      if (!pts[k]) continue;
      let [fx, fy] = pts[k];
      const dir = Math.random() < 0.5 ? -1 : 1;
      const fork: [number, number][] = [[fx, fy]];
      for (let i = 0; i < 4 + Math.random() * 4; i++) {
        fy += rand(this.ch * 0.6, this.ch * 1.6);
        fx += dir * rand(0.5, 2.5) * this.cw;
        fork.push([fx, fy]);
      }
      this.bolts.push({ pts: fork, t0: this.t });
    }
    this.nextStrike = this.t + rand(15, 35);
    this.rumbleAt = this.t + rand(0.8, 1.8);
  }

  click(x: number, y: number) {
    // him: lights a cigarette (and keeps smoking it wherever you send him)
    if (!this.smoking && Math.abs(x - this.px) < this.S * 0.14 && y > this.ground - this.S * 0.86 && y < this.ground) {
      this.smoking = true;
      this.newCigarette(this.t);
      this.dropped = null;
      unlock("smoke");
      return;
    }
    // the sky: call down lightning
    if (y < this.h * 0.24 && Math.abs(x - this.headX) > this.S * 0.25) {
      this.strike(x);
      return;
    }
    // the lamp head: switch it off or on, with a flicker
    if (Math.hypot(x - this.headX, y - this.headY) < Math.max(70, this.S * 0.18)) {
      if (this.brokenUntil) return; // it's broken. it's not coming back on yet.
      this.lampClicks = this.lampClicks.filter((c) => this.t - c < 6);
      this.lampClicks.push(this.t);
      if (this.lampClicks.length >= 10) {
        // pop: sparks, dark, and he looks up
        this.lampClicks = [];
        this.popBulb();
        return;
      }
      this.lampTarget = this.lampTarget > 0.5 ? 0 : 1;
      this.flickerUntil = this.t + 0.7;
      return;
    }
    this.target = clamp(x, this.w * 0.05, this.w * 0.95);
  }

  // ── drawing ───────────────────────────────────────────
  fill(glyph: Uint16Array, level: Float32Array, t: number, warm?: Float32Array) {
    const { cw, ch, cols, rows } = this;
    // `w` is how warm (amber) that character is; whatever draws over a cell sets its warmth
    const put = (c: number, r: number, g: number, v: number, force = false, w = 0) => {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      const i = r * cols + c;
      if (force || v > level[i]) {
        level[i] = v;
        glyph[i] = g;
        if (warm) warm[i] = w;
      }
    };
    const at = (x: number, y: number, g: number, v: number, w = 0) => put(Math.floor(x / cw), Math.floor(y / ch), g, v, false, w);
    // the lamp's light, warmed only very slightly (and only if that's switched on)
    // the lamp's light, tinted only very slightly: warm for the old lamp, cool white for the LED one
    const lampWarm = (L: number) => Math.min(0.08, L * 0.08);
    const fireOn = true;
    const gr = Math.floor(this.ground / ch);

    // haze inside the cone and the pool of light on the wet ground
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * cw;
        const y = (r + 0.5) * ch;
        if (r < gr) {
          const L = this.light(x, y);
          if (L > 0.1 && hash3(c, r, Math.floor(t * 2)) < 0.12) put(c, r, C(hash3(c, r, 1) < 0.5 ? "." : "'"), L * 0.3, false, lampWarm(L));
        } else if (r === gr) {
          const L = this.light(x, this.ground - 1);
          put(c, r, C(L > 0.35 ? "=" : "_"), 0.08 + L * 0.7, false, lampWarm(L));
        } else {
          // reflection of the bulb in the puddles, broken up by ripples
          const L = this.light(x, this.ground - 1);
          const refl = Math.exp(-(((x - this.headX) / (this.S * 0.07)) ** 2)) * this.lampOn;
          const ripple = hash3(c, r, Math.floor(t * 6)) < 0.55 ? 1 : 0.3;
          const v = (L * 0.25 + refl * 0.6 * ripple) * (1 - (r - gr) / (rows - gr + 1));
          if (v > 0.05) put(c, r, C(refl * ripple > 0.3 ? "|" : hash3(c, r, 3) < 0.5 ? "-" : "~"), v, false, lampWarm(Math.min(1, L + refl * 0.6)));
        }
      }
    }

    // rain: visible everywhere, brightest in the lamp light
    const slant = this.wind > 0.3 ? C("\\") : this.wind < -0.3 ? C("/") : C("|");
    for (const d of this.drops) {
      const L = this.light(d.x, d.y);
      const v = (0.05 + 0.14 * d.z) + L * 0.9 * d.z + this.flash * 0.55 * d.z;
      if (v < 0.07) continue;
      at(d.x, d.y, d.z > 0.6 ? slant : C("'"), v, lampWarm(L));
      if (d.z > 0.7) at(d.x - this.wind * ch * 0.55, d.y - ch, C("'"), v * 0.55, lampWarm(L));
    }
    // lightning bolts
    for (const b of this.bolts) {
      const age = t - b.t0;
      const v = age < 0.25 ? 1 : clamp(1 - (age - 0.25) * 2.2, 0, 1);
      if (v <= 0) continue;
      for (let k = 0; k < b.pts.length - 1; k++) {
        const [x0, y0] = b.pts[k];
        const [x1, y1] = b.pts[k + 1];
        const n = Math.max(1, Math.ceil(Math.abs(y1 - y0) / ch));
        const g = x1 - x0 > cw * 0.6 ? C("\\") : x0 - x1 > cw * 0.6 ? C("/") : C("|");
        for (let q = 0; q <= n; q++) at(x0 + ((x1 - x0) * q) / n, y0 + ((y1 - y0) * q) / n, g, v);
      }
    }

    for (const s of this.splashes) {
      const L = this.light(s.x, s.y) * 0.8 + 0.2;
      at(s.x - cw, s.y, C("`"), s.life * 3 * L);
      at(s.x + cw, s.y, C("'"), s.life * 3 * L);
      at(s.x, s.y, C("."), s.life * 3.5 * L);
    }

    // the lamp: base, pole, arm, head, bulb
    const S = this.S;
    const poleW = Math.max(cw * 1.6, S * 0.03);
    const c0 = Math.floor((this.lx - poleW / 2) / cw);
    const c1 = Math.floor((this.lx + poleW / 2) / cw);
    const topR = Math.floor(this.lampTop / ch);
    for (let r = topR; r < gr; r++) {
      const base = r > gr - Math.max(2, Math.round((S * 0.08) / ch));
      for (let c = c0 - (base ? 1 : 0); c <= c1 + (base ? 1 : 0); c++) {
        const L = this.light((c + 0.5) * cw, (r + 0.5) * ch);
        const edge = c === c0 - (base ? 1 : 0) || c === c1 + (base ? 1 : 0);
        put(c, r, C(edge ? "|" : base ? "#" : "H"), 0.32 + L * 0.3, true);
      }
    }
    // arm: a gentle curve from the pole top out to the head
    const armR = topR;
    const hc = Math.floor(this.headX / cw);
    for (let c = Math.min(hc, c0); c <= Math.max(hc, c0); c++) {
      const k = (c - hc) / (c0 - hc || 1);
      const rr = armR + Math.round((1 - Math.sin(k * Math.PI * 0.5)) * 0);
      put(c, rr, C("="), 0.45, true);
    }
    put(c0, armR - 1, C("."), 0.3, true);
    // head: a hood over the bulb
    const headR = Math.floor(this.headY / ch);
    const hw = Math.max(3, Math.round((S * 0.11) / cw));
    const bulb = 0.25 + 0.75 * this.lampOn;
    const broken = this.brokenUntil > 0;
    {
      for (let c = hc - hw; c <= hc + hw; c++) put(c, headR, C(c === hc - hw ? "/" : c === hc + hw ? "\\" : "#"), 0.55, true);
      for (let c = hc - hw + 1; c <= hc + hw - 1; c++) put(c, headR - 1, C("_"), 0.45, true);
      for (let c = hc - Math.max(1, hw - 2); c <= hc + Math.max(1, hw - 2); c++) put(c, headR + 1, C(broken ? (Math.abs(c - hc) <= 1 ? "x" : ",") : Math.abs(c - hc) <= 1 ? "@" : "o"), broken ? 0.3 : bulb * (Math.abs(c - hc) <= 1 ? 1 : 0.7), true, !broken ? 0.18 * this.lampOn : 0);
    }
    {
      // the pop: the bulb flares for an instant
      if (this.popFlash > 0.05) for (let c = hc - 2; c <= hc + 2; c++) put(c, headR + 1, C("@"), 1, true, fireOn ? 0.25 : 0);
      // the filament's dying glow in the dark bulb
      if (this.filament > 0.05 && this.popFlash <= 0.05) put(hc, headR + 1, C(this.filament > 0.5 ? "~" : "-"), 0.3 + this.filament * 0.45, true, fireOn ? 0.85 : 0);
      // sparks: amber, bright to dim as they cool
      for (const sp of this.sparks) {
        const k = clamp(sp.life / 0.9, 0, 1);
        put(Math.floor(sp.x / cw), Math.floor(sp.y / ch), C(k > 0.55 ? "*" : k > 0.25 ? "'" : "."), 0.35 + 0.65 * k, true, fireOn ? 0.45 + 0.45 * k : 0);
      }
      // glass shards catching what little light there is
      for (const sh of this.shards) put(Math.floor(sh.x / cw), Math.floor(sh.y / ch), C(sh.vy > 500 ? "|" : hash3(sh.x | 0, 1, 2) < 0.5 ? "'" : ","), 0.55, true);
    }
    if (this.huh > 0) {
      // he looks up at what just happened
      const mark = this.huh > 1.6 ? "!" : "?";
      put(Math.floor(this.px / cw) + this.dir * 2, Math.floor((this.ground - this.S * 1.32) / ch), C(mark), clamp(this.huh, 0, 1), true);
    }

    // the figure, rasterised cell by cell with 4 sub-samples for soft edges
    const minX = this.px - S * 0.62;
    const maxX = this.px + S * 0.62;
    const minY = this.ground - S * 1.3;
    const cA = Math.max(0, Math.floor(minX / cw));
    const cB = Math.min(cols - 1, Math.floor(maxX / cw));
    const rA = Math.max(0, Math.floor(minY / ch));
    for (let r = rA; r <= gr; r++) {
      for (let c = cA; c <= cB; c++) {
        const x0 = c * cw;
        const y0 = r * ch;
        let hits = 0;
        let part = 0;
        for (const [sx, sy] of [
          [0.3, 0.3],
          [0.7, 0.3],
          [0.3, 0.7],
          [0.7, 0.7],
        ]) {
          const p = this.sample(x0 + sx * cw, y0 + sy * ch);
          if (p) {
            hits++;
            if (!part || p === 2 || p === 6 || p === 7 || p === 8) part = p;
          }
        }
        if (!hits) continue;
        const x = x0 + cw / 2;
        const y = y0 + ch / 2;
        const L = this.light(x, y);
        // side facing the lamp gets a rim light
        const facing = Math.sign(this.headX - this.px) === Math.sign(x - this.px) ? 1 : 0.55;
        const n = hash3(c, r, 11);
        let v: number;
        let g: string;
        if (hits < 3 && part !== 7 && part !== 3 && part !== 8) {
          v = 0.28 + L * 0.5 * facing;
          g = hits === 1 ? (n < 0.5 ? "." : "'") : n < 0.5 ? ":" : ";";
        } else if (part === 6) {
          v = 0.55 + L * 0.45;
          g = n < 0.5 ? "=" : "-";
        } else if (part === 5) {
          v = 0.4 + L * 0.55;
          // ribs radiate from the top of the canopy
          const { cx: ux } = this.canopyCenter();
          const rib = Math.abs(Math.sin(((x - ux) / (S * 0.36)) * Math.PI * 2.5)) < 0.18;
          g = rib ? "|" : RAMP[clamp(5 + Math.floor(v * 4 + (n - 0.5) * 1.5), 0, RAMP.length - 1)];
        } else if (part === 4) {
          v = 0.5;
          g = "|";
        } else if (part === 3) {
          // trouser legs: a stroke that follows whichever leg this is
          const legs = this.legSegs();
          const near = legs.reduce((best, l) => (segDist(x, y, l[0], l[1], l[2], l[3]) < segDist(x, y, best[0], best[1], best[2], best[3]) ? l : best));
          const run = (near[2] - near[0]) / Math.max(1, near[3] - near[1]); // sideways per unit down
          v = 0.3 + L * 0.5 * facing;
          g = Math.abs(run) < 0.12 ? "|" : run > 0 ? "\\" : "/";
        } else if (part === 8) {
          v = 0.35 + L * 0.5 * facing;
          g = "=";
        } else if (part === 7) {
          // the arm as strokes along its direction, a touch brighter than the coat behind it
          const [sx, sy, ex, ey, fx, fy] = this.armJoints();
          const upper = segDist(x, y, sx, sy, ex, ey) < segDist(x, y, ex, ey, fx, fy);
          const ax = upper ? ex - sx : fx - ex;
          const ay = upper ? ey - sy : fy - ey;
          const ang = Math.abs(Math.atan2(ay, ax * 0.55)); // cells are taller than wide
          g = ang < 0.45 || ang > Math.PI - 0.45 ? "-" : Math.abs(ang - Math.PI / 2) < 0.5 ? "|" : ax * ay > 0 ? "\\" : "/";
          v = 0.5 + L * 0.45;
        } else if (part === 2) {
          v = 0.32 + L * 0.5 * facing;
          g = n < 0.5 ? "@" : "%";
        } else {
          v = 0.3 + L * 0.55 * facing;
          g = RAMP[clamp(5 + Math.floor(v * 4 + (n - 0.5) * 2), 0, RAMP.length - 1)];
        }
        put(c, r, C(g), v, true, lampWarm(L) * 0.7);
      }
    }

    // smoke: thin and grey, lit by whatever light it drifts through (the lamp, the lighter, the ember)
    for (const p of this.smoke) {
      const k = p.life / p.max;
      const L = this.light(p.x, p.y);
      const v = (0.08 + L * 0.6) * Math.min(1, k * 1.6);
      if (v < 0.05) continue;
      at(p.x, p.y, C(k > 0.7 ? "~" : k > 0.4 ? "-" : k > 0.2 ? "," : "."), v);
    }
    for (const a of this.ash) {
      const L = this.light(a.x, a.y);
      at(a.x, a.y, C(a.hot ? "'" : "."), a.hot ? Math.min(0.85, 0.4 + a.life * 0.4) : 0.25 + L * 0.35, a.hot && fireOn ? Math.min(0.8, a.life * 0.6) : 0);
    }
    // what's in his hand: the cigarette case, the lighter and its flame
    if (this.hand.ok && this.holding) {
      const hcx = Math.floor(this.hand.x / cw);
      const hcr = Math.floor(this.hand.y / ch);
      const L = this.light(this.hand.x, this.hand.y);
      if (this.holding === "case") {
        put(hcx, hcr, C("["), 0.45 + L * 0.4, true);
        put(hcx + this.dir, hcr, C("]"), 0.45 + L * 0.4, true);
      } else {
        put(hcx, hcr, C("I"), 0.5 + L * 0.3, true);
      }
    }
    // the cigarette: paper toward the face, ember at the tip
    if (this.cigPos) {
      const { x, y } = this.cigPos;
      const L = this.light(x, y);
      put(Math.floor((x - this.dir * S * 0.03) / cw), Math.floor(y / ch), C("-"), 0.5 + L * 0.35, true);
      put(Math.floor(x / cw), Math.floor(y / ch), C(this.ember > 0.7 ? "*" : this.ember > 0.2 ? "o" : "-"), Math.max(0.45 + L * 0.3, this.ember), true, fireOn ? Math.min(0.9, this.ember * 1.1) : 0);
    }
    // the flame goes on top of everything near it
    if (this.flame > 0.05) {
      const fl = hash3(Math.floor(t * 24), 3, 1);
      put(Math.floor(this.flamePos.x / cw), Math.floor(this.flamePos.y / ch), C(fl < 0.5 ? "^" : "*"), Math.min(1, 0.6 + this.flame * 0.4), true, fireOn ? 0.75 : 0);
      if (fl < 0.6) put(Math.floor(this.flamePos.x / cw), Math.floor(this.flamePos.y / ch) - 1, C("'"), 0.55 * this.flame, true, fireOn ? 0.55 : 0);
    }
    if (this.dropped) put(Math.floor(this.dropped.x / cw), Math.floor(this.dropped.y / ch), C(this.dropped.life > 1.5 ? "*" : "."), clamp(this.dropped.life / 3, 0.1, 0.8), true);

    // drips fall in front of everything
    for (const p of this.drips) {
      const L = this.light(p.x, p.y);
      at(p.x, p.y, C(p.vy > 400 ? "|" : p.vy > 150 ? "!" : "."), 0.35 + L * 0.6);
    }
  }
}
