"use client";
/**
 * files: yazi, the terminal file manager on most hyprland rices. Three columns (parent, current,
 * preview), hjkl or arrows to move, enter or l to open, backspace or h to go up, "." for hidden files,
 * q to quit. Folders and file types in colour, syntax-coloured previews, yazi's status line.
 * Opening a file hands it to the right app: source to code, notes to notes, songs to music.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { site } from "@/content/site";
import { NOTES } from "@/content/notes";
import { HOME_FILES } from "@/lib/homefiles";
import { openApp } from "@/lib/apps";
import { loadRepo, repoNow } from "@/lib/repo";
import { CONFIG_PATH } from "../code/config";
import { SYNTAX } from "../code/palettes";

/** nerd-font-style icons, one per file type, coloured like yazi's defaults */
const ICONS: Record<string, [string, React.ReactNode]> = {
  dir: ["var(--accent)", <path key="d" d="M3 6.5A1.5 1.5 0 0 1 4.5 5h5l2 2.2h8A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" fill="currentColor" />],
  ts: ["#519aba", <g key="t"><rect x="3" y="3" width="18" height="18" rx="2.5" fill="currentColor" /><path d="M7 10h6M10 10v7M18.5 10.6c-.4-.5-1-.8-1.7-.8-1 0-1.7.6-1.7 1.4 0 1.9 3.6 1.1 3.6 3.3 0 .9-.8 1.6-1.9 1.6-.8 0-1.5-.4-1.9-1" stroke="#0b0b0f" strokeWidth="1.6" fill="none" strokeLinecap="round" /></g>],
  tsx: ["#519aba", <g key="x" fill="none" stroke="currentColor" strokeWidth="1.5"><ellipse cx="12" cy="12" rx="9.5" ry="3.8" /><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(120 12 12)" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /></g>],
  json: ["#cbcb41", <path key="j" d="M8 4c-2 0-2 1.5-2 3s0 3-2 5c2 2 2 3.5 2 5s0 3 2 3M16 4c2 0 2 1.5 2 3s0 3 2 5c-2 2-2 3.5-2 5s0 3-2 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />],
  md: ["#a6a6a6", <g key="m" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="M6 15V9l2.5 3L11 9v6M15.5 9v6m-2-2 2 2 2-2" /></g>],
  css: ["#519aba", <path key="c" d="M5 3h14l-1.4 15.5L12 21l-5.6-2.5zM8 7.5h8l-.4 4.5H9.2l.2 2.2 2.6.9 2.6-.9.1-1.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />],
  js: ["#cbcb41", <g key="s"><rect x="3" y="3" width="18" height="18" rx="2.5" fill="currentColor" /><path d="M11 10v5.5c0 1-.6 1.5-1.5 1.5S8 16.6 8 16M18 10.6c-.4-.5-1-.8-1.7-.8-1 0-1.7.6-1.7 1.4 0 1.9 3.6 1.1 3.6 3.3 0 .9-.8 1.6-1.9 1.6-.8 0-1.5-.4-1.9-1" stroke="#0b0b0f" strokeWidth="1.5" fill="none" strokeLinecap="round" /></g>],
  mus: ["#e0af68", <path key="u" d="M9 17.5a2.5 2.5 0 1 1-2.5-2.5c.4 0 .7 0 1 .2V5.5L19 3v11.5a2.5 2.5 0 1 1-2.5-2.5c.4 0 .7 0 1 .2V6.8L9 8.4z" fill="currentColor" />],
  pdf: ["#f7768e", <g key="p" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M8.5 16h7" /></g>],
  txt: ["var(--muted)", <g key="txt" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h4" /></g>],
  cfg: ["var(--faint)", <g key="g" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></g>],
  img: ["#bb9af7", <g key="im" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" fill="currentColor" /><path d="m4 18 5-5 4 4 3-3 4 4" /></g>],
  link: ["#7dcfff", <path key="l" d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />],
};
function typeOf(e: Entry) {
  if (e.dir) return "dir";
  const ext = e.name.includes(".") ? e.name.split(".").pop()! : "";
  return ({ ts: "ts", tsx: "tsx", json: "json", md: "md", css: "css", mjs: "js", js: "js", mp3: "mus", pdf: "pdf", txt: "txt", url: "link", jpg: "img", jpeg: "img", png: "img", webp: "img", gif: "img" } as Record<string, string>)[ext] ?? "cfg";
}
function Icon({ e }: { e: Entry }) {
  const [color, body] = ICONS[typeOf(e)];
  return (
    <span className="yz-i" style={{ color }}>
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden>
        {body}
      </svg>
    </span>
  );
}

/** a light syntax colouring for previews, in the theme's editor colours */
function Highlight({ text, theme }: { text: string; theme: string }) {
  const y = SYNTAX[theme] ?? SYNTAX.monochrome;
  const KW = /\b(import|from|export|default|const|let|var|function|return|if|else|for|of|in|new|class|type|interface|private|this|true|false|null|async|await)\b/;
  return (
    <>
      {text.split("\n").map((ln, i) => {
        if (/^\s*(\/\/|\*|\/\*|#)/.test(ln))
          return (
            <span key={i} style={{ color: y.com, fontStyle: "italic" }}>
              {ln}
              {"\n"}
            </span>
          );
        const parts = ln.split(/("[^"]*"|'[^']*'|`[^`]*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b)/);
        return (
          <span key={i}>
            {parts.map((p, k) =>
              /^["'`]/.test(p) ? (
                <span key={k} style={{ color: y.str }}>
                  {p}
                </span>
              ) : /^\d/.test(p) ? (
                <span key={k} style={{ color: y.num }}>
                  {p}
                </span>
              ) : KW.test(p) && /^[a-z]+$/.test(p) ? (
                <span key={k} style={{ color: y.kw }}>
                  {p}
                </span>
              ) : /^[A-Z][\w$]*$/.test(p) ? (
                <span key={k} style={{ color: y.type }}>
                  {p}
                </span>
              ) : (
                p
              ),
            )}
            {"\n"}
          </span>
        );
      })}
    </>
  );
}

type Entry = { name: string; dir: boolean; size?: number; image?: string; preview?: () => string; open?: () => void };

const kb = (n: number) => (n < 1024 ? `${n}B` : n < 1048576 ? `${(n / 1024).toFixed(1)}K` : `${(n / 1048576).toFixed(1)}M`);
const say = (text: string) => window.dispatchEvent(new CustomEvent("site-toast", { detail: { text, ms: 2600, app: "yazi" } }));
const jump = (i: number) => window.dispatchEvent(new CustomEvent("parth-os:jump", { detail: i }));

/** what's in a folder, by path from ~ ("" is home) */
function list(path: string, hidden: boolean): Entry[] | null {
  const txt = (name: string, lines: () => string[], ws?: number): Entry => ({
    name,
    dir: false,
    size: lines().join("\n").length,
    preview: () => lines().join("\n"),
    open: ws === undefined ? undefined : () => jump(ws),
  });
  const parts = path ? path.split("/") : [];
  if (!parts.length) {
    const out: Entry[] = [
      { name: "about", dir: true },
      { name: "activity", dir: true },
      { name: "contact", dir: true },
      { name: "music", dir: true },
      { name: "notes", dir: true },
      { name: "parth-os", dir: true },
      { name: "pictures", dir: true },
      { name: "projects", dir: true },
      ...Object.entries(HOME_FILES).map(([n, f]) => txt(n, f)),
      { name: "resume.pdf", dir: false, size: 68000, preview: () => "resume (pdf, phone and address removed)\n\nenter opens it in a new tab.", open: () => window.open(site.contact.resume, "_blank") },
    ];
    if (hidden)
      out.unshift(
        { name: ".config", dir: true },
        { name: ".secrets", dir: false, size: 512, preview: () => "this one only opens in the terminal.\n\ntry: cat .secrets", open: () => say("try: cat .secrets in the terminal") },
      );
    return out;
  }
  const [top, ...rest] = parts;
  if (top === "projects" && !rest.length)
    return site.projects.map((p) => ({
      name: `${p.slug}.md`,
      dir: false,
      size: p.caseStudy.join("\n").length,
      preview: () => [p.title, p.line, "", `role: ${p.role}`, `stack: ${p.stack}`, `status: ${p.status}${p.year ? ` · ${p.year}` : ""}`, "", ...p.caseStudy].join("\n"),
      open: () => window.dispatchEvent(new CustomEvent("parth-os:project", { detail: p.slug })),
    }));
  if (top === "about" && !rest.length) return [txt("about.txt", HOME_FILES["about.txt"], 2), txt("interests.txt", HOME_FILES["interests.txt"], 2)];
  if (top === "contact" && !rest.length) return [txt("contact.txt", HOME_FILES["contact.txt"], 4)];
  if (top === "activity" && !rest.length)
    return [
      {
        name: "trading-game",
        dir: false,
        size: 4096,
        preview: () => "paper trading on live hyperliquid prices.\nbtc, eth and sol · spot or perps up to 10x.\n\nenter opens the activity workspace.",
        open: () => jump(3),
      },
    ];
  if (top === "music" && !rest.length)
    return [
      ...site.music.tracks.map((t, i) => ({
        name: `${t.title.replace(/\s+/g, "-")}.mp3`,
        dir: false,
        size: 3_400_000 + i * 410_000,
        preview: () => `${t.title}\n${t.artist}\n\nenter plays it in music.`,
        open: () => openApp("music", `radio/${i}`),
      })),
      { name: "soundcloud.url", dir: false, size: 48, preview: () => "parth's tracks and likes on soundcloud.\n\nenter opens them in music.", open: () => openApp("music", "soundcloud") },
    ];
  if (top === "pictures") {
    if (!rest.length) return Object.keys(site.pictures).map((f) => ({ name: f, dir: true }));
    const pics = site.pictures[rest[0]];
    if (pics && rest.length === 1)
      return pics.map((p, i) => ({
        name: p.src.split("/").pop() ?? p.src,
        dir: false,
        size: 240_000 + i * 37_000,
        image: p.src,
        preview: () => p.caption ?? "",
        open: () => openApp("images", `pictures/${rest[0]}/${i}`),
      }));
  }
  if (top === "notes" && !rest.length)
    return NOTES.map((n) => ({ name: `${n.slug}.md`, dir: false, size: n.body.length, preview: () => n.body.trim(), open: () => openApp("notes", n.slug) }));
  if (top === ".config") {
    if (!rest.length) return [{ name: "parth-os", dir: true }];
    if (rest.join("/") === "parth-os")
      return [{ name: "config", dir: false, size: 420, preview: () => "your settings for this visit, as a file.\nopen it in code, change something, save: it applies.", open: () => openApp("code", CONFIG_PATH) }];
  }
  if (top === "parth-os") {
    const snap = repoNow();
    if (!snap) return null; // still loading
    const pre = rest.length ? rest.join("/") + "/" : "";
    const dirs = new Set<string>();
    const files: Entry[] = [];
    for (const [f, t] of Object.entries(snap.files)) {
      if (!f.startsWith(pre)) continue;
      const r = f.slice(pre.length);
      const k = r.indexOf("/");
      if (k >= 0) dirs.add(r.slice(0, k));
      else if (hidden || !r.startsWith(".")) files.push({ name: r, dir: false, size: t.length, preview: () => t, open: () => openApp("code", f) });
    }
    return [...[...dirs].sort().map((name) => ({ name, dir: true })), ...files.sort((a, b) => a.name.localeCompare(b.name))];
  }
  return [];
}

export default function Files({ start, onRoute, theme = "monochrome", onQuit }: { start?: string; onRoute: (r?: string) => void; theme?: string; onQuit?: () => void }) {
  const [path, setPath] = useState(start && list(start, true) ? start : "");
  const [sel, setSel] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [, bump] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (path.startsWith("parth-os") && !repoNow()) loadRepo().then(() => bump((n) => n + 1));
  }, [path]);
  useEffect(() => onRoute(path || undefined), [path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => root.current?.focus({ preventScroll: true }), []);

  const entries = list(path, hidden);
  const parent = path ? path.split("/").slice(0, -1).join("/") : null;
  const parentEntries = parent !== null ? list(parent, hidden) : null;
  const cur = entries?.[Math.min(sel, (entries?.length ?? 1) - 1)];
  const childPath = cur?.dir ? (path ? `${path}/${cur.name}` : cur.name) : null;
  const childEntries = childPath ? list(childPath, hidden) : null;

  const enter = useCallback(
    (e?: Entry) => {
      const it = e ?? cur;
      if (!it) return;
      if (it.dir) {
        setPath(path ? `${path}/${it.name}` : it.name);
        setSel(0);
      } else it.open?.();
    },
    [cur, path],
  );
  const up = useCallback(() => {
    if (parent === null) return;
    const name = path.split("/").pop()!;
    const back = list(parent, hidden);
    setPath(parent);
    setSel(Math.max(0, back?.findIndex((x) => x.name === name) ?? 0));
  }, [parent, path, hidden]);

  const onKey = (e: React.KeyboardEvent) => {
    const n = entries?.length ?? 0;
    const k = e.key;
    if (k === "ArrowDown" || k === "j") setSel((s) => Math.min(n - 1, s + 1));
    else if (k === "ArrowUp" || k === "k") setSel((s) => Math.max(0, s - 1));
    else if (k === "ArrowRight" || k === "l" || k === "Enter") enter();
    else if (k === "ArrowLeft" || k === "h" || k === "Backspace") up();
    else if (k === "g") setSel(0);
    else if (k === "G") setSel(n - 1);
    else if (k === ".") setHidden((h) => !h);
    else if (k === "q") onQuit?.();
    else return;
    e.preventDefault();
  };

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  }, [sel, path]);

  const preview = useMemo(() => {
    if (!cur) return null;
    if (cur.dir) return null;
    const t = cur.preview?.() ?? "";
    return t.length > 4000 ? t.slice(0, 4000) + "\n…" : t;
  }, [cur]);

  const d = !!cur?.dir;
  const perm = (d ? "drwxr-xr-x" : "-rw-r--r--").split("");
  const code = cur && !cur.dir && /\.(tsx?|m?js|json|css)$/.test(cur.name);
  return (
    <div className="files yz" ref={root} tabIndex={0} onKeyDown={onKey} aria-label="yazi file manager">
      <div className="yz-head">
        <span className="yz-path">
          <span className="yz-dir">~{path ? `/${path}` : ""}/</span>
          <span className="yz-file">{cur?.name ?? ""}</span>
        </span>
        <span className="yz-tabs">
          <span className="on">1</span>
        </span>
      </div>
      <div className="files-cols">
        <Col entries={parentEntries} active={parent !== null ? path.split("/").pop() : undefined} className="files-parent" onPick={() => up()} />
        <div className="files-col files-main" ref={listRef}>
          {entries === null && <p className="app-empty">loading…</p>}
          {entries?.map((e, i) => (
            <button
              key={e.name}
              type="button"
              className={`files-row${i === sel ? " on" : ""}${e.dir ? " dir" : ""}`}
              onClick={() => setSel(i)}
              onDoubleClick={() => enter(e)}
            >
              <span className="files-name">
                <Icon e={e} />
                {e.name}
              </span>
              <span className="files-size">{e.dir ? (list(path ? `${path}/${e.name}` : e.name, hidden)?.length ?? "…") : kb(e.size ?? 0)}</span>
            </button>
          ))}
          {entries?.length === 0 && <p className="app-empty">empty</p>}
        </div>
        <div className="files-col files-preview">
          {cur?.dir && <Col entries={childEntries} bare />}
          {cur?.image && <img className="yz-img" src={cur.image} alt="" />}
          {preview !== null && !cur?.image && <pre className={code ? "yz-code" : undefined}>{code ? <Highlight text={preview} theme={theme} /> : preview}</pre>}
        </div>
      </div>
      <div className="yz-status">
        <span className="yz-l">
          <span className="yz-mode">NOR</span>
          <span className="yz-chip">{cur ? (d ? `${childEntries?.length ?? 0} items` : kb(cur.size ?? 0)) : ""}</span>
          <span className="yz-perm">
            {perm.map((c, i) => (
              <span key={i} className={c === "d" ? "pd" : c === "r" ? "pr" : c === "w" ? "pw" : c === "x" ? "px" : "pn"}>
                {c}
              </span>
            ))}
          </span>
        </span>
        <span className="yz-r">
          <span className="yz-hint">{hidden ? "hidden shown · " : ""}q quit · . hidden</span>
          <span className="yz-chip">{entries?.length ? Math.round(((Math.min(sel, entries.length - 1) + 1) / entries.length) * 100) : 0}%</span>
          <span className="yz-pos">{entries ? `${Math.min(sel + 1, entries.length)}/${entries.length}` : ""}</span>
        </span>
      </div>
    </div>
  );
}

function Col({ entries, active, className = "", onPick, bare }: { entries: Entry[] | null; active?: string; className?: string; onPick?: () => void; bare?: boolean }) {
  if (bare) {
    return (
      <div className="files-sub">
        {entries === null && <p className="app-empty">loading…</p>}
        {entries?.map((e) => (
          <div key={e.name} className={`files-row static${e.dir ? " dir" : ""}`}>
            <span className="files-name">
              <Icon e={e} />
              {e.name}
            </span>
          </div>
        ))}
        {entries?.length === 0 && <p className="app-empty">empty</p>}
      </div>
    );
  }
  return (
    <div className={`files-col ${className}`}>
      {entries?.map((e) => (
        <button key={e.name} type="button" className={`files-row${e.name === active ? " on dim" : ""}${e.dir ? " dir" : ""}`} onClick={onPick}>
          <span className="files-name">
            <Icon e={e} />
            {e.name}
          </span>
        </button>
      ))}
    </div>
  );
}
