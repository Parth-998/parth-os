/**
 * More background styles on a shared grid engine: rain, waves, matrix, constellation.
 * Each style reacts three ways, like the sharks: move (gentle), click (a burst), drag (direct control).
 */
import { clamp, hash3, rand, randInt } from "./math";
import type { Palette } from "./renderer";
import type { EngineOptions, Motion } from "./engine";

const STEP = 1 / 60;
const DRAG_PX = 6;

export interface Input {
  /** Pointer in px; active while hovering the background. */
  px: number;
  py: number;
  hover: boolean;
  /** Drag in px, with velocity (px/s); active while dragging. */
  dragging: boolean;
  dvx: number;
  dvy: number;
  /** 0–1 interaction strength. */
  strength: number;
}

export interface Scene {
  resize(w: number, h: number, cols: number, rows: number, cw: number, ch: number): void;
  step(dt: number, t: number, input: Input): void;
  click(x: number, y: number): void;
  /** Grid scenes fill `glyph` (char codes, 0 = empty) and `level` (0–1). */
  fill?(glyph: Uint16Array, level: Float32Array, t: number, warm: Float32Array): void;
  /** Free-form scenes paint the canvas themselves. */
  paint?(ctx: CanvasRenderingContext2D, ink: (a: number) => string, t: number): void;
  /** 0–1 full-screen flash (rain's lightning). */
  flash?: number;
  /** < 1 for a finer character grid (more detail), e.g. scenes drawn from a photo. */
  cellScale?: number;
  /** Easter egg: the konami code was entered. */
  konami?(): void;
}

const LEVELS = 24;

export class GridEngine {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private t = 0;
  private hidden = false;
  private motion: Motion = "full";
  private reduced: MediaQueryList;
  private ro: ResizeObserver;
  private disposed = false;
  private press: { id: number; x: number; y: number; lx: number; ly: number; lt: number; dragging: boolean } | null = null;
  private input: Input = { px: 0, py: 0, hover: false, dragging: false, dvx: 0, dvy: 0, strength: 1 };
  private palette: Palette = { bg: [0, 0, 0], glow: [6, 6, 6], ink: [255, 255, 255] };
  private contrast = 1;
  private tones: string[] = [];
  private w = 0;
  private h = 0;
  private dpr = 1;
  private cw = 10;
  private ch = 14;
  private cols = 0;
  private rows = 0;
  private glyph = new Uint16Array(0);
  private level = new Float32Array(0);
  /** 0–1 per cell: how far toward amber that character is drawn (fire, lamp light). Most scenes leave it 0. */
  private warm = new Float32Array(0);
  private buckets: number[][] = Array.from({ length: LEVELS }, () => []);
  private accepts: (t: EventTarget | null) => boolean;
  private interactive: boolean;
  private scale: number;

