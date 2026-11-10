"use client";
/**
 * "code": a VS Code window for the site's own source. The editor is Monaco, the editor VS Code is
 * built on, so typing, autocomplete, errors, find, multi-cursor and the command palette are the
 * real thing. Around it: menus, the explorer, search across files, source control with diffs,
 * tabs, a problems panel and the status bar. Edits stay in this browser tab and never change the
 * site, except .config/parth-os/config, which applies its settings when saved.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ThemePreset } from "@/content/themes";
import { addTypes, defineTheme, languageOf, modelFor, monaco, uriOf, type Snapshot } from "./setup";
import { CONFIG_PATH, configText, parseConfig, type SiteConfig } from "./config";
import "./code.css";

type Panel = "explorer" | "search" | "scm" | "extensions";
type Menu = "file" | "edit" | "selection" | "view" | "go" | "terminal" | "help";
type Toast = { text: string; tone?: "ok" | "err" };

const SAVE_KEY = "parth-os:code";
const GIT_KEY = "parth-os:code:git";
type Commit = { hash: string; msg: string; files: string[]; at: number; pushed?: boolean };

export default function CodeApp({
  snapshot,
  theme,
  config,
  onConfig,
  onClose,
  initialFile = "README.md",
  titleProps,
  onRoute,
}: {
  /** drag / double-click handlers from the window around it */
  titleProps?: object;
  /** reports the open file, for shareable links */
  onRoute?: (path?: string) => void;
  snapshot: Snapshot;
  theme: ThemePreset;
  /** the visitor's current settings, written out as the config file */
  config: SiteConfig;
  /** called when the config file is saved without errors */
  onConfig?: (c: SiteConfig) => void;
  onClose?: () => void;
  initialFile?: string;
}) {
  // ── files ─────────────────────────────────────────────────────────────
  const original = useMemo<Record<string, string>>(() => ({ ...snapshot.files, [CONFIG_PATH]: configText(config) }), [snapshot]); // eslint-disable-line react-hooks/exhaustive-deps
  const paths = useMemo(() => Object.keys(original).sort(sortPaths), [original]);
  const saved = useRef<Record<string, string>>({}); // last saved text per file (this tab)
  // a pretend git: "head" is the last committed text per file; commits live in this tab only
  const head = useRef<Record<string, string>>({});
  const [log, setLog] = useState<Commit[]>([]);
  const [msg, setMsg] = useState("");
  const [pushing, setPushing] = useState(false);
  const [, bump] = useState(0);
  const rerender = () => bump((n) => n + 1);

  const [open, setOpen] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [diffOf, setDiffOf] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>("explorer");
  const [bottom, setBottom] = useState<"problems" | "output" | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [quick, setQuick] = useState<null | "files" | "palette">(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [pos, setPos] = useState({ ln: 1, col: 1 });
  const [markers, setMarkers] = useState<monaco.editor.IMarker[]>([]);
  const [minimap, setMinimap] = useState(true);
  const [wrap, setWrap] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["src", "src/lib", "src/lib/ascii", ".config", ".config/parth-os"]));

  const host = useRef<HTMLDivElement>(null);
  const ed = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const diffHost = useRef<HTMLDivElement>(null);
  const diffEd = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const views = useRef(new Map<string, monaco.editor.ICodeEditorViewState | null>());
  const history = useRef<{ back: string[]; fwd: string[] }>({ back: [], fwd: [] });

  const say = useCallback((text: string, tone?: Toast["tone"]) => {
    setToast({ text, tone });
    window.clearTimeout((say as unknown as { t?: number }).t);
    (say as unknown as { t?: number }).t = window.setTimeout(() => setToast(null), 2600);
  }, []);

  // models for every file, restoring this tab's edits
  useEffect(() => {
    let stored: Record<string, string> = {};
    try {
      stored = JSON.parse(sessionStorage.getItem(SAVE_KEY) ?? "{}");
    } catch {}
    addTypes(snapshot);
    try {
      const g = JSON.parse(sessionStorage.getItem(GIT_KEY) ?? "{}");
      head.current = { ...original, ...(g.head ?? {}) };
      setLog(g.log ?? []);
    } catch {
      head.current = { ...original };
    }
    for (const p of paths) {
      const m = modelFor(p, stored[p] ?? original[p]);
      saved.current[p] = m.getValue();
      m.onDidChangeContent(() => rerender());
    }
    // the config file always reflects the current settings when the editor opens
    const cfg = monaco.editor.getModel(uriOf(CONFIG_PATH));
    if (cfg && !stored[CONFIG_PATH]) cfg.setValue(configText(config));
    const sub = monaco.editor.onDidChangeMarkers(() => setMarkers(monaco.editor.getModelMarkers({}).filter((m) => m.severity >= monaco.MarkerSeverity.Warning && !m.resource.path.startsWith("/node_modules") && !m.resource.path.startsWith("/__original__") && m.resource.path !== "/shims.d.ts")));
    return () => sub.dispose();
  }, [paths]); // eslint-disable-line react-hooks/exhaustive-deps

  const text = (p: string) => monaco.editor.getModel(uriOf(p))?.getValue() ?? original[p];
  const isDirty = (p: string) => text(p) !== saved.current[p];
  const headOf = (p: string) => head.current[p] ?? original[p] ?? "";
  const isChanged = (p: string) => (saved.current[p] ?? original[p]) !== headOf(p);
  const changed = paths.filter(isChanged);

  const persist = () => {
    const out: Record<string, string> = {};
    for (const p of paths) if (saved.current[p] !== original[p]) out[p] = saved.current[p];
    const h: Record<string, string> = {};
    for (const p of paths) if (head.current[p] !== undefined && head.current[p] !== original[p]) h[p] = head.current[p];
    try {
      sessionStorage.setItem(SAVE_KEY, JSON.stringify(out));
      sessionStorage.setItem(GIT_KEY, JSON.stringify({ head: h, log: logRef.current }));
    } catch {}
  };
  const logRef = useRef(log);
  logRef.current = log;

  const commit = () => {
    // like vs code with "smart commit": unsaved changes get saved and committed together
    for (const p of open) if (isDirty(p) && p !== CONFIG_PATH) saved.current[p] = text(p);
    const files = paths.filter(isChanged);
    if (!files.length) return say("nothing to commit, working tree clean");
    const m = msg.trim();
    if (!m) return say("enter a commit message first", "err");
    const hash = Array.from({ length: 7 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
    for (const p of files) head.current[p] = saved.current[p];
    const c: Commit = { hash, msg: m, files, at: Date.now() };
    logRef.current = [c, ...logRef.current];
    setLog(logRef.current);
    setMsg("");
    setDiffOf(null);
    persist();
    rerender();
    say(`[main ${hash}] ${m} · ${files.length} file${files.length === 1 ? "" : "s"} changed`, "ok");
  };
  const unpushed = log.filter((c) => !c.pushed).length;
  const push = () => {
    if (!unpushed || pushing) return;
    setPushing(true);
    window.setTimeout(() => {
      logRef.current = logRef.current.map((c) => ({ ...c, pushed: true }));
      setLog(logRef.current);
      setPushing(false);
      persist();
      say(`pushed ${unpushed} commit${unpushed === 1 ? "" : "s"} to origin/main · this tab's copy only, parth's real repo is untouched`, "ok");
    }, 1400);
  };

  // ── the editor ────────────────────────────────────────────────────────
  const themeName = useMemo(() => defineTheme(theme), [theme]);
  useEffect(() => {
    monaco.editor.setTheme(themeName);
  }, [themeName]);

  useEffect(() => {
    if (!host.current) return;
    const e = monaco.editor.create(host.current, {
      model: null,
      theme: themeName,
      automaticLayout: true,
      fontFamily: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      lineHeight: 20,
      fontLigatures: false,
      minimap: { enabled: true, renderCharacters: false, scale: 1 },
      bracketPairColorization: { enabled: true },
      guides: { indentation: true, bracketPairs: false },
      smoothScrolling: true,
      cursorSmoothCaretAnimation: "on",
      cursorBlinking: "smooth",
      renderLineHighlight: "all",
      scrollBeyondLastLine: false,
      stickyScroll: { enabled: true },
      tabSize: 2,
      padding: { top: 6 },
      fixedOverflowWidgets: true,
    });
    ed.current = e;
    e.onDidChangeCursorPosition((ev) => setPos({ ln: ev.position.lineNumber, col: ev.position.column }));
    // the shortcuts people expect from vs code
    e.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
    e.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, () => setQuick("files"));
    e.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => setPanel("search"));
    e.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => setPanel((p) => (p ? null : "explorer")));
    e.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ, () => setBottom((b) => (b ? null : "problems")));
    e.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyW, () => closeRef.current(activeRef.current));
    return () => e.dispose();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ed.current?.updateOptions({ minimap: { enabled: minimap, renderCharacters: false }, wordWrap: wrap ? "on" : "off" });
  }, [minimap, wrap]);

  const activeRef = useRef(active);
  activeRef.current = active;

  const openFile = useCallback(
    (p: string, line?: number, col = 1) => {
      setDiffOf(null);
      setOpen((o) => (o.includes(p) ? o : [...o, p]));
      const e = ed.current;
      if (!e) return;
      const prev = activeRef.current;
      if (prev && prev !== p) {
        views.current.set(prev, e.saveViewState());
        history.current.back.push(prev);
        history.current.fwd = [];
      }
      e.setModel(monaco.editor.getModel(uriOf(p)));
      const v = views.current.get(p);
      if (v) e.restoreViewState(v);
      if (line) {
        e.revealLineInCenter(line);
        e.setPosition({ lineNumber: line, column: col });
      }
      setActive(p);
      // open the folders it lives in
      setExpanded((x) => {
        const n = new Set(x);
        const parts = p.split("/");
        for (let i = 1; i < parts.length; i++) n.add(parts.slice(0, i).join("/"));
        return n;
      });
      window.setTimeout(() => e.focus(), 0);
    },
    [],
  );

  useEffect(() => {
    if (!ed.current) return;
    openFile(paths.includes(initialFile) ? initialFile : paths[0]);
  }, [initialFile]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    onRoute?.(diffOf ?? active ?? undefined);
  }, [active, diffOf]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeFile = (p: string | null) => {
    if (!p) return;
    const left = open.filter((x) => x !== p);
    setOpen(left);
    views.current.delete(p);
    if (diffOf === p) setDiffOf(null);
    if (active === p) {
      const next = left[Math.max(0, open.indexOf(p) - 1)] ?? null;
      if (next) openFile(next);
      else {
        ed.current?.setModel(null);
        setActive(null);
      }
    }
  };
  const closeRef = useRef(closeFile);
  closeRef.current = closeFile;

  // ── saving, and the config file ───────────────────────────────────────
  const save = (p = active) => {
    if (!p) return;
    const t = text(p);
    if (p === CONFIG_PATH) {
      const r = parseConfig(t, config);
      if (!r.ok) {
        say(`config:${r.line}: ${r.error}`, "err");
        return;
      }
      onConfig?.(r.config);
      saved.current[p] = t;
      persist();
      rerender();
      say(r.changes.length ? `applied: ${r.changes.join(", ")}` : "saved · nothing changed", "ok");
      return;
    }
    saved.current[p] = t;
    persist();
    rerender();
    say(`saved ${base(p)} · in this tab only, the real site is unchanged`);
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  const saveAll = () => {
    for (const p of open) if (isDirty(p)) save(p);
  };
  const revert = (p: string) => {
    const m = monaco.editor.getModel(uriOf(p));
    m?.setValue(headOf(p));
    saved.current[p] = headOf(p);
    persist();
    rerender();
    if (diffOf === p) setDiffOf(null);
  };

  // ── diff view for source control ──────────────────────────────────────
  useEffect(() => {
    if (!diffOf || !diffHost.current) return;
    const d = monaco.editor.createDiffEditor(diffHost.current, {
      automaticLayout: true,
      fontFamily: "'Geist Mono', ui-monospace, monospace",
      fontSize: 13,
      renderSideBySide: (diffHost.current.clientWidth || 0) > 720,
      readOnly: false,
      originalEditable: false,
      minimap: { enabled: false },
    });
    const ou = monaco.Uri.parse(`file:///__original__/${diffOf}`);
    const orig = monaco.editor.getModel(ou) ?? monaco.editor.createModel(headOf(diffOf), languageOf(diffOf), ou);
    if (orig.getValue() !== headOf(diffOf)) orig.setValue(headOf(diffOf));
    d.setModel({ original: orig, modified: monaco.editor.getModel(uriOf(diffOf))! });
    diffEd.current = d;
    return () => {
      d.dispose();
      diffEd.current = null;
    };
  }, [diffOf]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── menus ─────────────────────────────────────────────────────────────
  const run = (id: string) => {
    const e = ed.current;
    if (!e) return;
    e.focus();
    e.trigger("menu", id, null);
  };
  const MENUS: Record<Menu, ([string, string, () => void] | null)[]> = {
    file: [
      ["new text file", "", () => newFile()],
      ["go to file…", "ctrl p", () => setQuick("files")],
      null,
      ["save", "ctrl s", () => save()],
      ["save all", "", saveAll],
      ["revert file", "", () => active && revert(active)],
      null,
      ["close editor", "alt w", () => closeFile(active)],
      ["close all editors", "", () => [...open].forEach((p) => closeFile(p))],
      ["close window", "alt c", () => onClose?.()],
    ],
    edit: [
      ["undo", "ctrl z", () => run("undo")],
      ["redo", "ctrl y", () => run("redo")],
      null,
      ["cut", "ctrl x", () => run("editor.action.clipboardCutAction")],
      ["copy", "ctrl c", () => run("editor.action.clipboardCopyAction")],
      ["paste", "ctrl v", () => say("paste with ctrl v (browsers don't let menus read the clipboard)")],
      null,
      ["find", "ctrl f", () => run("actions.find")],
      ["replace", "ctrl h", () => run("editor.action.startFindReplaceAction")],
      ["find in files", "ctrl shift f", () => setPanel("search")],
      null,
      ["toggle line comment", "ctrl /", () => run("editor.action.commentLine")],
      ["format document", "shift alt f", () => run("editor.action.formatDocument")],
    ],
    selection: [
      ["select all", "ctrl a", () => run("editor.action.selectAll")],
      ["expand selection", "shift alt →", () => run("editor.action.smartSelect.expand")],
      ["shrink selection", "shift alt ←", () => run("editor.action.smartSelect.shrink")],
      null,
      ["copy line up", "shift alt ↑", () => run("editor.action.copyLinesUpAction")],
      ["copy line down", "shift alt ↓", () => run("editor.action.copyLinesDownAction")],
      ["move line up", "alt ↑", () => run("editor.action.moveLinesUpAction")],
      ["move line down", "alt ↓", () => run("editor.action.moveLinesDownAction")],
      null,
      ["add cursor above", "ctrl alt ↑", () => run("editor.action.insertCursorAbove")],
      ["add cursor below", "ctrl alt ↓", () => run("editor.action.insertCursorBelow")],
      ["add next occurrence", "ctrl d", () => run("editor.action.addSelectionToNextFindMatch")],
      ["select all occurrences", "ctrl shift l", () => run("editor.action.selectHighlights")],
    ],
    view: [
      ["command palette…", "f1", () => run("editor.action.quickCommand")],
      null,
      ["explorer", "ctrl shift e", () => setPanel("explorer")],
      ["search", "ctrl shift f", () => setPanel("search")],
      ["source control", "ctrl shift g", () => setPanel("scm")],
      ["extensions", "ctrl shift x", () => setPanel("extensions")],
      ["toggle sidebar", "ctrl b", () => setPanel((p) => (p ? null : "explorer"))],
      null,
      ["problems", "ctrl shift m", () => setBottom("problems")],
      ["toggle panel", "ctrl j", () => setBottom((b) => (b ? null : "problems"))],
      null,
      [`${minimap ? "hide" : "show"} minimap`, "", () => setMinimap((m) => !m)],
      [`word wrap ${wrap ? "off" : "on"}`, "alt z", () => setWrap((w) => !w)],
      ["zoom in", "ctrl =", () => run("editor.action.fontZoomIn")],
      ["zoom out", "ctrl -", () => run("editor.action.fontZoomOut")],
      ["reset zoom", "", () => run("editor.action.fontZoomReset")],
      null,
      ["fold all", "", () => run("editor.foldAll")],
      ["unfold all", "", () => run("editor.unfoldAll")],
    ],
    go: [
      ["back", "alt ←", goBack],
      ["forward", "alt →", goFwd],
      null,
      ["go to file…", "ctrl p", () => setQuick("files")],
      ["go to symbol…", "ctrl shift o", () => run("editor.action.quickOutline")],
      ["go to line…", "ctrl g", () => run("editor.action.gotoLine")],
      null,
      ["go to definition", "f12", () => run("editor.action.revealDefinition")],
      ["peek definition", "alt f12", () => run("editor.action.peekDefinition")],
      ["find all references", "shift f12", () => run("editor.action.referenceSearch.trigger")],
      null,
      ["next problem", "f8", () => run("editor.action.marker.next")],
      ["previous problem", "shift f8", () => run("editor.action.marker.prev")],
    ],
    terminal: [
      ["new terminal", "ctrl `", () => setBottom("output")],
      ["run build task", "ctrl shift b", () => buildTask()],
      ["show problems", "", () => setBottom("problems")],
    ],
    help: [
      ["about this editor", "", () => say("this is monaco, the editor inside vs code, running on parth-os")],
      ["keyboard shortcuts", "", () => run("editor.action.quickCommand")],
    ],
  };
  function goBack() {
    const p = history.current.back.pop();
    if (!p) return;
    if (activeRef.current) history.current.fwd.push(activeRef.current);
    const keep = history.current.back.slice();
    openFile(p);
    history.current.back = keep;
  }
  function goFwd() {
    const p = history.current.fwd.pop();
    if (!p) return;
    const fwd = history.current.fwd.slice();
    openFile(p);
    history.current.fwd = fwd;
  }
  const [output, setOutput] = useState<string[]>([]);
  function buildTask() {
    setBottom("output");
    const errs = markers.filter((m) => m.severity === monaco.MarkerSeverity.Error);
    setOutput([
      "> parth-os@1.0.0 build",
      "> next build",
      "",
      errs.length ? `✗ failed to compile: ${errs.length} type error${errs.length === 1 ? "" : "s"}` : "✓ compiled successfully",
      errs.length ? `  ${errs[0].resource.path.slice(1)}:${errs[0].startLineNumber}  ${errs[0].message.split("\n")[0]}` : "  (this is a copy of the source: the real site only rebuilds when parth deploys)",
    ]);
  }
  function newFile() {
    let n = 1;
    while (paths.includes(`untitled-${n}.ts`) || open.includes(`untitled-${n}.ts`)) n++;
    const p = `untitled-${n}.ts`;
    modelFor(p, "");
    saved.current[p] = "";
    openFile(p);
  }

  // close menus and quick-open on outside click / escape
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        setQuick(null);
      }
      // ctrl shift e/g/x/m like vs code
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        const m: Record<string, Panel | "problems"> = { e: "explorer", g: "scm", x: "extensions", m: "problems" };
        const v = m[e.key.toLowerCase()];
        if (v) {
          e.preventDefault();
          if (v === "problems") setBottom("problems");
          else setPanel(v);
        }
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  // ── render ────────────────────────────────────────────────────────────
  const errors = markers.filter((m) => m.severity === monaco.MarkerSeverity.Error).length;
  const warnings = markers.filter((m) => m.severity === monaco.MarkerSeverity.Warning).length;
  const lang = active ? LANG_NAME[languageOf(active)] ?? "plain text" : "";

  return (
    <div className="vsc" onPointerDown={(e) => !(e.target as HTMLElement).closest(".vsc-menus") && setMenu(null)}>
      {/* title bar */}
      <div className="vsc-title" {...titleProps}>
        <nav className="vsc-menus" aria-label="menu">
          {(Object.keys(MENUS) as Menu[]).map((m) => (
            <div key={m} className="vsc-menu">
              <button type="button" className={menu === m ? "on" : ""} onClick={() => setMenu(menu === m ? null : m)} onPointerEnter={() => menu && setMenu(m)}>
                {m}
              </button>
              {menu === m && (
                <div className="vsc-drop" role="menu">
                  {MENUS[m].map((it, i) =>
                    it ? (
                      <button
                        key={it[0]}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenu(null);
                          it[2]();
                        }}
                      >
                        <span>{it[0]}</span>
                        <kbd>{it[1]}</kbd>
                      </button>
                    ) : (
                      <hr key={i} />
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>
        <button type="button" className="vsc-cmd" onClick={() => setQuick("files")}>
          <Icon name="search" /> <span>{active ? `${base(active)} · parth-os` : "parth-os"}</span>
        </button>
        <div className="vsc-title-r">
          <button type="button" className="vsc-x" onClick={onClose} title="close (alt c)" aria-label="close code">
            <Icon name="close" />
          </button>
        </div>
      </div>

      <div className="vsc-main">
        {/* activity bar */}
        <nav className="vsc-act" aria-label="views">
          {(["explorer", "search", "scm", "extensions"] as Panel[]).map((p) => (
            <button key={p} type="button" className={panel === p ? "on" : ""} title={PANEL_NAME[p]} aria-label={PANEL_NAME[p]} onClick={() => setPanel(panel === p ? null : p)}>
              <Icon name={p} />
              {p === "scm" && changed.length > 0 && <span className="vsc-badge">{changed.length}</span>}
            </button>
          ))}
        </nav>

        {/* side panel */}
        {panel && (
          <aside className="vsc-side">
            <div className="vsc-side-h">{PANEL_NAME[panel]}</div>
            {panel === "explorer" && (
              <Tree paths={paths} expanded={expanded} setExpanded={setExpanded} active={active} onOpen={(p) => openFile(p)} dirty={isDirty} changed={isChanged} />
            )}
            {panel === "search" && <Search paths={paths} text={text} onOpen={openFile} />}
            {panel === "scm" && (
              <div className="vsc-scm">
                <textarea
                  id="vsc-commit-msg"
                  className="vsc-commit"
                  placeholder="message (ctrl+enter to commit on main)"
                  aria-label="commit message"
                  rows={2}
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      commit();
                    }
                  }}
                />
                {unpushed > 0 && !changed.length ? (
                  <button type="button" className="vsc-btn" onClick={push} disabled={pushing}>
                    {pushing ? "pushing…" : `↑ sync changes (${unpushed})`}
                  </button>
                ) : (
                  <button type="button" className="vsc-btn" onClick={commit}>
                    ✓ commit
                  </button>
                )}
                <div className="vsc-sub">changes {changed.length > 0 && <span className="vsc-count">{changed.length}</span>}</div>
                {changed.length === 0 && <p className="vsc-empty">no changes yet. edit a file and save it, and it shows up here as a change.</p>}
                {changed.map((p) => (
                  <div key={p} className={`vsc-row${diffOf === p ? " on" : ""}`}>
                    <button type="button" className="vsc-row-main" onClick={() => setDiffOf(p)} title="open changes">
                      <FileIcon path={p} />
                      <span className="vsc-name">{base(p)}</span>
                      <span className="vsc-dir">{dir(p)}</span>
                    </button>
                    <button type="button" className="vsc-mini" title="discard changes" aria-label={`discard changes to ${base(p)}`} onClick={() => revert(p)}>
                      ↺
                    </button>
                    <span className="vsc-m">M</span>
                  </div>
                ))}
                {changed.length > 1 && (
                  <button type="button" className="vsc-link" onClick={() => changed.forEach(revert)}>
                    discard all changes
                  </button>
                )}
                <div className="vsc-sub">graph</div>
                <div className="vsc-graph">
                  {log.map((c) => (
                    <div key={c.hash} className="vsc-commit-row" title={`${c.hash} · ${c.files.join(", ")}`}>
                      <span className={`vsc-node${c.pushed ? "" : " local"}`} />
                      <div>
                        <div className="vsc-name">{c.msg}</div>
                        <div className="vsc-dir">
                          you · {ago(c.at)} · {c.hash}
                          {c.pushed ? " · origin/main" : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="vsc-commit-row">
                    <span className="vsc-node base" />
                    <div>
                      <div className="vsc-name">deploy: the site as it is live right now</div>
                      <div className="vsc-dir">parth awana · {ago(Date.parse(snapshot.built))} · origin/main</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {panel === "extensions" && <Extensions />}
          </aside>
        )}

        {/* editor area */}
        <section className="vsc-ed">
          <div className="vsc-tabs" role="tablist">
            {open.map((p) => (
              <div key={p} className={`vsc-tab${p === active && !diffOf ? " on" : ""}${isDirty(p) ? " dirty" : ""}`} role="tab" aria-selected={p === active}>
                <button type="button" className="vsc-tab-main" onClick={() => openFile(p)} onAuxClick={(e) => e.button === 1 && closeFile(p)}>
                  <FileIcon path={p} />
                  <span>{base(p)}</span>
                </button>
                <button type="button" className="vsc-tab-x" aria-label={`close ${base(p)}`} title="close (alt w)" onClick={() => closeFile(p)}>
                  <span className="dot" />
                  <Icon name="close" />
                </button>
              </div>
            ))}
            {diffOf && (
              <div className="vsc-tab on" role="tab" aria-selected>
                <button type="button" className="vsc-tab-main">
                  <FileIcon path={diffOf} />
                  <span>{base(diffOf)} (working tree)</span>
                </button>
                <button type="button" className="vsc-tab-x" aria-label="close diff" onClick={() => setDiffOf(null)}>
                  <Icon name="close" />
                </button>
              </div>
            )}
          </div>
          {active && !diffOf && <div className="vsc-crumb">{active.split("/").join("  ›  ")}</div>}
          <div className="vsc-stage">
            <div ref={host} className="vsc-host" style={{ visibility: diffOf || !active ? "hidden" : "visible" }} />
            {diffOf && <div ref={diffHost} className="vsc-host" />}
            {!active && !diffOf && (
              <div className="vsc-welcome">
                <p className="vsc-wm">parth-os</p>
                <p>
                  <button type="button" className="vsc-link" onClick={() => setQuick("files")}>
                    go to file
                  </button>{" "}
                  <kbd>ctrl p</kbd>
                </p>
                <p>
                  <button type="button" className="vsc-link" onClick={() => openFile(CONFIG_PATH)}>
                    edit the site's settings
                  </button>{" "}
                  <span>.config/parth-os/config</span>
                </p>
              </div>
            )}
          </div>

          {bottom && (
            <div className="vsc-bottom">
              <div className="vsc-bottom-h">
                <button type="button" className={bottom === "problems" ? "on" : ""} onClick={() => setBottom("problems")}>
                  problems {markers.length > 0 && <span className="vsc-count">{markers.length}</span>}
                </button>
                <button type="button" className={bottom === "output" ? "on" : ""} onClick={() => setBottom("output")}>
                  terminal
                </button>
                <button type="button" className="vsc-mini ml" aria-label="close panel" onClick={() => setBottom(null)}>
                  <Icon name="close" />
                </button>
              </div>
              <div className="vsc-bottom-b">
                {bottom === "problems" &&
                  (markers.length ? (
                    markers.slice(0, 200).map((m, i) => (
                      <button key={i} type="button" className="vsc-prob" onClick={() => openFile(m.resource.path.slice(1), m.startLineNumber, m.startColumn)}>
                        <Icon name={m.severity === monaco.MarkerSeverity.Error ? "error" : "warning"} />
                        <span className="vsc-prob-msg">{m.message.split("\n")[0]}</span>
                        <span className="vsc-dir">
                          {base(m.resource.path)} [{m.startLineNumber}, {m.startColumn}]
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="vsc-empty">no problems have been detected in the workspace.</p>
                  ))}
                {bottom === "output" && (
                  <pre className="vsc-term">
                    {(output.length ? output : ["parth@parth-os ~/parth-os (main) $ ", "", "this panel shows build output. the full terminal is on workspace ~ (alt q).", "try terminal › run build task."]).join("\n")}
                  </pre>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* status bar */}
      <footer className="vsc-status">
        <span className="vsc-remote">
          <Icon name="remote" />
        </span>
        <button type="button" onClick={() => setPanel("scm")}>
          <Icon name="branch" /> main{changed.length ? "*" : ""}
        </button>
        <button type="button" onClick={() => setBottom("problems")} title="problems">
          <Icon name="error" /> {errors} <Icon name="warning" /> {warnings}
        </button>
        <span className="vsc-grow" />
        {active && (
          <>
            <button type="button" onClick={() => run("editor.action.gotoLine")}>
              ln {pos.ln}, col {pos.col}
            </button>
            <span className="vsc-hide-sm">spaces: 2</span>
            <span className="vsc-hide-sm">utf-8</span>
            <span className="vsc-hide-sm">lf</span>
            <span>{lang}</span>
          </>
        )}
      </footer>

      {quick && <Quick mode={quick} paths={paths} onClose={() => setQuick(null)} onOpen={(p) => openFile(p)} runPalette={() => run("editor.action.quickCommand")} />}
      {toast && <div className={`vsc-toast ${toast.tone ?? ""}`}>{toast.text}</div>}
    </div>
  );
}

// ── pieces ────────────────────────────────────────────────────────────────

const PANEL_NAME: Record<Panel, string> = { explorer: "explorer", search: "search", scm: "source control", extensions: "extensions" };
const LANG_NAME: Record<string, string> = { typescript: "typescript jsx", javascript: "javascript", json: "json", css: "css", markdown: "markdown", ini: "properties", plaintext: "plain text" };
const base = (p: string) => p.split("/").pop()!;
function ago(t: number) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} days ago`;
}
const dir = (p: string) => p.split("/").slice(0, -1).join("/");
function sortPaths(a: string, b: string) {
  // folders before files at every level, like the explorer
  const pa = a.split("/");
  const pb = b.split("/");
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    if (pa[i] === pb[i]) continue;
    const da = i < pa.length - 1;
    const db = i < pb.length - 1;
    if (da !== db) return da ? -1 : 1;
    return pa[i].localeCompare(pb[i]);
  }
  return pa.length - pb.length;
}

function Tree({
  paths,
  expanded,
  setExpanded,
  active,
  onOpen,
  dirty,
  changed,
}: {
  paths: string[];
  expanded: Set<string>;
  setExpanded: (f: (s: Set<string>) => Set<string>) => void;
  active: string | null;
  onOpen: (p: string) => void;
  dirty: (p: string) => boolean;
  changed: (p: string) => boolean;
}) {
  const rows: ReactNode[] = [];
  const seen = new Set<string>();
  for (const p of paths) {
    const parts = p.split("/");
    // folders on the way, each once
    let hidden = false;
    for (let i = 0; i < parts.length - 1; i++) {
      const d = parts.slice(0, i + 1).join("/");
      if (hidden) break;
      if (!seen.has(d)) {
        seen.add(d);
        const isOpen = expanded.has(d);
        rows.push(
          <button
            key={"d:" + d}
            type="button"
            className="vsc-tree-row"
            style={{ paddingLeft: 8 + i * 12 }}
            onClick={() =>
              setExpanded((s) => {
                const n = new Set(s);
                if (n.has(d)) n.delete(d);
                else n.add(d);
                return n;
              })
            }
          >
            <span className={`vsc-chev${isOpen ? " open" : ""}`}>›</span>
            <span>{parts[i]}</span>
          </button>,
        );
      }
      if (!expanded.has(d)) hidden = true;
    }
    if (hidden) continue;
    const ch = changed(p);
    rows.push(
      <button key={p} type="button" className={`vsc-tree-row${p === active ? " on" : ""}${ch ? " changed" : ""}`} style={{ paddingLeft: 8 + (parts.length - 1) * 12 + 14 }} onClick={() => onOpen(p)}>
        <FileIcon path={p} />
        <span className="vsc-name">{parts[parts.length - 1]}</span>
        {dirty(p) ? <span className="vsc-dotm" /> : ch ? <span className="vsc-m">M</span> : null}
      </button>,
    );
  }
  return <div className="vsc-tree">{rows}</div>;
}

function Search({ paths, text, onOpen }: { paths: string[]; text: (p: string) => string; onOpen: (p: string, l?: number, c?: number) => void }) {
  const [q, setQ] = useState("");
  const [cs, setCs] = useState(false);
  const [word, setWord] = useState(false);
  const [rx, setRx] = useState(false);
  const results = useMemo(() => {
    if (q.length < 2) return [];
    let re: RegExp;
    try {
      const src = rx ? q : q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      re = new RegExp(word ? `\\b${src}\\b` : src, cs ? "g" : "gi");
    } catch {
      return null;
    }
    const out: { p: string; hits: { ln: number; col: number; line: string; len: number }[] }[] = [];
    for (const p of paths) {
      const hits: { ln: number; col: number; line: string; len: number }[] = [];
      text(p)
        .split("\n")
        .forEach((line, i) => {
          re.lastIndex = 0;
          const m = re.exec(line);
          if (m) hits.push({ ln: i + 1, col: m.index + 1, line, len: m[0].length || 1 });
        });
      if (hits.length) out.push({ p, hits });
    }
    return out;
  }, [q, cs, word, rx, paths, text]);
  const total = results?.reduce((n, r) => n + r.hits.length, 0) ?? 0;
  return (
    <div className="vsc-search">
      <div className="vsc-input">
        <input id="vsc-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search" autoFocus spellCheck={false} aria-label="search in files" />
        <button type="button" className={cs ? "on" : ""} title="match case" onClick={() => setCs(!cs)}>
          Aa
        </button>
        <button type="button" className={word ? "on" : ""} title="match whole word" onClick={() => setWord(!word)}>
          ab
        </button>
        <button type="button" className={rx ? "on" : ""} title="use regular expression" onClick={() => setRx(!rx)}>
          .*
        </button>
      </div>
      {results === null && <p className="vsc-empty">that regular expression isn't valid.</p>}
      {results && q.length >= 2 && <p className="vsc-sub">{total ? `${total} result${total === 1 ? "" : "s"} in ${results.length} file${results.length === 1 ? "" : "s"}` : "no results found."}</p>}
      <div className="vsc-results">
        {results?.map((r) => (
          <div key={r.p}>
            <div className="vsc-res-file">
              <FileIcon path={r.p} />
              <span className="vsc-name">{base(r.p)}</span>
              <span className="vsc-dir">{dir(r.p)}</span>
              <span className="vsc-count">{r.hits.length}</span>
            </div>
            {r.hits.slice(0, 30).map((h) => {
              const start = Math.max(0, h.col - 1 - 24);
              const pre = h.line.slice(start, h.col - 1).trimStart();
              return (
                <button key={h.ln} type="button" className="vsc-res-hit" onClick={() => onOpen(r.p, h.ln, h.col)}>
                  {pre}
                  <mark>{h.line.slice(h.col - 1, h.col - 1 + h.len)}</mark>
                  {h.line.slice(h.col - 1 + h.len, h.col - 1 + h.len + 60)}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

const EXTS = [
  ["ESLint", "microsoft", "integrates eslint into vs code"],
  ["Prettier", "prettier", "code formatter"],
  ["Tailwind CSS IntelliSense", "tailwind labs", "autocomplete for tailwind classes"],
  ["GitLens", "gitkraken", "supercharge git inside vs code"],
  ["Error Lens", "alexander", "show errors inline, at the end of the line"],
  ["Vesper", "rauno", "a minimal dark theme"],
];
function Extensions() {
  return (
    <div className="vsc-exts">
      <div className="vsc-sub">installed</div>
      {EXTS.map(([n, by, d]) => (
        <div key={n} className="vsc-ext">
          <span className="vsc-ext-ico">{n[0]}</span>
          <div>
            <div className="vsc-name">{n}</div>
            <div className="vsc-dir">{d}</div>
            <div className="vsc-dir">{by}</div>
          </div>
        </div>
      ))}
      <p className="vsc-empty">the extensions parth uses. this copy can't install new ones.</p>
    </div>
  );
}

/** ctrl+p: fuzzy go-to-file, matched on word starts so "tiling" finds tiling.ts, not every t-i-l-i-n-g */
function Quick({ mode, paths, onClose, onOpen, runPalette }: { mode: "files" | "palette"; paths: string[]; onClose: () => void; onOpen: (p: string) => void; runPalette: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (mode === "palette") {
      onClose();
      runPalette();
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return paths.slice(0, 40);
    return paths
      .map((p) => [p, scorePath(p, s)] as const)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([p]) => p);
  }, [q, paths]);
  useEffect(() => {
    list.current?.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  }, [sel, hits]);
  return (
    <div className="vsc-quick-wrap" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="vsc-quick" role="dialog" aria-label="go to file">
        <input
          id="vsc-quick"
          autoFocus
          value={q}
          spellCheck={false}
          placeholder="search files by name"
          aria-label="search files by name"
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSel((n) => Math.min(hits.length - 1, n + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSel((n) => Math.max(0, n - 1));
            } else if (e.key === "Enter" && hits[sel]) {
              onOpen(hits[sel]);
              onClose();
            } else if (e.key === "Escape") onClose();
          }}
        />
        <div className="vsc-quick-list" ref={list}>
          {hits.map((p, i) => (
            <button
              key={p}
              type="button"
              className={i === sel ? "on" : ""}
              onPointerEnter={() => setSel(i)}
              onClick={() => {
                onOpen(p);
                onClose();
              }}
            >
              <FileIcon path={p} />
              <span className="vsc-name">{base(p)}</span>
              <span className="vsc-dir">{dir(p)}</span>
            </button>
          ))}
          {!hits.length && <p className="vsc-empty">no matching files</p>}
        </div>
      </div>
    </div>
  );
}
export function scorePath(p: string, s: string) {
  const name = base(p).toLowerCase();
  const full = p.toLowerCase();
  if (name === s) return 100;
  if (name.startsWith(s)) return 80;
  if (name.includes(s)) return 60;
  if (full.includes(s)) return 40;
  // initials and word starts: "ts" → tiling.ts? no; "rp" → repo? only when letters begin words
  const words = full.split(/[\/._-]/).filter(Boolean);
  let i = 0;
  for (const w of words) {
    if (i < s.length && w.startsWith(s.slice(i, i + 1))) {
      let k = 1;
      while (i + k <= s.length && w.startsWith(s.slice(i, i + k))) k++;
      i += k - 1;
    }
  }
  return i === s.length ? 20 : 0;
}

function FileIcon({ path }: { path: string }) {
  const ext = path.includes(".") ? path.split(".").pop()! : "";
  const [label, cls] =
    ext === "ts" ? ["TS", "ts"] : ext === "tsx" ? ["⚛", "tsx"] : ext === "css" ? ["#", "css"] : ext === "json" ? ["{}", "json"] : ext === "md" ? ["M↓", "md"] : ext === "mjs" || ext === "js" ? ["JS", "js"] : ["⚙", "cfg"];
  return <span className={`vsc-fi ${cls}`}>{label}</span>;
}

/** small line icons in the style of vs code's codicons */
function Icon({ name }: { name: string }) {
  const p: Record<string, ReactNode> = {
    explorer: (
      <>
        <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
        <path d="M14 3v5h5" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="6" />
        <path d="m20 20-4.5-4.5" />
      </>
    ),
    scm: (
      <>
        <circle cx="6" cy="6" r="2" />
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="9" r="2" />
        <path d="M6 8v8M18 11c0 4-6 3-11 5" />
      </>
    ),
    extensions: (
      <>
        <rect x="4" y="4" width="7" height="7" rx="1" />
        <rect x="13" y="4" width="7" height="7" rx="1" />
        <rect x="4" y="13" width="7" height="7" rx="1" />
        <rect x="13" y="13" width="7" height="7" rx="1" />
      </>
    ),
    close: <path d="M6 6l12 12M18 6 6 18" />,
    branch: (
      <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="7" r="2" />
        <path d="M6 7v10M18 9c0 5-12 2-12 8" />
      </>
    ),
    error: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M9 9l6 6M15 9l-6 6" />
      </>
    ),
    warning: (
      <>
        <path d="M12 4 3 20h18z" />
        <path d="M12 10v4M12 17v.5" />
      </>
    ),
    remote: <path d="M5 9l4 3-4 3M19 9l-4 3 4 3" />,
  };
  return (
    <svg className="vsc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {p[name]}
    </svg>
  );
}
