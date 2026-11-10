"use client";
import { useEffect, useRef, useState } from "react";
import { BACKGROUNDS, type BackgroundId, type Motion, type Palette } from "@/lib/ascii";
import Background from "./Background";

/** Wallpaper picker: a fan of tilted cards, each one a live preview of its background. */
export default function Picker({
  open,
  current,
  palette,
  motion,
  onPick,
  onClose,
}: {
  open: boolean;
  current: BackgroundId;
  palette: Palette;
  motion: Motion;
  onPick: (id: BackgroundId) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState(0);
  const selRef = useRef(sel);
  selRef.current = sel;
  // swipe / drag: the cards follow your finger (or mouse), then settle on the nearest one
  const [drag, setDrag] = useState(0); // in cards, positive = toward the next one
  const press = useRef<{ id: number; x: number; step: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);
  const last = BACKGROUNDS.length - 1;

  useEffect(() => {
    if (open) setSel(Math.max(0, BACKGROUNDS.findIndex((b) => b.id === current)));
  }, [open, current]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setSel((s) => Math.min(BACKGROUNDS.length - 1, s + 1));
      else if (e.key === "ArrowLeft") setSel((s) => Math.max(0, s - 1));
      else if (e.key === "Enter") {
        e.preventDefault();
        onPick(BACKGROUNDS[selRef.current].id);
      } else if (e.key === "Escape") onClose();
      else return;
      e.stopPropagation();
    };
    let wheelAcc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(wheelAcc) > 60) {
        const d = wheelAcc > 0 ? 1 : -1;
        wheelAcc = 0;
        setSel((s) => Math.max(0, Math.min(BACKGROUNDS.length - 1, s + d)));
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("wheel", onWheel);
    };
  }, [open, onPick, onClose]);

  if (!open) return null;
  const pos = Math.max(-0.4, Math.min(last + 0.4, sel + drag)); // a little give past the ends
  const info = BACKGROUNDS[Math.max(0, Math.min(last, Math.round(pos)))];

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const card = (e.currentTarget.querySelector(".picker-card") as HTMLElement | null)?.offsetWidth ?? 150;
    // one card per --pk-step of travel (about 110px on a phone)
    const step = parseFloat(getComputedStyle(e.currentTarget).getPropertyValue("--pk-step")) || card * 0.75;
    press.current = { id: e.pointerId, x: e.clientX, step, moved: false };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x;
    if (!p.moved && Math.abs(dx) > 8) {
      p.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (p.moved) setDrag(-dx / p.step);
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    if (!p.moved) return;
    swallowClick.current = true; // the drag shouldn't also count as a click on a card
    window.setTimeout(() => (swallowClick.current = false), 0);
    const dx = e.clientX - p.x;
    // a quick flick moves at least one card even if it's short
    const units = -dx / p.step;
    const to = Math.abs(units) > 0.25 && Math.abs(units) < 0.5 ? sel + Math.sign(units) : Math.round(sel + units);
    setSel(Math.max(0, Math.min(last, to)));
    setDrag(0);
  };

  return (
    <div className={`picker fixed inset-0 z-[55] flex flex-col items-center justify-center${drag ? " dragging" : ""}`} onClick={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label="wallpaper">
      <div
        className="picker-stage"
        onClick={(e) => !swallowClick.current && e.target === e.currentTarget && onClose()}
        onClickCapture={(e) => {
          if (swallowClick.current) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {BACKGROUNDS.map((b, i) => {
          const off = i - pos;
          const a = Math.abs(off);
          return (
            <button
              key={b.id}
              type="button"
              className="picker-card"
              aria-label={`${b.name}${b.id === current ? " (current)" : ""}`}
              aria-current={i === sel && !drag}
              onClick={() => (i === sel ? onPick(b.id) : setSel(i))}
              style={{
                transform: `translateX(calc(${off} * var(--pk-step))) translateZ(${-a * 90}px) rotateY(${Math.max(-1, Math.min(1, off)) * -32}deg) scale(${1.06 - Math.min(a, 1) * 0.12 - Math.max(0, Math.min(a, 3) - 1) * 0.06})`,
                zIndex: 10 - Math.round(a),
                opacity: a > 2 ? 0 : 1 - a * 0.18,
              }}
            >
              <Background style={b.id} palette={palette} motion={motion} preview className="pk-canvas" />
              {b.id === current && <span className="pk-badge label">current</span>}
            </button>
          );
        })}
      </div>

      <div className="pk-info mt-10 flex flex-col items-center gap-2 rounded-xl px-6 py-4 text-center">
        <div className="flex items-center gap-4">
          <button type="button" className="seg !h-8 !w-8" aria-label="previous" onClick={() => setSel((s) => Math.max(0, s - 1))}>
            ◂
          </button>
          <p className="min-w-[180px] text-[16px] tracking-[0.3em] uppercase" style={{ color: "var(--fg)" }}>{info.name}</p>
          <button type="button" className="seg !h-8 !w-8" aria-label="next" onClick={() => setSel((s) => Math.min(BACKGROUNDS.length - 1, s + 1))}>
            ▸
          </button>
        </div>
        <p className="mono text-[13px]" style={{ color: "var(--fg)", opacity: 0.9 }}>{info.how}</p>
        <p className="mono mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
          {"ontouchstart" in window ? "swipe to browse · tap the middle one to set" : "← → or drag to browse · enter or click to set · esc to close"}
        </p>
      </div>
    </div>
  );
}
