"use client";
import { useEffect, useRef, useState } from "react";
import { openApp } from "@/lib/apps";
import { site } from "@/content/site";
import { SECRET_COUNT, SECRET_LIST, scramble, useSecrets, type SecretId } from "@/lib/secrets";

const SEEN = "parth-os:secrets-seen";
const GLYPHS = "#%@$&*?!/\\|=+~^<>";

/**
 * `cat .secrets`: eight lines of noise. Each one decodes into what it was once you've found it,
 * and a line you found since you last looked decodes in front of you.
 */
export default function SecretsFile() {
  const found = useSecrets();
  // which ones were already decoded the last time this file was printed
  const seen = useRef<Set<string> | null>(null);
  if (!seen.current) {
    try {
      seen.current = new Set(JSON.parse(window.localStorage.getItem(SEEN) || "[]"));
    } catch {
      seen.current = new Set();
    }
  }
  useEffect(() => {
    if (!found.size) return;
    try {
      window.localStorage.setItem(SEEN, JSON.stringify([...found]));
    } catch {
      /* fine */
    }
  }, [found]);

  const n = found.size;
  const bonus = site.music.bonus;
  return (
    <div className="py-1">
      <div style={{ color: "var(--fg)" }}>
        ~/.secrets · {n}/{SECRET_COUNT} found
      </div>
      <div style={{ color: "var(--faint)" }}>{"-".repeat(28)}</div>
      {SECRET_LIST.map((s, i) => {
        const got = found.has(s.id);
        return (
          <div key={s.id} className="flex gap-2">
            <span style={{ color: got ? "var(--fg)" : "var(--faint)" }}>{got ? "[x]" : "[ ]"}</span>
            {got ? (
              <span>
                <Decode text={s.name} play={!seen.current!.has(s.id)} className="t-cmd" /> <span style={{ color: "var(--muted)" }}>· {s.found}</span>
              </span>
            ) : (
              <span>
                <span style={{ color: "var(--faint)" }}>{scramble(s.name, i)}</span> <span style={{ color: "var(--faint)", opacity: 0.75 }}>· {s.hint}</span>
              </span>
            )}
          </div>
        );
      })}
      <div className="mt-1" style={{ color: n === SECRET_COUNT ? "var(--fg)" : "var(--faint)" }}>
        {n === SECRET_COUNT ? (
          bonus ? (
            <>
              all {SECRET_COUNT} found. bonus track unlocked: {bonus.title} · {bonus.artist}{" "}
              <button type="button" className="t-cmd underline" onClick={() => openApp("music", "bonus")}>
                play it
              </button>
            </>
          ) : (
            `all ${SECRET_COUNT} found. respect.`
          )
        )
          : n === 0
            ? "nothing found yet. they're hidden all over this machine."
            : `${SECRET_COUNT - n} to go. find them all for a bonus track.`}
      </div>
    </div>
  );
}

/** Text that scrambles and settles into place, left to right. */
function Decode({ text, play, className }: { text: string; play: boolean; className?: string }) {
  const [shown, setShown] = useState(play ? scramble(text, 99) : text);
  useEffect(() => {
    if (!play) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = (now - t0) / 900;
      const fixed = Math.floor(k * text.length);
      setShown([...text].map((ch, i) => (i < fixed || ch === " " ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join(""));
      if (fixed < text.length) raf = requestAnimationFrame(tick);
      else setShown(text);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, text]);
  return <span className={className}>{shown}</span>;
}

export type { SecretId };
