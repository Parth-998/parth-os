"use client";
/** shutdown: systemd says goodbye, the screen goes dark, and any key powers it back on. */
import { useEffect, useState } from "react";

const LINES = [
  "[  OK  ] Stopped target graphical interface.",
  "         Stopping music player daemon...",
  "[  OK  ] Stopped wallpaper.service.",
  "[  OK  ] Stopped hyprland session of user parth.",
  "[  OK  ] Removed slice user-1000.slice.",
  "         Unmounting /home/parth...",
  "[  OK  ] Unmounted /home/parth.",
  "[  OK  ] Reached target power-off.",
  "reboot: Power down",
];

export default function Shutdown({ onPowerOn }: { onPowerOn: () => void }) {
  const [n, setN] = useState(0);
  const off = n > LINES.length + 2;
  useEffect(() => {
    if (off) return;
    const id = window.setTimeout(() => setN((x) => x + 1), n === 0 ? 300 : 170 + Math.random() * 160);
    return () => clearTimeout(id);
  }, [n, off]);
  useEffect(() => {
    if (!off) return;
    // a short pause so the key that shut it down doesn't power it straight back on
    const t0 = performance.now();
    const on = () => performance.now() - t0 > 700 && onPowerOn();
    window.addEventListener("keydown", on);
    window.addEventListener("pointerdown", on);
    return () => {
      window.removeEventListener("keydown", on);
      window.removeEventListener("pointerdown", on);
    };
  }, [off, onPowerOn]);
  return (
    <div className="poweroff" role="status" aria-live="polite">
      {off ? <div className="press">press any key to power on</div> : <pre>{LINES.slice(0, n).join("\n")}</pre>}
    </div>
  );
}
