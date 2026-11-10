/**
 * Free-placed windows on a snap grid.
 *
 * Every workspace starts in its designed layout. The first time you grab a window, that workspace
 * switches to a snap grid (24 columns, ~40px rows) with every window pinned where it was. Then:
 *   - drag a window by its title bar anywhere. It snaps to the grid (a dashed outline shows where)
 *     and stays where you drop it.
 *   - drag any edge, or the corner, to resize it in grid steps.
 * Other windows are left alone unless they're in the way. A window in the way is trimmed back to the
 * side that's still free; if that would make it too small for its content, it slides to the nearest
 * free spot instead. You see this live while dragging.
 *
 * Rules that always hold: nothing overlaps, nothing is narrower than MIN_W_PX, and no window is shorter
 * than its content. `resetLayout()` slides everything back to the designed layout.
 */

const COLS = 24;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ROW_PX = 40;
let GAP = 10;
/** settings › windows › gaps: tiled windows re-space themselves */
export function setTileGap(px: number) {
  GAP = px;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("resize"));
}
const MIN_W_PX = 280;
const FLEX_MIN_H = 200; // terminal, trading chart: content that fills whatever height it gets
const ANIM = "240ms cubic-bezier(0.22, 1, 0.36, 1)";

type R = { x: number; y: number; w: number; h: number };
interface Layout {
  tile: HTMLElement;
  rows: number;
  baseRows: number;
  rowPx: number;
  items: Map<HTMLElement, R>;
}

const layouts = new WeakMap<HTMLElement, Layout>();
const tileOf = (el: Element) => el.closest(".tile") as HTMLElement | null;
const winsIn = (tile: HTMLElement) => Array.from(tile.querySelectorAll<HTMLElement>(":scope > .win"));
const overlap = (a: R, b: R) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const area = (r: R) => r.w * r.h;
const unit = (L: Layout) => L.tile.getBoundingClientRect().width / COLS;
const minW = (L: Layout) => Math.min(COLS, Math.ceil((MIN_W_PX + GAP) / unit(L)));
let tid = 0;

/** Rows a window needs to show all its content at a width (in columns). Cached per gesture. */
let minHCache = new Map<string, number>();
function minH(L: Layout, el: HTMLElement, w: number) {
  if (el.dataset.flex) return Math.ceil((FLEX_MIN_H + GAP) / L.rowPx);
  const key = `${el.dataset.tid}:${w}`;
  const hit = minHCache.get(key);
  if (hit !== undefined) return hit;
  const s = el.style;
  const keep = [s.width, s.height, s.transition];
  s.transition = "none";
  s.width = `${w * unit(L) - GAP}px`;
  s.height = "auto";
  const px = el.offsetHeight;
  [s.width, s.height, s.transition] = keep;
  const rows = Math.max(2, Math.ceil((px + GAP) / L.rowPx));
  minHCache.set(key, rows);
  return rows;
}

function place(el: HTMLElement, r: R, L: Layout) {
  const U = unit(L);
  el.style.left = `${r.x * U + GAP / 2}px`;
  el.style.top = `${r.y * L.rowPx + GAP / 2}px`;
  el.style.width = `${r.w * U - GAP}px`;
  el.style.height = `${r.h * L.rowPx - GAP}px`;
}

function fitRows(L: Layout) {
  let bottom = 0;
  for (const r of L.items.values()) bottom = Math.max(bottom, r.y + r.h);
  L.rows = Math.max(L.baseRows, bottom);
  L.tile.style.minHeight = `${L.rows * L.rowPx}px`;
}

function render(L: Layout, animate: boolean, skip?: HTMLElement) {
  fitRows(L);
  for (const [el, r] of L.items) {
    if (el === skip) continue;
    el.style.transition = animate ? `left ${ANIM}, top ${ANIM}, width ${ANIM}, height ${ANIM}` : "none";
    place(el, r, L);
  }
}

