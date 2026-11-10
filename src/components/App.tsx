"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { site, type Project } from "@/content/site";
import { applyTheme, canvasPalette, timeTint, tinted } from "@/content/themes";
import { BACKGROUNDS, type BackgroundId, type Motion } from "@/lib/ascii";
import { store, useCompact, usePlayer, useTheme } from "@/lib/hooks";
import Background from "./Background";
import Bar, { type Menu } from "./Bar";
import Desktop, { type DesktopHandle } from "./Desktop";
import Picker from "./Picker";
import Settings from "./Settings";
import type { TermActions } from "./Terminal";
import { flip, focusDir, layoutChanged, moveDir, resetLayout, toggleFullscreen } from "@/lib/tiling";
import { Boot, Login } from "./Entry";
import { About, Activity, CaseStudy, Contact, Home, Projects } from "./Workspaces";
import Meltdown from "./Meltdown";
import Screensaver from "./Screensaver";
import { SECRET_COUNT, SECRET_EVENT, foundSecrets, unlock } from "@/lib/secrets";
import { THEMES } from "@/content/themes";
import { usePrefs } from "@/lib/prefs";
import { openApp, parseHash, setHash } from "@/lib/apps";
import AppLayer from "./apps/AppLayer";
import Launcher, { type LaunchActions } from "./Launcher";
import Shutdown from "./Shutdown";
import type { SiteConfig } from "./code/config";
import type { Proc } from "./apps/Btop";
import { feedControl } from "@/lib/ascii/feed";

type Phase = "boot" | "login" | "desktop";

function formatLogin(ms: number) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: site.timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(ms))
    .replace(/,/g, "")
    .toLowerCase();
}

