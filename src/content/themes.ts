// Theme presets. Every colour on the site (and the ASCII background) comes from one of these.
// Pick the default in site.ts (`theme`). Visitors can try others from settings for their visit.

export interface ThemePreset {
  id: string;
  name: string;
  mode: "dark" | "light";
  bg: string;
  /** Window fill, and its focused version. */
  win: string;
  winFocus: string;
  line: string;
  fg: string;
  muted: string;
  faint: string;
  accent: string;
}

const t = (p: ThemePreset) => p;

export const THEMES: ThemePreset[] = [
  t({ id: "monochrome", name: "monochrome", mode: "dark", bg: "#000000", win: "#000000", winFocus: "#050505", line: "#1c1c1c", fg: "#ffffff", muted: "#a3a3a3", faint: "#555555", accent: "#ffffff" }),
  t({ id: "graphite", name: "graphite", mode: "dark", bg: "#0d0d0d", win: "#111111", winFocus: "#161616", line: "#262626", fg: "#e8e8e8", muted: "#9b9b9b", faint: "#555555", accent: "#c9c9c9" }),
  t({ id: "slate", name: "slate", mode: "dark", bg: "#0b0d10", win: "#0f1216", winFocus: "#141820", line: "#212831", fg: "#e6eaf0", muted: "#98a2b0", faint: "#4d5560", accent: "#9fb0c3" }),
  t({ id: "nord", name: "nord", mode: "dark", bg: "#242933", win: "#2a2f3a", winFocus: "#2e3440", line: "#3b4252", fg: "#eceff4", muted: "#a7b1c2", faint: "#616e88", accent: "#88c0d0" }),
  t({ id: "tokyo-night", name: "tokyo night", mode: "dark", bg: "#13131a", win: "#16161e", winFocus: "#1a1b26", line: "#292e42", fg: "#c0caf5", muted: "#9aa5ce", faint: "#565f89", accent: "#7aa2f7" }),
  t({ id: "catppuccin", name: "catppuccin mocha", mode: "dark", bg: "#11111b", win: "#181825", winFocus: "#1e1e2e", line: "#313244", fg: "#cdd6f4", muted: "#a6adc8", faint: "#6c7086", accent: "#cba6f7" }),
  t({ id: "kanagawa", name: "kanagawa", mode: "dark", bg: "#16161d", win: "#1a1a22", winFocus: "#1f1f28", line: "#2a2a37", fg: "#dcd7ba", muted: "#a6a69c", faint: "#727169", accent: "#7e9cd8" }),
  t({ id: "rose-pine", name: "rose pine", mode: "dark", bg: "#191724", win: "#1c1a29", winFocus: "#1f1d2e", line: "#2a273f", fg: "#e0def4", muted: "#908caa", faint: "#6e6a86", accent: "#ebbcba" }),
  t({ id: "gruvbox", name: "gruvbox", mode: "dark", bg: "#1d2021", win: "#232526", winFocus: "#282828", line: "#3c3836", fg: "#ebdbb2", muted: "#a89984", faint: "#665c54", accent: "#fabd2f" }),
  t({ id: "everforest", name: "everforest", mode: "dark", bg: "#1e2326", win: "#232a2e", winFocus: "#2d353b", line: "#3d484d", fg: "#d3c6aa", muted: "#9da9a0", faint: "#5c6a72", accent: "#a7c080" }),
  t({ id: "matrix", name: "matrix", mode: "dark", bg: "#000000", win: "#010603", winFocus: "#020a05", line: "#0f2a16", fg: "#c8ffd4", muted: "#5fd47a", faint: "#1f6b33", accent: "#00ff66" }),
  t({ id: "red", name: "red", mode: "dark", bg: "#070000", win: "#0c0202", winFocus: "#120404", line: "#2a0d0d", fg: "#f5e6e6", muted: "#b08a8a", faint: "#5c3a3a", accent: "#ff3344" }),
  t({ id: "gold", name: "gold", mode: "dark", bg: "#090705", win: "#0e0b07", winFocus: "#130f09", line: "#2a2214", fg: "#f3ead8", muted: "#b3a27f", faint: "#5e5236", accent: "#e8b931" }),
  t({ id: "paper", name: "paper", mode: "light", bg: "#f4f2ee", win: "#ebe8e2", winFocus: "#ffffff", line: "#dcd8d0", fg: "#111111", muted: "#6b6b6b", faint: "#9a9a9a", accent: "#111111" }),
  t({ id: "beige", name: "beige", mode: "light", bg: "#e9e4d8", win: "#efeadf", winFocus: "#f7f3ea", line: "#cfc6b2", fg: "#2b2620", muted: "#6e6556", faint: "#a39a88", accent: "#8b1e1e" }),
  t({ id: "fog", name: "fog", mode: "light", bg: "#e6e8ea", win: "#eef0f2", winFocus: "#f8f9fa", line: "#c9ced4", fg: "#1b1f24", muted: "#5d6670", faint: "#9aa2ab", accent: "#3d5a80" }),
];

