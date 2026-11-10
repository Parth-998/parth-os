/**
 * Apartment: Chicago at night from a high-rise kitchen, rendered from the reference photo.
 * The photo is baked into three maps (apartment-data.ts): the scene without its point lights,
 * the lights themselves, and which parts are outside. Then it's lit by the real time in Chicago:
 * the sky and towers brighten through the day, a warm band rises at sunrise and sunset, and each
 * window in the skyline switches on or off as the city wakes up, comes home, and goes to bed.
 *   drag right → fast-forward (the further you drag, the faster)
 *   drag left  → rewind
 *   click      → back to the real time
 */
import { clamp, hash3, rand } from "./math";
import { unlock } from "@/lib/secrets";
import type { Input, Scene } from "./scenes";
import { APT_DATA, APT_H, APT_W } from "./apartment-data";

const C = (s: string) => s.charCodeAt(0);
const TZ = "America/Chicago";

function curve(h: number, keys: [number, number][]) {
  h = ((h % 24) + 24) % 24;
  for (let i = 0; i < keys.length - 1; i++) {
    const [h0, v0] = keys[i];
    const [h1, v1] = keys[i + 1];
    if (h >= h0 && h <= h1) return v0 + ((v1 - v0) * (h - h0)) / (h1 - h0 || 1);
  }
  return keys[keys.length - 1][1];
}
/** Share of the photo's windows that are on (the photo itself is a busy evening, ~1.0). */
const LIT: [number, number][] = [[0, 0.6], [3, 0.32], [5, 0.24], [7, 0.36], [9, 0.16], [16, 0.2], [18, 0.7], [20, 1], [22, 0.85], [24, 0.6]];
const DAY: [number, number][] = [[0, 0], [5, 0], [6.2, 0.45], [7.5, 1], [17, 1], [18.6, 0.45], [19.8, 0], [24, 0]];
const GLOW: [number, number][] = [[0, 0], [5, 0], [6.3, 1], [7.6, 0], [17, 0], [18.6, 1], [19.9, 0], [24, 0]];

function chicagoHours(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" }).formatToParts(d);
  const n = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return n("hour") + n("minute") / 60 + n("second") / 3600;
}

let decoded: { bg: Uint8Array; light: Uint8Array; out: Uint8Array } | null = null;
function data() {
  if (decoded) return decoded;
  const bin = atob(APT_DATA);
  const all = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) all[i] = bin.charCodeAt(i);
  const n = APT_W * APT_H;
  decoded = { bg: all.subarray(0, n), light: all.subarray(n, 2 * n), out: all.subarray(2 * n, 3 * n) };
  return decoded;
}

// ordered dither: a regular texture instead of speckle
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

export class Apartment implements Scene {
  cellScale = 0.72;
  private w = 0;
  private cw = 8;
  private ch = 12;
  private cols = 0;
  private rows = 0;

  private offset = 0;
  private sinceEmit = 1;
  private rate = 0;
  private dragFrom: number | null = null;
  private live = true;
  private hud = 0;
  private h = 0;
  private t = 0;
  // easter egg: scrub to exactly midnight and let go → fireworks over the skyline
  private settled = true;
  private fwUntil = 0;
  private fwNext = 0;
  private rockets: { x: number; y: number; vy: number; top: number }[] = [];
  private sparks: { x: number; y: number; vx: number; vy: number; life: number; max: number; g: string }[] = [];
  // easter egg (konami): a time-lapse, a whole day over the city in ten seconds
  private lapseT0 = -1;
  private lapseFrom = 0;
  private readonly LAPSE_S = 10;
  /** screensaver: the day rolls by slowly on its own */
  constructor(private saver = false) {}

  // per cell, sampled from the photo at resize
  private bg = new Float32Array(0); // 0–1 brightness without point lights
  private lt = new Float32Array(0); // 0–1 strongest light in the cell
  private lid = new Uint32Array(0); // which window that light belongs to (for on/off)
  private out = new Uint8Array(0); // 0 inside, 1 towers, 2 sky
  private fy = new Float32Array(0); // 0 top … 1 bottom, for the sky band