/** Switch a tile to the snap grid, pinning every window where it is now. */
function ensureGrid(tile: HTMLElement): Layout {
  const have = layouts.get(tile);
  if (have) return have;
  minHCache = new Map();
  const wins = winsIn(tile);
  const rects = wins.map((w) => w.getBoundingClientRect());
  // take the whole workspace: drop any centred max-width so windows can go anywhere on screen
  const H0 = tile.getBoundingClientRect().height;
  tile.dataset.tiled = "1";
  tile.style.minHeight = `${H0}px`;
  const T = tile.getBoundingClientRect();
  const rows = Math.max(8, Math.round(T.height / ROW_PX));
  const L: Layout = { tile, rows, baseRows: rows, rowPx: T.height / rows, items: new Map() };
  const U = T.width / COLS;
  wins.forEach((w, i) => {
    const b = rects[i];
    w.dataset.tid = String(++tid);
    w.style.position = "absolute";
    w.style.margin = "0";
    w.style.gridArea = "auto"; // otherwise an absolute grid item is placed inside its old grid cell
    // round each edge (gutter split evenly) rather than each size, so windows that line up on screen
    // line up on the grid too and a full column never adds up to more rows than the screen has
    const x = clamp(Math.round((b.left - T.left - GAP / 2) / U), 0, COLS - 1);
    const x2 = clamp(Math.round((b.right - T.left + GAP / 2) / U), x + 1, COLS);
    const y = Math.max(0, Math.round((b.top - T.top - GAP / 2) / L.rowPx));
    const y2 = Math.max(y + 2, Math.round((b.bottom - T.top + GAP / 2) / L.rowPx));
    const r: R = { x, y, w: x2 - x, h: y2 - y };
    L.items.set(w, r);
    w.style.transition = "none";
    place(w, r, L);
  });
  layouts.set(tile, L);
  settle(L, []);
  render(L, true);
  return L;
}

/** Nearest free spot for a window of r's size. */
function nearestFree(L: Layout, r: R, taken: R[], bounded = true): R | null {
  let best: R | null = null;
  let bestD = Infinity;
  // bounded: stay inside the workspace's own screen; only if that's impossible, look below it
  const maxY = bounded ? L.baseRows : Math.max(L.rows, ...taken.map((t) => t.y + t.h)) + r.h;
  for (let y = 0; y <= maxY - r.h; y++)
    for (let x = 0; x <= COLS - r.w; x++) {
      const c = { x, y, w: r.w, h: r.h };
      if (taken.some((t) => overlap(c, t))) continue;
      const d = (x - r.x) ** 2 + ((y - r.y) * 1.3) ** 2;
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
  return best;
}

/**
 * Clear overlaps. Windows in `keep` hold their spot; any window they cover is trimmed back to its
 * largest free side, or slides to the nearest free spot if trimming would make it too small.
 * Windows that aren't in the way are never touched.
 */
function settle(L: Layout, keep: HTMLElement[], vacated?: R) {
  const fixed = new Set(keep);
  const mw = minW(L);
  for (const [el, r] of L.items) {
    const need = minH(L, el, r.w);
    if (r.h < need) L.items.set(el, { ...r, h: need });
  }
  for (let guard = 0; guard < 120; guard++) {
    let pair: [HTMLElement, R, R] | null = null;
    const list = [...L.items];
    outer: for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const [ea, ra] = list[i];
        const [eb, rb] = list[j];
        if (!overlap(ra, rb)) continue;
        const moveB = fixed.has(ea) || (!fixed.has(eb) && (rb.y > ra.y || (rb.y === ra.y && rb.x >= ra.x)));
        pair = moveB ? [eb, rb, ra] : [ea, ra, rb];
        break outer;
      }
    if (!pair) return pullOnScreen(L, fixed);
    const [el, o, d] = pair;
    const others = [...L.items].filter(([k]) => k !== el).map(([, v]) => v);
    // a candidate may grow taller so its content still fits at the new width
    const fit = (c: R): R => {
      const h = Math.max(c.h, minH(L, el, c.w));
      // grown taller than the screen allows? lift it up instead of hanging off the bottom
      return { ...c, h, y: c.y + h > L.baseRows ? Math.max(0, L.baseRows - h) : c.y };
    };
    // it only has to clear windows that are already settled; anything else it now covers gets its own turn
    const settled = [...L.items].filter(([k]) => k !== el && fixed.has(k)).map(([, v]) => v);
    const ok = (c: R) => c.w >= mw && !settled.some((t) => overlap(c, t));
    const cands: R[] = [];
    if (d.x > o.x) cands.push({ ...o, w: d.x - o.x });
    if (d.x + d.w < o.x + o.w) cands.push({ ...o, x: d.x + d.w, w: o.x + o.w - (d.x + d.w) });
    if (d.y > o.y) cands.push({ ...o, h: d.y - o.y });
    if (d.y + d.h < o.y + o.h) cands.push({ ...o, y: d.y + d.h, h: o.y + o.h - (d.y + d.h) });
    // everything prefers to stay on the workspace's own screen (no scrolling to find a window)
    const inside = (c: R) => c.y + c.h <= L.baseRows;
    const okIn = (c: R) => ok(c) && inside(c);
    const trimmed = cands.map(fit).filter(okIn).sort((a, b) => area(b) - area(a))[0];
    // or take the spot the dragged window just left, reshaped to it
    const swap = vacated && !trimmed ? [fit({ ...vacated })].filter(okIn)[0] : undefined;
    // or the nearest free spot, at its size, then squeezed to its minimum size
    const small = (): R | null => {
      const w = mw;
      return nearestFree(L, { ...o, w, h: minH(L, el, w) }, others);
    };
    const spot =
      trimmed ?? swap ?? nearestFree(L, o, others) ?? small() ?? cands.map(fit).filter(ok)[0] ?? nearestFree(L, o, others, false);
    L.items.set(el, spot ?? { ...o, y: d.y + d.h });
    fixed.add(el);
  }
}

