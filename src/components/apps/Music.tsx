"use client";
/**
 * music: a tidal-style library. "parth-os radio" is the site's own songs (the same player as the
 * bar). "tracks" and "likes" come live from soundcloud: soundcloud's official embed player loads out
 * of sight and this window drives it through its widget api (play, pause, skip, seek), so plays
 * count on soundcloud and there's no api key. A cava-style visualizer runs along the bottom.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { site } from "@/content/site";
import type { Player } from "@/lib/hooks";
import { foundSecrets, SECRET_COUNT } from "@/lib/secrets";

const SC_USER = (site.contact.links.find((l) => l.label === "soundcloud")?.href ?? "https://soundcloud.com/ap_on_the_beat").replace(/\/$/, "");
type View = "radio" | "tracks" | "likes" | "bonus";
type ScSound = { id: number; title?: string; user?: { username?: string }; artwork_url?: string | null; duration?: number; permalink_url?: string };
type ScWidget = {
  bind: (ev: string, fn: (e?: { currentPosition?: number; relativePosition?: number }) => void) => void;
  load: (url: string, opts: Record<string, unknown>) => void;
  getSounds: (cb: (s: ScSound[]) => void) => void;
  getCurrentSoundIndex: (cb: (i: number) => void) => void;
  skip: (i: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seekTo: (ms: number) => void;
  setVolume: (v: number) => void;
};
type ScApi = { Widget: ((el: HTMLIFrameElement) => ScWidget) & { Events: Record<string, string> } };

let scScript: Promise<ScApi | null> | null = null;
function loadSc(): Promise<ScApi | null> {
  const w = window as unknown as { SC?: ScApi };
  if (w.SC) return Promise.resolve(w.SC);
  scScript ??= new Promise((res) => {
    const s = document.createElement("script");
    s.src = "https://w.soundcloud.com/player/api.js";
    s.async = true;
    s.onload = () => res(w.SC ?? null);
    s.onerror = () => {
      scScript = null;
      res(null);
    };
    document.head.appendChild(s);
  });
  return scScript;
}

const art = (u?: string | null) => (u ? u.replace("-large", "-t300x300") : null);
const mmss = (ms?: number) => {
  if (!ms && ms !== 0) return "";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function Music({ player, arg }: { player: Player; arg?: string }) {
  const [view, setView] = useState<View>("radio");
  const [source, setSource] = useState<"radio" | "sc">("radio");
  const frame = useRef<HTMLIFrameElement>(null);
  const widget = useRef<ScWidget | null>(null);
  const [scState, setScState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [sounds, setSounds] = useState<ScSound[]>([]);
  const [loadedFor, setLoadedFor] = useState<View | null>(null);
  const [scIdx, setScIdx] = useState(-1);
  const [scPlaying, setScPlaying] = useState(false);
  const [pos, setPos] = useState({ at: 0, rel: 0 });

  // ── soundcloud ─────────────────────────────────────────────────────
  const scUrl = (v: View) => (v === "bonus" && site.music.bonus ? site.music.bonus.soundcloud : v === "likes" ? `${SC_USER}/likes` : `${SC_USER}/tracks`);
  // the secrets' bonus track shows up once all ten are found
  const [bonusOn, setBonusOn] = useState(false);
  useEffect(() => setBonusOn(!!site.music.bonus && foundSecrets().size >= SECRET_COUNT), []);
  const refreshSounds = useCallback(() => widget.current?.getSounds((s) => setSounds(s ?? [])), []);

  const loadList = useCallback(
    async (v: View) => {
      if (v === "radio") return;
      setScState("loading");
      const SC = await loadSc();
      if (!SC || !frame.current) return setScState("error");
      if (!widget.current) {
        frame.current.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(scUrl(v))}&auto_play=false&visual=false&show_comments=false&single_active=false`;
        const w = SC.Widget(frame.current);
        widget.current = w;
        const E = SC.Widget.Events;
        const fail = window.setTimeout(() => setScState((s) => (s === "loading" ? "error" : s)), 12000);
        w.bind(E.READY, () => {
          window.clearTimeout(fail);
          setScState("ready");
          setLoadedFor(v);
          w.setVolume(Math.round(player.volume * 100));
          w.getSounds((s) => setSounds(s ?? []));
          // details for long lists arrive in pieces
          window.setTimeout(() => w.getSounds((s) => setSounds(s ?? [])), 2500);
        });
        w.bind(E.PLAY, () => {
          setScPlaying(true);
          setSource("sc");
          w.getCurrentSoundIndex(setScIdx);
          w.getSounds((s) => setSounds(s ?? []));
        });
        w.bind(E.PAUSE, () => setScPlaying(false));
        w.bind(E.FINISH, () => setScPlaying(false));
        w.bind(E.ERROR, () => setScState("error"));
        w.bind(E.PLAY_PROGRESS, (e) => setPos({ at: e?.currentPosition ?? 0, rel: e?.relativePosition ?? 0 }));
      } else {
        widget.current.load(scUrl(v), {
          auto_play: false,
          visual: false,
          callback: () => {
            setScState("ready");
            setLoadedFor(v);
            setScIdx(-1);
            refreshSounds();
            window.setTimeout(refreshSounds, 2500);
          },
        });
      }
    },
    [player.volume, refreshSounds],
  );

  useEffect(() => {
    if (view !== "radio" && loadedFor !== view) loadList(view);
  }, [view, loadedFor, loadList]);

  // only one thing plays at a time
  useEffect(() => {
    if (player.playing && scPlaying) {
      widget.current?.pause();
      setSource("radio");
    }
  }, [player.playing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (scPlaying && player.playing) player.pause();
  }, [scPlaying]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    widget.current?.setVolume(Math.round(player.volume * 100));
  }, [player.volume]);

  // opened from a link or the file manager: "radio/2", "soundcloud"
  useEffect(() => {
    if (!arg) return;
    if (arg === "soundcloud" || arg === "tracks") setView("tracks");
    else if (arg === "likes") setView("likes");
    else if (arg === "bonus" && site.music.bonus && foundSecrets().size >= SECRET_COUNT) {
      setBonusOn(true);
      setView("bonus");
    }
    const m = /^radio\/(\d+)$/.exec(arg);
    if (m) {
      setView("radio");
      playRadio(Number(m[1]));
    }
  }, [arg]); // eslint-disable-line react-hooks/exhaustive-deps

  const playRadio = (siteIndex: number) => {
    const t = site.music.tracks[siteIndex];
    const i = player.playlist.findIndex((p) => p.src === t?.src);
    widget.current?.pause();
    setSource("radio");
    if (i >= 0) player.playTrack(i);
  };
  const playSc = (i: number) => {
    const w = widget.current;
    if (!w) return;
    player.pause();
    setSource("sc");
    if (i === scIdx) w.toggle();
    else {
      w.skip(i);
      setScIdx(i);
      w.play();
    }
  };

  // ── what the now-playing bar shows ─────────────────────────────────
  const radioNow = player.playlist[player.index];
  const now =
    source === "sc" && scIdx >= 0
      ? { title: sounds[scIdx]?.title ?? "…", artist: sounds[scIdx]?.user?.username ?? "soundcloud", art: art(sounds[scIdx]?.artwork_url), playing: scPlaying }
      : { title: radioNow?.title ?? player.title, artist: radioNow?.artist ?? player.artist, art: null, playing: player.playing };
  const toggle = () => (source === "sc" && widget.current ? widget.current.toggle() : player.playing ? player.toggle() : player.start());
  const skip = (d: 1 | -1) => {
    if (source === "sc" && widget.current) return d > 0 ? widget.current.next() : widget.current.prev();
    if (d > 0) player.next();
    else player.playTrack((player.index - 1 + player.playlist.length) % player.playlist.length);
  };

  const radioRows = useMemo(() => site.music.tracks.map((t, i) => ({ t, i })), []);
  const heading = view === "bonus" && site.music.bonus ? { k: "bonus track · all 10 secrets found", t: site.music.bonus.title, s: `${site.music.bonus.artist} · on soundcloud` } : view === "radio" ? { k: "playlist", t: "parth-os radio", s: `${site.music.tracks.length} songs made for this site` } : view === "tracks" ? { k: "artist", t: "ap on the beat", s: "parth's tracks on soundcloud" } : { k: "playlist", t: "likes", s: "what parth's been liking on soundcloud" };

  return (
    <div className="music">
      <nav className="music-side" aria-label="library">
        <p className="music-k">listen</p>
        <button type="button" className={view === "radio" ? "on" : ""} onClick={() => setView("radio")}>
          parth-os radio
        </button>
        <p className="music-k">soundcloud</p>
        <button type="button" className={view === "tracks" ? "on" : ""} onClick={() => setView("tracks")}>
          my tracks
        </button>
        <button type="button" className={view === "likes" ? "on" : ""} onClick={() => setView("likes")}>
          likes
        </button>
        {bonusOn && site.music.bonus && (
          <>
            <p className="music-k">unlocked</p>
            <button type="button" className={view === "bonus" ? "on" : ""} onClick={() => setView("bonus")}>
              bonus track
            </button>
          </>
        )}
        <a className="music-out" href={SC_USER} target="_blank" rel="noreferrer">
          open soundcloud ↗
        </a>
      </nav>

      <section className="music-main">
        <header className="music-head">
          <Cover src={view === "radio" ? null : art(sounds[0]?.artwork_url)} label={heading.t} />
          <div>
            <p className="music-k">{heading.k}</p>
            <h2>{heading.t}</h2>
            <p className="music-sub">{heading.s}</p>
            <button
              type="button"
              className="music-play"
              onClick={() => (view === "radio" ? playRadio(0) : sounds.length && playSc(Math.max(0, scIdx)))}
              disabled={view !== "radio" && scState !== "ready"}
            >
              ▶ play
            </button>
          </div>
        </header>

        <div className="music-list" role="list">
          {view === "radio" &&
            radioRows.map(({ t, i }) => {
              const on = source === "radio" && radioNow?.src === t.src;
              return (
                <button key={t.src} type="button" role="listitem" className={`music-row${on ? " on" : ""}`} onClick={() => playRadio(i)}>
                  <span className="music-n">{on && player.playing ? <Eq /> : i + 1}</span>
                  <span className="music-t">{t.title}</span>
                  <span className="music-a">{t.artist}</span>
                  <span className="music-d" />
                </button>
              );
            })}
          {view !== "radio" && scState === "loading" && <p className="app-empty">loading from soundcloud…</p>}
          {view !== "radio" && scState === "error" && (
            <p className="app-empty">
              soundcloud didn't load here (a blocker or the network).{" "}
              <a href={view === "likes" ? `${SC_USER}/likes` : view === "bonus" && site.music.bonus ? site.music.bonus.soundcloud : SC_USER} target="_blank" rel="noreferrer">
                listen on soundcloud ↗
              </a>
            </p>
          )}
          {view !== "radio" &&
            scState === "ready" &&
            loadedFor === view &&
            sounds.map((s, i) => {
              const on = source === "sc" && i === scIdx;
              return (
                <button key={s.id ?? i} type="button" role="listitem" className={`music-row${on ? " on" : ""}`} onClick={() => playSc(i)}>
                  <span className="music-n">{on && scPlaying ? <Eq /> : i + 1}</span>
                  <span className="music-t">
                    {art(s.artwork_url) && <img src={art(s.artwork_url)!} alt="" width={28} height={28} loading="lazy" />}
                    {s.title ?? "loading…"}
                  </span>
                  <span className="music-a">{s.user?.username ?? ""}</span>
                  <span className="music-d">{mmss(s.duration)}</span>
                </button>
              );
            })}
          {view !== "radio" && scState === "ready" && loadedFor === view && !sounds.length && <p className="app-empty">nothing here yet.</p>}
        </div>
      </section>

      <Viz player={player} playing={now.playing} sc={source === "sc"} wide />
      <footer className="music-now">
        <div className="music-np">
          <Cover src={now.art} label={now.title} small />
          <div className="music-np-t">
            <span className="music-t">{now.title}</span>
            <span className="music-a">{now.artist}</span>
          </div>
        </div>
        <div className="music-ctl">
          <div className="music-btns">
            <button type="button" onClick={() => skip(-1)} aria-label="previous">
              ⏮
            </button>
            <button type="button" className="music-pp" onClick={toggle} aria-label={now.playing ? "pause" : "play"}>
              {now.playing ? "❚❚" : "▶"}
            </button>
            <button type="button" onClick={() => skip(1)} aria-label="next">
              ⏭
            </button>
          </div>
          {source === "sc" && scIdx >= 0 ? (
            <div className="music-seek">
              <span>{mmss(pos.at)}</span>
              <input
                id="music-seek"
                type="range"
                min={0}
                max={1000}
                value={Math.round(pos.rel * 1000)}
                aria-label="seek"
                onChange={(e) => {
                  const d = sounds[scIdx]?.duration ?? 0;
                  widget.current?.seekTo((Number(e.target.value) / 1000) * d);
                }}
              />
              <span>{mmss(sounds[scIdx]?.duration)}</span>
            </div>
          ) : (
            <div className="music-seek radio">{source === "radio" ? "parth-os radio · live" : ""}</div>
          )}
        </div>
        <div className="music-vol">
          <span aria-hidden>vol</span>
          <input id="music-vol" type="range" min={0} max={1} step={0.01} value={player.volume} onChange={(e) => player.setVolume(Number(e.target.value))} aria-label="volume" />
        </div>
      </footer>

      {/* soundcloud's own player, out of sight: this window is its remote */}
      <iframe ref={frame} className="music-sc" title="soundcloud player" allow="autoplay; encrypted-media" />
    </div>
  );
}

