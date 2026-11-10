"use client";
/**
 * nsxiv, the image viewer on a lot of rices: a thumbnail grid of the folder, Enter to view one,
 * arrows / hjkl / n p to flip, Enter again (or Escape) back to the grid, q to quit. The bar along the
 * bottom says where you are, like nsxiv's own.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { site } from "@/content/site";

export default function Images({ start, onRoute, onQuit }: { start?: string; onRoute: (r?: string) => void; onQuit?: () => void }) {
  // start is "pictures/me" or "pictures/me/3"
  const folders = Object.keys(site.pictures);
  const parts = (start ?? "").replace(/^pictures\/?/, "").split("/");
  const [folder, setFolder] = useState(folders.includes(parts[0]) ? parts[0] : "");
  const all = useMemo(() => (folder ? site.pictures[folder] : folders.flatMap((f) => site.pictures[f].map((p) => ({ ...p, folder: f })))), [folder]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState(Math.max(0, Number(parts[1]) || 0));
  const [view, setView] = useState(parts[1] !== undefined && parts[1] !== "");
  const [dims, setDims] = useState<string>("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => root.current?.focus({ preventScroll: true }), []);
  useEffect(() => onRoute(`pictures${folder ? `/${folder}` : ""}${view ? `/${sel}` : ""}`), [folder, sel, view]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = all.length;
  const cur = all[Math.min(sel, n - 1)];
  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    const cols = Math.max(1, Math.floor((root.current?.clientWidth ?? 600) / 140));
    if (k === "q") onQuit?.();
    else if (k === "Enter") setView((v) => !v && n > 0);
    else if (k === "Escape" && view) setView(false);
    else if (k === "ArrowRight" || k === "l" || k === "n") setSel((s) => Math.min(n - 1, s + 1));
    else if (k === "ArrowLeft" || k === "h" || k === "p") setSel((s) => Math.max(0, s - 1));
    else if ((k === "ArrowDown" || k === "j") && !view) setSel((s) => Math.min(n - 1, s + cols));
    else if ((k === "ArrowUp" || k === "k") && !view) setSel((s) => Math.max(0, s - cols));
    else if (k === "g") setSel(0);
    else if (k === "G") setSel(n - 1);
    else return;
    e.preventDefault();
  };
  const name = (src: string) => src.split("/").pop() ?? src;

  return (
    <div className="nsxiv" ref={root} tabIndex={0} onKeyDown={onKey} aria-label="image viewer">
      {folders.length > 0 && !view && (
        <div className="nsxiv-folders">
          <button type="button" className={folder === "" ? "on" : ""} onClick={() => (setFolder(""), setSel(0))}>
            all
          </button>
          {folders.map((f) => (
            <button key={f} type="button" className={folder === f ? "on" : ""} onClick={() => (setFolder(f), setSel(0))}>
              {f}
            </button>
          ))}
        </div>
      )}
      <div className="nsxiv-stage">
        {n === 0 && (
          <p className="nsxiv-empty">
            nsxiv: no images in ~/pictures{folder ? `/${folder}` : ""}
          </p>
        )}
        {n > 0 && !view && (
          <div className="nsxiv-grid">
            {all.map((p, i) => (
              <button key={p.src} type="button" className={`nsxiv-thumb${i === sel ? " on" : ""}`} onClick={() => setSel(i)} onDoubleClick={() => (setSel(i), setView(true))}>
                <img src={p.src} alt={p.caption ?? ""} loading="lazy" />
              </button>
            ))}
          </div>
        )}
        {n > 0 && view && cur && (
          <img
            className="nsxiv-full"
            src={cur.src}
            alt={cur.caption ?? ""}
            onLoad={(e) => setDims(`${e.currentTarget.naturalWidth}x${e.currentTarget.naturalHeight}`)}
            onClick={() => setView(false)}
          />
        )}
      </div>
      <div className="nsxiv-bar">
        <span className="nsxiv-l">{cur ? (view && cur.caption ? `${name(cur.src)} · ${cur.caption}` : name(cur.src)) : ""}</span>
        <span className="nsxiv-r">
          {view && dims ? `${dims}  ` : ""}
          {n ? `${Math.min(sel + 1, n)}/${n}` : "0/0"}
        </span>
      </div>
    </div>
  );
}
