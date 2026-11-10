/**
 * Market: a paper-trading game on an ASCII candlestick chart.
 *
 * Prices are live (Hyperliquid's public feed, 1-minute candles) for BTC, ETH and SOL. If the feed can't be
 * reached it falls back to a simulator with fast candles, and only then can you drag to pump or dump.
 *
 * Each coin has its own chart and position. Switching coins doesn't close anything or restart the price:
 * all three keep moving in the background, and liquidations, stops and targets fire on coins you aren't
 * looking at. The balance is shared, so you can't put up more than you have free.
 *
 *   spot:  click above the price line to buy; click below to sell what you hold (spot can't short)
 *   perps: click above to go long, below to go short, at 1–10x; click the other side to close.
 *          Every perp has a liquidation price: touch it and the margin is gone.
 *   take profit / stop loss: with a position open, drag on the price axis (the numbers on the right).
 *          The profit side of the price sets a take profit, the loss side a stop; drag a tag to move it,
 *          click it to remove it. Both fill at their level. A stop can't go past the liquidation price.
 *
 * Progress is saved in this browser: balance, record, settings, and open positions on live prices (they
 * pick back up at the current price). Simulated positions are settled at their last price when you leave.
 * [reset] in the menu starts over at $10,000 (the terminal's `reset` leaves the game alone).
 *
 * Effects: entries burst ^ or v; while open, + rises when you're up and - drips when you're down;
 * a profitable close rains $; a losing close cracks the chart and shakes it.
 */
import { clamp, hash3, rand } from "./math";
import type { Input, Scene } from "./scenes";
import { ASSETS, LiveFeed, type Asset, type LiveCandle } from "./feed";
import { unlock } from "@/lib/secrets";

const C = (s: string) => s.charCodeAt(0);
const SIM_CANDLE = 0.55;
export const SIZE_MIN = 500;
export const SIZE_MAX = 5000;
export const SIZE_STEP = 500;
const SIM_START: Record<Asset, number> = { BTC: 67000, ETH: 3400, SOL: 160 };
const START_BALANCE = 10000;
const STORE = "parth-os:paper";
/** The terminal's `reset` sends this so an open trading window starts over too. */
export const PAPER_RESET = "paper-reset";

interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  g: string;
  v: number;
  grav: number;
}
interface Position {
  kind: "spot" | "perp";
  side: 1 | -1;
  entry: number;
  size: number; // coins
  margin: number; // dollars at risk (spot: the whole notional)
  lev: number;
  liq: number; // NaN for spot
  tp: number; // NaN = none
  sl: number; // NaN = none
  t0: number;
}
export type Mode = "spot" | "perps";
export type Source = "connecting" | "live" | "sim";

/** One coin: its chart, its price process, and its position. */
interface Book {
  asset: Asset;
  candles: Candle[];
  price: number;
  drift: number;
  vol: number;
  whale: number;
  sinceCandle: number;
  source: Source;
  lastTickAt: number;
  feed: LiveFeed | null;
  pos: Position | null;
  /** a saved live position waiting for the first live price */
  pending: Position | null;
}

export interface OpenSummary {
  asset: Asset;
  label: string;
  pnl: number;
}
export interface MarketState {
  asset: Asset;
  mode: Mode;
  lev: number;
  size: number;
  source: Source;
  open: boolean;
  fresh: boolean;
  /** which coins have a position open (the menu marks them) */
  openAssets: Asset[];
}
interface Note {
  text: string;
  t0: number;
  y: number;
  up: boolean;
}
interface Saved {
  v: 1 | 2;
  balance: number;
  realized: number;
  trades: number;
  wins: number;
  liqs?: number;
  achv?: string[];
  asset: Asset;
  mode: Mode;
  lev: number;
  size: number;
  live: boolean;
  /** v2: one per coin; v1 saved a single position on `asset` */
  pos: Partial<Record<Asset, Position>> | Position | null;
}

const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (n: number) => `${n < 0 ? "-" : "+"}$${fmt(Math.abs(n))}`;
const pd = (p: number) => (p >= 10 ? 2 : 3);
const has = (n: number) => !Number.isNaN(n);

export class Market implements Scene {
  private w = 0;
  private h = 0;
  private cols = 0;
  private rows = 0;
  private cw = 10;
  private ch = 14;
  private t = 0;

  private asset: Asset = "BTC";
  private mode: Mode = "spot";
  private lev = 5;
  private size = 2500;
  private wantLive = true;
  onChange?: (s: MarketState) => void;

  private books = {} as Record<Asset, Book>;
  private lo = 0;
  private hi = 1;

  private balance = START_BALANCE;
  private realized = 0;
  private trades = 0;
  private wins = 0;
  private liqs = 0;
  private achv = new Set<string>();

