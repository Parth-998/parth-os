/**
 * Adapted from ascii-sharks by drewdi (MIT, see LICENSE-ascii-sharks).
 *
 * Wires World + AsciiRenderer to a full-screen canvas: fixed-timestep loop,
 * resize, pausing when the tab is hidden, a motion setting, and the three
 * interactions: move (fish scatter), click (drop food), drag (a lure sharks chase).
 */
import { AsciiRenderer, type Palette } from "./renderer";
import { World, type SharkSpec } from "./world";
import { unlock } from "@/lib/secrets";

const STEP = 1 / 60;
const MAX_STEPS = 4;
/** Pointer travel (px) before a press counts as a drag instead of a click. */
const DRAG_PX = 6;

export type Motion = "full" | "reduced" | "off";

export interface EngineOptions {
  sharks?: SharkSpec[];
  /**
   * Called on pointerdown with the event target. Return false when the press
   * landed on the UI (a window, the bar) so the background ignores it.
   */
  acceptsPointer?: (target: EventTarget | null) => boolean;
  /** false for thumbnails: no pointer input at all. */
  interactive?: boolean;
  /** Simulate a world this many times larger than the canvas (thumbnails). */
  virtualScale?: number;
  /** The original boxy look (cell grid + grey blocks). */
  boxy?: boolean;
  /** Override the area-based fish count (the screensaver wants a small school). */
  fishCount?: number;
}

export class OceanEngine {
  private world: World;
  private renderer: AsciiRenderer;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private hidden = false;
  private motion: Motion = "full";
  private systemReduced: MediaQueryList;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private press: { id: number; x: number; y: number; dragging: boolean } | null = null;
  private accepts: (t: EventTarget | null) => boolean;
  private interactive: boolean;
  private scale: number;

  constructor(private canvas: HTMLCanvasElement, opts: EngineOptions = {}) {
    this.world = new World(opts.sharks, opts.fishCount);
    this.renderer = new AsciiRenderer(canvas);
    this.renderer.setFontFamily(getComputedStyle(canvas).fontFamily);
    if (opts.boxy) this.renderer.setBoxy(true);
    this.accepts = opts.acceptsPointer ?? (() => true);
    this.interactive = opts.interactive ?? true;
    this.scale = opts.virtualScale ?? 1;
    this.systemReduced = window.matchMedia("(prefers-reduced-motion: reduce)");

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);

    this.systemReduced.addEventListener("change", this.schedule);
    document.addEventListener("visibilitychange", this.onVisibility);
    if (this.interactive) {
      window.addEventListener("pointermove", this.onPointerMove, { passive: true });
      window.addEventListener("pointerdown", this.onPointerDown, { passive: true });
      window.addEventListener("konami", this.onFrenzy);
      window.addEventListener("pointerup", this.onPointerUp, { passive: true });
      window.addEventListener("pointercancel", this.onPointerCancel, { passive: true });
      document.documentElement.addEventListener("pointerleave", this.onPointerLeave);
      window.addEventListener("blur", this.onPointerLeave);
    }

    this.resize();
    // Canvas text can't trigger a webfont load; once the mono face is in, redraw.
    document.fonts?.load(`600 16px ${getComputedStyle(canvas).fontFamily}`).then(() => {
      if (!this.disposed && !this.running()) this.drawStill();
    });
    this.schedule();
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.systemReduced.removeEventListener("change", this.schedule);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("konami", this.onFrenzy);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerCancel);
    document.documentElement.removeEventListener("pointerleave", this.onPointerLeave);
    window.removeEventListener("blur", this.onPointerLeave);
  }

  setPalette(palette: Palette, contrast = 1) {
    this.renderer.setPalette(palette, contrast);
    if (!this.running()) this.drawStill();
  }

  setMotion(motion: Motion) {
    this.motion = motion;
    this.schedule();
  }

  setInteraction(strength: number) {
    this.world.interaction = Math.max(0, Math.min(1, strength));
  }

  /** "full" animates; "reduced" (or the OS setting) runs slowly; "off" holds a still frame. */
  private running() {
    return this.motion !== "off";
  }

  private timeScale() {
    return this.motion === "reduced" || this.systemReduced.matches ? 0.35 : 1;
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const s = this.scale;
    this.renderer.resize(rect.width * s, rect.height * s, dpr / s);
    this.world.resize(rect.width * s, rect.height * s, this.renderer.cellWidth, this.renderer.cellHeight);
    if (!this.running()) this.drawStill();
  }

  private schedule = () => {
    cancelAnimationFrame(this.raf);
    if (this.disposed) return;
    if (!this.running()) {
      this.drawStill();
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
    let steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.world.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === MAX_STEPS) this.acc = 0;
    this.renderer.render(this.world, dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Let the ecosystem settle, then show a single frame. */
  private drawStill() {
    if (this.world.time < 4) {
      for (let i = 0; i < 240; i++) this.world.step(STEP);
    }
    this.renderer.render(this.world, STEP);
  }

  private onVisibility = () => {
    this.hidden = document.hidden;
    this.schedule();
  };

  private toLocal(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    return { x, y, inside };
  }

  private onPointerMove = (e: PointerEvent) => {
    const { x, y, inside } = this.toLocal(e);
    const p = this.world.pointer;
    p.x = x;
    p.y = y;
    p.active = inside && e.pointerType !== "touch";

    const press = this.press;
    if (!press || press.id !== e.pointerId) return;
    if (!press.dragging && Math.hypot(e.clientX - press.x, e.clientY - press.y) > DRAG_PX) {
      press.dragging = true;
      document.documentElement.classList.add("bg-dragging");
      window.getSelection()?.removeAllRanges();
    }
    if (press.dragging) {
      const lure = this.world.lure;
      lure.x = x;
      lure.y = y;
      lure.active = true;
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    if (!this.running() || e.button !== 0 || !this.accepts(e.target)) return;
    this.press = { id: e.pointerId, x: e.clientX, y: e.clientY, dragging: false };
  };

  private onPointerUp = (e: PointerEvent) => {
    const press = this.press;
    if (!press || press.id !== e.pointerId) return;
    if (!press.dragging) {
      const { x, y, inside } = this.toLocal(e);
      if (inside) {
        this.world.dropFood(x, y);
        this.poke(x, y);
      }
    }
    this.endPress();
  };

  /** Easter egg: poke the same shark 10 times (within ~12s) and it lunges at you. */
  private pokes = new Map<number, number[]>();
  private poke(x: number, y: number) {
    const sh = this.world.sharkAt(x, y);
    if (!sh) return;
    const now = performance.now();
    const hits = (this.pokes.get(sh.id) ?? []).filter((t) => now - t < 12000);
    hits.push(now);
    this.pokes.set(sh.id, hits);
    if (hits.length >= 10) {
      this.pokes.delete(sh.id);
      this.world.lunge(sh, x, y);
      unlock("shark");
    }
  }

  /** Easter egg (konami code): feeding frenzy, sent as a window event. */
  private onFrenzy = () => this.world.frenzy();

  private onPointerCancel = () => this.endPress();

  private endPress() {
    this.press = null;
    this.world.lure.active = false;
    document.documentElement.classList.remove("bg-dragging");
  }

  private onPointerLeave = () => {
    this.world.pointer.active = false;
    this.endPress();
  };
}
