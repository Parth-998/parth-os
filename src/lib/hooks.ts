"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyTheme, themeById, type ThemePreset } from "@/content/themes";

/** localStorage that never throws (private windows, blocked storage). */
export const store = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: the setting just lasts for this visit */
    }
  },
};

export type Theme = "dark" | "light";

/** Per-visit storage: theme experiments reset when the tab closes. */
const session = {
  get(key: string): string | null {
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      /* fine: lasts until reload */
    }
  },
};

/** The active theme preset. The sun/moon toggle flips between your dark preset and a light one. */
export function useTheme(defaultId: string, lightId: string) {
  const [id, setId] = useState(defaultId);
  const lastDark = useRef(themeById(defaultId).mode === "dark" ? defaultId : "monochrome");

  useEffect(() => {
    const saved = session.get("themeId");
    if (saved) setId(themeById(saved).id);
  }, []);
  useEffect(() => {
    const p = themeById(id);
    if (p.mode === "dark") lastDark.current = p.id;
    applyTheme(p);
  }, [id]);

  const setTheme = useCallback((next: string) => {
    setId(next);
    session.set("themeId", next);
  }, []);
  const toggle = useCallback(() => {
    setTheme(themeById(id).mode === "dark" ? lightId : lastDark.current);
  }, [id, lightId, setTheme]);

  const preset: ThemePreset = themeById(id);
  return { preset, mode: preset.mode as Theme, setTheme, toggle };
}

/** Wall-clock time in a given IANA zone, ticking each second. */
export function useClock(timeZone: string) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    now ? new Intl.DateTimeFormat("en-US", { timeZone, ...opts }).format(now).toLowerCase() : "";
  return {
    time: fmt({ hour: "numeric", minute: "2-digit" }),
    clock24: fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    /** "7:42" and "pm", for the big login clock. */
    clock12: fmt({ hour: "numeric", minute: "2-digit", hour12: true }).replace(/\s?[ap]m$/, ""),
    ampm: fmt({ hour: "numeric", hour12: true }).slice(-2),
    date: fmt({ weekday: "long", month: "long", day: "numeric" }),
  };
}

export interface Player {
  title: string;
  artist: string;
  /** Plays an audio file from the visitor's own computer, for this tab only. */
  loadFile: (file: File) => void;
  playing: boolean;
  muted: boolean;
  volume: number;
  /** Starts the song with a fade-in. Must be called from a click. */
  start: () => void;
  toggle: () => void;
  setMuted: (m: boolean) => void;
  setVolume: (v: number) => void;
  error: boolean;
  /** Skip to the next song in the rotation. */
  next: () => void;
  playlist: Track[];
  index: number;
  /** Jump to a song in the playlist and play it (from a click). */
  playTrack: (i: number) => void;
  /** Stop with a quick fade (another player, like soundcloud, is taking over). */
  pause: () => void;
  /** The audio element, for the music app's visualizer. */
  element: () => HTMLAudioElement | null;
}

/** The site's music: an <audio> element that only starts after a click. */
export interface Track {
  src: string;
  title: string;
  artist: string;
}