  resize(w: number, h: number, cols: number, rows: number, cw: number, ch: number) {
    this.w = w;
    this.h = h;
    this.cw = cw;
    this.ch = ch;
    this.cols = cols;
    this.rows = rows;
    const n = cols * rows;
    this.bg = new Float32Array(n);
    this.lt = new Float32Array(n);
    this.lid = new Uint32Array(n);
    this.out = new Uint8Array(n);
    this.fy = new Float32Array(n);
    const D = data();
    // cover-fit the photo to the screen, anchored a little low so the counter stays in view
    const s = Math.max(w / APT_W, h / APT_H);
    const ox = (w - APT_W * s) / 2;
    const oy = (h - APT_H * s) * 0.75;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        // the cell's footprint in photo pixels
        const px0 = (c * cw - ox) / s;
        const py0 = (r * ch - oy) / s;
        const px1 = ((c + 1) * cw - ox) / s;
        const py1 = ((r + 1) * ch - oy) / s;
        let sum = 0;
        let cnt = 0;
        let lmax = 0;
        let lx = 0;
        let ly = 0;
        let outs = 0;
        for (let y = Math.max(0, Math.floor(py0)); y < Math.min(APT_H, Math.ceil(py1)); y++)
          for (let x = Math.max(0, Math.floor(px0)); x < Math.min(APT_W, Math.ceil(px1)); x++) {
            const k = y * APT_W + x;
            sum += D.bg[k];
            cnt++;
            outs += D.out[k];
            if (D.light[k] > lmax) {
              lmax = D.light[k];
              lx = x;
              ly = y;
            }
          }
        if (!cnt) {
          const x = clamp(Math.round((px0 + px1) / 2), 0, APT_W - 1);
          const y = clamp(Math.round((py0 + py1) / 2), 0, APT_H - 1);
          const k = y * APT_W + x;
          sum = D.bg[k];
          cnt = 1;
          lmax = D.light[k];
          outs = D.out[k];
          lx = x;
          ly = y;
        }
        // lift the mid-tones so the towers read as solid shapes, keep the shadows black
        this.bg[i] = sum / cnt / 255;
        this.lt[i] = lmax / 255;
        // lights within ~3 photo pixels count as one window
        this.lid[i] = (Math.floor(lx / 3) * 977 + Math.floor(ly / 3) * 131) >>> 0;
        this.out[i] = Math.round(outs / cnt); // 0 inside, 1 towers, 2 sky
        this.fy[i] = clamp((r * ch - oy) / (APT_H * s), 0, 1);
      }
  }

  konami() {
    this.lapseT0 = this.t;
    this.lapseFrom = this.offset;
    this.rate = 0;
  }

  step(dt: number, _t: number, inp: Input) {
    if (this.saver) {
      this.offset += (24 / 90) * dt;
      this.t += dt;
      return;
    }
    if (this.lapseT0 >= 0) {
      const k = (this.t + dt - this.lapseT0) / this.LAPSE_S;
      if (k >= 1) {
        // back to now
        this.lapseT0 = -1;
        this.offset = 0;
        this.live = true;
        this.hud = 2.5;
      } else {
        // ease in and out so dawn and dusk don't blur past
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        this.offset = this.lapseFrom + 24 * e;
        this.live = false;
        this.hud = 1;
      }
      this.rate = 0;
      this.t += dt;
      this.sinceEmit += dt;
      if (this.sinceEmit > 0.1 && typeof window !== "undefined") {
        this.sinceEmit = 0;
        window.dispatchEvent(new CustomEvent("apt-hours", { detail: chicagoHours() + this.offset }));
      }
      this.settled = true; // a time-lapse passing midnight doesn't count as stopping there
      this.stepFireworks(dt);
      return;
    }
    if (inp.dragging) {
      if (this.dragFrom === null) this.dragFrom = inp.px;
      const d = clamp((inp.px - this.dragFrom) / (this.w * 0.45), -1, 1);
      this.rate = Math.sign(d) * d * d * 6 * (0.3 + 0.7 * inp.strength);
      this.live = false;
      this.hud = 2;
    } else {
      this.dragFrom = null;
      this.rate *= Math.exp(-dt * 6);
    }
    this.offset += this.rate * dt;
    this.t += dt;

    // midnight check: once a scrub has come to rest
    if (inp.dragging || Math.abs(this.rate) > 0.01) this.settled = false;
    else if (!this.settled) {
      this.settled = true;
      const h24 = (((chicagoHours() + this.offset) % 24) + 24) % 24;
      const fromMidnight = Math.min(h24, 24 - h24) * 60; // minutes
      if (!this.live && fromMidnight <= 3) {
        this.fwUntil = this.t + 8;
        this.fwNext = this.t;
        unlock("midnight");
      }
    }
    this.stepFireworks(dt);
    // tell the rest of the site what time it is in the scene (the site tints itself to match)
    this.sinceEmit += dt;
    if (this.sinceEmit > 0.25 && typeof window !== "undefined") {
      this.sinceEmit = 0;
      window.dispatchEvent(new CustomEvent("apt-hours", { detail: chicagoHours() + this.offset }));
    }
    this.hud = Math.max(0, this.hud - dt);
  }

  private stepFireworks(dt: number) {
    const t = this.t;
    if (t < this.fwUntil && t >= this.fwNext) {
      this.fwNext = t + rand(0.25, 0.6);
      this.rockets.push({ x: rand(this.w * 0.12, this.w * 0.88), y: this.h * 0.62, vy: -rand(420, 560), top: rand(this.h * 0.08, this.h * 0.3) });
    }
    for (const r of this.rockets) {
      r.y += r.vy * dt;
      if (r.y <= r.top) {
        // burst
        const n = Math.round(rand(26, 44));
        const g = Math.random() < 0.5 ? "*" : "+";
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rand(-0.1, 0.1);
          const v = rand(110, 210);
          const max = rand(1.1, 1.8);
          this.sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, g });
        }
        r.vy = 0;
      }
    }
    this.rockets = this.rockets.filter((r) => r.vy !== 0);
    for (const s of this.sparks) {
      s.vx *= Math.exp(-dt * 1.6);
      s.vy = s.vy * Math.exp(-dt * 1.6) + 60 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
  }

  click() {
    if (this.lapseT0 >= 0) return;
    this.offset = 0;
    this.rate = 0;
    this.live = true;
    this.hud = 2.5;
  }

  fill(glyph: Uint16Array, level: Float32Array, t: number) {
    const { cols, rows } = this;
    const hrs = chicagoHours() + this.offset;
    const day = curve(hrs, DAY);
    const glow = curve(hrs, GLOW);
    const litFrac = curve(hrs, LIT);
    const night = 1 - day;
    const tick = Math.floor(t * 0.7);

    for (let i = 0; i < cols * rows; i++) {
      const c = i % cols;
      const r = (i / cols) | 0;
      const kind = this.out[i];
      const bg = this.bg[i];
      const d = BAYER[(r & 3) * 4 + (c & 3)];
      let g = " ";
      let v = 0;
      if (kind === 2) {
        // sky: an even haze of dots, thicker where the clouds catch the city's light; brighter by day,
        // with a warm band at dawn and dusk
        const sky = this.fy[i];
        v = 0.06 + bg * (0.3 + 0.3 * day) + day * 0.32 + glow * 0.3 * Math.max(0, 1 - Math.abs(sky - 0.4) * 2.4);
        // by day the sky goes airy (few dots, but bright) so the towers stand out against it
        const dens = clamp(0.12 + bg * 1.1 + glow * 0.15, 0, 1);
        if (dens > d) g = dens > 0.75 && d < 0.25 ? ":" : ".";
      } else if (kind === 1) {
        // towers: solid textured masses, lighter on their lit faces by day
        v = 0.12 + bg * (0.4 + 0.45 * day) + day * 0.06;
        // by day: sunlit faces on the left half of each tower read denser than the shaded right
        const t2 = 0.12 + bg * 1.4 + 0.25 * (d < 0.5 ? 1 : 0.4);
        g = t2 > 0.62 ? (d < 0.5 ? "=" : ":") : t2 > 0.38 ? ":" : t2 > 0.2 ? (d < 0.6 ? ":" : ".") : d < 0.5 ? "." : " ";
        // each window switches on or off with the time
        const L = this.lt[i];
        if (L > 0.08) {
          const th = hash3(this.lid[i], 7, 11);
          const nearCut = Math.abs(th - litFrac) < 0.02 && hash3(this.lid[i], tick, 5) < 0.5;
          const beacon = L > 0.85; // crowns and the brightest signs stay on all night
          const on = beacon ? night > 0.3 : th < litFrac !== nearCut;
          if (on) {
            const lv = L * (0.35 + 0.5 * night) + 0.2;
            if (lv > v) {
              v = lv;
              g = lv > 0.7 ? "+" : "=";
            }
          }
        }
      } else {
        // inside: the dark room; the counter top and faucet catch the window light
        v = bg * (0.65 + 0.3 * day);
        const t2 = bg * (1 + 0.4 * day);
        g = t2 > 0.7 ? "=" : t2 > 0.5 ? "-" : t2 > 0.3 ? (d < 0.55 ? "." : " ") : t2 > 0.18 && d < 0.2 ? "." : " ";
      }
      v = clamp(v, 0, 1);
      if (g === " " || v < 0.04) {
        glyph[i] = 0;
        level[i] = 0;
      } else {
        glyph[i] = C(g);
        level[i] = v;
      }
    }

    // fireworks: only drawn outside (sky and towers), never on the kitchen side of the glass
    const draw = (x: number, y: number, g: string, v: number) => {
      const c = Math.floor(x / this.cw);
      const r = Math.floor(y / this.ch);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      const i = r * cols + c;
      if (!this.out[i] || v < level[i]) return;
      glyph[i] = C(g);
      level[i] = v;
    };
    for (const r of this.rockets) {
      draw(r.x, r.y, "|", 0.9);
      draw(r.x, r.y + this.ch, "'", 0.5);
    }
    for (const s of this.sparks) {
      const k = s.life / s.max;
      draw(s.x, s.y, k > 0.6 ? s.g : k > 0.3 ? "." : ",", 0.35 + 0.65 * k);
    }

    // time readout while scrubbing (and briefly after jumping back)
    if (!this.saver && (this.hud > 0 || !this.live)) {
      const hh = ((Math.floor(hrs) % 24) + 24) % 24;
      const mm = Math.floor((((hrs % 1) + 1) % 1) * 60);
      const label = `${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "am" : "pm"} chicago`;
      const speed = this.lapseT0 >= 0 ? "  >> time-lapse" : Math.abs(this.rate) > 0.05 ? `  ${this.rate > 0 ? ">>" : "<<"} ${Math.abs(this.rate * 3600).toFixed(0)}x` : this.live ? "  · live" : "  · click to go back to now";
      const s = label + speed;
      const v = this.live ? clamp(this.hud, 0, 1) * 0.85 : 0.8;
      const r0 = rows - 3;
      const c0 = cols - s.length - 3;
      for (let k = 0; k < s.length; k++) {
        const i = r0 * cols + c0 + k;
        if (i < 0 || i >= glyph.length) continue;
        glyph[i] = s[k] === " " ? 0 : C(s[k]);
        level[i] = s[k] === " " ? 0 : v;
      }
    }
  }
}
