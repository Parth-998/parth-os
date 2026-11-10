"use client";
/**
 * Apps float above the tiled desktop, like floating windows in Hyprland: drag them by the title bar,
 * resize from the corner, double-click the title bar (or alt f) to fill the screen, × or alt c to
 * close. Several can be open; the one you touched last is on top.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { APPS, OPEN_APP, setHash, type AppId, type OpenApp } from "@/lib/apps";
import type { ThemePreset } from "@/content/themes";
import type { SiteConfig } from "../code/config";
import type { Player } from "@/lib/hooks";
import Notes from "./Notes";
import Files from "./Files";
import Music from "./Music";
import Images from "./Images";
import Btop, { type Proc } from "./Btop";
import "./apps.css";

const CodeHost = lazy(() => import("./CodeHost"));

type Win = { id: AppId; arg?: string; x: number; y: number; w: number; h: number; z: number; max: boolean; route?: string; closing?: boolean };

const SIZE: Record<AppId, [number, number]> = { code: [0.9, 0.84], notes: [0.66, 0.8], files: [0.6, 0.66], music: [0.74, 0.8], images: [0.62, 0.74], btop: [0.72, 0.82] };

export type AppHost = {
  theme: ThemePreset;
  config: SiteConfig;
  onConfig: (c: SiteConfig) => void;
  player: Player;
  compact: boolean;
  /** btop: what's been killed, and the hooks that make kills real */
  killed: Set<Proc>;
  onKill: (p: Proc) => void;
  onRestart: () => void;
};

