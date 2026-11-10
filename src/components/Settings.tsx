"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { keybinds } from "@/lib/keys";
import { THEMES, type ThemePreset } from "@/content/themes";
import type { Motion } from "@/lib/ascii";
import { useIsMac, type Player } from "@/lib/hooks";
import { FONTS, usePrefs, type CursorTheme, type FontId, type Prefs } from "@/lib/prefs";

type Page = "themes" | "wallpaper" | "appearance" | "windows" | "bar" | "display" | "audio" | "notifications" | "privacy" | "shortcuts" | "power" | "about";

const ic = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
);

const ICONS: Record<Page, ReactNode> = {
  themes: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.6-9-7.6Z" />
      <circle cx="7.5" cy="11" r="1" />
      <circle cx="10.5" cy="7.5" r="1" />
      <circle cx="15" cy="8" r="1" />
    </svg>
  ),
  wallpaper: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m3 16 5-5 4 4 3-3 6 6" />
      <circle cx="15.5" cy="8.5" r="1.5" />
    </svg>
  ),
  audio: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  ),
  appearance: ic(
    <>
      <path d="M4 3l7 17 2.5-7L21 10.5Z" />
    </>,
  ),
  windows: ic(
    <>
      <rect x="3" y="4" width="8" height="16" rx="1.5" />
      <rect x="13" y="4" width="8" height="7" rx="1.5" />
      <rect x="13" y="13" width="8" height="7" rx="1.5" />
    </>,
  ),
  bar: ic(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 8.5h18" />
    </>,
  ),
  display: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  ),
  notifications: ic(
    <>
      <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>,
  ),
  privacy: ic(
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>,
  ),
  shortcuts: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </svg>
  ),
  power: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v9" />
      <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    </svg>
  ),
  about: ic(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>,
  ),
};