  constructor(private canvas: HTMLCanvasElement, private scene: Scene, opts: EngineOptions = {}) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.accepts = opts.acceptsPointer ?? (() => true);
    this.interactive = opts.interactive ?? true;
    this.scale = opts.virtualScale ?? 1;
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    document.addEventListener("visibilitychange", this.onVis);
    if (this.interactive) {
      window.addEventListener("pointermove", this.onMove, { passive: true });
      window.addEventListener("pointerdown", this.onDown, { passive: true });
      window.addEventListener("pointerup", this.onUp, { passive: true });
      window.addEventListener("pointercancel", this.endPress, { passive: true });
      window.addEventListener("konami", this.onKonami);
      window.addEventListener("blur", this.onLeave);
      document.documentElement.addEventListener("pointerleave", this.onLeave);
    }
    this.setPalette(this.palette, 1);
    this.resize();
    this.schedule();
  }

  private onKonami = () => this.scene.konami?.();

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    document.removeEventListener("visibilitychange", this.onVis);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.endPress);
    window.removeEventListener("konami", this.onKonami);
    window.removeEventListener("blur", this.onLeave);
    document.documentElement.removeEventListener("pointerleave", this.onLeave);
    document.documentElement.classList.remove("bg-dragging");
  }

  setPalette(p: Palette, contrast = 1) {
    this.palette = p;
    this.contrast = clamp(contrast, 0.2, 1);
    const { bg, ink } = p;
    this.tones = [];
    for (let i = 0; i < 256; i++) {
      const k = (i / 255) * this.contrast;
      this.tones.push(`rgb(${Math.round(bg[0] + (ink[0] - bg[0]) * k)},${Math.round(bg[1] + (ink[1] - bg[1]) * k)},${Math.round(bg[2] + (ink[2] - bg[2]) * k)})`);
    }
    if (!this.running()) this.draw();
  }

  setMotion(m: Motion) {
    this.motion = m;
    this.schedule();
  }

  setInteraction(v: number) {
    this.input.strength = clamp(v, 0, 1);
  }

  private running() {
    return this.motion !== "off";
  }

  private timeScale() {
    return this.motion === "reduced" || this.reduced.matches ? 0.35 : 1;
  }

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const s = this.scale;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2) / s;
    this.w = r.width * s;
    this.h = r.height * s;
    const cs = this.scene.cellScale ?? 1;
    this.cw = clamp(Math.round((this.w / 124) * cs), cs < 1 ? 6 : 8, 13);
    this.ch = Math.round(this.cw * 1.45);
    this.cols = Math.ceil(this.w / this.cw);
    this.rows = Math.ceil(this.h / this.ch);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.glyph = new Uint16Array(this.cols * this.rows);
    this.level = new Float32Array(this.cols * this.rows);
    this.warm = new Float32Array(this.cols * this.rows);
    this.scene.resize(this.w, this.h, this.cols, this.rows, this.cw, this.ch);
    if (!this.running()) {
      for (let i = 0; i < 180; i++) this.scene.step(STEP, (this.t += STEP), this.input);
      this.draw();
    }
  }

  private schedule = () => {
    cancelAnimationFrame(this.raf);
    if (this.disposed) return;
    if (!this.running()) {
      this.draw();
      return;
    }
    if (this.hidden) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  };

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000) * this.timeScale();
    this.last = now;
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 4) {
      this.t += STEP;
      this.scene.step(STEP, this.t, this.input);
      this.acc -= STEP;
      n++;
    }
    if (n === 4) this.acc = 0;
    // drag velocity decays when the pointer stops
    this.input.dvx *= 0.85;
    this.input.dvy *= 0.85;
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private draw() {
    const { ctx, dpr, w, h, palette } = this;
    if (!w) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const flash = this.scene.flash ?? 0;
    const g = ctx.createRadialGradient(w * 0.5, h * 0.38, 0, w * 0.5, h * 0.38, Math.hypot(w, h) * 0.62);
    g.addColorStop(0, `rgb(${palette.glow.join(",")})`);
    g.addColorStop(1, `rgb(${palette.bg.join(",")})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (flash > 0.01) {
      ctx.fillStyle = this.tone(flash * 0.22);
      ctx.globalAlpha = 1;
      ctx.fillRect(0, 0, w, h);
    }
    if (this.scene.paint) {
      this.scene.paint(ctx, (a) => this.tone(a), this.t);
      return;
    }
    const { glyph, level, warm, cols, cw, ch, buckets } = this;
    glyph.fill(0);
    level.fill(0);
    warm.fill(0);
    this.scene.fill?.(glyph, level, this.t, warm);
    for (const b of buckets) b.length = 0;
    const warmCells: number[] = [];
    for (let i = 0; i < glyph.length; i++) {
      if (!glyph[i] || level[i] < 0.03) continue;
      if (warm[i] > 0.02 || warm[i] < -0.02) warmCells.push(i);
      else buckets[Math.min(LEVELS - 1, Math.floor(level[i] * LEVELS))].push(i);
    }
    ctx.font = `600 ${Math.round(ch * 0.74)}px ${getComputedStyle(this.canvas).fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let b = 0; b < LEVELS; b++) {
      const list = buckets[b];
      if (!list.length) continue;
      ctx.fillStyle = this.tone((b + 0.5) / LEVELS);
      for (const i of list) ctx.fillText(String.fromCharCode(glyph[i]), (i % cols) * cw + cw / 2, ((i / cols) | 0) * ch + ch / 2 + 1);
    }
    // tinted characters: the usual tone, pulled toward amber (positive) or a cool LED white (negative);
    // on light themes, a deeper burnt orange / steel blue so they stay visible
    if (warmCells.length) {
      const { bg, ink } = palette;
      const light = bg[0] + bg[1] + bg[2] > 384;
      const amber = light ? [190, 95, 20] : [255, 176, 72];
      const cool = light ? [40, 90, 170] : [200, 226, 255];
      for (const i of warmCells) {
        const k = Math.min(1, level[i] * this.contrast);
        const wv = Math.abs(warm[i]);
        const to = warm[i] > 0 ? amber : cool;
        const rgb = [0, 1, 2].map((j) => Math.round(bg[j] + ((ink[j] + (to[j] - ink[j]) * wv) - bg[j]) * k));
        ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        ctx.fillText(String.fromCharCode(glyph[i]), (i % cols) * cw + cw / 2, ((i / cols) | 0) * ch + ch / 2 + 1);
      }
    }
  }

  private tone(v: number) {
    return this.tones[v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255)];
  }

  private onVis = () => {
    this.hidden = document.hidden;
    this.schedule();
  };

  private local(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * this.scale, y: (e.clientY - r.top) * this.scale };
  }

  private onMove = (e: PointerEvent) => {
    const { x, y } = this.local(e);
    const inp = this.input;
    inp.px = x;
    inp.py = y;
    inp.hover = e.pointerType !== "touch";
    const p = this.press;
    if (!p || p.id !== e.pointerId) return;
    if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_PX) {
      p.dragging = true;
      document.documentElement.classList.add("bg-dragging");
      window.getSelection()?.removeAllRanges();
    }
    if (p.dragging) {
      const now = performance.now();
      const dt = Math.max(8, now - p.lt) / 1000;
      inp.dvx = inp.dvx * 0.5 + ((x - p.lx) / dt) * 0.5;
      inp.dvy = inp.dvy * 0.5 + ((y - p.ly) / dt) * 0.5;
      inp.dragging = true;
      p.lx = x;
      p.ly = y;
      p.lt = now;
    }
  };

  private onDown = (e: PointerEvent) => {
    if (!this.running() || e.button !== 0 || !this.accepts(e.target)) return;
    const { x, y } = this.local(e);
    this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, lx: x, ly: y, lt: performance.now(), dragging: false };
  };

  private onUp = (e: PointerEvent) => {
    const p = this.press;
    if (!p || p.id !== e.pointerId) return;
    if (!p.dragging) {
      const { x, y } = this.local(e);
      this.scene.click(x, y);
    }
    this.endPress();
  };

  private endPress = () => {
    this.press = null;
    this.input.dragging = false;
    document.documentElement.classList.remove("bg-dragging");
  };

  private onLeave = () => {
    this.input.hover = false;
    this.endPress();
  };
}