function Cover({ src, label, small }: { src: string | null; label: string; small?: boolean }) {
  return (
    <div className={`music-cover${small ? " small" : ""}`} aria-hidden>
      {src ? <img src={src} alt="" /> : <span>{label.slice(0, 2)}</span>}
    </div>
  );
}

function Eq() {
  return (
    <span className="music-eq" aria-label="playing">
      <i />
      <i />
      <i />
    </span>
  );
}

/**
 * cava-style bars. The radio's audio is read for real (web audio analyser); soundcloud's player is a
 * separate site the browser won't let us listen to, so its bars follow a smooth beat-ish motion.
 */
const ctxRef: { ctx?: AudioContext; nodes: WeakMap<HTMLAudioElement, AnalyserNode> } = { nodes: new WeakMap() };
function Viz({ player, playing, sc, wide }: { player: Player; playing: boolean; sc: boolean; wide?: boolean }) {
  const pre = useRef<HTMLPreElement>(null);
  useEffect(() => {
    let raf = 0;
    const N = wide ? 64 : 36;
    const H = wide ? 3 : 2;
    const vals = new Float32Array(N);
    let analyser: AnalyserNode | null = null;
    let data: Uint8Array<ArrayBuffer> | null = null;
    const hook = () => {
      if (sc) return;
      const el = player.element();
      if (!el) return;
      try {
        ctxRef.ctx ??= new AudioContext();
        const ctx = ctxRef.ctx;
        if (ctx.state !== "running") {
          void ctx.resume();
          return; // only reroute audio once the context is really running, or the radio would go silent
        }
        let a = ctxRef.nodes.get(el);
        if (!a) {
          const src = ctx.createMediaElementSource(el);
          a = ctx.createAnalyser();
          a.fftSize = 256;
          a.smoothingTimeConstant = 0.78;
          src.connect(a);
          a.connect(ctx.destination);
          ctxRef.nodes.set(el, a);
        }
        analyser = a;
        data = new Uint8Array(a.frequencyBinCount);
      } catch {
        analyser = null;
      }
    };
    hook();
    const bars = " ▁▂▃▄▅▆▇█";
    const t0 = performance.now();
    const tick = (now: number) => {
      if (!analyser && playing && !sc) hook();
      if (analyser && data) {
        analyser.getByteFrequencyData(data);
        for (let i = 0; i < N; i++) {
          const k = Math.floor(Math.pow(i / N, 1.6) * (data.length * 0.7));
          vals[i] += ((data[k] / 255) * (playing ? 1 : 0) - vals[i]) * 0.5;
        }
      } else {
        const t = (now - t0) / 1000;
        const beat = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 1.45)), 6);
        for (let i = 0; i < N; i++) {
          const f = i / N;
          const target = playing ? (0.35 + 0.35 * Math.sin(t * (1.3 + f * 3) + i * 0.7) * Math.sin(t * 0.7 + i)) * (1 - f * 0.55) + beat * (1 - f) * 0.45 : 0;
          vals[i] += (Math.max(0, target) - vals[i]) * 0.18;
        }
      }
      const rows: string[] = [];
      for (let r = H - 1; r >= 0; r--) {
        let line = "";
        for (let i = 0; i < N; i++) {
          const v = Math.max(0, Math.min(1, vals[i])) * H - r;
          line += v >= 1 ? "█" : v <= 0 ? " " : bars[Math.round(v * 8)];
        }
        rows.push(line);
      }
      if (pre.current) pre.current.textContent = rows.join("\n");
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [player, playing, sc, wide]);
  return <pre ref={pre} className={`music-viz${wide ? " wide" : ""}`} aria-hidden />;
}
