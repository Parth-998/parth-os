/**
 * Apps you open and close (code, notes, files, music), as opposed to the desktop's built-in windows.
 * Anything can open one: openApp("code", "src/lib/tiling.ts") from the terminal, the launcher, the
 * file manager or a link. Links look like #code/src/lib/tiling.ts, #notes/how-this-site-was-built,
 * #music, #projects/stocktracker, so a page of the site can be shared directly.
 */
export type AppId = "code" | "notes" | "files" | "music" | "images" | "btop";
export const APPS: Record<AppId, { name: string; title: string; what: string }> = {
  code: { name: "code", title: "code", what: "edit the site's source" },
  notes: { name: "notes", title: "notes", what: "write-ups" },
  files: { name: "files", title: "yazi", what: "file manager" },
  music: { name: "music", title: "music", what: "soundcloud + radio" },
  images: { name: "images", title: "nsxiv", what: "image viewer" },
  btop: { name: "btop", title: "btop", what: "system monitor" },
};

export const OPEN_APP = "parth-os:open-app";
export type OpenApp = { id: AppId; arg?: string };

export function openApp(id: AppId, arg?: string) {
  window.dispatchEvent(new CustomEvent<OpenApp>(OPEN_APP, { detail: { id, arg } }));
}

/** "#code/src/x.ts" → { id: "code", arg: "src/x.ts" } (also #projects/slug and #workspace names) */
export function parseHash(h: string): { app?: OpenApp; project?: string; workspace?: number } | null {
  const raw = decodeURIComponent(h.replace(/^#\/?/, ""));
  if (!raw) return null;
  const [head, ...rest] = raw.split("/");
  const arg = rest.join("/") || undefined;
  if (head in APPS) return { app: { id: head as AppId, arg } };
  if (head === "projects" && arg) return { project: arg, workspace: 1 };
  const ws = ["home", "projects", "about", "activity", "contact"].indexOf(head);
  if (ws >= 0) return { workspace: ws };
  return null;
}

/** Keep the address bar in step with what's open, without adding history entries. */
export function setHash(h: string) {
  try {
    const url = h ? `#${h}` : location.pathname + location.search;
    if (location.hash !== (h ? `#${h}` : "")) history.replaceState(null, "", url);
  } catch {}
}