export default function AppLayer(host: AppHost) {
  const [wins, setWins] = useState<Win[]>([]);
  const zTop = useRef(10);
  const winsRef = useRef(wins);
  winsRef.current = wins;

  const open = useCallback((o: OpenApp) => {
    setWins((ws) => {
      const had = ws.find((w) => w.id === o.id);
      const z = ++zTop.current;
      if (had) return ws.map((w) => (w.id === o.id ? { ...w, z, closing: false, arg: o.arg ?? w.arg, route: o.arg ?? w.route } : w));
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const [fw, fh] = SIZE[o.id];
      const w = Math.min(1400, Math.round(vw * fw));
      const h = Math.round((vh - 46) * fh);
      const off = ws.length * 28;
      return [...ws, { id: o.id, arg: o.arg, route: o.arg, w, h, x: Math.round((vw - w) / 2) + off, y: 40 + Math.round((vh - 40 - h) / 2) + off, z, max: false }];
    });
  }, []);

  // hyprland's popin: shrink away, then go
  const close = useCallback((id: AppId) => {
    setWins((ws) => ws.map((w) => (w.id === id ? { ...w, closing: true } : w)));
    window.setTimeout(() => setWins((ws) => ws.filter((w) => !(w.id === id && w.closing))), 200);
  }, []);
  const front = useCallback((id: AppId) => {
    setWins((ws) => {
      const top = ws.reduce((m, w) => Math.max(m, w.z), 0);
      const me = ws.find((w) => w.id === id);
      if (!me || me.z === top) return ws;
      const z = ++zTop.current;
      return ws.map((w) => (w.id === id ? { ...w, z } : w));
    });
  }, []);
  const patch = useCallback((id: AppId, p: Partial<Win>) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, ...p } : w))), []);

  // btop killed code
  useEffect(() => {
    const on = (e: Event) => close((e as CustomEvent<AppId>).detail);
    window.addEventListener("parth-os:close-app", on);
    return () => window.removeEventListener("parth-os:close-app", on);
  }, [close]);

  // open requests from anywhere
  useEffect(() => {
    const on = (e: Event) => open((e as CustomEvent<OpenApp>).detail);
    window.addEventListener(OPEN_APP, on);
    return () => window.removeEventListener(OPEN_APP, on);
  }, [open]);

  // the address bar follows the app on top (and clears when the last one closes, not before any opened)
  const hadApps = useRef(false);
  useEffect(() => {
    const top = [...wins].sort((a, b) => b.z - a.z)[0];
    if (top) {
      hadApps.current = true;
      setHash(top.route ? `${top.id}/${top.route}` : top.id);
    } else if (hadApps.current && /^#(code|notes|files|music|images|btop)/.test(location.hash)) setHash("");
  }, [wins]);

  // alt c closes the app on top; alt f fills the screen with it (when the focus is inside an app)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      const ws = winsRef.current;
      if (!ws.length) return;
      const top = [...ws].filter((w) => !w.closing).sort((a, b) => b.z - a.z)[0];
      if (!top) return;
      const inApp = (document.activeElement as HTMLElement | null)?.closest?.(".app-win");
      if (e.code === "KeyC") {
        e.preventDefault();
        e.stopImmediatePropagation();
        const id = (inApp as HTMLElement | null)?.dataset.app as AppId | undefined;
        close(id ?? top.id);
      } else if (e.code === "KeyF" && inApp) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const id = (inApp as HTMLElement).dataset.app as AppId;
        setWins((all) => all.map((w) => (w.id === id ? { ...w, max: !w.max } : w)));
      }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [close]);

  const drag = (id: AppId) => (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button, a, input, textarea, select, [data-nodrag]")) return;
    const w = winsRef.current.find((x) => x.id === id);
    if (!w || host.compact) return;
    e.preventDefault();
    front(id);
    if (w.max) return;
    const sx = e.clientX - w.x;
    const sy = e.clientY - w.y;
    const move = (ev: PointerEvent) => {
      const x = Math.min(window.innerWidth - 80, Math.max(80 - w.w, ev.clientX - sx));
      const y = Math.min(window.innerHeight - 40, Math.max(36, ev.clientY - sy));
      patch(id, { x, y });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.documentElement.classList.remove("app-moving");
    };
    document.documentElement.classList.add("app-moving");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const resize = (id: AppId) => (e: React.PointerEvent) => {
    const w = winsRef.current.find((x) => x.id === id);
    if (!w || w.max) return;
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev: PointerEvent) => patch(id, { w: Math.max(420, w.w + ev.clientX - sx), h: Math.max(300, w.h + ev.clientY - sy) });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.documentElement.classList.remove("app-moving");
    };
    document.documentElement.classList.add("app-moving");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <>
      {wins.map((w) => {
        const titleProps = {
          onPointerDown: drag(w.id),
          onDoubleClick: (e: React.MouseEvent) => {
            if ((e.target as HTMLElement).closest("button, input")) return;
            patch(w.id, { max: !w.max });
          },
        };
        const route = (r?: string) => patch(w.id, { route: r });
        let body: ReactNode;
        if (w.id === "code")
          body = (
            <Suspense fallback={<AppLoading what="starting code" />}>
              <CodeHost file={w.arg} theme={host.theme} config={host.config} onConfig={host.onConfig} onClose={() => close("code")} titleProps={titleProps} onRoute={route} />
            </Suspense>
          );
        else
          body = (
            <Frame id={w.id} route={w.route} titleProps={titleProps} onClose={() => close(w.id)}>
              {w.id === "notes" && <Notes slug={w.arg} onRoute={route} />}
              {w.id === "files" && <Files start={w.arg} onRoute={route} theme={host.theme.id} onQuit={() => close("files")} />}
              {w.id === "music" && <Music player={host.player} arg={w.arg} />}
              {w.id === "images" && <Images start={w.arg} onRoute={route} onQuit={() => close("images")} />}
              {w.id === "btop" && (
                <Btop
                  theme={host.theme.id}
                  running={new Set(wins.filter((x) => !x.closing).map((x) => x.id as Proc))}
                  killed={host.killed}
                  onKill={host.onKill}
                  onRestart={host.onRestart}
                  onQuit={() => close("btop")}
                />
              )}
            </Frame>
          );
        const full = w.max || host.compact;
        return (
          <div
            key={w.id}
            className={`app-win${full ? " max" : ""}${w.closing ? " closing" : ""}`}
            data-app={w.id}
            style={full ? { zIndex: 30 + w.z } : { left: w.x, top: w.y, width: w.w, height: w.h, zIndex: 30 + w.z }}
            onPointerDownCapture={() => front(w.id)}
            role="dialog"
            aria-label={APPS[w.id].title}
          >
            {body}
            {!full && <span className="app-resize" aria-hidden onPointerDown={resize(w.id)} />}
          </div>
        );
      })}
    </>
  );
}

/** Title bar for the apps that don't draw their own (notes, files, music): name, where you are, × */
function Frame({ id, route, titleProps, onClose, children }: { id: AppId; route?: string; titleProps: object; onClose: () => void; children: ReactNode }) {
  return (
    <div className="app-frame">
      <div className="app-title" {...titleProps}>
        {id === "files" || id === "images" || id === "btop" ? (
          // yazi runs in a terminal and nsxiv titles itself: the window title is the program and where it is
          <span className="app-route app-term">
            {id === "btop" ? "btop" : `${id === "files" ? "yazi" : "nsxiv"} ~${route ? `/${route.replace(/\/\d+$/, "")}` : ""}`}
          </span>
        ) : (
          <>
            <span className="app-name">{APPS[id].title}</span>
            <span className="app-route">{route ? `~/${id === "notes" ? "notes/" : ""}${route}` : ""}</span>
          </>
        )}
        <button type="button" className="app-x" onClick={onClose} aria-label={`close ${id}`} title="close (alt c)">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <div className="app-body">{children}</div>
    </div>
  );
}

export function AppLoading({ what }: { what: string }) {
  return (
    <div className="app-loading">
      <span className="app-spin" aria-hidden />
      {what}…
    </div>
  );
}
