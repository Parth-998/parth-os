"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { REPO, filesUnder, inRepo, kind, list, loadRepo, readRepo, repoNow, resolvePath } from "@/lib/repo";
import { site } from "@/content/site";
import { THEMES } from "@/content/themes";
import { BACKGROUNDS, type BackgroundId } from "@/lib/ascii";
import type { Player } from "@/lib/hooks";
import { keybinds } from "@/lib/keys";
import SecretsFile from "./SecretsFile";

export interface TermActions {
  jump: (i: number) => void;
  openProject: (slug: string) => void;
  themeId: string;
  setTheme: (id: string) => void;
  bg: BackgroundId;
  setBg: (id: BackgroundId) => void;
  openPicker: () => void;
  openSettings: () => void;
  player: Player;
  reboot: () => void;
  logout: () => void;
  /** Theme, wallpaper, settings and window layout back to how they shipped. Returns what changed. */
  resetAll: () => string[];
  /** sudo rm -rf / */
  meltdown: () => void;
  /** start the screensaver now */
  screensaver: () => void;
  shutdown: () => void;
}

type Line = { id: number; node: ReactNode };

/** What `help` lists. Kept short: one command per job. */
const COMMANDS: Record<string, string> = {
  help: "list commands",
  shortcuts: "every keyboard shortcut",
  whoami: "print the user name",
  fetch: "system info",
  ls: "list files",
  cd: "go to a workspace: cd projects · the site's source: cd parth-os",
  cat: "print a file: cat about.txt",
  projects: "list projects",
  open: "open a project: open stocktracker",
  settings: "open settings",
  theme: "theme <name> · theme list",
  bg: "bg <style> · bg list · bg (opens the picker)",
  music: "the music app · music play | pause | next | list | vol 0-100",
  github: "open github",
  linkedin: "open linkedin",
  soundcloud: "my music",
  credits: "who made the parts",
  clear: "clear the terminal",
  reset: "put everything back: windows, theme, wallpaper, settings",
  code: "open the site's source in vs code: code src/lib/tiling.ts",
  notes: "write-ups: notes, notes how-this-site-was-built",
  files: "file manager (yazi)",
  nsxiv: "image viewer: nsxiv ~/pictures",
  btop: "system monitor (try killing something)",
  reboot: "replay the boot sequence",
  shutdown: "power off",
  logout: "back to the login screen",
};
/** Work too, listed on one line at the end of `help` (like bash's help, which lists the builtins briefly). */
const EXTRA = ["date", "echo", "history", "sudo", "screensaver", "pwd", "tree", "grep", "dmesg", "journalctl -b"];
const HIDDEN = [...EXTRA, "exit", "keys", "wallpaper", "rm", "saver"];

/** Folders map to workspaces. */
const DIRS: Record<string, number> = { projects: 1, about: 2, activity: 3, contact: 4 };

import { HOME_FILES as FILES } from "@/lib/homefiles";
import { openApp } from "@/lib/apps";
import { NOTES } from "@/content/notes";
import { BOOT_LINES, WALLPAPER_SERVICE } from "./Entry";

