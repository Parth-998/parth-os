"use client";
import { useEffect, useRef, useState } from "react";
import { GridEngine } from "@/lib/ascii/scenes";
import { Market, SIZE_MAX, SIZE_MIN, SIZE_STEP, type MarketState } from "@/lib/ascii/market";
import { ASSETS } from "@/lib/ascii/feed";
import type { Motion, Palette } from "@/lib/ascii";

/**
 * Paper trading in a window: BTC/ETH/SOL on an ASCII candle chart.
 * The menu picks the coin, spot or perps (1–10x), and live or simulated prices.
 */
export default function TradingSim({ palette, motion }: { palette: Palette; motion: Motion }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<GridEngine | null>(null);
  const market = useRef<Market | null>(null);
  const live = useRef({ palette, motion });
  live.current = { palette, motion };
  const [st, setSt] = useState<MarketState>({ asset: "BTC", mode: "spot", lev: 5, size: 2500, source: "connecting", open: false, fresh: true, openAssets: [] });
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (st.fresh) setConfirm(false);
  }, [st.fresh]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const m = new Market();
    m.onChange = setSt;
    setSt(m.state);
    const e = new GridEngine(c, m, { acceptsPointer: (t) => t === c });
    e.setPalette(live.current.palette, 1);
    e.setMotion(live.current.motion);
    engine.current = e;
    market.current = m;
    return () => {
      e.destroy();
      m.destroy();
      engine.current = null;
      market.current = null;
    };
  }, []);
  useEffect(() => engine.current?.setPalette(palette, 1), [palette]);
  useEffect(() => engine.current?.setMotion(motion), [motion]);

  const m = market.current;
  const locked = st.open; // can't change market or leverage with a position open
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="sim-bar mono flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px]">
        <Pick label="coin" options={ASSETS} value={st.asset} onPick={(a) => m?.setAsset(a)} mark={(a) => st.openAssets.includes(a)} />
        <Pick label="market" options={["spot", "perps"] as const} value={st.mode} onPick={(md) => m?.setMode(md)} disabled={locked} />
        <TextBar
          label="size"
          steps={(SIZE_MAX - SIZE_MIN) / SIZE_STEP + 1}
          index={(st.size - SIZE_MIN) / SIZE_STEP}
          text={`$${st.size.toLocaleString("en-US")}`}
          width="w-14"
          disabled={locked}
          title={locked ? "close your position to change the size" : st.mode === "spot" ? "how much to buy" : "margin per trade (times leverage)"}
          onIndex={(i) => m?.setSize(SIZE_MIN + i * SIZE_STEP)}
        />
        <TextBar
          label="lev"
          steps={10}
          index={(st.mode === "spot" ? 1 : st.lev) - 1}
          text={`${st.mode === "spot" ? 1 : st.lev}x`}
          width="w-7"
          disabled={st.mode === "spot" || locked}
          title={st.mode === "spot" ? "leverage is for perps" : locked ? "close your position to change leverage" : "leverage"}
          onIndex={(i) => m?.setLeverage(i + 1)}
        />
        <span className="ml-auto inline-flex items-center gap-4">
          {!st.fresh &&
            (confirm ? (
              <span className="inline-flex gap-1" style={{ color: "var(--faint)" }}>
                start over at $10,000?
                <button type="button" className="sim-pick" style={{ color: "var(--fg)" }} onClick={() => (m?.reset(), setConfirm(false))}>
                  [yes]
                </button>
                <button type="button" className="sim-pick" style={{ color: "var(--faint)" }} onClick={() => setConfirm(false)}>
                  [no]
                </button>
              </span>
            ) : (
              <button type="button" className="sim-pick" style={{ color: "var(--faint)" }} title="reset your paper balance and record" onClick={() => setConfirm(true)}>
                reset
              </button>
            ))}
          <Pick
            label="prices"
            options={["live", "simulated"] as const}
            value={st.source === "sim" ? "simulated" : "live"}
            onPick={(src) => m?.setSource(src === "live" ? "live" : "sim")}
          />
        </span>
      </div>
      <canvas ref={canvas} className="sim-canvas" aria-label="paper trading chart: click above the price line to buy or long, below to sell or short" />
    </div>
  );
}

/** Terminal-style picker: [selected] and the rest as plain words. */
function Pick<T extends string>({ label, options, value, onPick, disabled, mark }: { label: string; options: readonly T[]; value: T; onPick: (v: T) => void; disabled?: boolean; mark?: (v: T) => boolean }) {
  return (
    <span role="group" aria-label={label} className="inline-flex gap-1">
      {options.map((o) => {
        const on = o === value;
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            disabled={disabled && !on}
            onClick={() => onPick(o)}
            className="sim-pick"
            style={{ color: on ? "var(--fg)" : "var(--faint)" }}
          >
            {on ? `[${o}]` : `\u00a0${o}\u00a0`}
            {mark?.(o) ? <sup title="position open">*</sup> : null}
          </button>
        );
      })}
    </span>
  );
}

/** A setting as a text bar: lev [=====-----] 5x. Click or drag across it; arrow keys work too. */
function TextBar({ label, steps, index, text, width, disabled, title, onIndex }: { label: string; steps: number; index: number; text: string; width: string; disabled: boolean; title: string; onIndex: (i: number) => void }) {
  const set = (e: React.PointerEvent<HTMLSpanElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onIndex(Math.max(0, Math.min(steps - 1, Math.ceil(((e.clientX - r.left) / r.width) * steps) - 1)));
  };
  return (
    <span
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={steps - 1}
      aria-valuenow={index}
      aria-valuetext={text}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      className="inline-flex items-center gap-1.5 select-none"
      style={{ opacity: disabled ? 0.4 : 1, cursor: disabled ? "default" : "pointer" }}
      title={title}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") onIndex(Math.min(steps - 1, index + 1));
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onIndex(Math.max(0, index - 1));
        else return;
        e.preventDefault();
      }}
    >
      <span style={{ color: "var(--faint)" }}>{label}</span>
      <span
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          set(e);
        }}
        onPointerMove={(e) => !disabled && e.buttons === 1 && set(e)}
        style={{ color: "var(--fg)", whiteSpace: "pre" }}
      >
        [{"=".repeat(index + 1)}
        <span style={{ color: "var(--faint)" }}>{"-".repeat(steps - 1 - index)}</span>]
      </span>
      <span className={`${width} tabular-nums`} style={{ color: "var(--fg)" }}>
        {text}
      </span>
    </span>
  );
}
