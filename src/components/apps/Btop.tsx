"use client";
/**
 * btop, the system monitor from every rice screenshot. The processes are the site's real parts, and
 * killing one really does it: the wallpaper freezes, the bar goes, the music stops, the price feed
 * stops, code closes. r restarts everything. Frame rate, memory and core count come from the
 * browser; per-process cpu is an estimate, since a web page can't measure that.
 */
import { useEffect, useMemo, useRef, useState } from "react";

export type Proc =
  | "systemd"
  | "Hyprland"
  | "waybar"
  | "wallpaper"
  | "pipewire"
  | "radio"
  | "zsh"
  | "hl-feed"
  | "code"
  | "tsserver"
  | "btop";

type P = {
  pid: number;
  prog: Proc;
  cmd: string;
  thr: number;
  mem: number;
  cpu: number;
  what: string;
};
const ALL: P[] = [
  {
    pid: 1,
    prog: "systemd",
    cmd: "/sbin/init",
    thr: 1,
    mem: 12,
    cpu: 0.1,
    what: "",
  },
  {
    pid: 412,
    prog: "Hyprland",
    cmd: "Hyprland --config ~/.config/hypr",
    thr: 9,
    mem: 96,
    cpu: 2.2,
    what: "the window manager. you've been logged out.",
  },
  {
    pid: 438,
    prog: "waybar",
    cmd: "waybar -c ~/.config/waybar",
    thr: 4,
    mem: 34,
    cpu: 0.6,
    what: "the bar is gone. r brings it back.",
  },
  {
    pid: 455,
    prog: "wallpaper",
    cmd: "ascii-wall",
    thr: 2,
    mem: 58,
    cpu: 7.8,
    what: "the wallpaper froze on its last frame.",
  },
  {
    pid: 470,
    prog: "pipewire",
    cmd: "/usr/bin/pipewire",
    thr: 3,
    mem: 21,
    cpu: 0.9,
    what: "audio's down: the music stopped.",
  },
  {
    pid: 481,
    prog: "radio",
    cmd: "mpv --no-video radio",
    thr: 5,
    mem: 40,
    cpu: 1.4,
    what: "the radio stopped.",
  },
  {
    pid: 502,
    prog: "zsh",
    cmd: "-zsh",
    thr: 1,
    mem: 8,
    cpu: 0,
    what: "the terminal's shell restarted fresh.",
  },
  {
    pid: 530,
    prog: "hl-feed",
    cmd: "wss://api.hyperliquid.xyz/ws",
    thr: 2,
    mem: 18,
    cpu: 0.7,
    what: "the price feed is down: the trading game's prices stopped.",
  },
  {
    pid: 611,
    prog: "code",
    cmd: "code ~/parth-os",
    thr: 22,
    mem: 310,
    cpu: 3.5,
    what: "code closed.",
  },
  {
    pid: 612,
    prog: "tsserver",
    cmd: "node tsserver.js",
    thr: 8,
    mem: 220,
    cpu: 1.9,
    what: "code's typescript checker died with it.",
  },
  { pid: 700, prog: "btop", cmd: "btop", thr: 1, mem: 6, cpu: 0.4, what: "" },
];

