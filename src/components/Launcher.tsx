"use client";
/**
 * The launcher (alt+space, or the search button in the bar), like rofi or wofi on a real rice.
 * Type to find anything: workspaces, apps, projects, files in the source, notes, songs, wallpapers,
 * themes and commands. Matching is by words and word starts, so "bg" or "background" finds the
 * wallpapers and "stock" finds stocktracker, but letters scattered through a name don't count.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { site } from "@/content/site";
import { THEMES } from "@/content/themes";
import { NOTES } from "@/content/notes";
import { BACKGROUNDS } from "@/lib/ascii";
import { openApp } from "@/lib/apps";
import { loadRepo, repoNow } from "@/lib/repo";

export type LaunchActions = {
  jump: (i: number) => void;
  openProject: (slug: string) => void;
  setBg: (id: string) => void;
  setTheme: (id: string) => void;
  openSettings: () => void;
  command: (c: "screensaver" | "reboot" | "logout" | "shutdown" | "reset" | "terminal") => void;
  playRadio: (i: number) => void;
};

type Item = { kind: string; name: string; hint?: string; words?: string; run: () => void };

/** words people use for the same thing */
const SYNONYMS: Record<string, string> = {
  background: "wallpaper",
  backgrounds: "wallpaper",
  bg: "wallpaper",
  wall: "wallpaper",
  colors: "theme",
  colours: "theme",
  color: "theme",
  colour: "theme",
  song: "music",
  songs: "music",
  radio: "music",
  editor: "code",
  vscode: "code",
  source: "code",
  shell: "terminal",
  console: "terminal",
  cv: "resume",
  explorer: "files",
  finder: "files",
  blog: "notes",
  writeup: "notes",
  preferences: "settings",
  config: "settings",
  lock: "logout",
  poweroff: "shutdown",
  restart: "reboot",
};

export function score(item: Item, q: string): number {
  if (!q) return 1;
  const hay = `${item.name} ${item.kind} ${item.words ?? ""}`.toLowerCase();
  const words = hay.split(/[\s/._\-·]+/).filter(Boolean);
  const terms = q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => [t, SYNONYMS[t]].filter(Boolean) as string[]);
  let total = 0;
  for (const alts of terms) {
    let best = 0;
    for (const t of alts) {
      if (item.name.toLowerCase() === t) best = Math.max(best, 100);
      else if (item.name.toLowerCase().startsWith(t)) best = Math.max(best, 80);
      else if (words.some((w) => w === t)) best = Math.max(best, 60);
      else if (words.some((w) => w.startsWith(t))) best = Math.max(best, 45);
      else if (t.length >= 3 && hay.includes(t)) best = Math.max(best, 20);
    }
    if (!best) return 0;
    total += best;
  }
  return total;
}

