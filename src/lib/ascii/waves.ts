/**
 * Waves: the sea at night, seen from the shore. Swells roll toward you under a low horizon,
 * and the moon lays a broken path of light across the water.
 *   move  → a faint ripple now and then where your cursor rests on the water
 *   click → a splash
 *   drag  → a wake trails behind the cursor, like a boat cutting through
 * Now and then a shooting star crosses the sky. Catch one with a click and it bursts, the sky
 * answers with a shower, and the terminal asks you to make a wish (secret: "wish").
 */
import { clamp, hash3, rand } from "./math";
import { unlock } from "../secrets";
import type { Input, Scene } from "./scenes";

const C = (s: string) => s.charCodeAt(0);
const smooth01 = (x: number) => {
  const k = clamp(x, 0, 1);
  return k * k * (3 - 2 * k);
};

interface Ring {
  X: number;
  Z: number;
  t0: number;
  amp: number;
}
interface Push {
  dx: number;
  dz: number;
  t0: number;
  amp: number;
}

export class Waves implements Scene {
  private w = 0;
  private h = 0;
  private cols = 0;
  private rows = 0;
  private cw = 10;
  private ch = 14;
  private horizon = 0;
  private mx = 0;
  private my = 0;
  private mr = 30;
  private t = 0;
  private rings: Ring[] = [];
  private pushes: Push[] = [];
  private wake: { x: number; y: number; t0: number; dir: number }[] = [];
  private spray: { x: number; y: number; vx: number; vy: number; life: number; y0: number }[] = [];
  /** Splash rings drawn on the surface: flattened ellipses that spread and fade. */
  private splashRings: { x: number; y: number; t0: number; scale: number; delay: number }[] = [];
  private lastRing = 0;
  private lastPx = -1;
  private lastPy = -1;
  // easter egg (konami): a rogue wave rises far out, rolls in and breaks on the shore
  private rogueT0 = -99;
  private rogueBroke = false;
  private readonly ROGUE_S = 7.5;
  /** Shooting stars: every few seconds on the screensaver, rarely (and a little slower, so one can
   *  be caught) on the wallpaper. */
  constructor(private saver = false) {
    this.nextMeteor = saver ? 2 : rand(12, 30);
  }
  private meteors: { x: number; y: number; vx: number; vy: number; t0: number; life: number; caught?: boolean }[] = [];
  private nextMeteor = 2;
  /** a caught star: sparkles drifting down, the stars flaring, a short shower */
  private sparkles: { x: number; y: number; vx: number; vy: number; t0: number; life: number }[] = [];
  private wishT0 = -99;

  resize(w: number, h: number, cols: number, rows: number, cw: number, ch: number) {
    this.w = w;
    this.h = h;
    this.cols = cols;
    this.rows = rows;
    this.cw = cw;
    this.ch = ch;
    this.horizon = h * 0.44;
    this.mx = w * 0.3;
    this.my = h * 0.19;
    this.mr = clamp(h * 0.065, 22, 70);
  }

  /** Screen → sea coordinates (X across, Z depth). */
  private toSea(x: number, y: number) {
    const dy = Math.max(2, y - this.horizon);
    const Z = (this.h * 0.55) / dy;
    const X = ((x - this.w / 2) / dy) * 0.9;
    return { X, Z };
  }

  private height(X: number, Z: number, t: number) {
    let hgt =
      Math.sin(X * 0.9 + Z * 2.3 - t * 1.1) * 0.5 +
      Math.sin(X * -1.7 + Z * 3.1 - t * 1.6 + 1.3) * 0.28 +
      Math.sin(X * 3.3 + Z * 5.2 - t * 2.4 + 2.1) * 0.14 +
      Math.sin(X * -4.1 + Z * 7.7 - t * 3.1 + 0.4) * 0.08;
    for (const r of this.rings) {
      const age = t - r.t0;
      const d = Math.hypot(X - r.X, (Z - r.Z) * 1.6);
      const front = age * 1.2;
      if (Math.abs(d - front) > 0.7) continue;
      const env = Math.exp(-(((d - front) / 0.22) ** 2)) * Math.exp(-age * 0.9);
      hgt += r.amp * env * Math.sin((d - front) * 16);
    }
    // the rogue wave: a ridge that travels toward you, growing as it comes
    const ra = t - this.rogueT0;
    if (ra >= 0 && ra < this.ROGUE_S + 1.5) {
      const k = clamp(ra / this.ROGUE_S, 0, 1);
      const Zr = 14 * Math.pow(1 - k, 1.6) + 0.35;
      const width = 0.18 * Zr + 0.12;
      const amp = (0.6 + 2.6 * k) * (ra > this.ROGUE_S ? Math.max(0, 1 - (ra - this.ROGUE_S) / 1.5) : 1);
      const dz = (Z - Zr) / width;
      // steep front (toward you), long back
      hgt += amp * Math.exp(-(dz > 0 ? dz * dz * 0.35 : dz * dz * 1.6)) * (1 + 0.15 * Math.sin(X * 2.2 + t * 2));
    }
    for (const p of this.pushes) {
      const age = t - p.t0;
      const s = X * p.dx + Z * p.dz - age * 1.4;
      hgt += p.amp * Math.exp(-age * 0.35) * Math.exp(-(((s % 6) - 3) ** 2) * 0.6) * Math.sin(s * 3);
    }
    return hgt;
  }