/** btop's palette per site theme; monochrome and friends get btop's own default colours */
const BTOP_DEFAULT = {
  g: ["#4caf50", "#cddc39", "#ff9800", "#f44336"],
  mem: "#b388ff",
  net: "#26c6da",
  key: "#ff9800",
  sel: "#0b4a6f",
};
const PALETTES: Record<string, typeof BTOP_DEFAULT> = {
  nord: {
    g: ["#a3be8c", "#ebcb8b", "#d08770", "#bf616a"],
    mem: "#b48ead",
    net: "#88c0d0",
    key: "#ebcb8b",
    sel: "#3b4252",
  },
  "tokyo-night": {
    g: ["#9ece6a", "#e0af68", "#ff9e64", "#f7768e"],
    mem: "#bb9af7",
    net: "#7dcfff",
    key: "#ff9e64",
    sel: "#283457",
  },
  catppuccin: {
    g: ["#a6e3a1", "#f9e2af", "#fab387", "#f38ba8"],
    mem: "#cba6f7",
    net: "#89dceb",
    key: "#fab387",
    sel: "#313244",
  },
  kanagawa: {
    g: ["#98bb6c", "#e6c384", "#ffa066", "#e46876"],
    mem: "#957fb8",
    net: "#7fb4ca",
    key: "#ffa066",
    sel: "#2d4f67",
  },
  "rose-pine": {
    g: ["#9ccfd8", "#f6c177", "#ebbcba", "#eb6f92"],
    mem: "#c4a7e7",
    net: "#9ccfd8",
    key: "#f6c177",
    sel: "#2a283e",
  },
  gruvbox: {
    g: ["#b8bb26", "#fabd2f", "#fe8019", "#fb4934"],
    mem: "#d3869b",
    net: "#83a598",
    key: "#fe8019",
    sel: "#3c3836",
  },
  everforest: {
    g: ["#a7c080", "#dbbc7f", "#e69875", "#e67e80"],
    mem: "#d699b6",
    net: "#7fbbb3",
    key: "#e69875",
    sel: "#3d484d",
  },
  matrix: {
    g: ["#1f6b33", "#3ddc84", "#7cffa4", "#e6ffec"],
    mem: "#5fd47a",
    net: "#00ff66",
    key: "#00ff66",
    sel: "#0f2a16",
  },
  red: {
    g: ["#7a2b2b", "#b84a4a", "#ff6b76", "#ff3344"],
    mem: "#d98c8c",
    net: "#ff8a80",
    key: "#ff3344",
    sel: "#2a0d0d",
  },
  gold: {
    g: ["#8a6d2b", "#c9a86a", "#e8b931", "#ffd76a"],
    mem: "#e0a458",
    net: "#f0c75e",
    key: "#e8b931",
    sel: "#2a2214",
  },
  paper: {
    g: ["#2e7d32", "#9e9d24", "#ef6c00", "#c62828"],
    mem: "#6a1b9a",
    net: "#00838f",
    key: "#ef6c00",
    sel: "#cfe3f3",
  },
  beige: {
    g: ["#2e7d32", "#9e9d24", "#ef6c00", "#c62828"],
    mem: "#6a1b9a",
    net: "#00838f",
    key: "#ef6c00",
    sel: "#e3d5b8",
  },
  fog: {
    g: ["#2e7d32", "#9e9d24", "#ef6c00", "#c62828"],
    mem: "#6a1b9a",
    net: "#00838f",
    key: "#ef6c00",
    sel: "#cfd8e3",
  },
};

