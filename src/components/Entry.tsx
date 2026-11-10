"use client";
import { useEffect, useRef, useState } from "react";
import { site } from "@/content/site";
import { tzAbbr, useClock } from "@/lib/hooks";

/** Each line has a weight: how long the boot pauses before it appears, relative to the others. */
export const BOOT_LINES: [string, number][] = [
  ["parth-os bootloader v2.4", 1.4],
  ["loading linux 6.11-parth ...", 2.2],
  ["loading initial ramdisk ...", 1.6],
  ["[    0.000000] linux version 6.11-parth (gcc 14.2) #1 smp preempt", 1.2],
  ["[    0.412881] cpu: 8 cores, 16 threads", 0.5],
  ["[    0.958330] memory: 16gb available", 0.5],
  ["[    1.204118] fsck: /dev/nvme0n1p2 clean", 1.4],
  ["[ ok ] mounted /home/parth", 0.9],
  ["[ ok ] started network manager", 0.6],
  ["[ ok ] reached target network online", 1.3],
  ["[ ok ] started pipewire audio service", 0.6],
  ["[ ok ] started font cache (geist, geist mono)", 0.5],
  ["[ ok ] loaded workspaces 1-5", 0.7],
  ["[ ok ] started {wallpaper}", 0.9],
  ["[ ok ] started waybar", 0.5],
  ["[ ok ] reached target graphical interface", 1.2],
  ["starting login manager ...", 1.6],
];

/** Startup lines at an uneven, believable pace. Any key or click skips. */
/** What the boot log calls each wallpaper's service. */
export const WALLPAPER_SERVICE: Record<string, string> = {
  sharks: "ascii ocean (sharks)",
  rain: "weather service (rain)",
  waves: "ascii sea (waves)",
  apartment: "city view (chicago)",
};

export function Boot({ ms, onDone, wallpaper }: { ms: number; onDone: () => void; wallpaper: string }) {
  const [shown, setShown] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (done.current) return;
      done.current = true;
      onDone();
    };
    const total = BOOT_LINES.reduce((a, [, w]) => a + w, 0) + 1.2; // a beat on the last line before the login screen
    let at = 0;
    const timers = BOOT_LINES.map(([, w], i) => {
      at += (w / total) * ms * (0.85 + Math.random() * 0.3);
      return window.setTimeout(() => setShown(i + 1), Math.min(at, ms - 200));
    });
    timers.push(window.setTimeout(finish, ms));
    window.addEventListener("keydown", finish);
    window.addEventListener("pointerdown", finish);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("keydown", finish);
      window.removeEventListener("pointerdown", finish);
    };
  }, [ms, onDone]);

  return (
    <div className="screen boot" role="status" aria-label="starting up">
      {BOOT_LINES.slice(0, shown).map(([raw], i) => {
        const l = raw.replace("{wallpaper}", WALLPAPER_SERVICE[wallpaper] ?? wallpaper);
        return l.startsWith("[ ok ]") ? (
          <div key={i}>
            <span className="ok">[ ok ]</span>
            {l.slice(6)}
          </div>
        ) : (
          <div key={i}>{l}</div>
        );
      })}
      <span className="cursor" style={{ background: "#cfcfcf" }} />
      <div className="boot-skip">press any key to skip</div>
    </div>
  );
}

/** Login screen: a big CST clock, the username types itself, the password fills with dots. */
export function Login({ onLogin, leaving }: { onLogin: () => void; leaving: boolean }) {
  const { clock12, clock24, ampm, date } = useClock(site.timezone);
  const name = site.entry.username;
  const pwLen = site.entry.passwordLength;
  const [typed, setTyped] = useState(0);
  const total = name.length + pwLen;
  const ready = typed >= total;
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (typed >= total) {
      button.current?.focus({ preventScroll: true });
      return;
    }
    const delay = typed === 0 ? 650 : typed === name.length ? 380 : 70 + Math.random() * 70;
    const id = window.setTimeout(() => setTyped((n) => n + 1), delay);
    return () => clearTimeout(id);
  }, [typed, total, name.length]);

  // a greeting for the time it is in chicago
  const [greeting, setGreeting] = useState("");
  useEffect(() => {
    const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: site.timezone, hour: "numeric", hourCycle: "h23" }).format(new Date()));
    setGreeting(h >= 5 && h < 12 ? "good morning." : h >= 12 && h < 17 ? "good afternoon." : h >= 17 && h < 22 ? "good evening." : "up late?");
  }, []);

  const user = name.slice(0, Math.min(typed, name.length));
  const dots = Math.max(0, typed - name.length);
  const onUser = typed < name.length;

  return (
    <div className="screen login" style={{ opacity: leaving ? 0 : 1, pointerEvents: leaving ? "none" : undefined }}>
      <form
        className="flex w-full max-w-[300px] flex-col items-stretch gap-3 text-center"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onLogin();
        }}
      >
        <div className="mono text-[64px] leading-none font-light tracking-tight tabular-nums" style={{ color: "var(--fg)" }}>
          {(site.clock === "12h" ? clock12 : clock24) || " "}
          {site.clock === "12h" && clock12 && (
            <span className="ml-[0.18em] text-[0.34em] font-normal tracking-[0.08em] align-baseline" style={{ color: "var(--muted)" }}>
              {ampm.toUpperCase()}
            </span>
          )}
        </div>
        <div className="label mb-9">
          {date} · {tzAbbr(site.timezone).toLowerCase()}
          {greeting && <span className="mt-2 block normal-case tracking-[0.06em]" style={{ color: "var(--muted)" }}>{greeting}</span>}
        </div>
        <div className="mono mx-auto mb-2 grid size-14 place-items-center rounded-full border text-[15px]" style={{ borderColor: "var(--line)" }}>
          {site.initials}
        </div>
        <div id="login-user" className="field" aria-label="username">
          {user}
          {onUser && <span className="cursor ml-px" />}
        </div>
        <div id="login-pass" aria-label="password" className="field tracking-[0.25em]" style={{ borderColor: !onUser && !ready ? "var(--line-focus)" : undefined }}>
          {"•".repeat(dots)}
          {!onUser && !ready && <span className="cursor ml-px" />}
        </div>
        <button ref={button} id="login-btn" type="submit" className="btn mt-1" disabled={!ready}>
          log in
        </button>
      </form>
    </div>
  );
}