export default function Launcher({ open, onClose, actions }: { open: boolean; onClose: () => void; actions: LaunchActions }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [ver, bump] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setSel(0);
    window.setTimeout(() => input.current?.focus({ preventScroll: true }), 10);
    // the source files join the results once they've loaded
    if (!repoNow()) loadRepo().then(() => bump((n) => n + 1));
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const a = actions;
    const out: Item[] = [
      ...site.workspaces.map((w, i) => ({ kind: "workspace", name: w.label, hint: `alt ${i + 1}`, words: w.path, run: () => a.jump(i) })),
      { kind: "app", name: "terminal", hint: "alt q", run: () => a.command("terminal") },
      { kind: "app", name: "code", hint: "the site's source", words: "editor vscode", run: () => openApp("code") },
      { kind: "app", name: "notes", hint: "write-ups", run: () => openApp("notes") },
      { kind: "app", name: "files", hint: "yazi", words: "yazi ranger file manager", run: () => openApp("files") },
      { kind: "app", name: "btop", hint: "system monitor", words: "htop top monitor processes", run: () => openApp("btop") },
      { kind: "app", name: "pictures", hint: "nsxiv", words: "photos images nsxiv imv", run: () => openApp("images", "pictures") },
      { kind: "app", name: "music", hint: "soundcloud + radio", words: "soundcloud tidal", run: () => openApp("music") },
      { kind: "app", name: "settings", hint: "ctrl k", run: () => a.openSettings() },
      ...site.projects.map((p) => ({ kind: "project", name: p.title, hint: p.stack, words: `${p.slug} ${p.line}`, run: () => a.openProject(p.slug) })),
      ...BACKGROUNDS.map((b) => ({ kind: "wallpaper", name: b.name, hint: "wallpaper", words: "wallpaper background", run: () => a.setBg(b.id) })),
      ...THEMES.map((t) => ({ kind: "theme", name: t.name, hint: t.mode, words: "theme colors", run: () => a.setTheme(t.id) })),
      ...NOTES.map((n) => ({ kind: "note", name: n.title, hint: "notes", words: "notes", run: () => openApp("notes", n.slug) })),
      ...site.music.tracks.map((t, i) => ({ kind: "music", name: t.title, hint: t.artist, words: "song radio", run: () => a.playRadio(i) })),
      { kind: "music", name: "my soundcloud", hint: "tracks + likes", words: "soundcloud", run: () => openApp("music", "soundcloud") },
      { kind: "command", name: "screensaver", run: () => a.command("screensaver") },
      { kind: "command", name: "reboot", run: () => a.command("reboot") },
      { kind: "command", name: "logout", hint: "lock screen", words: "lock", run: () => a.command("logout") },
      { kind: "command", name: "shutdown", words: "poweroff", run: () => a.command("shutdown") },
      { kind: "command", name: "reset layout", hint: "windows, theme, wallpaper", words: "reset", run: () => a.command("reset") },
      { kind: "file", name: "resume.pdf", hint: "opens in a new tab", words: "resume cv", run: () => window.open(site.contact.resume, "_blank") },
      { kind: "file", name: "config", hint: "~/.config/parth-os", words: "settings config", run: () => openApp("code", ".config/parth-os/config") },
    ];
    const snap = repoNow();
    if (snap) for (const f of Object.keys(snap.files)) out.push({ kind: "file", name: f.split("/").pop()!, hint: f, words: f, run: () => openApp("code", f) });
    return out;
  }, [actions, open, ver]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => {
    const s = q.trim();
    if (!s) return items.filter((i) => i.kind === "workspace" || i.kind === "app");
    return items
      .map((it, i) => [it, score(it, s), i] as const)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || a[2] - b[2])
      .slice(0, 60)
      .map(([it]) => it);
  }, [items, q]);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [sel, shown]);

  if (!open) return null;
  const run = (it?: Item) => {
    if (!it) return;
    onClose();
    window.setTimeout(it.run, 30);
  };
  return (
    <div className="launcher-wrap" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="launcher pop" role="dialog" aria-label="launcher">
        <div className="launcher-in">
          <span aria-hidden>❯</span>
          <input
            ref={input}
            id="launcher-q"
            value={q}
            autoComplete="off"
            spellCheck={false}
            placeholder="search apps, projects, files, themes…"
            aria-label="search"
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
                e.preventDefault();
                setSel((n) => Math.min(shown.length - 1, n + 1));
              } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
                e.preventDefault();
                setSel((n) => Math.max(0, n - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(shown[sel]);
              } else if (e.key === "Escape") onClose();
            }}
          />
        </div>
        <ul ref={list} role="listbox" className="launcher-list">
          {shown.map((it, i) => (
            <li key={`${it.kind}:${it.name}:${it.hint ?? ""}`} role="option" aria-selected={i === sel} onPointerMove={() => setSel(i)} onClick={() => run(it)}>
              <span className="launcher-k">{it.kind}</span>
              <span className="launcher-n">{it.name}</span>
              <span className="launcher-h">{it.hint}</span>
            </li>
          ))}
          {!shown.length && <li className="launcher-empty">nothing called "{q}". try a project, a theme or a file name.</li>}
        </ul>
        <div className="launcher-foot">
          <span>↑↓ move · enter open · esc close</span>
          <span>
            {shown.length} result{shown.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </div>
  );
}
