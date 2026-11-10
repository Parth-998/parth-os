"use client";
import { useEffect, useRef, useState } from "react";
import { OceanEngine, type BackgroundId, type Palette } from "@/lib/ascii";
import { GridEngine } from "@/lib/ascii/scenes";
import { Rain } from "@/lib/ascii/rain";
import { Waves } from "@/lib/ascii/waves";
import { Apartment } from "@/lib/ascii/apartment";

/**
 * After two minutes idle the desktop fades out into a screensaver that matches the wallpaper:
 *   sharks  → one big shark with a decent school of fish
 *   rain    → he stops under the lamp, lights a cigarette and smokes it
 *   waves   → the sea at night with shooting stars
 *   chicago → the city in a slow time-lapse, a day every ninety seconds
 * Any mouse move, touch, key or scroll fades it back out.
 */
export default function Screensaver({ bg, palette, onWake }: { bg: BackgroundId; palette: Palette; onWake: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState(false);
  const leaving = useRef(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const e =
      bg === "rain"
        ? new GridEngine(c, new Rain(true), { interactive: false })
        : bg === "waves"
          ? new GridEngine(c, new Waves(true), { interactive: false })
          : bg === "apartment"
            ? new GridEngine(c, new Apartment(true), { interactive: false })
            : new OceanEngine(c, {
                // one big shark with a good-sized school (about 60% of the wallpaper's)
                sharks: [{ kind: "tiger", size: 1.15 }],
                fishCount: Math.round(Math.min(220, Math.max(120, (window.innerWidth * window.innerHeight) / 7000))),
                interactive: false,
              });
    e.setPalette(palette, 1);
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    document.documentElement.classList.add("saver");
    return () => {
      cancelAnimationFrame(id);
      e.destroy();
      document.documentElement.classList.remove("saver");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // ignore the first moment so the event that's still settling doesn't wake it straight away
    const t0 = performance.now();
    const wake = () => {
      if (leaving.current || performance.now() - t0 < 1000) return;
      // fade out: the desktop comes back in underneath while the saver dissolves
      leaving.current = true;
      setShown(false);
      const html = document.documentElement;
      html.classList.add("saver-out");
      html.classList.remove("saver");
      window.setTimeout(() => {
        html.classList.remove("saver-out");
        onWake();
      }, 1300);
    };
    const evs = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;
    evs.forEach((ev) => window.addEventListener(ev, wake, { passive: true }));
    return () => evs.forEach((ev) => window.removeEventListener(ev, wake));
  }, [onWake]);

  return (
    <div className="saver-layer" style={{ opacity: shown ? 1 : 0, pointerEvents: shown ? undefined : "none" }} aria-hidden>
      <canvas ref={canvas} className="saver-canvas" />
    </div>
  );
}