  private launch(t: number, fast: boolean) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    const sp = fast ? rand(500, 800) : rand(300, 420);
    this.meteors.push({ x: rand(this.w * 0.15, this.w * 0.85), y: rand(this.h * 0.04, this.horizon * 0.5), vx: dir * sp, vy: sp * rand(0.25, 0.38), t0: t, life: fast ? 1.1 : 1.9 });
  }

  private stepMeteors(dt: number, t: number) {
    if (t > this.nextMeteor) {
      this.nextMeteor = t + (this.saver ? rand(2.5, 6) : rand(35, 75));
      this.launch(t, this.saver);
    }
    // the shower after a wish: a handful of quick ones over a few seconds
    const wa = t - this.wishT0;
    if (wa > 0.6 && wa < 4.5 && Math.random() < dt * 2.2) this.launch(t, true);
    this.meteors = this.meteors.filter((m) => !m.caught && t - m.t0 < m.life);
    for (const s of this.sparkles) {
      s.vx *= 1 - dt * 1.6;
      s.vy = s.vy * (1 - dt * 1.6) + 30 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
    this.sparkles = this.sparkles.filter((s) => t - s.t0 < s.life);
  }

  /** Did the click land on a shooting star? Generous: anywhere near its head or the front of its tail. */
  private catchMeteor(x: number, y: number) {
    if (this.saver) return false;
    for (const m of this.meteors) {
      const age = this.t - m.t0;
      const hx = m.x + m.vx * age;
      const hy = m.y + m.vy * age;
      const tx = hx - m.vx * 0.12;
      const ty = hy - m.vy * 0.12;
      // distance from the click to the segment head→tail
      const L = Math.hypot(hx - tx, hy - ty) || 1;
      const u = clamp(((x - tx) * (hx - tx) + (y - ty) * (hy - ty)) / (L * L), 0, 1.3);
      if (Math.hypot(x - (tx + (hx - tx) * u), y - (ty + (hy - ty) * u)) > 38) continue;
      m.caught = true;
      this.wishT0 = this.t;
      for (let i = 0; i < 46; i++) {
        const a = rand(0, Math.PI * 2);
        const sp = rand(30, 190);
        this.sparkles.push({ x: hx, y: hy, vx: Math.cos(a) * sp + m.vx * 0.15, vy: Math.sin(a) * sp * 0.8 + m.vy * 0.1, t0: this.t, life: rand(1.6, 3.4) });
      }
      unlock("wish");
      window.dispatchEvent(new CustomEvent("wish-star"));
      return true;
    }
    return false;
  }

  konami() {
    this.rogueT0 = this.t;
    this.rogueBroke = false;
  }

  step(dt: number, t: number, inp: Input) {
    this.t = t;
    this.stepMeteors(dt, t);
    // the rogue wave breaks: a wall of spray all along the shore
    if (!this.rogueBroke && t - this.rogueT0 > this.ROGUE_S - 0.4 && t - this.rogueT0 < this.ROGUE_S + 1) {
      this.rogueBroke = true;
      const y = this.h * 0.86;
      for (let i = 0; i < 160; i++) {
        const x = rand(0, this.w);
        this.spray.push({ x, y: y + rand(-10, 10), vx: rand(-40, 40), vy: -rand(260, 620), life: 2.5, y0: y + rand(0, 40) });
      }
      for (let k = 0; k < 6; k++) this.splashRings.push({ x: rand(this.w * 0.1, this.w * 0.9), y, t0: t, scale: 1.2, delay: k * 0.12 });
    }
    const onSea = inp.py > this.horizon + 6;
    if (inp.dragging && onSea) {
      // wake: a ring dropped along the drag path every few frames
      const moved = Math.hypot(inp.px - this.lastPx, inp.py - this.lastPy);
      if (moved > 14 && t - this.lastRing > 0.045) {
        const { X, Z } = this.toSea(inp.px, inp.py);
        this.rings.push({ X, Z, t0: t, amp: 0.75 });
        this.wake.push({ x: inp.px, y: inp.py, t0: t, dir: Math.sign(inp.dvx) || 1 });
        this.lastRing = t;
        this.lastPx = inp.px;
        this.lastPy = inp.py;
      }
    } else if (inp.hover && inp.strength > 0 && onSea) {
      // hover stays quiet: a small, soft ripple only after the cursor travels a fair way
      const moved = Math.hypot(inp.px - this.lastPx, inp.py - this.lastPy);
      if (moved > 70 && t - this.lastRing > 0.5) {
        const { X, Z } = this.toSea(inp.px, inp.py);
        this.rings.push({ X, Z, t0: t, amp: 0.12 * inp.strength });
        this.lastRing = t;
        this.lastPx = inp.px;
        this.lastPy = inp.py;
      }
    }
    this.rings = this.rings.filter((r) => t - r.t0 < 4).slice(-36);
    this.wake = this.wake.filter((p) => t - p.t0 < 4).slice(-160);
    this.pushes = this.pushes.filter((p) => t - p.t0 < 9).slice(-6);
    for (const s of this.spray) {
      s.vy += 700 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.vy > 0 && s.y >= s.y0) {
        // droplet lands: a tiny ring where it hits
        s.life = 0;
        if (Math.random() < 0.5) this.splashRings.push({ x: s.x, y: s.y0, t0: t, scale: 0.25, delay: 0 });
      }
    }
    this.spray = this.spray.filter((s) => s.life > 0);
    this.splashRings = this.splashRings.filter((r) => t - r.t0 - r.delay < 2.4).slice(-40);
  }

  click(x: number, y: number) {
    if (this.catchMeteor(x, y)) return;
    if (y < this.horizon + 4) return;
    const { X, Z } = this.toSea(x, y);
    this.rings.push({ X, Z, t0: this.t, amp: 0.5 });
    // nearer water = bigger splash
    const scale = clamp(0.35 + ((y - this.horizon) / (this.h - this.horizon)) * 0.85, 0.35, 1.2);
    for (let k = 0; k < 3; k++) this.splashRings.push({ x, y, t0: this.t, scale, delay: k * 0.25 });
    // a crown of droplets: thrown up and slightly out, then falling back to the surface
    const n = Math.round(10 + 14 * scale);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const out = rand(40, 110) * scale;
      this.spray.push({ x, y, vx: Math.cos(a) * out, vy: -rand(170, 320) * scale - Math.abs(Math.sin(a)) * 40 * scale, life: 2, y0: y + Math.sin(a) * 6 * scale });
    }
    // a short column in the middle
    for (let i = 0; i < 5; i++) this.spray.push({ x: x + rand(-3, 3), y, vx: rand(-12, 12), vy: -rand(300, 420) * scale, life: 2, y0: y });
  }

  fill(glyph: Uint16Array, level: Float32Array, t: number, warm?: Float32Array) {
    const { cw, ch, cols, rows, w, h } = this;
    const put = (c: number, r: number, g: string, v: number) => {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      const i = r * cols + c;
      if (v > level[i]) {
        level[i] = v;
        glyph[i] = C(g);
      }
    };
    const hr = Math.floor(this.horizon / ch);

    // stars (after a wish they flare and twinkle hard for a few seconds, rippling out from the catch)
    const wa = t - this.wishT0;
    const flare = wa > 0 && wa < 6 ? Math.sin(Math.min(1, wa / 0.8) * Math.PI * 0.5) * (1 - smooth01((wa - 3.5) / 2.5)) : 0;
    for (let k = 0; k < Math.round((w * h) / 9000); k++) {
      const c = Math.floor(hash3(k, 1, 7) * cols);
      const r = Math.floor(hash3(k, 2, 7) * (hr - 1));
      const tw = 0.5 + 0.5 * Math.sin(t * (0.6 + hash3(k, 3, 7) + flare * 4) + k);
      const base = (0.12 + 0.25 * hash3(k, 5, 7)) * (0.5 + 0.5 * tw);
      const f = flare * (0.4 + 0.6 * tw);
      put(c, r, f > 0.5 && hash3(k, 4, 7) < 0.5 ? "*" : hash3(k, 4, 7) < 0.15 ? "*" : ".", Math.min(1, base + f * 0.6));
      if (warm && f > 0.05 && c >= 0 && c < cols && r >= 0 && r < rows) warm[r * cols + c] = Math.max(warm[r * cols + c], f * 0.5);
    }

    // the moon: a shaded disc with a soft halo
    const mrw = this.mr;
    for (let r = Math.floor((this.my - mrw * 2) / ch); r <= Math.ceil((this.my + mrw * 2) / ch); r++) {
      for (let c = Math.floor((this.mx - mrw * 2) / cw); c <= Math.ceil((this.mx + mrw * 2) / cw); c++) {
        const dx = (c + 0.5) * cw - this.mx;
        const dy = (r + 0.5) * ch - this.my;
        const d = Math.hypot(dx, dy);
        if (d < mrw) {
          const shade = 0.75 + 0.25 * (-(dx + dy) / mrw) * 0.5 - (hash3(c, r, 21) < 0.18 ? 0.25 : 0);
          put(c, r, shade > 0.85 ? "@" : shade > 0.7 ? "%" : "#", clamp(shade, 0.4, 1));
        } else if (d < mrw * 1.9 && hash3(c, r, 22) < 0.5 * (1 - (d - mrw) / (mrw * 0.9))) {
          put(c, r, ".", 0.18 * (1 - (d - mrw) / (mrw * 0.9)));
        }
      }
    }

    // a caught star's sparkles: warm, twinkling, drifting down and out
    for (const s of this.sparkles) {
      const a = (t - s.t0) / s.life;
      const tw = hash3(s.x | 0, s.y | 0, Math.floor(t * 12)) < 0.8 ? 1 : 0.3;
      const c = Math.floor(s.x / cw);
      const r = Math.floor(s.y / ch);
      put(c, r, a < 0.3 ? "*" : a < 0.7 ? "+" : ".", (1 - a) * tw);
      if (warm && c >= 0 && c < cols && r >= 0 && r < rows) warm[r * cols + c] = Math.max(warm[r * cols + c], 0.8 * (1 - a));
    }
    // the moment of the catch: a quick star-shaped flash
    if (wa >= 0 && wa < 0.5 && this.sparkles.length) {
      const s0 = this.sparkles[0];
      const ox = s0.x - s0.vx * 0;
      const c0 = Math.floor(ox / cw);
      const r0 = Math.floor(s0.y / ch);
      const k = 1 - wa / 0.5;
      const len = Math.round(2 + wa * 14);
      for (let q = 1; q <= len; q++) {
        put(c0 + q, r0, "-", k * (1 - q / (len + 1)));
        put(c0 - q, r0, "-", k * (1 - q / (len + 1)));
        if (q <= len / 2) {
          put(c0, r0 + q, "|", k * (1 - q / (len + 1)));
          put(c0, r0 - q, "|", k * (1 - q / (len + 1)));
        }
      }
    }

    // shooting stars: a bright head and a fading tail
    for (const m of this.meteors) {
      const age = t - m.t0;
      const fade = Math.max(0, 1 - age / m.life);
      for (let k = 0; k < 14; k++) {
        const x = m.x + m.vx * (age - k * 0.018);
        const y = m.y + m.vy * (age - k * 0.018);
        if (y > this.horizon - ch) continue;
        put(Math.floor(x / cw), Math.floor(y / ch), k === 0 ? "*" : k < 4 ? "-" : ".", fade * (1 - k / 14));
      }
    }

    // horizon
    for (let c = 0; c < cols; c++) put(c, hr, hash3(c, 9, 1) < 0.7 ? "-" : "_", 0.14);

    // the sea
    const dZ = 0.03;
    for (let r = hr + 1; r < rows; r++) {
      const y = (r + 0.5) * ch;
      const near = (y - this.horizon) / (h - this.horizon);
      const pathW = cw * 1.5 + (y - this.horizon) * 0.42;
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.5) * cw;
        const { X, Z } = this.toSea(x, y);
        const H0 = this.height(X, Z, t);
        const slope = (this.height(X, Z + dZ * Z, t) - H0) / (dZ * Z);
        // light: crests facing you catch the sky; the moon path is where slopes flash
        const facing = clamp(-slope * 0.9, -1, 1);
        const inPath = Math.exp(-(((x - this.mx) / pathW) ** 2));
        const glint = inPath * Math.max(0, facing) ** 1.2 * (hash3(c, r, Math.floor(t * 5)) < 0.75 ? 1 : 0.45);
        const crest = Math.max(0, H0 - 0.3) * 0.7;
        let v = 0.03 + 0.06 * near + Math.max(0, facing) * 0.45 * (0.3 + 0.7 * near) + crest * (0.4 + 0.6 * near) + glint * 0.95;
        v *= 0.55 + 0.45 * Math.min(1, near * 3);
        if (v < 0.07) continue;
        const g = glint > 0.35 ? (glint > 0.7 ? "=" : "-") : v > 0.32 ? "~" : v > 0.16 ? "-" : ".";
        put(c, r, g, clamp(v, 0, 1));
      }
    }

    // the wake: foam in the cursor's path that spreads out in two arms and fades
    for (const p of this.wake) {
      const age = t - p.t0;
      const near = clamp((p.y - this.horizon) / (h - this.horizon), 0.2, 1);
      const fade = Math.min(1, 1.15 * Math.exp(-age * 0.75));
      const r0 = Math.floor(p.y / ch);
      if (age < 0.9) put(Math.floor(p.x / cw) + (hash3(p.x | 0, r0, Math.floor(t * 8)) < 0.5 ? 0 : 1), r0, age < 0.35 ? "o" : "°", 0.95 * fade);
      const spread = age * 34 * near;
      for (const side of [-1, 1]) {
        const rr = Math.floor((p.y + age * 9 * near) / ch);
        const cc = Math.floor((p.x + side * spread) / cw);
        put(cc, rr, age < 1.2 ? "=" : "~", fade);
        put(cc + side, rr, "-", 0.55 * fade);
      }
    }

    // splashes: the water opens into calm rings (the sea inside is cleared so the shape reads),
    // ring lines spread outward in perspective, droplets fly up and fall back
    const force = (c: number, r: number, g: string, v: number) => {
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      const i = r * cols + c;
      level[i] = v;
      glyph[i] = v > 0 ? C(g) : 0;
    };
    for (const sr of this.splashRings) {
      const age = t - sr.t0 - sr.delay;
      if (age < 0 || sr.scale < 0.3 || sr.delay > 0) continue;
      // clear the inside of the leading ring while it's young
      const rx = (24 + age * 230) * sr.scale;
      const ry = rx * (0.26 + 0.12 * sr.scale);
      const k = clamp(1 - age / 1.4, 0, 1);
      if (k <= 0) continue;
      for (let r = Math.floor((sr.y - ry) / ch); r <= Math.ceil((sr.y + ry) / ch); r++)
        for (let c = Math.floor((sr.x - rx) / cw); c <= Math.ceil((sr.x + rx) / cw); c++) {
          const dx = ((c + 0.5) * cw - sr.x) / rx;
          const dy = ((r + 0.5) * ch - sr.y) / ry;
          if (dx * dx + dy * dy < 0.8 && hash3(c, r, 77) < k) force(c, r, " ", 0);
        }
    }
    for (const sr of this.splashRings) {
      const age = t - sr.t0 - sr.delay;
      if (age < 0) continue;
      const rx = (24 + age * 230) * sr.scale;
      const ry = rx * (0.26 + 0.12 * sr.scale);
      const v = clamp(1 - age * 0.55, 0, 1) * (sr.scale < 0.3 ? 0.55 : 1);
      if (v <= 0.05) continue;
      const steps = Math.max(12, Math.round((rx * 2.2 * Math.PI) / cw));
      for (let q = 0; q < steps; q++) {
        const a = (q / steps) * Math.PI * 2;
        const c = Math.floor((sr.x + Math.cos(a) * rx) / cw);
        const r = Math.floor((sr.y + Math.sin(a) * ry) / ch);
        // near edge (bottom half) is brighter: it faces you
        const near = Math.sin(a) > 0;
        force(c, r, near ? "=" : "-", v * (near ? 1 : 0.6));
      }
    }
    // droplets: bright while rising, dimmer as they fall back
    for (const d of this.spray) force(Math.floor(d.x / cw), Math.floor(d.y / ch), d.vy < -120 ? "|" : d.vy < 0 ? "'" : ".", d.vy < 0 ? 1 : 0.75);
  }
}