/** Last pass: any window hanging below the workspace's screen moves (or shrinks) into free space on it. */
function pullOnScreen(L: Layout, fixed: Set<HTMLElement>) {
  const mw = minW(L);
  for (const [el, r] of L.items) {
    if (r.y + r.h <= L.baseRows) continue;
    const others = [...L.items].filter(([k]) => k !== el).map(([, v]) => v);
    const spot = nearestFree(L, r, others) ?? nearestFree(L, { ...r, w: Math.max(mw, Math.min(r.w, mw + 2)), h: minH(L, el, Math.max(mw, Math.min(r.w, mw + 2))) }, others) ?? nearestFree(L, { ...r, w: mw, h: minH(L, el, mw) }, others);
    if (spot) L.items.set(el, spot);
  }
  void fixed;
}

const ghostOf = (tile: HTMLElement) => {
  let g = tile.querySelector<HTMLElement>(":scope > .snap-ghost");
  if (!g) {
    g = document.createElement("div");
    g.className = "snap-ghost";
    tile.appendChild(g);
  }
  return g;
};

/** How many rows of windows hang below the workspace's own screen. */
const offScreen = (L: Layout, items: Map<HTMLElement, R> = L.items) => {
  let n = 0;
  for (const r of items.values()) n += Math.max(0, r.y + r.h - L.baseRows);
  return n;
};
const snapshot = (L: Layout) => new Map([...L.items].map(([k, v]) => [k, { ...v }] as const));
const restore = (L: Layout, s: Map<HTMLElement, R>) => {
  for (const [k, v] of s) L.items.set(k, { ...v });
};
const key = (r: R) => `${r.x},${r.y},${r.w},${r.h}`;

/** Lay `n` windows side by side across [x0, x1) in columns, as evenly as the grid allows. */
function divide(x0: number, x1: number, n: number) {
  const span = x1 - x0;
  const base = Math.floor(span / n);
  let extra = span - base * n;
  const out: [number, number][] = [];
  let x = x0;
  for (let i = 0; i < n; i++) {
    const w = base + (extra-- > 0 ? 1 : 0);
    out.push([x, w]);
    x += w;
  }
  return out;
}