/** A tiny picture of the theme: a window with text lines, an accent bar, and its palette underneath. */
function Swatch({ p, active, onPick }: { p: ThemePreset; active: boolean; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} aria-pressed={active} className="swatch group text-left" style={{ borderColor: active ? "var(--line-focus)" : "transparent" }}>
      <div className="relative h-[54px] overflow-hidden rounded-[5px] px-2 pt-1.5" style={{ background: p.win, boxShadow: `inset 0 0 0 1px ${p.line}` }}>
        <div className="flex gap-[3px]">
          {[p.fg, p.muted, p.faint].map((c, i) => (
            <span key={i} className="size-[3px] rounded-full" style={{ background: c }} />
          ))}
        </div>
        <div className="mt-1.5 h-[2px] w-[58%] rounded" style={{ background: p.fg }} />
        <div className="mt-1 h-[2px] w-[38%] rounded" style={{ background: p.muted }} />
        <div className="absolute right-2 bottom-[17px] h-[5px] w-[30%] rounded-full" style={{ background: p.accent }} />
        <span className="absolute right-2 bottom-[24px] size-[5px] rounded-full" style={{ background: p.fg }} />
        <div className="absolute inset-x-2 bottom-1.5 grid grid-cols-5 gap-[3px]">
          {[p.line, p.faint, p.muted, p.fg, p.accent].map((c, i) => (
            <span key={i} className="h-[3px] rounded-sm" style={{ background: c }} />
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex min-w-0 items-center justify-between gap-1.5 px-0.5">
        <span className="label swatch-name" title={p.name} style={{ color: active ? "var(--fg)" : undefined }}>
          {p.name}
        </span>
        {active && <span className="size-[5px] shrink-0 rounded-full" style={{ background: "var(--accent)" }} />}
      </div>
    </button>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([v, label]) => (
        <button key={v} type="button" className="seg" aria-pressed={value === v} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="group-box space-y-3">
      <p className="label">{label}</p>
      {children}
    </div>
  );
}

export default function Settings({
  open,
  onClose,
  themeId,
  setTheme,
  player,
  motion,
  onMotion,
  interaction,
  onInteraction,
  onWallpaper,
  onReboot,
  onLogout,
  onShutdown,
  onScreensaver,
  bgHow,
}: {
  onShutdown: () => void;
  onScreensaver: () => void;
  bgHow: string;
  open: boolean;
  onClose: () => void;
  themeId: string;
  setTheme: (id: string) => void;
  player: Player;
  motion: Motion;
  onMotion: (m: Motion) => void;
  interaction: number;
  onInteraction: (v: number) => void;
  onWallpaper: () => void;
  onReboot: () => void;
  onLogout: () => void;
}) {
  const [page, setPage] = useState<Page>("themes");
  const active = THEMES.find((t) => t.id === themeId) ?? THEMES[0];
  const [mode, setMode] = useState<"dark" | "light">(active.mode);
  const file = useRef<HTMLInputElement>(null);
  const mac = useIsMac();
  const mod = mac ? "⌘" : "ctrl";
  const alt = mac ? "⌥" : "alt";
  const { prefs, set, reset } = usePrefs();

  useEffect(() => {
    if (open) setMode(active.mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const list = THEMES.filter((t) => t.mode === mode);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-6" style={{ background: "color-mix(in srgb, var(--bg) 45%, transparent)" }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="settings pop flex h-[min(620px,88dvh)] w-full max-w-[960px] flex-col overflow-hidden sm:flex-row" role="dialog" aria-modal="true" aria-label="settings">
        <nav className="settings-nav flex shrink-0 gap-1 overflow-x-auto p-3 sm:w-[190px] sm:flex-col sm:overflow-visible sm:p-4" aria-label="settings pages">
          {(Object.keys(ICONS) as Page[]).map((p) => (
            <button key={p} type="button" className="nav-item" aria-current={page === p} onClick={() => (p === "wallpaper" ? onWallpaper() : setPage(p))}>
              {ICONS[p]}
              <span>{p}</span>
            </button>
          ))}
          <button type="button" onClick={onClose} className="nav-item order-first sm:mb-2 sm:self-start" aria-label="close settings" title="close (esc)">
            ✕
          </button>
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-6 sm:px-7 sm:pt-6">
          <h2 className="mb-5 text-[15px] tracking-[0.32em] uppercase">{page}</h2>

          {page === "themes" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="seg" onClick={() => setMode(mode === "dark" ? "light" : "dark")}>
                  mode: {mode}
                </button>
                <div className="seg seg-text pointer-events-none" aria-live="polite" title={active.name}>
                  <span>theme: {active.name}</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {list.map((p) => (
                  <Swatch key={p.id} p={p} active={p.id === themeId} onPick={() => setTheme(p.id)} />
                ))}
              </div>
              <p className="text-[11.5px]" style={{ color: "var(--faint)" }}>
                your pick lasts until you close the tab.
              </p>
            </div>
          )}

          {page === "audio" && (
            <div className="space-y-4">
              <Row label="now playing">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px]">{player.title}</p>
                    <p className="truncate text-[12px]" style={{ color: "var(--muted)" }}>
                      {player.artist}
                    </p>
                  </div>
                  <button type="button" className="seg !w-auto px-4" onClick={player.toggle}>
                    {player.playing ? "pause" : "play"}
                  </button>
                </div>
              </Row>
              <Row label="volume">
                <div className="flex items-center gap-3">
                  <button type="button" className="seg !w-[86px]" aria-pressed={player.muted} onClick={() => player.setMuted(!player.muted)}>
                    {player.muted ? "muted" : "mute"}
                  </button>
                  <input id="volume" type="range" min={0} max={1} step={0.01} value={player.volume} onChange={(e) => player.setVolume(Number(e.target.value))} aria-label="volume" className="flex-1" />
                  <span className="label w-9 text-right tabular-nums">{Math.round(player.volume * 100)}%</span>
                </div>
              </Row>
              <Row label="try a song">
                <p className="text-[12.5px]" style={{ color: "var(--muted)" }}>
                  play an mp3 from your computer to hear it on the site. it stays in this tab and isn't uploaded anywhere.
                </p>
                <input
                  ref={file}
                  id="song-file"
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) player.loadFile(f);
                    e.target.value = "";
                  }}
                />
                <button type="button" className="seg !w-auto px-4" onClick={() => file.current?.click()}>
                  choose a file
                </button>
                {player.error && (
                  <p className="text-[12px]" style={{ color: "var(--fg)" }}>
                    that file wouldn't play. try an mp3 or m4a.
                  </p>
                )}
              </Row>
            </div>
          )}

          {page === "appearance" && (
            <div className="space-y-4">
              <Row label="cursor">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(
                    [
                      ["default", "system"],
                      ["bibata", "bibata modern"],
                      ["bibata-ice", "bibata ice"],
                      ["breeze", "breeze"],
                      ["adwaita", "adwaita"],
                    ] as [CursorTheme, string][]
                  ).map(([v, label]) => (
                    <button key={v} type="button" className="seg" aria-pressed={prefs.cursor === v} onClick={() => set("cursor", v)}>
                      {label}
                    </button>
                  ))}
                </div>
                <Seg<string> value={String(prefs.cursorSize)} onChange={(v) => set("cursorSize", Number(v) as Prefs["cursorSize"])} options={[["24", "24px"], ["32", "32px"], ["40", "40px"]]} />
                <Hint>cursor themes from real linux desktops. hover around this window to try one.</Hint>
              </Row>
              <Row label="font">
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(FONTS) as FontId[]).map((f) => (
                    <button key={f} type="button" className="seg" aria-pressed={prefs.font === f} onClick={() => set("font", f)}>
                      {FONTS[f].name}
                    </button>
                  ))}
                </div>
              </Row>
              <Row label="text size">
                <Seg<string> value={String(prefs.textScale)} onChange={(v) => set("textScale", Number(v))} options={[["0.9", "small"], ["1", "default"], ["1.1", "large"], ["1.2", "larger"]]} />
              </Row>
            </div>
          )}

          {page === "windows" && (
            <div className="space-y-4">
              <Row label="gaps">
                <Slider id="gaps" value={prefs.gaps} min={0} max={24} step={1} unit="px" onChange={(v) => set("gaps", v)} />
              </Row>
              <Row label="corner roundness">
                <Slider id="radius" value={prefs.radius} min={0} max={16} step={1} unit="px" onChange={(v) => set("radius", v)} />
              </Row>
              <Row label="border">
                <Seg<string> value={String(prefs.border)} onChange={(v) => set("border", Number(v) as 1 | 2)} options={[["1", "thin"], ["2", "thick"]]} />
              </Row>
              <Row label="window opacity">
                <Slider id="opacity" value={Math.round(prefs.opacity * 100)} min={60} max={100} step={1} unit="%" onChange={(v) => set("opacity", v / 100)} />
                <Hint>lower lets more of the wallpaper through, like hyprland's inactive_opacity.</Hint>
              </Row>
            </div>
          )}

          {page === "bar" && (
            <div className="space-y-4">
              <Row label="position">
                <Seg<Prefs["barPos"]> value={prefs.barPos} onChange={(v) => set("barPos", v)} options={[["top", "top"], ["bottom", "bottom"]]} />
              </Row>
              <Row label="clock">
                <Seg<Prefs["clock"]> value={prefs.clock} onChange={(v) => set("clock", v)} options={[["12h", "12-hour"], ["24h", "24-hour"]]} />
                <Seg<string> value={prefs.seconds ? "1" : "0"} onChange={(v) => set("seconds", v === "1")} options={[["0", "no seconds"], ["1", "seconds"]]} />
              </Row>
              <Row label="date">
                <Seg<Prefs["date"]> value={prefs.date} onChange={(v) => set("date", v)} options={[["none", "off"], ["short", "11/5"], ["long", "thu nov 5"]]} />
                <Hint>click the clock in the bar for the calendar, weather and prices.</Hint>
              </Row>
            </div>
          )}

          {page === "notifications" && (
            <div className="space-y-4">
              <Row label="do not disturb">
                <Seg<string> value={prefs.dnd ? "1" : "0"} onChange={(v) => set("dnd", v === "1")} options={[["0", "off"], ["1", "on"]]} />
                <Hint>hides the pop-ups at the top: now playing, secrets found, trades.</Hint>
              </Row>
            </div>
          )}

          {page === "privacy" && <Privacy onReset={reset} />}

          {page === "about" && <About />}

          {page === "display" && (
            <div className="space-y-4">
              <Row label="screensaver">
                <Seg<string> value={String(prefs.saverMin)} onChange={(v) => set("saverMin", Number(v) as Prefs["saverMin"])} options={[["1", "1 min"], ["2", "2 min"], ["5", "5 min"], ["0", "never"]]} />
                <button type="button" className="seg !w-auto px-4" onClick={onScreensaver}>
                  preview
                </button>
              </Row>
              <Row label="animation">
                <Seg<Motion> value={motion} onChange={onMotion} options={[["full", "on"], ["reduced", "slow"], ["off", "off"]]} />
              </Row>
              <Row label="background reacts to cursor">
                <div className="flex items-center gap-3">
                  <input id="interaction" type="range" min={0} max={1} step={0.05} value={interaction} onChange={(e) => onInteraction(Number(e.target.value))} aria-label="interaction strength" className="flex-1" />
                  <span className="label w-9 text-right tabular-nums">{Math.round(interaction * 100)}%</span>
                </div>
              </Row>
            </div>
          )}

          {page === "power" && (
            <div className="space-y-4">
              <Row label="session">
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" className="seg" onClick={onReboot}>
                    reboot
                  </button>
                  <button type="button" className="seg" onClick={onLogout}>
                    log out
                  </button>
                  <button type="button" className="seg" onClick={onShutdown}>
                    shut down
                  </button>
                </div>
                <p className="text-[12px]" style={{ color: "var(--faint)" }}>
                  reboot replays the boot sequence and login. log out goes straight to the login screen. shut down powers off until you press a key. the terminal has the same: reboot, logout, shutdown.
                </p>
              </Row>
            </div>
          )}

          {page === "shortcuts" && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-[13px]">
              {[
                ...keybinds(mac),
                ["on the background", bgHow],
              ].map(([k, v]) => (
                <div key={k} className="contents">
                  <dt>{k}</dt>
                  <dd style={{ color: "var(--muted)" }}>{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="text-[12px]" style={{ color: "var(--faint)" }}>
      {children}
    </p>
  );
}

function Slider({ id, value, min, max, step, unit, onChange }: { id: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={id} className="flex-1" />
      <span className="label w-12 text-right tabular-nums">
        {value}
        {unit}
      </span>
    </div>
  );
}

/** What the site keeps in this browser, and buttons to clear each part. */
function Privacy({ onReset }: { onReset: () => void }) {
  const [done, setDone] = useState("");
  const clear = (what: string, keys: string[], session: string[] = []) => {
    try {
      for (const k of keys) localStorage.removeItem(k);
      for (const k of session) sessionStorage.removeItem(k);
    } catch {}
    setDone(`cleared: ${what}`);
  };
  const rows: [string, string, () => void][] = [
    ["trading game", "balance, positions and trade history", () => clear("trading game", ["parth-os:paper", "parth-os:achievements"])],
    ["secrets found", "which of the ten you've found", () => clear("secrets", ["parth-os:secrets", "parth-os:secrets-seen"])],
    ["code edits", "files you changed and commits, in this tab", () => clear("code edits", [], ["parth-os:code", "parth-os:code:git"])],
    ["system settings", "cursor, font, windows, bar, notifications", () => {
      onReset();
      setDone("cleared: system settings");
    }],
  ];
  return (
    <div className="space-y-4">
      <Row label="saved in this browser">
        <Hint>nothing leaves your browser: no accounts, no tracking. this is everything the site keeps.</Hint>
        <div className="space-y-2">
          {rows.map(([name, what, go]) => (
            <div key={name} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13.5px]">{name}</p>
                <p className="truncate text-[12px]" style={{ color: "var(--faint)" }}>
                  {what}
                </p>
              </div>
              <button type="button" className="seg !w-auto px-4" onClick={go}>
                clear
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="seg"
          onClick={() => {
            try {
              for (const k of Object.keys(localStorage)) if (k.startsWith("parth-os") || ["theme", "muted", "lastVisit", "tipShown"].includes(k)) localStorage.removeItem(k);
              for (const k of Object.keys(sessionStorage)) sessionStorage.removeItem(k);
            } catch {}
            location.reload();
          }}
        >
          clear everything and restart
        </button>
        {done && (
          <p className="text-[12px]" style={{ color: "var(--fg)" }} role="status">
            {done}
          </p>
        )}
      </Row>
    </div>
  );
}

/** like gnome's about page: this "os", and the visitor's real machine as the browser reports it */
function About() {
  const [info, setInfo] = useState<[string, string][]>([]);
  const [upd, setUpd] = useState<"idle" | "checking" | "done">("idle");
  useEffect(() => {
    const n = navigator as Navigator & { deviceMemory?: number; userAgentData?: { platform?: string } };
    let gpu = "unknown";
    try {
      const c = document.createElement("canvas");
      const gl = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      if (gl && ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).replace(/^ANGLE \((.*)\)$/, "$1").replace(/, (OpenGL|Direct3D|Metal|Vulkan).*$/, "");
    } catch {}
    const ua = n.userAgent;
    const browser = /Edg\//.test(ua) ? `edge ${ua.match(/Edg\/(\d+)/)?.[1]}` : /Firefox\//.test(ua) ? `firefox ${ua.match(/Firefox\/(\d+)/)?.[1]}` : /Chrome\//.test(ua) ? `chrome ${ua.match(/Chrome\/(\d+)/)?.[1]}` : /Safari\//.test(ua) ? `safari ${ua.match(/Version\/(\d+)/)?.[1] ?? ""}` : "unknown";
    const os = n.userAgentData?.platform || (/Mac/.test(ua) ? "macos" : /Windows/.test(ua) ? "windows" : /Android/.test(ua) ? "android" : /iPhone|iPad/.test(ua) ? "ios" : /Linux/.test(ua) ? "linux" : "unknown");
    setInfo([
      ["os", "parth-os 2.0 (x86_64)"],
      ["kernel", "linux 6.11-parth"],
      ["desktop", "tiling, hyprland-style"],
      ["host os", os.toLowerCase()],
      ["browser", browser],
      ["processor", `${n.hardwareConcurrency ?? "?"} threads`],
      ["memory", n.deviceMemory ? `${n.deviceMemory} gb or more` : "your browser doesn't say"],
      ["graphics", gpu.toLowerCase()],
      ["display", `${screen.width}×${screen.height} at ${devicePixelRatio}x`],
    ]);
  }, []);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <pre className="text-[11px] leading-[1.2]" style={{ color: "var(--fg)" }}>{` ____   _
|  _ \\ / \\
| |_) / _ \\
|  __/ ___ \\
|_| /_/   \\_\\`}</pre>
        <div>
          <p className="text-[16px]">parth-os</p>
          <p className="text-[12px]" style={{ color: "var(--faint)" }}>
            version 2.0 · built by parth awana
          </p>
        </div>
      </div>
      <Row label="system">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-[13px]">
          {info.map(([k, v]) => (
            <div key={k} className="contents">
              <dt style={{ color: "var(--faint)" }}>{k}</dt>
              <dd className="min-w-0 truncate" title={v}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
        <Hint>everything from host os down is your own machine, as your browser reports it. nothing is sent anywhere.</Hint>
      </Row>
      <Row label="software update">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="seg !w-auto px-4"
            disabled={upd === "checking"}
            onClick={() => {
              setUpd("checking");
              window.setTimeout(() => setUpd("done"), 1600);
            }}
          >
            {upd === "checking" ? "checking…" : "check for updates"}
          </button>
          {upd === "done" && <span className="text-[12.5px]">parth-os is up to date.</span>}
        </div>
      </Row>
    </div>
  );
}