export function usePlayer(tracks: Track[], baseVolume: number, fadeMs: number): Player {
  const audio = useRef<HTMLAudioElement | null>(null);
  // shuffled once per visit; plays straight through and wraps around
  const order = useRef<number[]>([]);
  const posRefEarly = useRef(0);
  if (!order.current.length) order.current = shuffle(tracks.map((_, i) => i));
  // a track added later (the secrets bonus) plays next
  if (order.current.length < tracks.length) {
    const have = new Set(order.current);
    const extra = tracks.map((_, i) => i).filter((i) => !have.has(i));
    const at = (order.current.length ? (posRefEarly.current % order.current.length) : 0) + 1;
    order.current = [...order.current.slice(0, at), ...extra, ...order.current.slice(at)];
  }
  const [pos, setPos] = useState(0);
  const posRef = useRef(0);
  posRefEarly.current = pos;
  const cur = tracks[order.current[pos % order.current.length]] ?? tracks[0];
  const src = cur.src;
  const [meta, setMeta] = useState({ title: cur.title, artist: cur.artist });
  useEffect(() => setMeta({ title: cur.title, artist: cur.artist }), [cur.title, cur.artist]);
  const wasPlaying = useRef(false);
  const fade = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [volume, setVolumeState] = useState(baseVolume);
  const volumeRef = useRef(baseVolume);
  volumeRef.current = volume;
  const [error, setError] = useState(false);

  useEffect(() => {
    const a = new Audio(src);
    a.loop = tracks.length < 2;
    a.preload = "auto";
    a.volume = 0;
    const m = store.get("muted") === "1";
    a.muted = m;
    setMutedState(m);
    a.addEventListener("play", () => setPlaying(true));
    a.addEventListener("pause", () => setPlaying(false));
    a.addEventListener("error", () => setError(true));
    // one song ends → the next one starts
    a.addEventListener("ended", () => {
      wasPlaying.current = true;
      posRef.current += 1;
      setPos(posRef.current);
    });
    audio.current = a;
    if (wasPlaying.current) {
      a.volume = 0;
      a.play()
        .then(() => {
          const t0 = performance.now();
          const tick = (now: number) => {
            const k = Math.min(1, (now - t0) / 1200);
            a.volume = Math.max(0, Math.min(1, volumeRef.current * k));
            if (k < 1) fade.current = requestAnimationFrame(tick);
          };
          fade.current = requestAnimationFrame(tick);
        })
        .catch(() => setError(true));
    }
    return () => {
      cancelAnimationFrame(fade.current);
      a.pause();
      audio.current = null;
    };
  }, [src]);

  const rampTo = useCallback(
    (target: number, ms: number, then?: () => void) => {
      const a = audio.current;
      if (!a) return;
      cancelAnimationFrame(fade.current);
      const from = a.volume;
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / Math.max(1, ms));
        a.volume = Math.max(0, Math.min(1, from + (target - from) * k * k * (3 - 2 * k)));
        if (k < 1) fade.current = requestAnimationFrame(tick);
        else then?.();
      };
      fade.current = requestAnimationFrame(tick);
    },
    [],
  );

  const start = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    a.volume = 0;
    a.play()
      .then(() => rampTo(volume, fadeMs))
      .catch(() => setError(true));
  }, [fadeMs, rampTo, volume]);

  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) {
      a.play()
        .then(() => rampTo(volume, 400))
        .catch(() => setError(true));
    } else {
      rampTo(0, 250, () => a.pause());
    }
  }, [rampTo, volume]);

  const setMuted = useCallback((m: boolean) => {
    if (audio.current) audio.current.muted = m;
    setMutedState(m);
    store.set("muted", m ? "1" : "0");
  }, []);

  const setVolume = useCallback((v: number) => {
    cancelAnimationFrame(fade.current);
    if (audio.current) audio.current.volume = v;
    setVolumeState(v);
  }, []);

  const loadFile = useCallback(
    (file: File) => {
      const a = audio.current;
      if (!a) return;
      if (a.src.startsWith("blob:")) URL.revokeObjectURL(a.src);
      a.src = URL.createObjectURL(file);
      setError(false);
      setMeta({ title: file.name.replace(/\.[^.]+$/, "").toLowerCase(), artist: "your file" });
      a.volume = 0;
      a.play()
        .then(() => rampTo(volume, 600))
        .catch(() => setError(true));
    },
    [rampTo, volume],
  );

  /** Skip to the next song (keeps playing if it was playing). */
  const next = useCallback(() => {
    const a = audio.current;
    wasPlaying.current = !!a && !a.paused;
    const go = () => {
      posRef.current += 1;
      setPos(posRef.current);
    };
    if (a && !a.paused) rampTo(0, 250, go);
    else go();
  }, [rampTo]);
  const playTrack = useCallback(
    (i: number) => {
      const a = audio.current;
      const len = order.current.length;
      const cur = posRef.current % len;
      if (i === cur) {
        if (a && a.paused) toggle();
        return;
      }
      wasPlaying.current = true;
      const go = () => {
        posRef.current += ((i - cur) % len + len) % len;
        setPos(posRef.current);
      };
      if (a && !a.paused) rampTo(0, 200, go);
      else go();
    },
    [rampTo, toggle],
  );
  const pause = useCallback(() => {
    const a = audio.current;
    if (a && !a.paused) rampTo(0, 250, () => a.pause());
  }, [rampTo]);
  const element = useCallback(() => audio.current, []);
  const playlist = order.current.map((i) => tracks[i]);
  const index = pos % order.current.length;

  return { title: meta.title, artist: meta.artist, loadFile, playing, muted, volume, start, toggle, setMuted, setVolume, error, next, playlist, index, playTrack, pause, element };
}

function shuffle<T>(a: T[]) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export function useIsMac() {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);
  return mac;
}

/** True on phones and narrow screens, where the desktop becomes a plain scrolling page. */
export function useCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px), (pointer: coarse)");
    const on = () => setCompact(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return compact;
}

/** The zone's current abbreviation (CST in winter, CDT in summer). */
export function tzAbbr(tz: string, d = new Date()) {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "";
}
