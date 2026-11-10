"use client";
/**
 * Easter eggs. Ten are hidden around the site; `ls -a` shows the ~/.secrets file and `cat .secrets`
 * lists them, scrambled until you find each one. Progress is saved in this browser.
 * Finding all ten unlocks the bonus track (site.music.bonus) in the music app.
 */
import { useEffect, useState } from "react";

export type SecretId = "shark" | "konami" | "rmrf" | "midnight" | "lamp" | "smoke" | "owl" | "tenx" | "console" | "wish";

export const SECRET_LIST: { id: SecretId; name: string; found: string; hint: string }[] = [
  { id: "shark", name: "shark bait", found: "poked the same shark until it snapped", hint: "they don't like being poked." },
  { id: "konami", name: "up up down down", found: "entered the konami code", hint: "an old cheat code still works here." },
  { id: "rmrf", name: "root access", found: "deleted the whole system (it got better)", hint: "with great power comes great responsibility." },
  { id: "midnight", name: "midnight in chicago", found: "rang in midnight over the skyline", hint: "the city celebrates at one exact minute." },
  { id: "lamp", name: "lights out", found: "broke the streetlight", hint: "that lamp in the rain can only take so much." },
  { id: "smoke", name: "smoke break", found: "gave the man in the rain a minute to himself", hint: "the man in the rain looks like he could use a break." },
  { id: "owl", name: "night owl", found: "visited when you should've been asleep", hint: "come back when you should be in bed." },
  { id: "tenx", name: "10x", found: "doubled your margin in one trade", hint: "some trades pay more than others." },
  { id: "console", name: "under the hood", found: "found the note in the console", hint: "developers know where to look." },
  { id: "wish", name: "make a wish", found: "caught a shooting star", hint: "keep an eye on the sky over the sea." },
];
export const SECRET_COUNT = SECRET_LIST.length;

const KEY = "parth-os:secrets";
/** fired on window with detail { id, name, count } when a secret is found for the first time */
export const SECRET_EVENT = "secret-found";

export function foundSecrets(): Set<SecretId> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    return new Set((Array.isArray(raw) ? raw : []).filter((x): x is SecretId => SECRET_LIST.some((s) => s.id === x)));
  } catch {
    return new Set();
  }
}

/** Mark a secret found. Returns true the first time. */
export function unlock(id: SecretId): boolean {
  if (typeof window === "undefined") return false;
  const have = foundSecrets();
  if (have.has(id)) return false;
  have.add(id);
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...have]));
  } catch {
    /* storage blocked: it still counts for this visit */
  }
  const s = SECRET_LIST.find((x) => x.id === id)!;
  window.dispatchEvent(new CustomEvent(SECRET_EVENT, { detail: { id, name: s.name, count: have.size } }));
  return true;
}

/** Secrets the visitor has found, kept in sync with new finds. */
export function useSecrets() {
  const [found, setFound] = useState<Set<SecretId>>(() => new Set());
  useEffect(() => {
    setFound(foundSecrets());
    const on = () => setFound(foundSecrets());
    window.addEventListener(SECRET_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(SECRET_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return found;
}

/** Same-length gibberish for a line that hasn't been found yet (stable per secret). */
export function scramble(text: string, seed: number) {
  const G = "#%@$&*?!/\\|=+~^<>";
  let h = Math.imul(seed + 1, 0x9e3779b1);
  return [...text]
    .map((ch) => {
      if (ch === " ") return " ";
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return G[(h >>> 0) % G.length];
    })
    .join("");
}