/**
 * Dropping a window onto another one:
 *   left/right → it joins that window's row and the row re-divides (3 across becomes 4)
 *   above/below → it becomes a new row spanning that row
 * The row it left closes the gap it leaves behind.
 */
function rowDrop(L: Layout, snap: Map<HTMLElement, R>, win: HTMLElement, start: R, target: HTMLElement, zone: string): Map<HTMLElement, R> {
  const plan = new Map([...snap].map(([k, v]) => [k, { ...v }] as const));
  const mw = minW(L);
  const sameRow = (r: R, ref: R) => r.y === ref.y && r.h === ref.h;
  // close the gap in the row it leaves (only if that row was contiguous with it)
  const old = [...plan].filter(([el, r]) => el !== win && sameRow(r, start)).sort((a, b) => a[1].x - b[1].x);
  if (old.length) {
    const x0 = Math.min(start.x, ...old.map(([, r]) => r.x));
    const x1 = Math.max(start.x + start.w, ...old.map(([, r]) => r.x + r.w));
    const covered = start.w + old.reduce((a, [, r]) => a + r.w, 0);
    if (covered === x1 - x0) divide(x0, x1, old.length).forEach(([x, w], i) => plan.set(old[i][0], { ...old[i][1], x, w }));
  }
  const t = plan.get(target)!;
  const row = [...plan].filter(([el, r]) => el !== win && sameRow(r, t)).sort((a, b) => a[1].x - b[1].x);
  let x0 = Math.min(...row.map(([, r]) => r.x));
  let x1 = Math.max(...row.map(([, r]) => r.x + r.w));

  if (zone === "left" || zone === "right") {
    // make the row wide enough for one more window: grow toward the side you dropped on first
    const need = Math.min(COLS, (row.length + 1) * mw);
    if (x1 - x0 < need) {
      const more = need - (x1 - x0);
      if (zone === "left") {
        const l = Math.min(more, x0);
        x0 -= l;
        x1 = Math.min(COLS, x1 + (more - l));
      } else {
        const r = Math.min(more, COLS - x1);
        x1 += r;
        x0 = Math.max(0, x0 - (more - r));
      }
    }
    const idx = row.findIndex(([el]) => el === target) + (zone === "right" ? 1 : 0);
    const order = row.map(([el]) => el);
    order.splice(idx, 0, win);
    const h = Math.max(...row.map(([, r]) => r.h), minH(L, win, Math.floor((x1 - x0) / order.length)));
    divide(x0, x1, order.length).forEach(([x, w], i) => plan.set(order[i], { x, w, y: t.y, h }));
    return plan;
  }

  // above/below: stack it with the target in a column. Split the target's height if both fit;
  // otherwise the column grows and whatever is below moves down (if there's room on screen).
  const needT = minH(L, target, t.w);
  const needW = minH(L, win, t.w);
  let ht = t.h;
  let hw = needW;
  if (t.h >= needT + needW) {
    hw = Math.max(needW, Math.floor(t.h / 2));
    ht = t.h - hw;
  } else {
    ht = Math.max(needT, Math.min(t.h, t.h - needW));
    ht = Math.max(needT, ht);
  }
  if (zone === "above") {
    plan.set(win, { x: t.x, w: t.w, y: t.y, h: hw });
    plan.set(target, { ...t, y: t.y + hw, h: ht });
  } else {
    plan.set(target, { ...t, h: ht });
    plan.set(win, { x: t.x, w: t.w, y: t.y + ht, h: hw });
  }
  return plan;
}