  private parts: Particle[] = [];
  private notes: Note[] = [];
  private shake = 0;
  private cracks: { c: number; r: number; g: string; t0: number }[] = [];
  private pulse = 0;
  private hover = { x: 0, y: 0, on: false };
  /** dragging a TP/SL on the price axis */
  private axisDrag: { on: boolean; which: "tp" | "sl" } = { on: false, which: "tp" };
  private wasDragging = false;
  private sinceSave = 0;
  private onLeave = () => this.save();
  private onReset = () => this.reset();

  flash = 0;

  constructor() {
    for (const a of ASSETS) this.books[a] = this.newBook(a);
    this.load();
    for (const a of ASSETS) {
      if (this.wantLive) this.connect(this.books[a]);
      else this.books[a].source = "sim";
    }
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", this.onLeave);
      window.addEventListener(PAPER_RESET, this.onReset);
    }
  }

  private get b() {
    return this.books[this.asset];
  }
  private get price() {
    return this.b.price;
  }

  // ── data ─────────────────────────────────────────────
  private newBook(asset: Asset): Book {
    const b: Book = { asset, candles: [], price: 0, drift: 0, vol: 0.0009, whale: 0, sinceCandle: 0, source: "connecting", lastTickAt: 0, feed: null, pos: null, pending: null };
    this.seedSim(b);
    return b;
  }

  private seedSim(b: Book) {
    b.price = SIM_START[b.asset] * (1 + rand(-0.02, 0.02));
    b.candles = [];
    for (let i = 0; i < 160; i++) {
      const o = b.price;
      let h = o;
      let l = o;
      for (let k = 0; k < 12; k++) {
        this.simTick(b, SIM_CANDLE / 12);
        h = Math.max(h, b.price);
        l = Math.min(l, b.price);
      }
      b.candles.push({ t: i, o, h, l, c: b.price });
    }
    b.candles.push({ t: 160, o: b.price, h: b.price, l: b.price, c: b.price });
    if (b.asset === this.asset && this.books[b.asset]) this.fitNow();
  }

  private connect(b: Book) {
    b.feed?.close();
    b.source = "connecting";
    if (typeof window === "undefined" || typeof WebSocket === "undefined") {
      b.source = "sim";
      return;
    }
    b.feed = new LiveFeed(b.asset, {
      onHistory: (cs: LiveCandle[]) => {
        b.candles = cs.map((c) => ({ ...c }));
        b.price = cs[cs.length - 1].c;
        b.source = "live";
        if (b.pending) {
          b.pos = { ...b.pending, t0: this.t };
          b.pending = null;
          this.note(b, "position restored · live", this.h * 0.4, true);
        }
        if (b.asset === this.asset) this.fitNow();
        this.emit();
      },
      onTick: (p, ts) => {
        b.source = "live";
        b.lastTickAt = this.t;
        b.price = p;
        const bucket = Math.floor(ts / 60) * 60;
        const cur = b.candles[b.candles.length - 1];
        if (!cur || bucket > cur.t) {
          b.candles.push({ t: bucket, o: cur ? cur.c : p, h: p, l: p, c: p });
          if (b.candles.length > 400) b.candles.shift();
        } else {
          cur.c = p;
          cur.h = Math.max(cur.h, p);
          cur.l = Math.min(cur.l, p);
        }
      },
      onFail: () => {
        // a live position can't keep going on made-up prices: it goes back at its entry
        if (b.pending) this.note(b, "no live price · saved position closed at entry", this.h * 0.5, false);
        b.pending = null;
        if (b.pos) this.close(b, "closed", true);
        b.feed = null;
        b.source = "sim";
        if (b.asset === this.asset) this.notes.push({ text: "live feed unreachable · simulating", t0: this.t, y: this.h * 0.5, up: true });
        this.emit();
      },
    });
  }

  private simTick(b: Book, dt: number) {
    if (Math.random() < dt * 0.25) b.drift = rand(-1, 1) * 0.0004;
    b.vol = clamp(b.vol + (rand(-1, 1) * 0.00025 + (0.0009 - b.vol) * 0.4) * dt * 6, 0.0004, 0.003);
    const shock = Math.random() < dt * 0.04 ? rand(-1, 1) * 0.006 : 0;
    const r = b.drift * dt * 10 + b.vol * Math.sqrt(dt * 10) * gauss() + shock + b.whale * dt;
    b.price *= 1 + r;
    b.whale *= Math.exp(-dt * 2.5);
  }

  // ── state + saving ───────────────────────────────────
  get state(): MarketState {
    const b = this.b;
    const openAssets = ASSETS.filter((a) => this.books[a].pos || this.books[a].pending);
    return {
      asset: this.asset,
      mode: this.mode,
      lev: this.lev,
      size: this.size,
      source: b.source,
      open: !!(b.pos || b.pending),
      fresh: !openAssets.length && this.trades === 0 && this.balance === START_BALANCE,
      openAssets,
    };
  }
  private emit() {
    this.onChange?.(this.state);
    this.save();
  }

  private load() {
    let d: Saved | null = null;
    try {
      d = JSON.parse(window.localStorage.getItem(STORE) || "null");
    } catch {
      return;
    }
    if (!d || (d.v !== 1 && d.v !== 2)) return;
    const num = (x: unknown, dflt: number) => (typeof x === "number" && isFinite(x) ? x : dflt);
    this.balance = num(d.balance, START_BALANCE);
    this.realized = num(d.realized, 0);
    this.trades = num(d.trades, 0);
    this.wins = num(d.wins, 0);
    this.liqs = num(d.liqs, 0);
    if (Array.isArray(d.achv)) this.achv = new Set(d.achv.filter((x) => typeof x === "string"));
    if (ASSETS.includes(d.asset)) this.asset = d.asset;
    if (d.mode === "spot" || d.mode === "perps") this.mode = d.mode;
    this.lev = clamp(Math.round(num(d.lev, 5)), 1, 10);
    this.size = clamp(Math.round(num(d.size, 2500) / SIZE_STEP) * SIZE_STEP, SIZE_MIN, SIZE_MAX);
    this.wantLive = d.live !== false;
    const saved: Partial<Record<Asset, Position>> = !d.pos ? {} : d.v === 1 ? { [this.asset]: d.pos as Position } : (d.pos as Partial<Record<Asset, Position>>);
    if (this.wantLive)
      for (const a of ASSETS) {
        const p = saved[a];
        if (p && isFinite(p.entry)) this.books[a].pending = { ...p, liq: p.kind === "perp" ? num(p.liq, NaN) : NaN, tp: num(p.tp, NaN), sl: num(p.sl, NaN) };
      }
  }

  private save() {
    if (typeof window === "undefined") return;
    let { balance, realized, trades, wins } = this;
    const pos: Saved["pos"] = {};
    for (const a of ASSETS) {
      const b = this.books[a];
      if (b.pending) pos[a] = b.pending;
      else if (b.pos && b.source === "live") pos[a] = b.pos;
      else if (b.pos) {
        // simulated prices don't survive a reload, so a simulated position is banked at its last price
        const p = this.pnl(b);
        balance += p;
        realized += p;
        trades++;
        if (p >= 0) wins++;
      }
    }
    const d: Saved = { v: 2, balance, realized, trades, wins, liqs: this.liqs, achv: [...this.achv], asset: this.asset, mode: this.mode, lev: this.lev, size: this.size, live: this.wantLive, pos };
    try {
      window.localStorage.setItem(STORE, JSON.stringify(d));
    } catch {
      /* storage blocked */
    }
  }

  reset() {
    for (const a of ASSETS) {
      this.books[a].pos = null;
      this.books[a].pending = null;
    }
    this.balance = START_BALANCE;
    this.realized = 0;
    this.trades = 0;
    this.wins = 0;
    this.liqs = 0;
    this.parts = [];
    this.cracks = [];
    this.shake = 0;
    this.notes.push({ text: `balance reset · $${fmt(START_BALANCE)}`, t0: this.t, y: this.h * 0.45, up: true });
    this.emit();
  }

  // ── menu ─────────────────────────────────────────────
  setAsset(a: Asset) {
    if (a === this.asset) return;
    this.asset = a;
    this.axisDrag = { on: false, which: "tp" };
    this.fitNow();
    this.emit();
  }
  setMode(m: Mode) {
    if (this.b.pos || this.b.pending || m === this.mode) return;
    this.mode = m;
    this.emit();
  }
  setSize(dollars: number) {
    if (this.b.pos || this.b.pending) return;
    this.size = clamp(Math.round(dollars / SIZE_STEP) * SIZE_STEP, SIZE_MIN, SIZE_MAX);
    this.emit();
  }
  setLeverage(x: number) {
    if (this.b.pos || this.b.pending) return;
    this.lev = clamp(Math.round(x), 1, 10);
    this.emit();
  }
  setSource(src: "live" | "sim") {
    this.wantLive = src === "live";
    for (const a of ASSETS) {
      const b = this.books[a];
      if (b.pos) this.close(b);
      b.pending = null;
      b.feed?.close();
      b.feed = null;
      this.seedSim(b);
      if (this.wantLive) this.connect(b);
      else b.source = "sim";
    }
    this.emit();
  }

  // ── layout ───────────────────────────────────────────
  resize(w: number, h: number, cols: number, rows: number, cw: number, ch: number) {
    this.w = w;
    this.h = h;
    this.cols = cols;
    this.rows = rows;
    this.cw = cw;
    this.ch = ch;
  }
  private get area() {
    return { top: 5, bottom: this.rows - 3, left: 2, right: this.cols - 14 };
  }
  private visible() {
    const { left, right } = this.area;
    return this.b.candles.slice(-Math.max(10, Math.floor((right - left) / 2)));
  }
  private range() {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of this.visible()) {
      lo = Math.min(lo, c.l);
      hi = Math.max(hi, c.h);
    }
    const p = this.b.pos;
    if (p) {
      lo = Math.min(lo, p.entry);
      hi = Math.max(hi, p.entry);
      // keep the take profit and stop on the chart (unless they're far away)
      for (const lvl of [p.tp, p.sl])
        if (has(lvl) && Math.abs(lvl - this.price) / this.price < 0.06) {
          lo = Math.min(lo, lvl);
          hi = Math.max(hi, lvl);
        }
    }
    const pad = (hi - lo) * 0.18 + this.price * 0.0004;
    return [lo - pad, hi + pad];
  }
  private fitNow() {
    [this.lo, this.hi] = this.range();
  }
  private yOf(p: number) {
    const { top, bottom } = this.area;
    return bottom - ((p - this.lo) / (this.hi - this.lo || 1)) * (bottom - top);
  }
  private pOf(row: number) {
    const { top, bottom } = this.area;
    return this.lo + ((bottom - row) / (bottom - top)) * (this.hi - this.lo);
  }

  private pnl(b: Book, at = b.price) {
    const p = b.pos;
    if (!p) return 0;
    return Math.max(-p.margin, (at - p.entry) * p.side * p.size);
  }

  private note(b: Book, text: string, y: number, up: boolean) {
    this.notes.push({ text: b.asset === this.asset ? text : `${b.asset} · ${text}`, t0: this.t, y, up });
  }

  // ── simulation ───────────────────────────────────────
  step(dt: number, t: number, inp: Input) {
    this.t = t;
    this.sinceSave += dt;
    if (this.sinceSave > 3) {
      this.sinceSave = 0;
      this.save();
    }

    // every coin keeps moving, not only the one on screen
    for (const a of ASSETS) {
      const b = this.books[a];
      if (b.source === "live") continue;
      this.simTick(b, dt);
      const cur = b.candles[b.candles.length - 1];
      cur.c = b.price;
      cur.h = Math.max(cur.h, b.price);
      cur.l = Math.min(cur.l, b.price);
      b.sinceCandle += dt;
      if (b.sinceCandle > SIM_CANDLE) {
        b.sinceCandle = 0;
        b.candles.push({ t: cur.t + 1, o: b.price, h: b.price, l: b.price, c: b.price });
        if (b.candles.length > 400) b.candles.shift();
      }
    }

    // drag: on the price axis it sets a take profit or stop; on the chart (simulated) it pumps or dumps
    const inAxis = inp.px >= this.area.right * this.cw;
    if (inp.dragging && !this.wasDragging) this.axisDrag = { on: inAxis && !!this.b.pos, which: this.whichLevel(inp.py / this.ch) };
    if (!inp.dragging) this.axisDrag = { on: false, which: "tp" };
    this.wasDragging = inp.dragging;
    if (inp.dragging && this.axisDrag.on) this.dragLevel(this.axisDrag.which, inp.py);
    else if (inp.dragging && this.b.source === "sim") this.b.whale = clamp(this.b.whale + (-inp.dvy / 1500) * 0.004 * dt * 60 * inp.strength, -0.02, 0.02);

    if (!this.axisDrag.on) {
      const [lo, hi] = this.range();
      const k = Math.min(1, dt * 3);
      this.lo += (lo - this.lo) * k;
      this.hi += (hi - this.hi) * k;
    }

    const inside = inp.px >= 0 && inp.py >= 0 && inp.px < this.w && inp.py < this.h;
    this.hover = { x: inp.px, y: inp.py, on: inp.hover && inside && !inp.dragging };

    // liquidations, stops and targets, on every coin
    for (const a of ASSETS) {
      const b = this.books[a];
      const p = b.pos;
      if (!p) continue;
      const px = b.price;
      const past = (lvl: number) => (p.side === 1 ? px <= lvl : px >= lvl);
      const beyond = (lvl: number) => (p.side === 1 ? px >= lvl : px <= lvl);
      if (p.kind === "perp" && past(p.liq)) this.close(b, "liquidated");
      else if (has(p.sl) && past(p.sl)) this.close(b, "stopped out");
      else if (has(p.tp) && beyond(p.tp)) this.close(b, "take profit");
    }

    if (this.b.pos) {
      const b = this.b;
      const pos = b.pos!;
      const p = this.pnl(b);
      const yP = this.yOf(this.price) * this.ch;
      const yE = this.yOf(pos.entry) * this.ch;
      const x0 = (this.area.right - 1) * this.cw;
      if (Math.random() < dt * (6 + Math.min(20, Math.abs(p) / 8))) {
        const y = rand(Math.min(yP, yE), Math.max(yP, yE));
        const x = x0 - rand(0, this.w * 0.35);
        if (p >= 0) this.parts.push({ x, y, vx: 0, vy: -rand(30, 70), life: 1.2, max: 1.2, g: "+", v: 0.7, grav: 0 });
        else this.parts.push({ x, y, vx: 0, vy: rand(20, 50), life: 1.4, max: 1.4, g: hash3(x, y, 1) < 0.5 ? "-" : ".", v: 0.5, grav: 20 });
      }
      this.pulse += dt;
    }

    for (const q of this.parts) {
      q.vy += q.grav * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.life -= dt;
    }
    this.parts = this.parts.filter((q) => q.life > 0 && q.y > -40 && q.y < this.h + 40);
    if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
    this.notes = this.notes.filter((n) => t - n.t0 < 2.8);
    this.cracks = this.cracks.filter((c) => t - c.t0 < 1.6);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 1.8);
  }

  /**
   * Which level a drag on the axis moves, decided when it starts: grab an existing tag to move it,
   * otherwise the profit side of the price is the take profit and the loss side is the stop.
   */
  private whichLevel(row: number): "tp" | "sl" {
    const pos = this.b.pos;
    if (!pos) return "tp";
    const near = (lvl: number) => has(lvl) && Math.abs(this.yOf(lvl) - row) <= 1.5;
    if (near(pos.tp)) return "tp";
    if (near(pos.sl)) return "sl";
    return (this.pOf(row) - this.price) * pos.side > 0 ? "tp" : "sl";
  }

  /** Move the take profit or stop to where the pointer is. It stays on its own side of the price. */
  private dragLevel(which: "tp" | "sl", py: number) {
    const pos = this.b.pos;
    if (!pos) return;
    const lvl = this.pOf(py / this.ch);
    const gap = this.price * 0.0003; // keep it at least a hair away from the price
    if (which === "tp") {
      pos.tp = pos.side === 1 ? Math.max(lvl, this.price + gap) : Math.min(lvl, this.price - gap);
    } else {
      let sl = pos.side === 1 ? Math.min(lvl, this.price - gap) : Math.max(lvl, this.price + gap);
      // a stop past the liquidation price would never fire
      if (pos.kind === "perp") {
        const floor = pos.liq + (pos.entry - pos.liq) * 0.02;
        sl = pos.side === 1 ? Math.max(sl, floor) : Math.min(sl, floor);
      } else sl = Math.max(sl, 0);
      pos.sl = sl;
    }
  }

  click(x: number, y: number) {
    const r = Math.floor(y / this.ch);
    if (r < this.area.top - 1) return;
    const b = this.b;
    const c = Math.floor(x / this.cw);

    // on the price axis: click a TP/SL tag to remove it
    if (c >= this.area.right) {
      const pos = b.pos;
      if (!pos) return;
      const near = (lvl: number) => has(lvl) && Math.abs(Math.round(this.yOf(lvl)) - r) <= 1;
      if (near(pos.tp)) {
        pos.tp = NaN;
        this.note(b, "take profit removed", y, true);
      } else if (near(pos.sl)) {
        pos.sl = NaN;
        this.note(b, "stop removed", y, false);
      }
      return;
    }

    if (b.pending) return;
    const priceY = this.yOf(this.price) * this.ch;
    const above = y < priceY;
    if (!b.pos) return this.open(above, x);
    const closing = (b.pos.side === 1) !== above;
    if (closing) this.close(b);
    else this.burst(above ? 1 : -1, x, priceY, 10);
  }

  private marginInUse() {
    let m = 0;
    for (const a of ASSETS) m += this.books[a].pos?.margin ?? 0;
    return m;
  }

  private open(above: boolean, x: number) {
    const b = this.b;
    const y = this.yOf(this.price) * this.ch;
    const dp = pd(this.price);
    const free = this.balance - this.marginInUse();
    if (this.size > free) {
      const msg = this.balance < SIZE_MIN ? `balance $${fmt(this.balance)} · [reset] to start over` : free < SIZE_MIN ? "all your money is in other positions" : "not enough free balance · lower the size";
      this.notes.push({ text: msg, t0: this.t, y, up: false });
      return;
    }
    if (this.mode === "spot") {
      if (!above) {
        this.notes.push({ text: "spot can't short · switch to perps", t0: this.t, y, up: false });
        return;
      }
      const size = this.size / this.price;
      b.pos = { kind: "spot", side: 1, entry: this.price, size, margin: this.size, lev: 1, liq: NaN, tp: NaN, sl: NaN, t0: this.t };
      this.notes.push({ text: `BUY ${fmt(size, 4)} ${this.asset} @ ${fmt(this.price, dp)}`, t0: this.t, y, up: true });
    } else {
      const side: 1 | -1 = above ? 1 : -1;
      const size = (this.size * this.lev) / this.price;
      const liq = this.price * (1 - side * (0.95 / this.lev));
      b.pos = { kind: "perp", side, entry: this.price, size, margin: this.size, lev: this.lev, liq, tp: NaN, sl: NaN, t0: this.t };
      this.notes.push({ text: `${side === 1 ? "LONG" : "SHORT"} ${this.lev}x ${this.asset} @ ${fmt(this.price, dp)}`, t0: this.t, y, up: side === 1 });
    }
    this.pulse = 0;
    this.burst(above ? 1 : -1, x, y, 40);
    this.emit();
  }

  private burst(side: 1 | -1, x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = (-Math.PI / 2) * side + rand(-0.7, 0.7);
      const v = rand(120, 380);
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.5, 1), max: 1, g: side === 1 ? "^" : "v", v: 1, grav: side * 120 });
    }
  }

  /** atEntry: give the margin back with no gain or loss (a live position that lost its feed). */
  private close(b: Book, why = "closed", atEntry = false) {
    const pos = b.pos;
    if (!pos) return;
    // stops and targets fill at their level, not wherever the price jumped to
    const fill = why === "stopped out" ? pos.sl : why === "take profit" ? pos.tp : b.price;
    const p = atEntry ? 0 : why === "liquidated" ? -pos.margin : this.pnl(b, fill);
    b.pos = null;
    if (atEntry) {
      this.note(b, "closed at entry", this.h * 0.5, false);
      this.emit();
      return;
    }
    this.balance += p;
    this.realized += p;
    this.trades++;
    if (why === "liquidated") this.liqs++;
    this.achievements(why, p, (p / pos.margin) * 100);
    const onScreen = b.asset === this.asset;
    const y = onScreen ? this.yOf(b.price) * this.ch : this.h * 0.35;
    this.note(b, `${why.toUpperCase()} ${money(p)}`, y, p >= 0);
    if (p >= 0) {
      this.wins++;
      const n = Math.round(clamp(60 + p / 2, 60, 260));
      for (let i = 0; i < n; i++) {
        this.parts.push({ x: rand(0, this.w), y: rand(-this.h * 0.4, 0), vx: rand(-30, 30), vy: rand(60, 220), life: rand(2, 3.4), max: 3.4, g: hash3(i, n, 3) < 0.55 ? "$" : "+", v: 1, grav: 60 });
      }
      if (onScreen)
        for (let i = 0; i < 40; i++) {
          const a = rand(0, Math.PI * 2);
          const v = rand(150, 520);
          this.parts.push({ x: (this.area.right - 2) * this.cw, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.5, 1.1), max: 1.1, g: "*", v: 1, grav: 200 });
        }
      this.flash = 0.6;
    } else {
      this.shake = 1;
      const c0 = this.area.right - 2;
      const r0 = Math.round(y / this.ch);
      for (let arm = 0; arm < 5; arm++) {
        let c = c0;
        let r = r0;
        const dc = -1 - Math.random() * 2;
        const dr = rand(-1.4, 1.4);
        for (let k = 0; k < 18 + arm * 4; k++) {
          c += dc * 0.6;
          r += dr * 0.6 + rand(-0.6, 0.6);
          this.cracks.push({ c: Math.round(c), r: Math.round(r), g: Math.abs(dr) < 0.5 ? "_" : dr > 0 ? "\\" : "/", t0: this.t });
        }
      }
      for (let i = 0; i < 70; i++) {
        this.parts.push({ x: rand(this.w * 0.3, (this.area.right - 1) * this.cw), y: y + rand(-30, 30), vx: rand(-40, 40), vy: rand(-80, 30), life: rand(1, 2), max: 2, g: hash3(i, 7, 7) < 0.5 ? "x" : ".", v: 0.85, grav: 520 });
      }
    }
    this.emit();
  }

  /** Little milestones, each shown once (they survive a balance reset, like a record). */
  private achievements(why: string, p: number, pct: number) {
    const earn = (id: string, text: string) => {
      if (this.achv.has(id)) return;
      this.achv.add(id);
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("site-toast", { detail: { text: `achievement · ${text}`, ms: 4200 } })), 900);
    };
    if (p > 0) earn("first-win", "first green trade");
    if (why === "take profit") earn("tp", "sniper: hit your take profit");
    if (why === "stopped out") earn("sl", "risk manager: your stop saved you");
    if (why === "liquidated") earn("rekt", "rekt: first liquidation. it happens.");
    if (this.liqs >= 3) earn("rekt3", "three liquidations. maybe stick to spot.");
    if (this.balance >= 25000) earn("25k", "25k club");
    if (this.balance >= 100000) earn("100k", "six figures (paper, but still)");
    if (this.trades >= 50) earn("50", "50 trades. touch grass.");
    // the secret one: double your margin in a single trade
    if (pct >= 100 && unlock("tenx")) this.flash = 1;
  }

  // ── drawing ──────────────────────────────────────────
  fill(glyph: Uint16Array, level: Float32Array, t: number) {
    const { cols, rows, cw, ch } = this;
    const { top, bottom, left, right } = this.area;
    const b = this.b;
    const jitter = this.shake > 0 ? Math.round(Math.sin(t * 90) * 3 * this.shake) : 0;
    const put = (c: number, r: number, g: number, v: number, shakes = true) => {
      if (shakes) c += jitter;
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      const i = r * cols + c;
      if (v >= level[i]) {
        level[i] = v;
        glyph[i] = g;
      }
    };
    const text = (c: number, r: number, s: string, v: number, shakes = true) => {
      for (let k = 0; k < s.length; k++) if (s[k] !== " ") put(c + k, r, s.charCodeAt(k), v, shakes);
      return c + s.length;
    };
    const dp = pd(this.price);

    // HUD
    const live = b.source === "live";
    const stale = live && t - b.lastTickAt > 20;
    const src = b.source === "connecting" ? "connecting..." : live ? (stale ? "o live (quiet)" : `${Math.sin(t * 4) > 0 ? "*" : "o"} live · hyperliquid`) : "o simulated";
    text(left, 1, `${this.asset}/USD  ${this.mode === "spot" ? "spot" : `perps ${this.lev}x`}`, 0.9, false);
    text(right - src.length + 12, 1, src, live ? 0.75 : 0.4, false);
    const used = this.marginInUse();
    text(left, 2, `balance  $${fmt(this.balance)}${used ? `   in positions $${fmt(used, 0)}` : ""}`, 0.5, false);
    text(left, 3, `realized ${money(this.realized)}   trades ${this.trades}  wins ${this.wins}`, 0.4, false);
    // positions on the other coins
    const others = ASSETS.filter((a) => a !== this.asset && this.books[a].pos).map((a) => {
      const o = this.books[a];
      const p = o.pos!;
      return `${a} ${p.kind === "spot" ? "spot" : `${p.side === 1 ? "long" : "short"} ${p.lev}x`} ${money(this.pnl(o))}`;
    });
    if (b.pending) text(left, 4, `saved ${b.pending.kind === "spot" ? "spot" : b.pending.side === 1 ? "long" : "short"} @ ${fmt(b.pending.entry, pd(b.pending.entry))} · waiting for the live price...`, 0.55, false);
    else if (others.length) text(left, 4, `also open: ${others.join(" · ")}`, 0.5, false);

    // price grid + axis labels
    const ticks = 5;
    for (let k = 0; k <= ticks; k++) {
      const r = Math.round(top + ((bottom - top) * k) / ticks);
      for (let cc = left; cc < right; cc += 3) put(cc, r, C("."), 0.09);
      text(right + 2, r, fmt(this.pOf(r), dp === 3 ? 2 : 0), 0.3);
    }

    // candles
    const vis = this.visible();
    const n = Math.floor((right - left) / 2);
    const off = n - vis.length;
    vis.forEach((cd, i) => {
      const cc = left + (off + i) * 2;
      const rh = Math.round(this.yOf(cd.h));
      const rl = Math.round(this.yOf(cd.l));
      const ro = Math.round(this.yOf(cd.o));
      const rc = Math.round(this.yOf(cd.c));
      const bull = cd.c >= cd.o;
      const age = vis.length - 1 - i;
      const fade = 0.55 + 0.45 * Math.max(0, 1 - age / n);
      for (let r = rh; r <= rl; r++) put(cc, r, C("|"), 0.35 * fade);
      for (let r = Math.min(ro, rc); r <= Math.max(ro, rc); r++) put(cc, r, bull ? C("#") : C(":"), (bull ? 0.9 : 0.55) * fade);
    });

    // live price line and tag
    const rp = Math.round(this.yOf(this.price));
    for (let cc = left; cc < right; cc += 2) put(cc, rp, C("-"), 0.22);
    text(right + 1, rp, `>${fmt(this.price, dp)}`, 1);

    const pos = b.pos;
    if (pos) {
      const re = Math.round(this.yOf(pos.entry));
      const p = this.pnl(b);
      const lbl = pos.kind === "spot" ? `HOLDING ${fmt(pos.entry, dp)}` : `${pos.side === 1 ? "LONG" : "SHORT"} ${pos.lev}x ${fmt(pos.entry, dp)}`;
      for (let cc = left; cc < right; cc++) put(cc, re, C("="), 0.5);
      const notional = pos.size * pos.entry;
      const sizeLbl = `${fmt(pos.size, 4)} ${this.asset} · $${fmt(notional, 0)}${pos.kind === "perp" ? ` · margin $${fmt(pos.margin, 0)}` : ""}`;
      text(left + 1, re - 1, `${lbl}   ${sizeLbl}`, 0.75);
      if (pos.kind === "perp") {
        const rl = Math.round(this.yOf(pos.liq));
        if (rl >= top && rl <= bottom) {
          for (let cc = left; cc < right; cc += 2) put(cc, rl, C("x"), 0.45 + 0.25 * Math.max(0, Math.sin(t * 6)));
          text(left + 1, rl + (pos.side === 1 ? 1 : -1), `LIQ ${fmt(pos.liq, dp)}`, 0.7);
        } else text(left + 1, pos.side === 1 ? bottom : top, `liq ${fmt(pos.liq, dp)} ${pos.side === 1 ? "v" : "^"}`, 0.45);
      }
      // take profit and stop: dashed lines with a tag on the axis showing what you'd make or lose
      const level = (lvl: number, tag: string, glyphC: string) => {
        if (!has(lvl)) return;
        const rr = Math.round(this.yOf(lvl));
        const out = pnlAt(lvl);
        if (rr < top || rr > bottom) {
          text(right - 22, (lvl - this.price) * 1 > 0 ? top : bottom, `${tag} ${fmt(lvl, dp)} ${money(out)} ${lvl > this.price ? "^" : "v"}`, 0.5);
          return;
        }
        for (let cc = left; cc < right; cc += 3) put(cc, rr, C(glyphC), 0.42);
        text(right + 1, rr, `${tag} ${money(out)}`, 0.85);
      };
      const pnlAt = (lvl: number) => this.pnl(b, lvl);
      level(pos.tp, "TP", "+");
      level(pos.sl, "SL", "_");

      const a = Math.min(re, rp);
      const z = Math.max(re, rp);
      const breathe = 0.5 + 0.5 * Math.sin(this.pulse * 4);
      for (let r = a + 1; r < z; r++)
        for (let cc = right - 30; cc < right; cc++) if (hash3(cc, r, Math.floor(t * 3)) < 0.18) put(cc, r, C(p >= 0 ? "'" : ","), 0.12 + 0.12 * breathe);
      const pct = (p / pos.margin) * 100;
      text(right + 1, rp + (rp > re ? 1 : -1), money(p), 0.95);
      text(right + 1, rp + (rp > re ? 2 : -2), `${pct >= 0 ? "+" : ""}${fmt(pct)}%`, 0.6);
    }

    // hover hint
    if (this.hover.on) {
      const hc = Math.round(this.hover.x / cw);
      const hr = Math.round(this.hover.y / ch);
      if (hc >= right && pos) {
        const lvl = this.pOf(hr);
        const profit = (lvl - this.price) * pos.side > 0;
        const near = (l: number) => has(l) && Math.abs(Math.round(this.yOf(l)) - hr) <= 1;
        const hint = near(pos.tp) || near(pos.sl) ? "drag: move · click: remove" : profit ? "drag: take profit" : "drag: stop loss";
        text(right - hint.length - 1, hr, hint, 0.7);
      } else if (hc < right && hr >= top - 1) {
        const above = hr < rp;
        let hint = "";
        if (!pos) hint = this.mode === "spot" ? (above ? "[ BUY ]" : "") : above ? `[ LONG ${this.lev}x ]` : `[ SHORT ${this.lev}x ]`;
        else if ((pos.side === 1) !== above) hint = pos.kind === "spot" ? "[ SELL ]" : "[ CLOSE ]";
        if (hint) text(hc + 2, hr, hint, 0.75);
      }
    }

    const pump = b.source === "sim" ? " · drag to pump or dump" : "";
    const help = pos
      ? cols > 100
        ? `other side of the line closes · drag on the prices (right) to set take profit / stop loss${pump}`
        : "other side: close · drag prices: tp / sl"
      : this.mode === "spot"
        ? cols > 100
          ? `click above the line to buy · click below to sell${pump}`
          : "above: buy · below: sell"
        : cols > 100
          ? `click above the line to long · below to short · other side closes · price hits liq = margin gone${pump}`
          : "above: long · below: short · other side: close";
    text(left, rows - 2, help, 0.32, false);

    for (const nt of this.notes) {
      const age = t - nt.t0;
      const r = Math.round(nt.y / ch + (nt.up ? -1 : 1) * age * 2.4);
      text(right - nt.text.length - 2, r, nt.text, clamp(1.2 - age * 0.45, 0, 1));
    }
    for (const k of this.cracks) put(k.c, k.r, C(k.g), clamp(1 - (t - k.t0) / 1.6, 0, 1));
    for (const q of this.parts) put(Math.floor(q.x / cw), Math.floor(q.y / ch), C(q.g), q.v * clamp(q.life / (q.max * 0.5), 0, 1));
  }

  destroy() {
    this.save();
    for (const a of ASSETS) this.books[a].feed?.close();
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", this.onLeave);
      window.removeEventListener(PAPER_RESET, this.onReset);
    }
  }
}

function gauss() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