export default function Btop({
  theme,
  running,
  killed,
  onKill,
  onRestart,
  onQuit,
}: {
  theme: string;
  /** which optional processes exist right now (code only while it's open) */
  running: Set<Proc>;
  killed: Set<Proc>;
  onKill: (p: Proc) => void;
  onRestart: () => void;
  onQuit: () => void;
}) {
  const pal = PALETTES[theme] ?? BTOP_DEFAULT;
  const grad = (p: number) =>
    pal.g[p < 0.35 ? 0 : p < 0.6 ? 1 : p < 0.85 ? 2 : 3];
  const procs = useMemo(
    () =>
      ALL.filter((p) =>
        p.prog === "code" || p.prog === "tsserver" ? running.has("code") : true,
      ),
    [running],
  );
  const [selPid, setSelPid] = useState(455);
  const [msg, setMsg] = useState("↑↓ to pick a process, k to kill it.");
  const [, setTick] = useState(0);
  const cur = useRef(new Map<number, number>());
  const hist = useRef<number[]>([]);
  const fps = useRef(60);
  const root = useRef<HTMLDivElement>(null);
  const graph = useRef<HTMLCanvasElement>(null);

  // the real frame rate
  useEffect(() => {
    let raf = 0;
    let frames = 0;
    let last = performance.now();
    const loop = (now: number) => {
      frames++;
      if (now - last >= 1000) {
        fps.current = (frames * 1000) / (now - last);
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // once a second, like btop's default update rate
  useEffect(() => {
    const step = () => {
      for (const p of ALL) {
        const dead =
          killed.has(p.prog) || (p.prog === "tsserver" && killed.has("code"));
        cur.current.set(
          p.pid,
          dead ? 0 : Math.max(0, p.cpu * (0.6 + Math.random() * 0.8)),
        );
      }
      const total = Math.min(
        100,
        [...cur.current.values()].reduce((a, b) => a + b, 0) * 2.2 +
          (60 - Math.min(60, fps.current)) * 0.8,
      );
      hist.current.push(total);
      if (hist.current.length > 160) hist.current.shift();
      setTick((n) => n + 1);
    };
    step();
    const id = window.setInterval(step, 1000);
    return () => clearInterval(id);
  }, [killed]);
  useEffect(() => root.current?.focus({ preventScroll: true }), []);

  // the cpu graph: dotted columns coloured by height, like btop's braille graph
  useEffect(() => {
    const c = graph.current;
    if (!c) return;
    const dpr = devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    c.width = w * dpr;
    c.height = h * dpr;
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    const bw = w / 160;
    hist.current.forEach((v, i) => {
      const x = w - (hist.current.length - i) * bw;
      for (let y = 0; y < (v / 100) * h; y += 4) {
        g.fillStyle = grad(y / h);
        g.fillRect(x + bw * 0.2, h - y - 2.5, Math.max(1, bw * 0.55), 2.5);
      }
    });
  });

  const order = [...procs].sort(
    (a, b) => (cur.current.get(b.pid) ?? 0) - (cur.current.get(a.pid) ?? 0),
  );
  const isDead = (p: P) =>
    killed.has(p.prog) || (p.prog === "tsserver" && killed.has("code"));
  const kill = (p: P) => {
    if (p.prog === "systemd")
      return setMsg("kill: (1) - operation not permitted");
    if (p.prog === "btop") return onQuit();
    if (isDead(p)) return setMsg(`kill: (${p.pid}) - no such process`);
    setMsg(`killed ${p.pid} ${p.prog}: ${p.what}`);
    onKill(p.prog === "tsserver" ? "code" : p.prog);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const i = order.findIndex((p) => p.pid === selPid);
    if (e.key === "ArrowDown" || e.key === "j")
      setSelPid(order[Math.min(order.length - 1, i + 1)].pid);
    else if (e.key === "ArrowUp") setSelPid(order[Math.max(0, i - 1)].pid);
    else if (e.key === "k" && order[i]) kill(order[i]);
    else if (e.key === "r") {
      onRestart();
      setMsg("restarted everything.");
    } else if (e.key === "q") onQuit();
    else return;
    e.preventDefault();
  };

  const nav = navigator as Navigator & { deviceMemory?: number };
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
  };
  const heap = perf.memory ? perf.memory.usedJSHeapSize / 1048576 : null;
  const cores = Math.min(16, nav.hardwareConcurrency || 8);
  const total = hist.current[hist.current.length - 1] ?? 0;
  const feedOn = !killed.has("hl-feed");
  const rx = feedOn ? 0.4 + Math.random() * 1.6 : 0;

  return (
    <div
      className="btop"
      ref={root}
      tabIndex={0}
      onKeyDown={onKey}
      aria-label="btop system monitor"
      style={{
        ["--bt-key" as string]: pal.key,
        ["--bt-sel" as string]: pal.sel,
      }}
    >
      <div className="bt-box bt-cpu">
        <span className="bt-t">
          <sup>¹</sup>cpu
        </span>
        <span className="bt-t2">
          {new Date().toLocaleTimeString("en-US", { hour12: false })}
        </span>
        <canvas ref={graph} className="bt-graph" />
        <div className="bt-cores">
          {Array.from({ length: cores }, (_, i) => {
            const v = Math.max(
              2,
              Math.min(99, total * (0.5 + ((i * 37) % 10) / 10)),
            );
            return (
              <div key={i} className="bt-core">
                <span className="bt-k">c{i}</span>
                <span className="bt-meter">
                  <i style={{ width: `${v}%`, background: grad(v / 100) }} />
                </span>
                <span className="bt-pct">{v.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="bt-box">
        <span className="bt-t">
          <sup>²</sup>mem
        </span>
        <Meter
          k="js heap"
          v={heap !== null ? `${heap.toFixed(0)} MiB` : "not reported"}
          p={
            heap !== null && perf.memory
              ? (heap / (perf.memory.jsHeapSizeLimit / 1048576)) * 8
              : 0.3
          }
          c={pal.mem}
        />
        <Meter
          k="frame rate"
          v={`${fps.current.toFixed(0)} fps`}
          p={fps.current / 60}
          c={grad(1 - fps.current / 60)}
        />
        <Meter
          k="device memory"
          v={nav.deviceMemory ? `${nav.deviceMemory} GiB` : "not reported"}
          p={0.6}
          c={pal.mem}
        />
      </div>
      <div className="bt-box">
        <span className="bt-t">
          <sup>³</sup>net
        </span>
        <span className="bt-t2">hyperliquid</span>
        <div className="bt-row">
          <span className="bt-k">status</span>
          <span style={{ color: feedOn ? pal.g[0] : pal.g[3] }}>
            {feedOn ? "connected" : "killed"}
          </span>
        </div>
        <div className="bt-row">
          <span className="bt-k">download</span>
          <span style={{ color: pal.net }}>{rx.toFixed(1)} KiB/s</span>
        </div>
        <div className="bt-row">
          <span className="bt-k">coins</span>
          <span>btc eth sol</span>
        </div>
      </div>
      <div className="bt-box bt-proc">
        <span className="bt-t">
          <sup>⁴</sup>proc
        </span>
        <span className="bt-t2">sort: cpu ↓</span>
        <div className="bt-scroll">
          <table>
            <thead>
              <tr>
                <th className="r">pid</th>
                <th>program</th>
                <th className="bt-sm">command</th>
                <th className="r">thr</th>
                <th className="r">mem</th>
                <th className="r">cpu%</th>
              </tr>
            </thead>
            <tbody>
              {order.map((p) => {
                const v = cur.current.get(p.pid) ?? 0;
                return (
                  <tr
                    key={p.pid}
                    className={`${p.pid === selPid ? "on" : ""}${isDead(p) ? " dead" : ""}`}
                    onClick={() => setSelPid(p.pid)}
                    onDoubleClick={() => kill(p)}
                  >
                    <td className="r">{p.pid}</td>
                    <td>{p.prog}</td>
                    <td className="bt-sm">{p.cmd}</td>
                    <td className="r">{p.thr}</td>
                    <td className="r">{p.mem}M</td>
                    <td
                      className="r"
                      style={{ color: isDead(p) ? undefined : grad(v / 10) }}
                    >
                      {v.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bt-foot">
        <span className="bt-msg">{msg}</span>
        <span>
          <b>↑↓</b> select <b>k</b> kill <b>r</b> restart all <b>q</b> quit
        </span>
      </div>
    </div>
  );
}

function Meter({ k, v, p, c }: { k: string; v: string; p: number; c: string }) {
  return (
    <>
      <div className="bt-row">
        <span className="bt-k">{k}</span>
        <span>{v}</span>
      </div>
      <div className="bt-meter bt-wide">
        <i
          style={{
            width: `${Math.max(2, Math.min(100, p * 100))}%`,
            background: c,
          }}
        />
      </div>
    </>
  );
}
