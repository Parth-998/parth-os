/**
 * ~/parth-os: the site's own source, as a read-only folder in the terminal. The files come from
 * public/parth-os.json, which scripts/snapshot.mjs writes on every build, so it's always the code
 * that's actually running. It's only fetched the first time someone looks inside.
 */
export const REPO = "parth-os";

type Snapshot = { built: string; files: Record<string, string> };
let data: Snapshot | null = null;
let pending: Promise<Snapshot | null> | null = null;

export function loadRepo(): Promise<Snapshot | null> {
  if (data) return Promise.resolve(data);
  pending ??= fetch("parth-os.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((d: Snapshot | null) => (data = d))
    .catch(() => null)
    .finally(() => {
      if (!data) pending = null; // let a later try go again
    });
  return pending;
}
/** the snapshot if it's already here (for tab completion, which can't wait) */
export const repoNow = () => data;

/**
 * Resolve a path typed in the terminal against the current folder. Home is "", a workspace
 * folder is "projects", a repo folder is "parth-os/src/lib". Returns null if it climbs above home.
 */
export function resolvePath(cwd: string, arg: string): string | null {
  let p = arg.trim();
  let parts: string[];
  if (p === "~" || p === "") return "";
  if (p.startsWith("~/")) {
    parts = [];
    p = p.slice(2);
  } else if (p.startsWith("/home/parth")) {
    parts = [];
    p = p.slice("/home/parth".length);
  } else parts = cwd ? cwd.split("/") : [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

export const inRepo = (p: string) => p === REPO || p.startsWith(REPO + "/");

/** Is this repo path a folder, a file, or nothing? */
export function kind(snap: Snapshot, p: string): "dir" | "file" | null {
  if (p === REPO) return "dir";
  const rel = p.slice(REPO.length + 1);
  if (rel in snap.files) return "file";
  const pre = rel + "/";
  return Object.keys(snap.files).some((f) => f.startsWith(pre)) ? "dir" : null;
}

/** Entries directly inside a repo folder: folders first, then files, like ls. */
export function list(snap: Snapshot, p: string, all = false): { name: string; dir: boolean }[] {
  const rel = p === REPO ? "" : p.slice(REPO.length + 1) + "/";
  const dirs = new Set<string>();
  const files: string[] = [];
  for (const f of Object.keys(snap.files)) {
    if (!f.startsWith(rel)) continue;
    const rest = f.slice(rel.length);
    const i = rest.indexOf("/");
    if (i >= 0) dirs.add(rest.slice(0, i));
    else files.push(rest);
  }
  const vis = (n: string) => all || !n.startsWith(".");
  return [...[...dirs].sort().filter(vis).map((name) => ({ name, dir: true })), ...files.sort().filter(vis).map((name) => ({ name, dir: false }))];
}

export const readRepo = (snap: Snapshot, p: string) => snap.files[p.slice(REPO.length + 1)];

/** Every file under a folder, with its repo path (for grep, tree). */
export function filesUnder(snap: Snapshot, p: string): string[] {
  const rel = p === REPO ? "" : p.slice(REPO.length + 1) + "/";
  return Object.keys(snap.files)
    .filter((f) => f.startsWith(rel))
    .sort();
}
