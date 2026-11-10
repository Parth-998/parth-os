"use client";
import { useEffect, useRef } from "react";
import { createBackground, type Background as Engine, type BackgroundId, type Motion, type Palette } from "@/lib/ascii";

/** Presses on these never reach the background: windows, the bar, menus, entry screens, and the
 *  text of your name and the line under it (so you can drag to select part of it). */
const UI = ".win, .bar, .pop, .screen, .picker, .app-win, .launcher-wrap, .poweroff, a, button, input, textarea, .home-name h1, .home-name p";

/** The full-screen background, or a small live thumbnail of one (preview). */
export default function Background({
  style,
  palette,
  motion,
  interaction = 1,
  contrast = 1,
  preview = false,
  className = "bg-canvas",
}: {
  style: BackgroundId;
  palette: Palette;
  motion: Motion;
  interaction?: number;
  contrast?: number;
  preview?: boolean;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  // swww-style transition: a snapshot of the old wallpaper, eaten away by a circle growing from your last click
  const over = useRef<HTMLImageElement>(null);
  const snap = useRef<string | null>(null);
  const live = useRef({ palette, contrast, motion, interaction });
  live.current = { palette, contrast, motion, interaction };

  useEffect(() => {
    if (!canvas.current) return;
    if (!preview && snap.current && over.current) grow(over.current, snap.current);
    snap.current = null;
    const e = createBackground(style, canvas.current, preview
      ? { interactive: false, virtualScale: 3 }
      : { acceptsPointer: (t) => !(t instanceof Element && t.closest(UI)) });
    const l = live.current;
    e.setPalette(l.palette, l.contrast);
    e.setMotion(l.motion);
    e.setInteraction(l.interaction);
    engine.current = e;
    return () => {
      // keep a picture of this wallpaper for the transition to the next one
      if (!preview && canvas.current && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
        try {
          snap.current = canvas.current.toDataURL("image/png");
        } catch {
          snap.current = null;
        }
      }
      e.destroy();
      engine.current = null;
    };
  }, [style, preview]);

  // clicking the background (even fast, like switching the lamp 10 times) never starts a text
  // selection, and it clears anything that's already highlighted. text inside windows stays selectable.
  useEffect(() => {
    if (preview) return;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0 || (e.target instanceof Element && e.target.closest(UI))) return;
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [preview]);

  useEffect(() => {
    engine.current?.setPalette(palette, contrast);
  }, [palette, contrast]);
  useEffect(() => {
    engine.current?.setMotion(motion);
  }, [motion]);
  useEffect(() => {
    engine.current?.setInteraction(interaction);
  }, [interaction]);

  return (
    <>
      <canvas ref={canvas} className={className} aria-hidden="true" />
      {!preview && <img ref={over} className={`${className} bg-swww`} alt="" aria-hidden="true" />}
    </>
  );
}

/** where the last click or touch was, so the transition grows from there (swww --transition-pos) */
let lastPoint = { x: -1, y: -1 };
if (typeof window !== "undefined")
  window.addEventListener(
    "pointerdown",
    (e) => {
      lastPoint = { x: e.clientX, y: e.clientY };
    },
    true,
  );

/** swww's "grow" transition: the new wallpaper appears in a circle that grows until it fills the screen */
function grow(img: HTMLImageElement, src: string) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const x = lastPoint.x >= 0 ? lastPoint.x : w / 2;
  const y = lastPoint.y >= 0 ? lastPoint.y : h / 2;
  const R = Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) + 4;
  const ms = 1100;
  img.src = src;
  img.style.display = "block";
  const t0 = performance.now();
  const frame = (now: number) => {
    const k = Math.min(1, (now - t0) / ms);
    const r = R * (1 - Math.pow(1 - k, 3)); // ease out, like swww's default bezier
    const m = `radial-gradient(circle at ${x}px ${y}px, transparent ${r}px, #000 ${r + 1.5}px)`;
    img.style.maskImage = m;
    img.style.webkitMaskImage = m;
    if (k < 1) requestAnimationFrame(frame);
    else {
      img.style.display = "none";
      img.removeAttribute("src");
    }
  };
  requestAnimationFrame(frame);
}
