/**
 * Live prices from Hyperliquid's public API (no key needed), the perp mid/trade prices:
 *   history: POST https://api.hyperliquid.xyz/info  {type:"candleSnapshot", req:{coin, interval:"1m", startTime}}
 *   ticks:   wss://api.hyperliquid.xyz/ws  subscribe {type:"trades", coin}
 * If either is blocked or slow, the caller falls back to the simulator.
 */

export type Asset = "BTC" | "ETH" | "SOL";
export const ASSETS: Asset[] = ["BTC", "ETH", "SOL"];

const INFO = "https://api.hyperliquid.xyz/info";
const WS = "wss://api.hyperliquid.xyz/ws";

export interface LiveCandle {
  t: number; // start, unix seconds
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface FeedHandlers {
  onHistory: (candles: LiveCandle[]) => void;
  onTick: (price: number, timeSec: number) => void;
  onFail: (why: string) => void;
}

interface HlCandle {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
}
interface HlTrade {
  coin: string;
  px: string;
  time: number;
}

/** btop can kill the feed: while paused, ticks are dropped and prices stop moving. */
export const feedControl = { paused: false };

export class LiveFeed {
  private ws: WebSocket | null = null;
  private dead = false;
  private gotTick = false;
  private timer = 0;
  private ping = 0;
  private drops = 0;

  constructor(
    private asset: Asset,
    private h: FeedHandlers,
  ) {
    this.start();
  }

  private async start() {
    const coin = this.asset;
    // a watchdog: no tick within 8s means the network is blocked
    this.timer = window.setTimeout(() => {
      if (!this.gotTick) this.fail("timeout");
    }, 8000);
    try {
      const res = await fetch(INFO, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "candleSnapshot", req: { coin, interval: "1m", startTime: Date.now() - 240 * 60_000 } }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const rows = (await res.json()) as HlCandle[];
      if (this.dead) return;
      const candles = rows.slice(-240).map((r) => ({ t: Math.floor(r.t / 1000), o: +r.o, h: +r.h, l: +r.l, c: +r.c }));
      if (candles.length) this.h.onHistory(candles);
    } catch (e) {
      if (!this.dead) this.fail(`history: ${(e as Error).message}`);
      return;
    }
    if (!this.dead) this.socket();
  }

  private socket() {
    const coin = this.asset;
    try {
      const ws = new WebSocket(WS);
      this.ws = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "trades", coin } }));
        // Hyperliquid drops sockets that go quiet for a minute
        clearInterval(this.ping);
        this.ping = window.setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ method: "ping" })), 30_000);
      };
      ws.onmessage = (ev) => {
        if (feedControl.paused) return;
        try {
          const m = JSON.parse(ev.data as string);
          if (m.channel !== "trades" || !Array.isArray(m.data)) return;
          const last = (m.data as HlTrade[]).filter((d) => d.coin === coin).pop();
          if (!last) return;
          this.gotTick = true;
          this.drops = 0;
          this.h.onTick(parseFloat(last.px), last.time / 1000);
        } catch {
          /* ignore malformed frames */
        }
      };
      ws.onclose = () => {
        if (this.dead) return;
        // it was working: quietly reconnect a few times before giving up
        if (this.gotTick && this.drops++ < 5) window.setTimeout(() => !this.dead && this.socket(), 1500 * this.drops);
        else this.fail("socket closed");
      };
    } catch (e) {
      this.fail(`socket: ${(e as Error).message}`);
    }
  }

  private fail(why: string) {
    if (this.dead) return;
    this.close();
    this.h.onFail(why);
  }

  close() {
    this.dead = true;
    clearTimeout(this.timer);
    clearInterval(this.ping);
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
    this.ws = null;
  }
}