export const themeById = (id: string) => THEMES.find((x) => x.id === id) ?? THEMES[0];

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: string, b: string, k: number): [number, number, number] => {
  const x = hex(a);
  const y = hex(b);
  return [0, 1, 2].map((i) => Math.round(x[i] + (y[i] - x[i]) * k)) as [number, number, number];
};

/** Canvas palette for the ASCII background: ground from bg, ink between fg and the accent. */
export function canvasPalette(p: ThemePreset) {
  return {
    bg: hex(p.bg),
    // dark: a faint lift in the middle; light: the middle glows paper-white instead of going grey
    glow: p.mode === "dark" ? mix(p.bg, p.fg, 0.025) : mix(p.bg, "#ffffff", 0.55),
    ink: mix(p.fg, p.accent, 0.45),
  };
}

/** Writes a preset onto the page as CSS variables. */
export function applyTheme(p: ThemePreset) {
  const r = document.documentElement;
  r.dataset.theme = p.mode;
  const vars: Record<string, string> = {
    "--bg": p.bg,
    "--win": p.win,
    "--win-focus": p.winFocus,
    "--line": p.line,
    "--line-focus": p.accent,
    "--fg": p.fg,
    "--muted": p.muted,
    "--faint": p.faint,
    "--accent": p.accent,
    "--scrim": `color-mix(in srgb, ${p.bg} 80%, transparent)`,
  };
  for (const [k, v] of Object.entries(vars)) r.style.setProperty(k, v);
}

/**
 * The Chicago wallpaper's light, as a colour for the whole site:
 * cool blue-grey at night, warm amber at sunrise and sunset, a neutral bright white by day.
 */
export function timeTint(hrs: number): string {
  const h = ((hrs % 24) + 24) % 24;
  const keys: [number, string][] = [
    [0, "#8aa4c8"], [4.5, "#8aa4c8"], [6.2, "#e8a25c"], [7.6, "#f3ead8"], [16.6, "#f3ead8"],
    [18.5, "#e89a58"], [19.9, "#8aa4c8"], [24, "#8aa4c8"],
  ];
  for (let i = 0; i < keys.length - 1; i++) {
    const [h0, c0] = keys[i];
    const [h1, c1] = keys[i + 1];
    if (h >= h0 && h <= h1) {
      const [r, g, b] = mix(c0, c1, (h - h0) / (h1 - h0 || 1));
      return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
    }
  }
  return keys[0][1];
}

/** A theme with the time-of-day tint laid over it (dark themes only; light themes stay as they are). */
export function tinted(p: ThemePreset, tint: string): ThemePreset {
  if (p.mode !== "dark") return p;
  const hx = (c: [number, number, number]) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  return { ...p, accent: tint, fg: hx(mix(p.fg, tint, 0.35)), muted: hx(mix(p.muted, tint, 0.3)), line: hx(mix(p.line, tint, 0.25)) };
}