export default function App() {
  const { preset, mode, setTheme, toggle: toggleTheme } = useTheme(site.theme, site.lightTheme);
  const compact = useCompact();
  // the radio; the secrets' bonus track lives in the music app (it plays from soundcloud)
  const tracks = site.music.tracks;
  const player = usePlayer(tracks, site.music.volume, site.music.fadeInMs);
  const { prefs, set: setPref } = usePrefs();
  const dndRef = useRef(false);
  dndRef.current = prefs.dnd;
  const [launcher, setLauncher] = useState(false);
  // btop: processes killed from the system monitor (r in btop, or a reboot, brings them back)
  const [killed, setKilled] = useState<Set<Proc>>(() => new Set());
  const [poweredOff, setPoweredOff] = useState(false);
  const [meltdown, setMeltdown] = useState(false);
  const [goldUntil, setGoldUntil] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [interaction, setInteraction] = useState(site.background.interaction);
  const [phase, setPhase] = useState<Phase>("boot");
  const [leaving, setLeaving] = useState(false);
  const [bootMs, setBootMs] = useState<number | null>(null);
  const [lastLogin, setLastLogin] = useState<string | null>(null);
  const [current, setCurrent] = useState(0);
  const [motion, setMotion] = useState<Motion>("full");
  const [menu, setMenu] = useState<Menu>(null);
  const [openProject, setOpenProject] = useState<Project | null>(null);
  // notifications, mako-style: small cards stacked top-right, each with the app it came from
  const [notes, setNotes] = useState<{ id: number; app: string; text: string; out?: boolean }[]>([]);
  const noteId = useRef(0);
  const desktop = useRef<DesktopHandle>(null);
  const [bg, setBgState] = useState<BackgroundId>(site.background.style);
  // Chicago wallpaper: the whole site takes on the scene's time-of-day light
  const [aptHrs, setAptHrs] = useState<number | null>(null);
  const tint = bg === "apartment" && aptHrs !== null ? timeTint(aptHrs) : null;
  // konami code: everything turns gold for a bit
  const gold = goldUntil > 0 ? THEMES.find((t) => t.id === "gold") : undefined;
  const shown = useMemo(() => (gold ? gold : tint ? tinted(preset, tint) : preset), [preset, tint, gold]);
  useEffect(() => {
    applyTheme(shown);
  }, [shown]);
  useEffect(() => {
    if (bg !== "apartment") {
      setAptHrs(null);
      return;
    }
    const on = (e: Event) => setAptHrs((e as CustomEvent<number>).detail);
    window.addEventListener("apt-hours", on);
    return () => window.removeEventListener("apt-hours", on);
  }, [bg]);
  const palette = useMemo(() => canvasPalette(shown), [shown]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Background choice lasts for the visit (until the tab closes).
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem("bg") as BackgroundId | null;
      if (saved && BACKGROUNDS.some((b) => b.id === saved)) setBgState(saved);
    } catch {
      /* no session storage: default background */
    }
  }, []);
  const setBg = useCallback((id: BackgroundId) => {
    setBgState(id);
    try {
      window.sessionStorage.setItem("bg", id);
    } catch {
      /* fine */
    }
  }, []);

  // Returning visitors get a shorter boot; "last login" is their own previous visit.
  useEffect(() => {
    const prev = Number(store.get("lastVisit") || 0);
    setBootMs(prev ? Math.round(site.entry.bootMs / 2) : site.entry.bootMs);
    if (prev) setLastLogin(formatLogin(prev));
    store.set("lastVisit", String(Date.now()));
    window.scrollTo(0, 0);
  }, []);

  const dismiss = useCallback((id: number) => {
    setNotes((n) => n.map((x) => (x.id === id ? { ...x, out: true } : x)));
    window.setTimeout(() => setNotes((n) => n.filter((x) => x.id !== id)), 260);
  }, []);
  const showToast = useCallback(
    (text: string, ms: number, from?: string) => {
      // settings › notifications › do not disturb
      if (dndRef.current) return 0;
      const app =
        from ??
        (/^secret found|^all \d+ (found|secrets)/.test(text)
          ? "secrets"
          : text.startsWith("♫")
            ? "music"
            : text.startsWith("achievement")
              ? "trading"
              : text.startsWith("background:")
                ? "swww"
                : "parth-os");
      const id = ++noteId.current;
      setNotes((n) => [...n.slice(-2), { id, app, text: text.replace(/^♫\s*/, "now playing · ").replace(/^achievement · /, "") }]);
      window.setTimeout(() => dismiss(id), ms);
      return 0;
    },
    [dismiss],
  );

  const bootDone = useCallback(() => setPhase("login"), []);

  // toasts from anywhere (paper trading achievements)
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ text: string; ms?: number; app?: string }>).detail;
      showToast(d.text, d.ms ?? 3500, d.app);
    };
    window.addEventListener("site-toast", on);
    return () => window.removeEventListener("site-toast", on);
  }, [showToast]);

  // a secret found: say so, and when all are found, unlock the bonus track
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ name: string; count: number }>).detail;
      showToast(`secret found: ${d.name} · ${d.count}/${SECRET_COUNT}${d.count === 1 ? " · cat .secrets" : ""}`, 5000);
      if (d.count >= SECRET_COUNT) {
        window.setTimeout(
          () => showToast(site.music.bonus ? `all ${SECRET_COUNT} found · bonus track unlocked: ${site.music.bonus.title}. it's in music.` : `all ${SECRET_COUNT} secrets found. respect.`, 7000, "secrets"),
          5600,
        );
      }
    };
    window.addEventListener(SECRET_EVENT, on);
    return () => window.removeEventListener(SECRET_EVENT, on);
  }, [showToast]);

  // a shooting star caught on the waves: bring the terminal up so the visitor can make a wish
  useEffect(() => {
    const on = () => {
      desktop.current?.jump(0);
      window.setTimeout(() => document.getElementById("term-input")?.focus({ preventScroll: true }), 120);
    };
    window.addEventListener("wish-star", on);
    return () => window.removeEventListener("wish-star", on);
  }, []);

  // a note for whoever opens the browser console
  useEffect(() => {
    const w = window as unknown as { parthOS?: { secret: () => string } };
    w.parthOS = {
      secret: () => {
        unlock("console");
        return "found one. now try `cat .secrets` in the terminal.";
      },
    };
    console.log(
      "%c ____   _\n|  _ \\ / \\\n| |_) / _ \\\n|  __/ ___ \\\n|_| /_/   \\_\\\n\n%clooking under the hood? there's a secret here.\ntype %cparthOS.secret()%c and press enter.",
      "font-family:monospace;color:#888",
      "font-family:monospace;color:#aaa",
      "font-family:monospace;color:#fff;font-weight:bold",
      "font-family:monospace;color:#aaa",
    );
  }, []);

  // konami code: ↑ ↑ ↓ ↓ ← → ← → b a
  useEffect(() => {
    if (phase !== "desktop") return;
    const code = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
    let at = 0;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      at = k === code[at] ? at + 1 : k === "arrowup" ? (at === 2 ? 2 : 1) : 0;
      if (at < code.length) return;
      at = 0;
      unlock("konami");
      showToast("cheat code accepted", 3000);
      // each wallpaper has its own reaction (sharks: speed + gold, rain: a storm, waves: a rogue wave,
      // chicago: a day in ten seconds)
      window.dispatchEvent(new Event("konami"));
      if (bg === "sharks") {
        setGoldUntil(Date.now() + 10000);
        window.setTimeout(() => setGoldUntil(0), 10000);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, bg, showToast]);

  // screensaver: two minutes without a touch, mouse move, key or scroll
  const [saver, setSaver] = useState(false);
  const wakeSaver = useCallback(() => setSaver(false), []);
  useEffect(() => {
    if (phase !== "desktop" || meltdown || !prefs.saverMin) return;
    let id = 0;
    const arm = () => {
      // (the screensaver wakes itself, with a fade, so activity only restarts the countdown)
      clearTimeout(id);
      id = window.setTimeout(() => {
        if (!document.hidden) setSaver(true);
      }, prefs.saverMin * 60000);
    };
    const evs = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    evs.forEach((ev) => window.addEventListener(ev, arm, { passive: true }));
    arm();
    return () => {
      clearTimeout(id);
      evs.forEach((ev) => window.removeEventListener(ev, arm));
    };
  }, [phase, meltdown, prefs.saverMin]);

  const leaveDesktop = useCallback(
    (to: Phase) => {
      setSettingsOpen(false);
      setPickerOpen(false);
      setOpenProject(null);
      setMenu(null);
      if (player.playing) player.toggle();
      if (to === "boot") setBootMs(site.entry.bootMs);
      window.setTimeout(() => {
        window.scrollTo(0, 0);
        setPhase(to);
      }, 250);
    },
    [player],
  );

  const login = useCallback(() => {
    player.start();
    setLeaving(true);
    window.setTimeout(() => {
      setPhase("desktop");
      setLeaving(false);
    }, 650);
  }, [player]);

  // After entry: now-playing toast, then the one-time tip.
  useEffect(() => {
    if (phase !== "desktop") return;
    const timers: number[] = [];
    timers.push(window.setTimeout(() => timers.push(showToast(`♫ ${player.title} · ${player.artist}`, 3800)), 700));
    // night owl: visiting between 2 and 5am chicago time
    const hr = Number(new Intl.DateTimeFormat("en-US", { timeZone: site.timezone, hour: "numeric", hourCycle: "h23" }).format(new Date()));
    if (hr >= 2 && hr < 5) {
      const clock = new Intl.DateTimeFormat("en-US", { timeZone: site.timezone, hour: "numeric", minute: "2-digit" }).format(new Date()).toLowerCase().replace(" ", "");
      timers.push(window.setTimeout(() => timers.push(showToast(`it's ${clock} in chicago. go to sleep.`, 4500)), 4300));
      timers.push(window.setTimeout(() => unlock("owl"), 9200));
    }
    // phones: say once a visit that it's built for a laptop
    let phoneNote = false;
    try {
      phoneNote = compact && window.sessionStorage.getItem("phoneNote") !== "1";
      if (phoneNote) window.sessionStorage.setItem("phoneNote", "1");
    } catch {
      phoneNote = compact;
    }
    if (phoneNote) timers.push(window.setTimeout(() => timers.push(showToast("best on a laptop · the trading game and keybinds are desktop only", 5500)), 5000));
    if (store.get("tipShown") !== "1") {
      const tipAt = phoneNote ? 11000 : 5200;
      timers.push(
        window.setTimeout(() => {
          // first visit only: the kind of hint hyprland dotfiles show on first login
          timers.push(
            showToast(
              compact ? "tap the search button to find everything · tap the wallpaper, it reacts" : "alt space opens the launcher · ? shows every keybind · the wallpaper reacts too: click it, drag it",
              8000,
              "parth-os",
            ),
          );
          store.set("tipShown", "1");
        }, tipAt),
      );
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, showToast, compact]);

  // Global keys: m mute, ctrl/cmd+k settings, esc closes things.
  useEffect(() => {
    if (phase !== "desktop") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // hyprland-style window keys, on alt (option on a mac)
      if (e.altKey && !e.metaKey && !e.ctrlKey && !compact) {
        const arrow = ({ ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" } as const)[e.key as "ArrowLeft"];
        const typing = t && /^(INPUT|TEXTAREA)$/.test(t.tagName) && (t as HTMLInputElement).value;
        if (arrow && !typing) {
          e.preventDefault();
          if (e.shiftKey) moveDir(arrow);
          else focusDir(arrow);
          return;
        }
        const digit = /^Digit([1-5])$/.exec(e.code);
        if (digit) {
          e.preventDefault();
          desktop.current?.jump(Number(digit[1]) - 1);
          return;
        }
        if (e.code === "KeyF") {
          e.preventDefault();
          toggleFullscreen();
          return;
        }
        if (e.code === "KeyJ") {
          e.preventDefault();
          flip();
          return;
        }
        if (e.code === "Space") {
          e.preventDefault();
          setLauncher((o) => !o);
          return;
        }
        if (e.code === "KeyQ") {
          e.preventDefault();
          desktop.current?.jump(0);
          window.setTimeout(() => document.getElementById("term-input")?.focus({ preventScroll: true }), 60);
          return;
        }
      }
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (t?.closest?.(".app-win")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMenu(null);
        setSettingsOpen((o) => !o);
      } else if (e.key === "Escape") {
        setLauncher(false);
        setMenu(null);
        setOpenProject(null);
        setSettingsOpen(false);
        setPickerOpen(false);
        document.querySelector(".win.fullscreen")?.classList.remove("fullscreen");
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "m") {
        player.setMuted(!player.muted);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, player, compact]);

  const actions: TermActions = useMemo(
    () => ({
      jump: (i: number) => desktop.current?.jump(i),
      openProject: (slug: string) => setOpenProject(site.projects.find((p) => p.slug === slug) ?? null),
      themeId: preset.id,
      setTheme,
      bg,
      setBg,
      openPicker: () => setPickerOpen(true),
      openSettings: () => setSettingsOpen(true),
      player,
      reboot: () => leaveDesktop("boot"),
      logout: () => leaveDesktop("login"),
      screensaver: () => setSaver(true),
      shutdown: () => {
        leaveDesktop("login");
        window.setTimeout(() => setPoweredOff(true), 260);
      },
      meltdown: () => {
        setMenu(null);
        setSettingsOpen(false);
        setPickerOpen(false);
        setOpenProject(null);
        if (player.playing) player.toggle();
        setMeltdown(true);
      },
      resetAll: () => {
        const done: string[] = [];
        if (layoutChanged()) done.push("windows back in place");
        else done.push("windows already in place");
        resetLayout();
        done.push(`theme → ${site.theme}`);
        setTheme(site.theme);
        done.push(`wallpaper → ${site.background.style}`);
        setBg(site.background.style);
        setInteraction(site.background.interaction);
        setMotion("full");
        done.push("motion + reactivity → defaults");
        setPickerOpen(false);
        setSettingsOpen(false);
        desktop.current?.jump(0);
        document.documentElement.classList.remove("resetting");
        void document.documentElement.offsetWidth;
        document.documentElement.classList.add("resetting");
        window.setTimeout(() => document.documentElement.classList.remove("resetting"), 1100);
        return done;
      },
    }),
    [preset.id, setTheme, bg, setBg, player, leaveDesktop],
  );

  const launchActions: LaunchActions = useMemo(
    () => ({
      jump: (i) => desktop.current?.jump(i),
      openProject: (slug) => {
        desktop.current?.jump(1);
        window.setTimeout(() => setOpenProject(site.projects.find((p) => p.slug === slug) ?? null), 350);
      },
      setBg: (id) => setBg(id as BackgroundId),
      setTheme,
      openSettings: () => setSettingsOpen(true),
      playRadio: (i) => openApp("music", `radio/${i}`),
      command: (c) => {
        if (c === "terminal") {
          desktop.current?.jump(0);
          window.setTimeout(() => document.getElementById("term-input")?.focus({ preventScroll: true }), 80);
        } else if (c === "screensaver") setSaver(true);
        else if (c === "reboot") actions.reboot();
        else if (c === "logout") actions.logout();
        else if (c === "shutdown") actions.shutdown();
        else if (c === "reset") actions.resetAll();
      },
    }),
    [setBg, setTheme, actions],
  );

  // the config file in code: the visitor's settings as text, applied when saved
  const siteConfig: SiteConfig = useMemo(
    () => ({ theme: preset.id, mode, wallpaper: bg === "apartment" ? "chicago" : bg, clock: prefs.clock, music: { volume: Math.round(player.volume * 100) } }),
    [preset.id, mode, bg, prefs.clock, player.volume],
  );
  const applyConfig = useCallback(
    (c: SiteConfig) => {
      if (c.theme !== preset.id) setTheme(c.theme);
      const w = (c.wallpaper === "chicago" ? "apartment" : c.wallpaper) as BackgroundId;
      if (w !== bg) setBg(w);
      if (c.clock !== prefs.clock) setPref("clock", c.clock);
      if (Math.round(player.volume * 100) !== c.music.volume) player.setVolume(c.music.volume / 100);
    },
    [preset.id, setTheme, bg, setBg, prefs.clock, setPref, player],
  );

  // shareable links: #code/src/x.ts, #notes/slug, #music, #projects/slug, #about …
  const route = useCallback((h: string) => {
    const r = parseHash(h);
    if (!r) return;
    if (r.workspace !== undefined) desktop.current?.jump(r.workspace);
    if (r.project) {
      const p = site.projects.find((x) => x.slug === r.project);
      if (p) window.setTimeout(() => setOpenProject(p), 400);
    }
    if (r.app) window.setTimeout(() => openApp(r.app!.id, r.app!.arg), 250);
  }, []);
  useEffect(() => {
    if (phase !== "desktop") return;
    const t = window.setTimeout(() => route(location.hash), 700);
    const on = () => route(location.hash);
    window.addEventListener("hashchange", on);
    return () => {
      clearTimeout(t);
      window.removeEventListener("hashchange", on);
    };
  }, [phase, route]);
  // a project open is a link too
  const hadProject = useRef(false);
  useEffect(() => {
    if (phase !== "desktop") return;
    if (openProject) {
      hadProject.current = true;
      setHash(`projects/${openProject.slug}`);
    } else if (hadProject.current && /^#projects\//.test(location.hash)) setHash("");
  }, [openProject, phase]);

  // requests from the apps (file manager: open a project, go to a workspace)
  useEffect(() => {
    const onJump = (e: Event) => desktop.current?.jump((e as CustomEvent<number>).detail);
    const onProject = (e: Event) => launchActions.openProject((e as CustomEvent<string>).detail);
    window.addEventListener("parth-os:jump", onJump);
    window.addEventListener("parth-os:project", onProject);
    return () => {
      window.removeEventListener("parth-os:jump", onJump);
      window.removeEventListener("parth-os:project", onProject);
    };
  }, [launchActions]);

  const onKill = useCallback(
    (p: Proc) => {
      setKilled((k) => new Set(k).add(p));
      if (p === "pipewire" || p === "radio") player.pause();
      if (p === "hl-feed") feedControl.paused = true;
      if (p === "zsh") window.dispatchEvent(new Event("parth-os:zsh-restart"));
      if (p === "code") window.dispatchEvent(new CustomEvent("parth-os:close-app", { detail: "code" }));
      if (p === "Hyprland") {
        window.setTimeout(() => {
          setKilled(new Set());
          feedControl.paused = false;
          leaveDesktop("login");
        }, 700);
      }
    },
    [player, leaveDesktop],
  );
  const onRestart = useCallback(() => {
    setKilled(new Set());
    feedControl.paused = false;
  }, []);

  // No page scrolling until you're logged in.
  useEffect(() => {
    document.documentElement.style.overflow = phase === "desktop" ? "" : "hidden";
  }, [phase]);

  return (
    <>
      <Background style={bg} palette={palette} motion={killed.has("wallpaper") ? "off" : motion} interaction={interaction} contrast={site.background.contrast} />

      {phase === "desktop" && !killed.has("waybar") && (
        <Bar
          current={current}
          onJump={(i) => desktop.current?.jump(i)}
          mode={mode}
          onTheme={toggleTheme}
          player={player}
          compact={compact}
          menu={menu}
          setMenu={setMenu}
          bgHow={BACKGROUNDS.find((b) => b.id === bg)?.how ?? ""}
          onLauncher={() => setLauncher((o) => !o)}
          prefs={prefs}
          onSettings={() => {
            setMenu(null);
            setSettingsOpen((o) => !o);
          }}
        />
      )}

      <div style={{ visibility: phase === "desktop" ? "visible" : "hidden" }}>
        <Desktop ref={desktop} compact={compact} active={phase === "desktop"} onCurrent={setCurrent}>
          <Home lastLogin={lastLogin} actions={actions} />
          <Projects onOpen={setOpenProject} />
          <About />
          <Activity palette={palette} motion={motion} />
          <Contact />
        </Desktop>
      </div>

      <Settings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        bgHow={BACKGROUNDS.find((b) => b.id === bg)?.how ?? ""}
        themeId={preset.id}
        setTheme={setTheme}
        player={player}
        motion={motion}
        onMotion={setMotion}
        interaction={interaction}
        onInteraction={setInteraction}
        onWallpaper={() => {
          setSettingsOpen(false);
          setPickerOpen(true);
        }}
        onReboot={() => leaveDesktop("boot")}
        onLogout={() => leaveDesktop("login")}
        onShutdown={() => actions.shutdown()}
        onScreensaver={() => {
          setSettingsOpen(false);
          window.setTimeout(() => setSaver(true), 200);
        }}
      />

      <Picker
        open={pickerOpen}
        current={bg}
        palette={palette}
        motion={motion}
        onPick={(id) => {
          setBg(id);
          setPickerOpen(false);
          showToast(`background: ${id}`, 2400);
        }}
        onClose={() => setPickerOpen(false)}
      />

      {openProject && <CaseStudy project={openProject} onClose={() => setOpenProject(null)} />}

      {phase === "desktop" && <AppLayer theme={shown} config={siteConfig} onConfig={applyConfig} player={player} compact={compact} killed={killed} onKill={onKill} onRestart={onRestart} />}
      {phase === "desktop" && <Launcher open={launcher} onClose={() => setLauncher(false)} actions={launchActions} />}
      {poweredOff && (
        <Shutdown
          onPowerOn={() => {
            setPoweredOff(false);
            setBootMs(site.entry.bootMs);
            setPhase("boot");
          }}
        />
      )}

      <div className="notify" role="status" aria-live="polite">
        {notes.map((n) => (
          <button key={n.id} type="button" className={`notify-card${n.out ? " out" : ""}`} onClick={() => dismiss(n.id)} title="click to dismiss">
            <span className="notify-app">{n.app}</span>
            <span className="notify-text">{n.text}</span>
          </button>
        ))}
      </div>

      {saver && phase === "desktop" && <Screensaver bg={bg} palette={palette} onWake={wakeSaver} />}

      {meltdown && (
        <Meltdown
          onDone={() => {
            unlock("rmrf");
            setMeltdown(false);
            setBootMs(site.entry.bootMs);
            window.scrollTo(0, 0);
            setPhase("boot");
          }}
        />
      )}

      {phase === "login" && <Login onLogin={login} leaving={leaving} />}
      {phase === "boot" && bootMs !== null && <Boot ms={bootMs} onDone={bootDone} wallpaper={bg} />}
      {phase === "boot" && bootMs === null && <div className="screen boot" />}
    </>
  );
}