/** `date` the way Linux prints it: Sat Oct 31 05:26:00 AM CDT 2026 */
function linuxDate(tz: string, d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true, year: "numeric", timeZoneName: "short" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.weekday} ${p.month} ${p.day} ${p.hour}:${p.minute}:${p.second} ${p.dayPeriod} ${p.timeZoneName} ${p.year}`;
}

/** fastfetch shows the distro logo; this distro's logo is the PA mark. */
const FETCH_ART = String.raw` ____   _
|  _ \ / \
| |_) / _ \
|  __/ ___ \
|_| /_/   \_\ `;

function pathFor(dir: string | null) {
  return dir ? `~/${dir}` : "~";
}

export default function Terminal({ actions, lastLogin }: { actions: TermActions; lastLogin: string | null }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [value, setValue] = useState("");
  const [dir, setDir] = useState<string | null>(null);
  const [hist, setHist] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);

  const push = (...nodes: ReactNode[]) => setLines((l) => [...l, ...nodes.map((node) => ({ id: idRef.current++, node }))].slice(-300));

  // The shell greeting, like a ricer's .zshrc prints on every new terminal (shown again after `reset`).
  const welcome = (fresh = false) => {
    const row = (k: string, v: ReactNode) => (
      <span className="t-greet">
        <span style={{ color: "var(--faint)" }}>{k}</span>
        <span>{v}</span>
      </span>
    );
    const apps = ["code", "notes", "yazi", "btop", "music", "nsxiv"];
    push(
      <span style={{ color: "var(--fg)" }}>{fresh ? "fresh start. everything's back how it shipped." : lastLogin ? "welcome back to parth-os." : "welcome to parth-os."}</span>,
      row(
        "apps",
        apps.map((a, i) => (
          <span key={a}>
            {i > 0 && <span style={{ color: "var(--faint)" }}> · </span>}
            <b className="t-cmd">{a}</b>
          </span>
        )),
      ),
      row(
        "find",
        <>
          <b className="t-cmd">alt space</b>, or the search button in the bar
        </>,
      ),
      row(
        "help",
        <>
          type <b className="t-cmd">help</b>, or press <b className="t-cmd">?</b> for every keybind
        </>,
      ),
      row(
        "undo",
        <>
          moved windows around? <b className="t-cmd">reset</b> puts it all back
        </>,
      ),
    );
  };
  useEffect(() => {
    setLines([]);
    welcome();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastLogin]);

  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms));

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [lines]);

  // a shooting star was caught on the waves: the next line typed is a wish
  // btop killed the shell: a fresh one starts, like a new terminal session
  useEffect(() => {
    const on = () => {
      setLines([]);
      setDir(null);
      push(<span style={{ color: "var(--faint)" }}>[process exited with code 137]</span>, <span>new zsh session. type help to look around.</span>);
    };
    window.addEventListener("parth-os:zsh-restart", on);
    return () => window.removeEventListener("parth-os:zsh-restart", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [wishing, setWishing] = useState(false);
  useEffect(() => {
    const on = () => {
      setWishing(true);
      push(
        <span style={{ color: "var(--fg)" }}>✦ you caught a shooting star.</span>,
        <span>make a wish. type it below and press enter.</span>,
      );
      window.setTimeout(() => input.current?.focus({ preventScroll: true }), 80);
    };
    window.addEventListener("wish-star", on);
    return () => window.removeEventListener("wish-star", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const makeWish = (raw: string) => {
    const wish = raw.trim();
    const low = wish.toLowerCase();
    push(
      <span>
        <span style={{ color: "var(--faint)" }}>✦ wish</span> <span style={{ color: "var(--fg)" }}>❯</span> {wish}
      </span>,
    );
    setWishing(false);
    if (!wish) return push(<span>no wish? the star's gone. there'll be another one.</span>);
    let h = 0;
    for (const ch of low) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
    const pick = <T,>(xs: T[]) => xs[Math.abs(h) % xs.length];
    const has = (...ws: string[]) => ws.some((x) => new RegExp(`\\b${x}`).test(low));
    const [verdict, note] = has("more wishes", "infinite wishes", "unlimited wishes", "another wish")
      ? ["wish denied.", "nice try."]
      : has("hire", "intern", "job", "offer", "parth")
        ? ["wish granted.", "make it happen: cat contact.txt"]
        : has("rich", "money", "million", "billion", "lambo", "moon", "100x", "1000x", "crypto", "bitcoin", "btc")
          ? ["we shall see.", "not financial advice."]
          : has("world peace", "peace")
            ? ["we shall see.", "working on it."]
            : has("die", "kill", "hurt", "hate")
              ? ["wish denied.", "the star doesn't do that."]
              : pick([
                  ["wish granted.", "give it time."],
                  ["wish granted.", "you didn't hear it from me."],
                  ["we shall see.", "the stars are thinking about it."],
                  ["we shall see.", "ask again on a clearer night."],
                  ["wish denied.", "the star said no. harsh."],
                ]);
    const v = verdict;
    later(500, () => push(<span className="mono">. . .</span>));
    later(1500, () => push(<span style={{ color: "var(--fg)", fontWeight: 600 }}>{v}</span>, <span>{note}</span>));
  };

  const words = value.split(/\s+/);
  const cmd = words[0] ?? "";
  const known = cmd in COMMANDS || HIDDEN.includes(cmd);

  // Fish-style autosuggestion from history.
  const suggestion = useMemo(() => {
    if (!value) return "";
    const hit = [...hist].reverse().find((h) => h.startsWith(value) && h !== value);
    return hit ? hit.slice(value.length) : "";
  }, [value, hist]);

  const candidates = (v: string): string[] => {
    const parts = v.split(/\s+/);
    if (parts.length <= 1) return Object.keys(COMMANDS).filter((c) => c.startsWith(parts[0]));
    const [c, ...rest] = parts;
    const last = rest[rest.length - 1] ?? "";
    let pool: string[] = [];
    if ((c === "cd" || c === "cat" || c === "ls" || c === "tree" || c === "code") && (inRepo(resolvePath(dir ?? "", last.includes("/") ? last.slice(0, last.lastIndexOf("/")) || "/" : ".") ?? "") || last.startsWith(REPO))) {
      // inside the source: complete the last path segment from the snapshot
      const snap = repoNow();
      if (!snap) {
        void loadRepo();
        return [];
      }
      const cut = last.lastIndexOf("/");
      const head = cut >= 0 ? last.slice(0, cut + 1) : "";
      const base = resolvePath(dir ?? "", head || ".");
      if (base === null || !inRepo(base)) {
        if (base === "") pool = [`${REPO}/`];
      } else
        pool = list(snap, base, last.slice(cut + 1).startsWith("."))
          .filter((e) => (c === "cd" ? e.dir : true))
          .map((e) => head + e.name + (e.dir ? "/" : ""));
    } else if (c === "cd") pool = [...Object.keys(DIRS), REPO + "/", "~", ".."];
    else if (c === "cat") pool = Object.keys(FILES);
    else if (c === "code" && !inRepo(dir ?? "")) {
      const snap = repoNow();
      if (!snap) void loadRepo();
      pool = snap ? [...Object.keys(snap.files), ".config/parth-os/config"] : [];
    } else if (c === "notes") pool = NOTES.map((n) => n.slug);
    else if (c === "open") pool = site.projects.map((p) => p.slug);
    else if (c === "theme") pool = ["list", ...THEMES.map((t) => t.id)];
    else if (c === "bg") pool = ["list", ...BACKGROUNDS.map((b) => b.id)];
    else if (c === "music") pool = ["play", "pause", "next", "list", "mute", "unmute", "vol"];
    return pool.filter((p) => p.startsWith(last)).map((p) => [c, ...rest.slice(0, -1), p].join(" "));
  };

  /** load the source snapshot (first time only), then do something with it */
  const inRepoDo = async (fail: string, f: (snap: NonNullable<ReturnType<typeof repoNow>>) => void) => {
    const snap = await loadRepo();
    if (!snap) return push(`${fail}: couldn't reach the server`);
    f(snap);
  };

  const run = (raw: string) => {
    const line = raw.trim();
    const promptLine = (
      <span>
        <span style={{ color: "var(--faint)" }}>{pathFor(dir)}</span> <span style={{ color: "var(--fg)" }}>❯</span> {line}
      </span>
    );
    push(promptLine);
    if (!line) return;
    setHist((h) => [...h.filter((x) => x !== line), line].slice(-50));
    const [c, ...args] = line.split(/\s+/);
    const a0 = (args[0] ?? "").toLowerCase();
    const out = (...t: ReactNode[]) => push(...t);

    switch (c) {
      case "help":
        out(
          <div className="grid grid-cols-[auto_1fr] gap-x-4">
            {Object.entries(COMMANDS).map(([k, v]) => (
              <div key={k} className="contents">
                <span className="t-cmd">{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>,
          <span>also: {EXTRA.join(", ")}</span>,
        );
        break;
      case "whoami":
        out(site.handle);
        break;
      case "fetch": {
        const preset = THEMES.find((x) => x.id === actions.themeId);
        const up = Math.max(1, Math.round((performance.now()) / 60000));
        const rowsI: [string, string][] = [
          ["os", "parth-os x86_64"],
          ["kernel", "linux 6.11-parth"],
          ["uptime", `${up} min${up === 1 ? "" : "s"}`],
          ["shell", "zsh"],
          ["wm", "workspaces 1-5 (tiling)"],
          ["theme", preset?.name ?? actions.themeId],
          ["wallpaper", BACKGROUNDS.find((b) => b.id === actions.bg)?.name ?? actions.bg],
          ["resolution", `${window.innerWidth}x${window.innerHeight}`],
          ["cpu", "8 cores, 16 threads"],
          ["memory", "16gb"],
          ["audio", "pipewire"],
          ["font", "geist mono"],
        ];
        out(
          <div className="flex flex-wrap gap-x-6 py-1">
            <pre className="leading-[1.25]" style={{ color: "var(--fg)" }}>{FETCH_ART}</pre>
            <div>
              <div style={{ color: "var(--fg)" }}>
                {site.handle}@parth-os
              </div>
              <div style={{ color: "var(--faint)" }}>{"-".repeat(site.handle.length + 9)}</div>
              {rowsI.map(([k, v]) => (
                <div key={k}>
                  <span className="t-cmd inline-block w-[84px]">{k}</span>
                  {v}
                </div>
              ))}
            </div>
          </div>,
        );
        break;
      }
      case "ls": {
        // dotfiles only show with -a, like the real thing
        const all = args.some((x) => /^-\w*a/.test(x));
        const where = resolvePath(dir ?? "", args.find((x) => !x.startsWith("-")) ?? ".");
        if (where !== null && inRepo(where)) {
          void inRepoDo(`ls: cannot access '${where}'`, (snap) => {
            const k = kind(snap, where);
            if (!k) return out(`ls: cannot access '${args.find((x) => !x.startsWith("-"))}': no such file or directory`);
            if (k === "file") return out(where.split("/").pop()!);
            const items = [...(all ? [{ name: ".", dir: true }, { name: "..", dir: true }] : []), ...list(snap, where, all)];
            out(
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-4">
                {items.map((e) => (
                  <span key={e.name} style={{ color: e.dir ? "var(--fg)" : undefined }}>
                    {e.name}
                    {e.dir ? "/" : ""}
                  </span>
                ))}
              </div>,
            );
          });
          break;
        }
        const items = [...(all ? ["./", "../"] : []), ...Object.keys(DIRS).map((d) => `${d}/`), `${REPO}/`, ...Object.keys(FILES), ...(all ? [".secrets"] : [])];
        out(
          <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-x-4">
            {items.map((i) => (
              <span key={i} style={{ color: i.endsWith("/") ? "var(--fg)" : undefined }}>
                {i}
              </span>
            ))}
          </div>,
        );
        break;
      }
      case "cd": {
        const into = resolvePath(dir ?? "", args[0] ?? "~");
        if (into !== null && inRepo(into)) {
          void inRepoDo("cd: couldn't load the source", (snap) => {
            const k = kind(snap, into);
            if (k === "dir") setDir(into);
            else if (k === "file") out(`cd: not a directory: ${args[0]}`);
            else out(`cd: no such file or directory: ${args[0]}`);
          });
          break;
        }
        // climbing out of the source lands back home, or in a workspace folder: cd ../projects
        const target = into !== null && (into === "" || into in DIRS) ? into : a0.replace(/\/$/, "").replace(/^~\//, "");
        if (!target || target === "~" || target === "..") {
          setDir(null);
          actions.jump(0);
        } else if (target === ".secrets") {
          out("cd: not a directory: .secrets");
        } else if (target in DIRS) {
          setDir(target);
          // leave the terminal so typing doesn't scroll back to it
          input.current?.blur();
          actions.jump(DIRS[target]);
        } else out(`cd: no such file or directory: ${args[0]}`);
        break;
      }
      case "cat": {
        const at = resolvePath(dir ?? "", args[0] ?? "");
        if (at !== null && inRepo(at)) {
          void inRepoDo("cat: couldn't load the source", (snap) => {
            const k = kind(snap, at);
            if (k === "dir") return out(`cat: ${args[0]}: is a directory`);
            const txt = k === "file" ? readRepo(snap, at) : undefined;
            if (txt === undefined) return out(`cat: ${args[0]}: no such file`);
            out(<pre className="t-code overflow-x-auto whitespace-pre">{txt.replace(/\n$/, "")}</pre>);
          });
          break;
        }
        if (!args[0]) {
          out("usage: cat <file>");
          break;
        }
        const f = a0.replace(/^~\//, "");
        if (f === ".secrets") {
          out(<SecretsFile />);
          break;
        }
        const src = FILES[f];
        if (src) out(...src().map((t, i) => <span key={i}>{t}</span>));
        else out(`cat: ${args[0] ?? ""}: no such file`);
        break;
      }
      case "pwd":
        out(`/home/${site.handle}${dir ? "/" + dir : ""}`);
        break;
      case "tree": {
        const at = resolvePath(dir ?? "", args.find((x) => !x.startsWith("-")) ?? ".");
        if (at === null || !inRepo(at)) {
          out(inRepo(at ?? "") ? "" : `tree: try it inside the source: tree ${REPO}`);
          break;
        }
        void inRepoDo("tree: couldn't load the source", (snap) => {
          if (kind(snap, at) !== "dir") return out(`tree: ${args[0] ?? at}: not a directory`);
          const rows: string[] = [at === REPO ? REPO : at.split("/").pop()!];
          let nd = 0;
          let nf = 0;
          const walk = (p: string, pre: string) => {
            const es = list(snap, p);
            es.forEach((e, i) => {
              const last = i === es.length - 1;
              rows.push(pre + (last ? "└── " : "├── ") + e.name);
              if (e.dir) {
                nd++;
                walk(`${p}/${e.name}`, pre + (last ? "    " : "│   "));
              } else nf++;
            });
          };
          walk(at, "");
          rows.push("", `${nd} director${nd === 1 ? "y" : "ies"}, ${nf} file${nf === 1 ? "" : "s"}`);
          out(<pre className="t-code whitespace-pre">{rows.join("\n")}</pre>);
        });
        break;
      }
      case "grep": {
        // grep [-i] [-r] [-n] pattern [path]: searches the source
        const flags = args.filter((x) => x.startsWith("-")).join("");
        const rest = args.filter((x) => !x.startsWith("-"));
        const pat = rest[0]?.replace(/^["']|["']$/g, "");
        if (!pat) {
          out("usage: grep [-i] pattern [path]   (searches the site's source)");
          break;
        }
        const at = resolvePath(dir ?? "", rest[1] ?? (inRepo(dir ?? "") ? "." : REPO));
        if (at === null || !inRepo(at)) {
          out(`grep: ${rest[1]}: only the source is searchable: grep ${pat} ${REPO}`);
          break;
        }
        void inRepoDo("grep: couldn't load the source", (snap) => {
          let re: RegExp;
          try {
            re = new RegExp(pat, flags.includes("i") ? "i" : "");
          } catch {
            re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags.includes("i") ? "i" : "");
          }
          const files = kind(snap, at) === "file" ? [at.slice(REPO.length + 1)] : filesUnder(snap, at);
          const base = inRepo(dir ?? "") ? (dir as string).slice(REPO.length + 1) : null;
          const hits: ReactNode[] = [];
          let total = 0;
          for (const f of files) {
            snap.files[f].split("\n").forEach((ln, i) => {
              if (!re.test(ln)) return;
              total++;
              if (hits.length >= 60) return;
              const shown = base !== null && f.startsWith(base ? base + "/" : "") ? f.slice(base ? base.length + 1 : 0) : `${REPO}/${f}`;
              hits.push(
                <span key={`${f}:${i}`} className="block truncate">
                  <span style={{ color: "var(--fg)" }}>{shown}</span>
                  <span style={{ color: "var(--faint)" }}>:{i + 1}:</span> {ln.trim().slice(0, 160)}
                </span>,
              );
            });
          }
          if (!total) return out(`no matches for "${pat}"`);
          out(...hits);
          if (total > hits.length) out(<span style={{ color: "var(--faint)" }}>…and {total - hits.length} more</span>);
        });
        break;
      }
      case "projects":
        out(
          ...site.projects.map((p) => (
            <span key={p.slug}>
              <span className="t-cmd inline-block w-[130px]">{p.slug}</span>
              {p.line}
            </span>
          )),
          "open one with: open <name>",
        );
        break;
      case "open": {
        const p = site.projects.find((x) => x.slug === a0 || x.title === args.join(" ").toLowerCase());
        if (p) {
          input.current?.blur();
          actions.jump(1);
          window.setTimeout(() => actions.openProject(p.slug), 500);
          out(`opening ${p.title}...`);
        } else out(`open: no project called "${args.join(" ")}". try: projects`);
        break;
      }
      case "theme": {
        if (!a0 || a0 === "list") {
          out(`current: ${actions.themeId}`, THEMES.map((t) => t.id).join("  "));
          break;
        }
        const t = THEMES.find((x) => x.id === a0 || x.name === args.join(" ").toLowerCase());
        if (t) {
          actions.setTheme(t.id);
          out(`theme set to ${t.name}. it lasts for this visit.`);
        } else out(`theme: unknown theme "${args.join(" ")}". try: theme list`);
        break;
      }
      case "bg":
      case "wallpaper": {
        if (!a0) {
          actions.openPicker();
          break;
        }
        if (a0 === "list") {
          out(`current: ${actions.bg}`, BACKGROUNDS.map((b) => b.id).join("  "));
          break;
        }
        const b = BACKGROUNDS.find((x) => x.id === a0);
        if (b) {
          actions.setBg(b.id);
          out(`background set to ${b.name}. ${b.how}.`);
        } else out(`bg: unknown style "${a0}". try: bg list`);
        break;
      }
      case "music": {
        const pl = actions.player;
        if (a0 === "play" || a0 === "pause") {
          if (pl.playing !== (a0 === "play")) pl.toggle();
          out(a0 === "play" ? `playing ${pl.title}` : "paused");
        } else if (a0 === "mute" || a0 === "unmute") {
          pl.setMuted(a0 === "mute");
          out(a0 === "mute" ? "muted" : "unmuted");
        } else if (a0 === "vol" && args[1]) {
          const v = Math.max(0, Math.min(100, Number(args[1]) || 0));
          pl.setVolume(v / 100);
          out(`volume ${v}%`);
        } else if (a0 === "next" || a0 === "skip") {
          pl.next();
          out("next song");
        } else if (a0 === "list") {
          out(
            ...pl.playlist.map((t, i) => (
              <span key={t.src} style={{ color: i === pl.index ? "var(--fg)" : undefined }}>
                {i === pl.index ? "> " : "  "}
                {t.title} · {t.artist}
              </span>
            )),
          );
        } else if (!a0) {
          out("opening music...");
          openApp("music");
          input.current?.blur();
        } else out(`${pl.playing ? "playing" : "paused"}: ${pl.title} · ${pl.artist}`, "usage: music play | pause | next | list | mute | unmute | vol 0-100");
        break;
      }
      case "settings":
        actions.openSettings();
        break;
      case "github":
        if (site.github) {
          window.open(`https://github.com/${site.github}`, "_blank", "noopener");
          out(`github.com/${site.github}`);
        } else out("github isn't linked yet.");
        break;
      case "soundcloud":
      case "linkedin": {
        const li = site.contact.links.find((l) => l.label === c)?.href;
        if (li && li !== "#") {
          window.open(li, "_blank", "noopener");
          out(li.replace(/^https?:\/\/(www\.)?/, ""));
        } else out(`${c} isn't linked yet.`);
        break;
      }
      case "shortcuts":
      case "keys": {
        const mac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
        out(
          <div className="grid grid-cols-[auto_1fr] gap-x-4">
            {keybinds(mac).map(([k, v]) => (
              <div key={k} className="contents">
                <span className="t-cmd whitespace-nowrap">{k}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>,
          <span>background: {BACKGROUNDS.find((b) => b.id === actions.bg)?.how}</span>,
        );
        break;
      }
      case "credits":
        out(...site.credits.map((c) => <span key={c.href}>{c.label}: {c.href}</span>), "design and build: Parth Awana");
        break;
      case "clear":
        setLines([]);
        break;
      case "reset": {
        out(<span style={{ color: "var(--fg)" }}>restoring defaults...</span>);
        const steps = actions.resetAll();
        const bar = (k: number) => `[${"#".repeat(k)}${"-".repeat(16 - k)}]`;
        for (let k = 1; k <= 4; k++) later(k * 110, () => setLines((l) => [...l.slice(0, -1), { id: idRef.current++, node: <span className="mono">{bar(k * 4)} {k * 25}%</span> }]));
        later(0, () => push(<span className="mono">{bar(0)} 0%</span>));
        steps.forEach((st, i) => later(520 + i * 120, () => push(<span>  <span style={{ color: "var(--fg)" }}>✓</span> {st}</span>)));
        later(620 + steps.length * 120, () => push(<span style={{ color: "var(--fg)" }}>done.</span>));
        later(1300 + steps.length * 120, () => {
          setDir(null);
          setHist([]);
          setLines([]);
          welcome(true);
        });
        break;
      }
      case "reboot":
        out("rebooting...");
        window.setTimeout(actions.reboot, 400);
        break;
      case "code":
      case "vscode": {
        // code <file>: relative to where you are in the source, or a path from the repo root
        let f = args[0];
        if (f) {
          const at = resolvePath(dir ?? "", f);
          if (at && inRepo(at)) f = at.slice(REPO.length + 1);
          else f = f.replace(/^~\/?(parth-os\/)?/, "");
          if (f === ".config/parth-os/config" || f === "config") f = ".config/parth-os/config";
        }
        out(f ? `opening ${f} in code...` : "opening code...");
        openApp("code", f || undefined);
        input.current?.blur();
        break;
      }
      case "notes":
        out("opening notes...");
        openApp("notes", args[0]);
        input.current?.blur();
        break;
      case "files":
      case "yazi":
      case "ranger":
      case "nautilus":
        out("opening files...");
        openApp("files", inRepo(dir ?? "") ? (dir as string) : undefined);
        input.current?.blur();
        break;
      case "dmesg":
      case "journalctl": {
        // the boot log, the real way: dmesg shows the kernel's lines, journalctl -b the whole boot
        const all = BOOT_LINES.map(([l]) => l.replace("{wallpaper}", WALLPAPER_SERVICE[actions.bg] ?? actions.bg));
        const lines = c === "dmesg" ? all.filter((l) => l.startsWith("[ ")) : all;
        out(
          <pre className="t-code whitespace-pre-wrap">
            {lines.map((l) => (l.startsWith("[ ok ]") ? `[  OK  ]${l.slice(6)}` : l)).join("\n")}
          </pre>,
        );
        break;
      }
      case "btop":
      case "htop":
      case "top":
        out("opening btop...");
        openApp("btop");
        input.current?.blur();
        break;
      case "nsxiv":
      case "imv":
      case "feh": {
        const at = (args[0] ?? "pictures").replace(/^~\/?/, "").replace(/\/$/, "");
        if (!at.startsWith("pictures")) {
          out(`${c}: ${args[0]}: no such file or directory`);
          break;
        }
        out(`opening ~/${at}...`);
        openApp("images", at);
        input.current?.blur();
        break;
      }
      case "shutdown":
      case "poweroff":
        out("powering off...");
        window.setTimeout(actions.shutdown, 400);
        break;
      case "logout":
      case "exit":
        out("logging out...");
        window.setTimeout(actions.logout, 400);
        break;
      case "screensaver":
      case "saver":
        out("starting screensaver... move the mouse or press a key to come back.");
        input.current?.blur();
        window.setTimeout(actions.screensaver, 700);
        break;
      case "date":
        out(linuxDate(site.timezone));
        break;
      case "echo":
        out(args.join(" "));
        break;
      case "history":
        out(...[...hist, line].map((h, i) => <span key={i}>{String(i + 1).padStart(3)}  {h}</span>));
        break;
      case "sudo": {
        const rest = args.join(" ");
        const m = /^rm((?:\s+-[a-z]+|\s+--no-preserve-root)+)\s+(\/\*?)$/.exec(rest);
        const flags = m ? m[1] : "";
        const recursive = /\s-[a-z]*r/.test(flags) && /\s-[a-z]*f/.test(flags);
        if (m && recursive) {
          // like GNU rm: `rm -rf /` is refused unless you insist. (`/*` gets expanded by the shell
          // first, so the failsafe never sees it.)
          if (m[2] === "/" && !flags.includes("--no-preserve-root")) {
            out("rm: it is dangerous to operate recursively on '/'", "rm: use --no-preserve-root to override this failsafe");
            break;
          }
          input.current?.blur();
          const verbose = /\s-[a-z]*v/.test(flags);
          let at = 0;
          if (verbose) {
            // -v prints every file it deletes: thousands of lines, far too fast to read
            const dirs = ["/bin", "/boot", "/etc", "/home/parth", "/lib", "/opt", "/usr/bin", "/usr/lib", "/usr/share", "/var/log"];
            const names = ["ls", "zsh", "systemd", "libc.so.6", "fonts", "sharks.dat", "resume.pdf", "projects", "Xorg", "pipewire", "grub.cfg", "passwd", "hosts", "init", "kitty", "hyprland.conf"];
            for (let k = 0; k < 24; k++)
              later(k * 40, () => push(...Array.from({ length: 12 }, (_, i) => <span key={i}>removed &apos;{dirs[(k * 12 + i) % dirs.length]}/{names[((k * 12 + i) * 7) % names.length]}&apos;</span>)));
            at = 24 * 40;
          } else {
            // without -v, rm says nothing while it works. you only see it when things start failing.
            at = 1600;
          }
          const fails = ["/proc/1/fd", "/proc/1/ns", "/proc/sys/kernel", "/sys/firmware/efi", "/sys/kernel/debug", "/run/user/1000/gvfs", "/dev/pts/0"];
          fails.forEach((f, i) => later(at + i * 35, () => push(<span>rm: cannot remove &apos;{f}&apos;: {f.startsWith("/sys") ? "Read-only file system" : f.startsWith("/run") ? "Device or resource busy" : "Operation not permitted"}</span>)));
          later(at + fails.length * 35 + 200, () => push(<span>zsh: /usr/bin/ls: No such file or directory</span>));
          later(at + fails.length * 35 + 500, actions.meltdown);
        } else if (/^rm\b/.test(rest)) out("rm: missing operand, or not much worth deleting there.");
        else out(`${site.name} is not in the sudoers file. this incident will be reported.`);
        break;
      }
      case "rm":
        out(args.some((x) => x.startsWith("/")) ? `rm: cannot remove '${args.find((x) => x.startsWith("/"))}': Permission denied` : "rm: nothing here you're allowed to delete.");
        break;
      default:
        out(`zsh: command not found: ${c}`);
    }
  };

  return (
    <div className="term mono flex h-full min-h-0 flex-col text-[12.5px]" style={{ color: "var(--muted)" }} onClick={() => input.current?.focus({ preventScroll: true })}>
      <div ref={scroller} className="term-scroll min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {lines.map((l) => (
          <div key={l.id} className="break-words whitespace-pre-wrap">
            {l.node}
          </div>
        ))}
      </div>
      <div className="relative mt-1 flex items-center gap-2">
        <span style={{ color: "var(--faint)" }}>{wishing ? "✦ wish" : pathFor(dir)}</span>
        <span style={{ color: "var(--fg)" }}>❯</span>
        <div className="relative min-w-0 flex-1">
          {/* what you type, highlighted, with the faded suggestion after it */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre" aria-hidden="true">
            <span style={{ color: known || wishing ? "var(--fg)" : "var(--faint)", fontWeight: known && !wishing ? 600 : 400 }}>{cmd}</span>
            <span style={{ color: "var(--fg)" }}>{value.slice(cmd.length)}</span>
            <span style={{ color: "var(--faint)" }}>{wishing ? "" : suggestion}</span>
          </div>
          <input
            ref={input}
            id="term-input"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setHIdx(-1);
            }}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            aria-label="terminal input"
            className="relative w-full bg-transparent outline-none"
            style={{ color: "transparent", caretColor: "var(--fg)" }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (wishing) makeWish(value);
                else run(value);
                setValue("");
                setHIdx(-1);
              } else if (e.key === "Tab") {
                e.preventDefault();
                const c = candidates(value);
                if (c.length === 1) setValue(c[0] + " ");
                else if (c.length > 1) {
                  // complete the shared prefix, then list the options
                  let pre = c[0];
                  for (const x of c) while (!x.startsWith(pre)) pre = pre.slice(0, -1);
                  if (pre.length > value.length) setValue(pre);
                  else push(<span>{c.map((x) => x.split(" ").pop()).join("   ")}</span>);
                }
              } else if (e.key === "ArrowRight" && suggestion && input.current?.selectionStart === value.length) {
                e.preventDefault();
                setValue(value + suggestion);
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                if (!hist.length) return;
                const i = hIdx < 0 ? hist.length - 1 : Math.max(0, hIdx - 1);
                setHIdx(i);
                setValue(hist[i]);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                if (hIdx < 0) return;
                const i = hIdx + 1;
                if (i >= hist.length) {
                  setHIdx(-1);
                  setValue("");
                } else {
                  setHIdx(i);
                  setValue(hist[i]);
                }
              } else if (e.ctrlKey && e.key.toLowerCase() === "l") {
                e.preventDefault();
                setLines([]);
              } else if (e.ctrlKey && e.key.toLowerCase() === "c") {
                if (input.current && input.current.selectionStart !== input.current.selectionEnd) return;
                e.preventDefault();
                push(
                  <span>
                    <span style={{ color: "var(--faint)" }}>{pathFor(dir)}</span> ❯ {value}^C
                  </span>,
                );
                setValue("");
              } else if (e.key === "Escape") {
                input.current?.blur();
              }
              e.stopPropagation();
            }}
          />
        </div>
      </div>
    </div>
  );
}