export function startMove(win: HTMLElement, e: PointerEvent) {
  const tile = tileOf(win);
  if (!tile || win.closest(".compact")) return;
  const sx = e.clientX;
  const sy = e.clientY;
  let L: Layout | null = null;
  let snap = new Map<HTMLElement, R>();
  let start: R | null = null;
  let target: R | null = null;
  let accepted = new Map<HTMLElement, R>();
  let lastKey = "";
  let ghost: HTMLElement | null = null;
  let origin = { left: 0, top: 0 };

  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - sx;
    const dy = ev.clientY - sy;
    if (!L && Math.hypot(dx, dy) < 5) return;
    if (!L) {
      L = ensureGrid(tile);
      minHCache = new Map();
      snap = snapshot(L);
      start = { ...snap.get(win)! };
      origin = { left: parseFloat(win.style.left), top: parseFloat(win.style.top) };
      win.classList.add("moving");
      document.documentElement.classList.add("tiling");
      window.getSelection()?.removeAllRanges();
      ghost = ghostOf(tile);
      ghost.style.display = "block";
    }
    win.style.transition = "none";
    win.style.left = `${origin.left}px`;
    win.style.top = `${origin.top}px`;
    win.style.transform = `translate(${dx}px, ${dy}px)`;
    const s = start!;
    const T = tile.getBoundingClientRect();
    const px = ev.clientX - T.left;
    const py = ev.clientY - T.top;
    // over another window? join its row (or start a new one) and let the rows re-divide
    const U = unit(L);
    let over: [HTMLElement, R] | null = null;
    for (const [el, r] of snap) {
      if (el === win) continue;
      if (px >= r.x * U && px <= (r.x + r.w) * U && py >= r.y * L.rowPx && py <= (r.y + r.h) * L.rowPx) over = [el, r];
    }
    let plan: Map<HTMLElement, R> | null = null;
    let next: R;
    let k: string;
    if (over) {
      const [, t] = over;
      const fy = (py - t.y * L.rowPx) / (t.h * L.rowPx);
      const zone = fy < 0.25 ? "above" : fy > 0.75 ? "below" : px < (t.x + t.w / 2) * U ? "left" : "right";
      k = `${over[0].dataset.tid}:${zone}`;
      plan = rowDrop(L, snap, win, s, over[0], zone);
      next = plan.get(win)!;
    } else {
      // open space: place it freely; the window stays on its workspace's screen
      const maxY = Math.max(0, L.baseRows - s.h);
      next = { ...s, x: Math.max(0, Math.min(COLS - s.w, Math.round(s.x + dx / U))), y: Math.max(0, Math.min(maxY, Math.round(s.y + dy / L.rowPx))) };
      k = key(next);
    }
    if (k === lastKey) return;
    // live: windows in the way make room; everything else stays put
    restore(L, plan ?? snap);
    L.items.set(win, next);
    const band = plan ? [...plan].filter(([el, r]) => el !== win && key(r) !== key(snap.get(el)!)).map(([el]) => el) : [];
    settle(L, [win, ...band], plan ? undefined : s);
    if (offScreen(L) > offScreen(L, snap)) {
      // dropping here would shove something off the screen: keep the last good spot
      restore(L, target ? accepted : snap);
      return;
    }
    lastKey = k;
    target = next;
    accepted = snapshot(L);
    render(L, true, win);
    ghost!.style.transition = `left 90ms, top 90ms, width 90ms, height 90ms`;
    place(ghost!, target, L);
  };

  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    document.documentElement.classList.remove("tiling");
    win.classList.remove("moving");
    if (ghost) ghost.style.display = "none";
    if (!L) return;
    if (!target) {
      // never found a valid spot: slide back home
      win.style.transform = "";
      restore(L, snap);
      render(L, true);
      return;
    }
    // glide from where the pointer let go into the snapped spot
    const T = tile.getBoundingClientRect();
    const r = win.getBoundingClientRect();
    win.style.transform = "";
    win.style.transition = "none";
    win.style.left = `${r.left - T.left}px`;
    win.style.top = `${r.top - T.top}px`;
    void win.offsetWidth;
    render(L, true);
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

export type Edge = "n" | "s" | "e" | "w" | "se";

