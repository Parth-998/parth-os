"use client";
import { keybinds } from "@/lib/keys";
import { useEffect, useRef, useState } from "react";
import { site } from "@/content/site";
import { tzAbbr, useIsMac, type Player, type Theme } from "@/lib/hooks";
import type { Prefs } from "@/lib/prefs";
import ClockMenu from "./ClockMenu";

function SunMoon({ mode }: { mode: Theme }) {
  return mode === "dark" ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

/** Settings cog (Lucide "settings" icon, ISC licence). */
export function Gear({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export type Menu = "keys" | "clock" | null;

/** The bar clock, per settings: 12h or 24h, with or without seconds, with or without the date. */
function useBarClock(tz: string, p: Pick<Prefs, "clock" | "seconds" | "date">) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!now) return "";
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: p.clock === "24h" ? "2-digit" : "numeric", minute: "2-digit", second: p.seconds ? "2-digit" : undefined, hourCycle: p.clock === "24h" ? "h23" : "h12" })
    .format(now)
    .toLowerCase();
  const date =
    p.date === "none" ? "" : new Intl.DateTimeFormat("en-US", { timeZone: tz, ...(p.date === "short" ? { month: "numeric", day: "numeric" } : { weekday: "short", month: "short", day: "numeric" }) }).format(now).toLowerCase().replace(",", "");
  return date ? `${date}  ${time}` : time;
}

export default function Bar({
  current,
  onJump,
  mode,
  onTheme,
  player,
  compact,
  menu,
  setMenu,
  onSettings,
  bgHow,
  onLauncher,
  prefs,
}: {
  onLauncher: () => void;
  prefs: Prefs;
  bgHow: string;
  current: number;
  onJump: (i: number) => void;
  mode: Theme;
  onTheme: () => void;
  player: Player;
  compact: boolean;
  menu: Menu;
  setMenu: (m: Menu) => void;
  onSettings: () => void;
}) {
  const time = useBarClock(site.timezone, prefs);
  const mac = useIsMac();
  const mod = mac ? "⌘" : "ctrl";
  const alt = mac ? "⌥" : "alt";
  const ref = useRef<HTMLDivElement>(null);
  const tap = useRef<{ x: number; y: number; at: number } | null>(null);
  const lastTouchJump = useRef(0);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu, setMenu]);

  return (
    <header className="bar" ref={ref}>
      <nav className="flex items-center gap-1" aria-label="workspaces">
        <button type="button" className="bar-search" onClick={onLauncher} title={`launcher (${alt} space)`} aria-label="open the launcher">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4.2-4.2" />
          </svg>
        </button>
        {site.workspaces.map((w, i) => (
          <button
            key={w.id}
            type="button"
            className="ws-dot tabular-nums"
            aria-current={i === current}
            aria-label={w.label}
            title={w.label}
            // phones: jump on the finger lifting. a tap while the page is still coasting only stops the
            // scroll and never becomes a click, which made the numbers feel like they missed
            onPointerDown={(e) => {
              if (e.pointerType === "touch") tap.current = { x: e.clientX, y: e.clientY, at: 0 };
            }}
            onPointerUp={(e) => {
              const t = tap.current;
              if (e.pointerType !== "touch" || !t) return;
              tap.current = null;
              if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > 12) return;
              lastTouchJump.current = performance.now();
              onJump(i);
            }}
            onClick={() => {
              if (performance.now() - lastTouchJump.current < 700) return;
              onJump(i);
            }}
          >
            {i + 1}
          </button>
        ))}
      </nav>

      <div className="truncate text-center" style={{ color: "var(--fg)" }}>
        {compact ? "" : site.workspaces[current]?.path}
      </div>

      <div className="flex items-center justify-end gap-1">
        {!compact && (
          <>
            <button type="button" onClick={player.toggle} title={player.playing ? "pause" : "play"} className="max-w-[260px] truncate">
              {player.playing ? "♫" : "‖"} {player.title} · {player.artist}
            </button>
            {player.playlist.length > 1 && (
              <button type="button" onClick={player.next} title="next song" aria-label="next song" className="px-1">
                »
              </button>
            )}
          </>
        )}
        <button type="button" className="px-1.5 tabular-nums whitespace-nowrap" style={{ color: "var(--fg)" }} onClick={() => setMenu(menu === "clock" ? null : "clock")} aria-expanded={menu === "clock"} title="calendar, weather, prices">
          {time} {tzAbbr(site.timezone).toLowerCase()}
        </button>
        {!compact && (
          <>
            <button type="button" onClick={onTheme} aria-label={`switch to ${mode === "dark" ? "light" : "dark"} mode`} title="light / dark">
              <SunMoon mode={mode} />
            </button>
            <button type="button" onClick={() => setMenu(menu === "keys" ? null : "keys")} aria-expanded={menu === "keys"} aria-label="keyboard shortcuts">
              ?
            </button>
          </>
        )}
        <button type="button" id="settings-btn" onClick={onSettings} aria-label="settings" title={`settings (${mod} k)`}>
          <Gear />
        </button>
      </div>

      {menu === "clock" && (
        <div className="absolute top-[calc(100%+4px)] right-[max(16px,env(safe-area-inset-right,0px))]">
          <ClockMenu />
        </div>
      )}
      {menu === "keys" && (
        <div className="pop absolute top-[calc(100%+4px)] right-[max(16px,env(safe-area-inset-right,0px))] w-[min(420px,calc(100vw-32px))] p-4 text-[12px]">
          <p className="label mb-3">shortcuts</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            {keybinds(mac).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="whitespace-nowrap">{k}</dt>
                <dd style={{ color: "var(--muted)" }}>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[11px]" style={{ color: "var(--faint)" }}>
            on the background: {bgHow}
          </p>
          <p className="mt-2 text-[11px]" style={{ color: "var(--faint)" }}>
            type <span style={{ color: "var(--fg)" }}>shortcuts</span> in the terminal for this list.
          </p>
        </div>
      )}
    </header>
  );
}
