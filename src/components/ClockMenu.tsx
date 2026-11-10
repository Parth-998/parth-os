"use client";
/**
 * Click the clock: a calendar for the month, the time in chicago and bloomington, the weather in both
 * (open-meteo, no key) and live btc / eth / sol prices from hyperliquid. Like a waybar clock tooltip
 * plus a couple of the usual widgets.
 */
import { useEffect, useState } from "react";
import { site } from "@/content/site";

const PLACES = [
  { name: "chicago", tz: "America/Chicago", lat: 41.88, lon: -87.63 },
  { name: "bloomington", tz: "America/Indiana/Indianapolis", lat: 39.17, lon: -86.53 },
];
const WX: Record<number, string> = { 0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "cloudy", 45: "fog", 48: "fog", 51: "drizzle", 53: "drizzle", 55: "drizzle", 61: "rain", 63: "rain", 65: "heavy rain", 71: "snow", 73: "snow", 75: "heavy snow", 80: "showers", 81: "showers", 82: "storms", 95: "thunderstorm", 96: "thunderstorm", 99: "thunderstorm" };

export default function ClockMenu() {
  const [now, setNow] = useState(() => new Date());
  const [wx, setWx] = useState<Record<string, { t: number; code: number } | null>>({});
  const [px, setPx] = useState<Record<string, number> | null>(null);
  const [month, setMonth] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    for (const p of PLACES)
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`)
        .then((r) => r.json())
        .then((d) => setWx((w) => ({ ...w, [p.name]: { t: Math.round(d.current.temperature_2m), code: d.current.weather_code } })))
        .catch(() => setWx((w) => ({ ...w, [p.name]: null })));
    const prices = () =>
      fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "allMids" }) })
        .then((r) => r.json())
        .then((d: Record<string, string>) => setPx({ BTC: Number(d.BTC), ETH: Number(d.ETH), SOL: Number(d.SOL) }))
        .catch(() => setPx(null));
    prices();
    const id = window.setInterval(prices, 15000);
    return () => clearInterval(id);
  }, []);

  // the month, in chicago's calendar
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: site.timezone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now).map((p) => [p.type, p.value]));
  const y = Number(parts.year);
  const m = Number(parts.month) - 1 + month;
  const first = new Date(y, m, 1);
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = first.getDay();
  const today = month === 0 ? Number(parts.day) : -1;
  const title = first.toLocaleString("en-US", { month: "long", year: "numeric" }).toLowerCase();

  return (
    <div className="clockmenu pop">
      <div className="cm-cal">
        <div className="cm-cal-h">
          <button type="button" onClick={() => setMonth((x) => x - 1)} aria-label="previous month">
            ‹
          </button>
          <span>{title}</span>
          <button type="button" onClick={() => setMonth((x) => x + 1)} aria-label="next month">
            ›
          </button>
        </div>
        <div className="cm-grid">
          {["su", "mo", "tu", "we", "th", "fr", "sa"].map((d) => (
            <span key={d} className="cm-dow">
              {d}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`x${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => (
            <span key={i} className={i + 1 === today ? "cm-today" : undefined}>
              {i + 1}
            </span>
          ))}
        </div>
      </div>
      <div className="cm-side">
        {PLACES.map((p) => {
          const w = wx[p.name];
          return (
            <div key={p.name} className="cm-place">
              <div className="cm-row">
                <span className="cm-k">{p.name}</span>
                <span className="cm-v">{new Intl.DateTimeFormat("en-US", { timeZone: p.tz, hour: "numeric", minute: "2-digit" }).format(now).toLowerCase()}</span>
              </div>
              <div className="cm-row cm-dim">
                <span>{w === undefined ? "…" : w === null ? "weather unavailable" : WX[w.code] ?? "—"}</span>
                <span>{w ? `${w.t}°f` : ""}</span>
              </div>
            </div>
          );
        })}
        <div className="cm-place">
          <span className="cm-k">markets · hyperliquid</span>
          {(["BTC", "ETH", "SOL"] as const).map((c) => (
            <div key={c} className="cm-row">
              <span>{c.toLowerCase()}</span>
              <span className="cm-v">{px?.[c] ? `$${px[c].toLocaleString("en-US", { maximumFractionDigits: c === "SOL" ? 2 : 0 })}` : px === null ? "—" : "…"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
