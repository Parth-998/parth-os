"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from "react";
import { site } from "@/content/site";

const SLIDE_MS = 620;
/** Wheel travel needed to leave a workspace. Stops a trackpad flick from skipping two. */
const EDGE_THRESHOLD = 90;
/** After a slide, wheel input is ignored until it has been quiet this long (trackpad inertia). */
const QUIET_MS = 220;

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/** True if some element between `el` and the page can still scroll in the wheel's direction. */
function canScroll(el: Element, dy: number) {
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    const h = n as HTMLElement;
    if (h.scrollHeight <= h.clientHeight + 1) continue;
    const oy = getComputedStyle(h).overflowY;
    if (oy !== "auto" && oy !== "scroll") continue;
    if (dy < 0 ? h.scrollTop > 0 : h.scrollTop + h.clientHeight < h.scrollHeight - 1) return true;
  }
  return false;
}

export interface DesktopHandle {
  jump: (i: number) => void;
}

/**
 * Five full-height workspaces stacked like floors.
 * A workspace that fits on one screen slides to the next on scroll; a taller one
 * scrolls normally and slides on once you push past its end. Phones get a plain page.
 */
const Desktop = forwardRef<DesktopHandle, { compact: boolean; active: boolean; onCurrent: (i: number) => void; children: ReactNode[] }>(
  function Desktop({ compact, active, onCurrent, children }, handle) {
    const refs = useRef<(HTMLElement | null)[]>([]);
    const anim = useRef({ raf: 0, busy: false, lockUntil: 0, acc: 0, lastWheel: 0 });
    const [launched, setLaunched] = useState<boolean[]>(() => children.map(() => false));
    const currentRef = useRef(0);
    const pinned = useRef<number | null>(null);

    const indexAt = useCallback(() => {
      const mid = window.scrollY + window.innerHeight * 0.45;
      let idx = 0;
      refs.current.forEach((el, i) => {
        if (el && el.offsetTop <= mid) idx = i;
      });
      return idx;
    }, []);

    const scrollToY = useCallback((y: number, ms = SLIDE_MS, done?: () => void) => {
      const a = anim.current;
      cancelAnimationFrame(a.raf);
      const from = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const to = Math.max(0, Math.min(max, y));
      if (Math.abs(to - from) < 1) return done?.();
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        window.scrollTo(0, to);
        return done?.();
      }
      a.busy = true;
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / ms);
        window.scrollTo(0, from + (to - from) * ease(k));
        if (k < 1) a.raf = requestAnimationFrame(tick);
        else {
          a.busy = false;
          a.lockUntil = performance.now() + QUIET_MS;
          done?.();
        }
      };
      a.raf = requestAnimationFrame(tick);
    }, []);

    const jump = useCallback(
      (i: number) => {
        const el = refs.current[Math.max(0, Math.min(refs.current.length - 1, i))];
        if (!el) return;
        anim.current.acc = 0;
        if (compact) {
          // a short workspace can't reach the top of the screen, so the one you tapped stays lit
          // until you scroll yourself
          pinned.current = refs.current.indexOf(el);
          currentRef.current = pinned.current;
          onCurrent(pinned.current);
          // our own scroll, from where the workspace actually is right now (scrollIntoView on phones
          // gets cut off by momentum scrolling and the toolbar resizing)
          const barH = (document.querySelector(".bar") as HTMLElement | null)?.offsetHeight ?? 0;
          const target = i === 0 ? 0 : el.getBoundingClientRect().top + window.scrollY - barH;
          scrollToY(target, 420, () => {
            // if the page scrolled somewhere else (or not at all), snap it there
            const off = el.getBoundingClientRect().top - (i === 0 ? 0 : barH);
            const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
            if (Math.abs(off) > 24 && !(atBottom && off > 0)) el.scrollIntoView({ block: "start" });
          });
        } else scrollToY(el.offsetTop);
      },
      [compact, scrollToY, onCurrent],
    );
    useImperativeHandle(handle, () => ({ jump }), [jump]);

    // Track the current workspace for the bar.
    useEffect(() => {
      const on = () => {
        if (pinned.current !== null) return;
        const i = indexAt();
        if (i !== currentRef.current) {
          currentRef.current = i;
          onCurrent(i);
        }
      };
      const unpin = () => {
        pinned.current = null;
      };
      on();
      window.addEventListener("scroll", on, { passive: true });
      window.addEventListener("resize", on);
      window.addEventListener("touchstart", unpin, { passive: true });
      window.addEventListener("wheel", unpin, { passive: true });
      window.addEventListener("keydown", unpin);
      return () => {
        window.removeEventListener("scroll", on);
        window.removeEventListener("resize", on);
        window.removeEventListener("touchstart", unpin);
        window.removeEventListener("wheel", unpin);
        window.removeEventListener("keydown", unpin);
      };
    }, [indexAt, onCurrent]);

    // Windows launch the first time their workspace comes into view.
    useEffect(() => {
      if (!active) return;
      const io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const i = refs.current.indexOf(e.target as HTMLElement);
            if (i >= 0) setLaunched((l) => (l[i] ? l : l.map((v, k) => (k === i ? true : v))));
          }
        },
        { threshold: 0.25 },
      );
      refs.current.forEach((el) => el && io.observe(el));
      return () => io.disconnect();
    }, [active]);

    // Wheel: gentle inside a workspace, a quick slide between them.
    useEffect(() => {
      if (compact || !active) return;
      const a = anim.current;
      const onWheel = (e: WheelEvent) => {
        if (e.ctrlKey) return; // pinch zoom
        const t = e.target as Element | null;
        if (t?.closest("[role=dialog], .pop")) return;
        // Let scrollable panes (the terminal, long windows) scroll themselves first.
        if (t && canScroll(t, e.deltaY)) return;
        const now = performance.now();
        const gap = now - a.lastWheel;
        a.lastWheel = now;
        if (a.busy) {
          e.preventDefault();
          return;
        }
        if (now < a.lockUntil) {
          // Still the tail of the same flick: swallow it and keep waiting for quiet.
          e.preventDefault();
          if (gap < QUIET_MS) a.lockUntil = now + QUIET_MS;
          return;
        }
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
        const i = indexAt();
        const el = refs.current[i];
        if (!el) return;
        const vh = window.innerHeight;
        const top = el.offsetTop;
        const bottom = top + el.offsetHeight;
        const y = window.scrollY;
        const fits = el.offsetHeight <= vh + 2;
        if (gap > 300) a.acc = 0;

        if (!fits) {
          const atEnd = dy > 0 && y + vh >= bottom - 2;
          const atStart = dy < 0 && y <= top + 2;
          if (!atEnd && !atStart) {
            // Inside a tall workspace: native scrolling, clamped at its edges.
            if (dy > 0 && y + vh + dy > bottom) {
              e.preventDefault();
              window.scrollTo(0, bottom - vh);
            } else if (dy < 0 && y + dy < top) {
              e.preventDefault();
              window.scrollTo(0, top);
            }
            a.acc = 0;
            return;
          }
        }

        e.preventDefault();
        a.acc += dy;
        if (Math.abs(a.acc) < EDGE_THRESHOLD) return;
        const dir = a.acc > 0 ? 1 : -1;
        a.acc = 0;
        const next = i + dir;
        if (next < 0 || next >= refs.current.length) return;
        const target = refs.current[next]!;
        // Going up into a tall workspace lands on its last screen.
        const y2 = dir < 0 && target.offsetHeight > vh + 2 ? target.offsetTop + target.offsetHeight - vh : target.offsetTop;
        scrollToY(y2);
      };
      window.addEventListener("wheel", onWheel, { passive: false });
      return () => window.removeEventListener("wheel", onWheel);
    }, [compact, active, indexAt, scrollToY]);

    // Keys: 1–5 jump, page keys and space move a whole workspace.
    useEffect(() => {
      if (!active) return;
      const onKey = (e: KeyboardEvent) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const t = e.target as HTMLElement | null;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        // keys inside an app (files uses j/k, notes and music have their own) or under a modal stay there
        if (document.querySelector("[aria-modal=true]") || t?.closest?.(".app-win, .launcher-wrap")) return;
        const n = Number(e.key);
        if (n >= 1 && n <= site.workspaces.length) {
          e.preventDefault();
          jump(n - 1);
          return;
        }
        if (compact) return;
        if (e.key === "PageDown" || (e.key === " " && !e.shiftKey)) {
          e.preventDefault();
          jump(indexAt() + 1);
        } else if (e.key === "PageUp" || (e.key === " " && e.shiftKey)) {
          e.preventDefault();
          jump(indexAt() - 1);
        } else if (e.key === "Home") {
          e.preventDefault();
          jump(0);
        } else if (e.key === "End") {
          e.preventDefault();
          jump(refs.current.length - 1);
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [active, compact, indexAt, jump]);

    // Scrollbar drags and arrow keys: settle back onto a workspace edge once scrolling stops.
    useEffect(() => {
      if (compact || !active) return;
      let timer = 0;
      const settle = () => {
        if (anim.current.busy) return;
        const i = indexAt();
        const el = refs.current[i];
        if (!el) return;
        const vh = window.innerHeight;
        const y = window.scrollY;
        const top = el.offsetTop;
        const bottom = top + el.offsetHeight;
        if (el.offsetHeight <= vh + 2) {
          if (Math.abs(y - top) > 2) scrollToY(top, 360);
        } else if (y < top - 2) scrollToY(top, 360);
        else if (y + vh > bottom + 2) scrollToY(bottom - vh, 360);
      };
      const on = () => {
        clearTimeout(timer);
        timer = window.setTimeout(settle, 160);
      };
      window.addEventListener("scroll", on, { passive: true });
      return () => {
        clearTimeout(timer);
        window.removeEventListener("scroll", on);
      };
    }, [compact, active, indexAt, scrollToY]);

    return (
      <main className={compact ? "compact" : ""}>
        {children.map((child, i) => (
          <div
            key={site.workspaces[i].id}
            id={site.workspaces[i].id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className={`ws ${launched[i] ? "launched" : ""}`}
            aria-label={site.workspaces[i].label}
          >
            {child}
          </div>
        ))}
      </main>
    );
  },
);

export default Desktop;