export function startResize(win: HTMLElement, edge: Edge, e: PointerEvent) {
  const tile = tileOf(win);
  if (!tile || win.closest(".compact")) return;
  const L = ensureGrid(tile);
  minHCache = new Map();
  const snap = snapshot(L);
  const me0 = snap.get(win)!;
  const sx = e.clientX;
  const sy = e.clientY;
  const mw = minW(L);
  let last = "";
  let accepted = snapshot(L);
  const offScreen0 = offScreen(L);
  win.classList.add("resizing");
  document.documentElement.classList.add("tiling", edge === "e" || edge === "w" ? "tiling-col" : edge === "se" ? "tiling-se" : "tiling-row");
  window.getSelection()?.removeAllRanges();

  const onMove = (ev: PointerEvent) => {
    const du = Math.round((ev.clientX - sx) / unit(L));
    const dv = Math.round((ev.clientY - sy) / L.rowPx);
    const me = { ...me0 };
    if (edge === "e" || edge === "se") me.w = Math.max(mw, Math.min(COLS - me.x, me0.w + du));
    if (edge === "w") {
      const x = Math.max(0, Math.min(me0.x + me0.w - mw, me0.x + du));
      me.w = me0.x + me0.w - x;
      me.x = x;
    }
    if (edge === "s" || edge === "se") me.h = Math.max(2, Math.min(Math.max(me0.h, L.baseRows - me.y), me0.h + dv));
    if (edge === "n") {
      const y = Math.max(0, Math.min(me0.y + me0.h - 2, me0.y + dv));
      me.h = me0.y + me0.h - y;
      me.y = y;
    }
    me.h = Math.max(me.h, minH(L, win, me.w)); // never shorter than its content
    if (key(me) === last) return;
    restore(L, snap);
    L.items.set(win, me);
    settle(L, [win]); // only windows the resized one now covers are touched
    if (offScreen(L) > offScreen0) {
      // no room left on this screen: the resize stops here
      restore(L, accepted);
      render(L, true);
      return;
    }
    last = key(me);
    accepted = snapshot(L);
    render(L, true);
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    win.classList.remove("resizing");
    document.documentElement.classList.remove("tiling", "tiling-col", "tiling-row", "tiling-se");
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

/** Slide every workspace back to its designed layout. */
export function resetLayout() {
  for (const tile of Array.from(document.querySelectorAll<HTMLElement>(".tile"))) untile(tile);
}

/** One workspace back to its designed (non-tiled) layout. */
function untile(tile: HTMLElement) {
  {
    if (!layouts.has(tile)) return;
    const wins = winsIn(tile);
    const before = new Map(wins.map((w) => [w, w.getBoundingClientRect()] as const));
    layouts.delete(tile);
    delete tile.dataset.tiled;
    tile.style.minHeight = "";
    tile.querySelector(":scope > .snap-ghost")?.remove();
    for (const w of wins) for (const p of ["position", "margin", "gridArea", "left", "top", "width", "height", "transition", "transform"] as const) w.style[p] = "";
    for (const w of wins) {
      const a = before.get(w)!;
      const b = w.getBoundingClientRect();
      w.style.transition = "none";
      w.style.transformOrigin = "0 0";
      w.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / (b.width || 1)}, ${a.height / (b.height || 1)})`;
      void w.offsetWidth;
      w.style.transition = `transform ${ANIM}`;
      w.style.transform = "";
      window.setTimeout(() => {
        w.style.transition = "";
        w.style.transformOrigin = "";
      }, 320);
    }
  }
}

export function layoutChanged() {
  return Array.from(document.querySelectorAll<HTMLElement>(".tile")).some((t) => layouts.has(t));
}

// snapped workspaces keep their columns when the browser window changes width
if (typeof window !== "undefined") {
  let raf = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      minHCache = new Map();
      for (const tile of Array.from(document.querySelectorAll<HTMLElement>(".tile[data-tiled]"))) {
        const L = layouts.get(tile);
        if (L) {
          settle(L, []);
          render(L, false);
        }
      }
    });
  });
}

/* ── keyboard (Hyprland-style, on Alt since browsers own the Super key) ───────────── */

type Dir = "left" | "right" | "up" | "down";
let lastWin: HTMLElement | null = null;
if (typeof window !== "undefined") {
  const note = (e: Event) => {
    const w = (e.target as Element | null)?.closest?.(".ws .win") as HTMLElement | null;
    if (w) lastWin = w;
  };
  document.addEventListener("pointerdown", note, true);
  document.addEventListener("focusin", note, true);
}

/** The workspace on screen right now. */
function currentWs(): HTMLElement | null {
  const mid = window.innerHeight * 0.45;
  for (const ws of Array.from(document.querySelectorAll<HTMLElement>(".ws"))) {
    const r = ws.getBoundingClientRect();
    if (r.top <= mid && r.bottom > mid) return ws;
  }
  return null;
}

function focused(): HTMLElement | null {
  const ws = currentWs();
  if (!ws || ws.closest(".compact")) return null;
  const act = document.activeElement?.closest?.(".win") as HTMLElement | null;
  if (act && ws.contains(act)) return act;
  if (lastWin && ws.contains(lastWin)) return lastWin;
  return ws.querySelector<HTMLElement>(".win");
}

function focusWin(w: HTMLElement) {
  if (!w.hasAttribute("tabindex")) w.tabIndex = -1;
  w.focus({ preventScroll: true });
  lastWin = w;
}

/** The nearest window from `from` in a direction, by centre distance (straight ahead counts most). */
function neighbour(from: DOMRect, cands: [HTMLElement, DOMRect][], dir: Dir) {
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  let best: HTMLElement | null = null;
  let bestS = Infinity;
  for (const [el, r] of cands) {
    const x = r.left + r.width / 2 - cx;
    const y = r.top + r.height / 2 - cy;
    const ahead = dir === "left" ? -x : dir === "right" ? x : dir === "up" ? -y : y;
    const side = dir === "left" || dir === "right" ? Math.abs(y) : Math.abs(x);
    if (ahead <= 4) continue;
    const s = ahead + side * 2;
    if (s < bestS) {
      bestS = s;
      best = el;
    }
  }
  return best;
}

/** alt + arrows: move focus to the next window that way. */
export function focusDir(dir: Dir) {
  const w = focused();
  if (!w) return;
  const ws = w.closest(".ws")!;
  const others = Array.from(ws.querySelectorAll<HTMLElement>(".win")).filter((o) => o !== w).map((o) => [o, o.getBoundingClientRect()] as [HTMLElement, DOMRect]);
  const n = neighbour(w.getBoundingClientRect(), others, dir);
  focusWin(n ?? w);
}

/** alt + shift + arrows: swap the focused window with its neighbour that way (or nudge it to the edge). */
export function moveDir(dir: Dir) {
  const w = focused();
  const tile = w && tileOf(w);
  if (!w || !tile) return;
  const L = ensureGrid(tile);
  minHCache = new Map();
  const before = snapshot(L);
  const me = { ...L.items.get(w)! };
  const others = [...L.items].filter(([o]) => o !== w).map(([o]) => [o, o.getBoundingClientRect()] as [HTMLElement, DOMRect]);
  const n = neighbour(w.getBoundingClientRect(), others, dir);
  if (n) {
    const them = { ...L.items.get(n)! };
    L.items.set(w, them);
    L.items.set(n, me);
    settle(L, [w, n]);
  } else {
    const step = dir === "left" || dir === "right" ? me.w : 2;
    const x = dir === "left" ? 0 : dir === "right" ? COLS - me.w : me.x;
    const y = dir === "up" ? Math.max(0, me.y - step) : dir === "down" ? Math.min(L.baseRows - me.h, me.y + step) : me.y;
    L.items.set(w, { ...me, x, y });
    settle(L, [w]);
  }
  if (offScreen(L) > offScreen(L, before)) restore(L, before);
  render(L, true);
  focusWin(w);
}

/** alt + j: flip the focused window and its neighbour between side by side and stacked. */
/** The last flip, so flipping the same pair straight back restores exactly what was there. */
let lastFlip: { tile: HTMLElement; pair: HTMLElement[]; before: Map<HTMLElement, R>; after: string } | null = null;
const sig = (L: Layout) => [...L.items.values()].map(key).join("|");

export function flip() {
  const w = focused();
  const tile = w && tileOf(w);
  if (!w || !tile) return;
  const fresh = !layouts.has(tile);
  const L = ensureGrid(tile);
  minHCache = new Map();
  if (lastFlip && lastFlip.tile === tile && lastFlip.pair.includes(w) && lastFlip.after === sig(L)) {
    restore(L, lastFlip.before);
    lastFlip = null;
    render(L, true);
    focusWin(w);
    return;
  }
  const before = snapshot(L);
  const a = { ...L.items.get(w)! };
  // Candidates: every window in line with it, beside or above/below, nearest first; when two are
  // equally close the one sharing the longer edge goes first, and a stacked pair (flipping to side by
  // side) goes before a side-by-side one, since stacking needs height the screen often doesn't have.
  // Each is tried in turn and the first flip that fits on screen is kept.
  const cands: { el: HTMLElement; r: R; side: boolean; gap: number; share: number }[] = [];
  for (const [el, r] of L.items) {
    if (el === w) continue;
    const vOverlap = Math.min(a.y + a.h, r.y + r.h) - Math.max(a.y, r.y);
    const hOverlap = Math.min(a.x + a.w, r.x + r.w) - Math.max(a.x, r.x);
    const hGap = Math.max(r.x - (a.x + a.w), a.x - (r.x + r.w));
    const vGap = Math.max(r.y - (a.y + a.h), a.y - (r.y + r.h));
    // a gap of a cell or two is just the gutter between tiles: that still counts as touching
    const near = (g: number) => (g <= 2 ? 0 : g);
    if (vOverlap > 0 && hGap >= -1) cands.push({ el, r: { ...r }, side: true, gap: near(hGap), share: vOverlap / Math.max(a.h, r.h) });
    else if (hOverlap > 0 && vGap >= -1) cands.push({ el, r: { ...r }, side: false, gap: near(vGap) * 1.5, share: hOverlap / Math.max(a.w, r.w) });
  }
  cands.sort((p, q) => p.gap - q.gap || q.share - p.share || Number(p.side) - Number(q.side));
  let done = false;
  for (const { el: n, r: b, side } of cands) {
    const x0 = Math.min(a.x, b.x);
    const y0 = Math.min(a.y, b.y);
    const x1 = Math.max(a.x + a.w, b.x + b.w);
    const y1 = Math.max(a.y + a.h, b.y + b.h);
    const first = side ? (a.x <= b.x ? w : n) : a.y <= b.y ? w : n;
    const second = first === w ? n : w;
    if (side) {
      // side by side → stacked, full width each
      const W = x1 - x0;
      const h1 = Math.max(minH(L, first, W), Math.floor((y1 - y0) / 2));
      const h2 = Math.max(minH(L, second, W), y1 - y0 - h1);
      L.items.set(first, { x: x0, w: W, y: y0, h: h1 });
      L.items.set(second, { x: x0, w: W, y: y0 + h1, h: h2 });
    } else {
      // stacked → side by side, full height each
      const half = Math.floor((x1 - x0) / 2);
      const H = y1 - y0;
      L.items.set(first, { x: x0, w: half, y: y0, h: Math.max(H, minH(L, first, half)) });
      L.items.set(second, { x: x0 + half, w: x1 - x0 - half, y: y0, h: Math.max(H, minH(L, second, x1 - x0 - half)) });
    }
    settle(L, [w, n]);
    if (offScreen(L) > offScreen(L, before)) {
      restore(L, before);
      continue;
    }
    done = true;
    lastFlip = { tile, pair: [w, n], before, after: sig(L) };
    break;
  }
  if (!done) {
    // nothing it can flip with fits: say so instead of silently doing nothing
    w.classList.remove("nudge");
    void w.offsetWidth;
    w.classList.add("nudge");
    if (fresh) {
      // and if the page hadn't been rearranged yet, leave it exactly as designed
      untile(tile);
      focusWin(w);
      return;
    }
  }
  render(L, true);
  focusWin(w);
}

/** alt + f: the focused window fills the screen; again to put it back. */
export function toggleFullscreen() {
  const w = document.querySelector<HTMLElement>(".win.fullscreen") ?? focused();
  if (!w) return;
  w.classList.toggle("fullscreen");
  focusWin(w);
}
