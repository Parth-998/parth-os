/**
 * System settings beyond theme and wallpaper: cursor, font, text size, window gaps/corners/borders/
 * transparency, the bar clock, screensaver timing and notifications. Saved in the visitor's browser
 * and applied as CSS variables on <html>, so everything picks them up at once.
 */
import { useCallback, useEffect, useState } from "react";
import { setTileGap } from "./tiling";

export type CursorTheme = "default" | "bibata" | "bibata-ice" | "breeze" | "adwaita";
export type FontId = "geist" | "jetbrains" | "fira" | "plex";
export type Prefs = {
  cursor: CursorTheme;
  cursorSize: 24 | 32 | 40;
  font: FontId;
  textScale: number;
  gaps: number;
  radius: number;
  border: 1 | 2;
  opacity: number;
  clock: "24h" | "12h";
  seconds: boolean;
  date: "none" | "short" | "long";
  barPos: "top" | "bottom";
  saverMin: 0 | 1 | 2 | 5;
  dnd: boolean;
};

export const DEFAULT_PREFS: Prefs = {
  cursor: "default",
  cursorSize: 24,
  font: "geist",
  textScale: 1,
  gaps: 10,
  radius: 8,
  border: 1,
  opacity: 0.9,
  clock: "12h",
  seconds: false,
  date: "none",
  barPos: "top",
  saverMin: 2,
  dnd: false,
};

export const FONTS: Record<FontId, { name: string; family: string; google?: string }> = {
  geist: { name: "geist mono", family: 'var(--font-geist-mono, "Geist Mono")' },
  jetbrains: { name: "jetbrains mono", family: '"JetBrains Mono"', google: "JetBrains+Mono:wght@300;400;600" },
  fira: { name: "fira code", family: '"Fira Code"', google: "Fira+Code:wght@300;400;600" },
  plex: { name: "ibm plex mono", family: '"IBM Plex Mono"', google: "IBM+Plex+Mono:wght@300;400;600" },
};

const KEY = "parth-os:prefs";
const EVENT = "parth-os:prefs";

export function readPrefs(): Prefs {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return { ...DEFAULT_PREFS, ...JSON.parse(s) };
  } catch {}
  return { ...DEFAULT_PREFS };
}

/** Linux cursor themes, drawn as small svgs: arrow and pointing hand for each. */
function cursorCss(theme: CursorTheme, size: number) {
  if (theme === "default") return { arrow: "auto", hand: "pointer", text: "text" };
  const c = {
    bibata: { fill: "#000000", stroke: "#ffffff", round: true },
    "bibata-ice": { fill: "#ffffff", stroke: "#000000", round: true },
    breeze: { fill: "#232629", stroke: "#fcfcfc", round: false },
    adwaita: { fill: "#000000", stroke: "#ffffff", round: false },
  }[theme];
  const lj = c.round ? "round" : "miter";
  const arrow = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 24 24'><path d='M4 2.5 L4 19.5 L8.6 15.3 L11.6 21.6 L14.6 20.2 L11.6 14 L18 14 Z' fill='${c.fill}' stroke='${c.stroke}' stroke-width='1.4' stroke-linejoin='${lj}'/></svg>`;
  const hand = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 24 24'><path d='M9 3.2c.9 0 1.6.7 1.6 1.6v6.1l.6-.1V9.5c0-.9.7-1.5 1.5-1.5s1.5.6 1.5 1.5v1.6l.5-.1c.1-.8.7-1.3 1.5-1.3.8 0 1.5.7 1.5 1.5v1.3c.2-.6.8-1 1.4-1 .8 0 1.5.7 1.5 1.5v3.6c0 3.6-2.5 6-6 6h-1.4c-2 0-3.4-.8-4.6-2.4L4.6 14c-.5-.7-.3-1.6.4-2 .6-.4 1.4-.3 1.9.2l.5.6V4.8c0-.9.7-1.6 1.6-1.6z' fill='${c.fill}' stroke='${c.stroke}' stroke-width='1.2' stroke-linejoin='${lj}'/></svg>`;
  const url = (svg: string, x: number, y: number) => `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${Math.round((x * size) / 24)} ${Math.round((y * size) / 24)}`;
  return { arrow: `${url(arrow, 4, 2.5)}, auto`, hand: `${url(hand, 9, 3)}, pointer`, text: "text" };
}

export function applyPrefs(p: Prefs) {
  const r = document.documentElement;
  const st = r.style;
  st.setProperty("--gap", `${p.gaps}px`);
  st.setProperty("--radius", `${p.radius}px`);
  st.setProperty("--border-w", `${p.border}px`);
  st.setProperty("--win-alpha", `${Math.round(p.opacity * 100)}%`);
  const f = FONTS[p.font] ?? FONTS.geist;
  if (f.google && !document.getElementById(`font-${p.font}`)) {
    const l = document.createElement("link");
    l.id = `font-${p.font}`;
    l.rel = "stylesheet";
    l.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`;
    document.head.appendChild(l);
  }
  const stack = `${f.family}, ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
  st.setProperty("--font-sans", stack);
  st.setProperty("--font-mono", stack);
  st.setProperty("--text-scale", String(p.textScale));
  r.style.fontSize = p.textScale === 1 ? "" : `${p.textScale * 100}%`;
  const cur = cursorCss(p.cursor, p.cursorSize);
  st.setProperty("--cursor", cur.arrow);
  st.setProperty("--cursor-hand", cur.hand);
  r.dataset.cursor = p.cursor;
  r.dataset.bar = p.barPos;
  setTileGap(p.gaps);
}

/** Prefs state, saved and applied; any component can read or change them. */
export function usePrefs() {
  const [prefs, setState] = useState<Prefs>(DEFAULT_PREFS);
  useEffect(() => {
    const p = readPrefs();
    setState(p);
    applyPrefs(p);
    const on = (e: Event) => setState((e as CustomEvent<Prefs>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const set = useCallback(<K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    const p = { ...readPrefs(), [k]: v };
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {}
    applyPrefs(p);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: p }));
  }, []);
  const reset = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {}
    applyPrefs(DEFAULT_PREFS);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { ...DEFAULT_PREFS } }));
  }, []);
  return { prefs, set, reset };
}
