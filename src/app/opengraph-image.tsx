/**
 * The picture shown when the site is shared (linkedin, imessage, discord, x): the desktop's bar,
 * a bit of ascii sky, the name and a terminal line. Generated once at build time.
 */
import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Parth Awana · parth-os, a linux-style desktop portfolio";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// a fixed scatter of ascii "stars", so the image is the same every build
const STARS = Array.from({ length: 70 }, (_, i) => {
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return { x: Math.round(r(1) * 1160) + 20, y: Math.round(r(2) * 470) + 60, c: r(3) < 0.2 ? "*" : r(3) < 0.6 ? "." : "·", o: 0.25 + r(4) * 0.5 };
});

export default async function Image() {
  // the site's own font, from the geist package
  const dir = join(process.cwd(), "node_modules/geist/dist/fonts/geist-mono");
  const [regular, light] = await Promise.all([readFile(join(dir, "GeistMono-Regular.ttf")), readFile(join(dir, "GeistMono-Light.ttf"))]);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#000", color: "#fff", fontFamily: "Geist Mono", position: "relative" }}>
        {STARS.map((s, i) => (
          <div key={i} style={{ position: "absolute", left: s.x, top: s.y, fontSize: 20, color: `rgba(255,255,255,${s.o})` }}>
            {s.c}
          </div>
        ))}
        {/* the bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 52, padding: "0 28px", borderBottom: "1px solid #1c1c1c", fontSize: 20, color: "#a3a3a3" }}>
          <div style={{ display: "flex", gap: 10 }}>
            {["1", "2", "3", "4", "5"].map((n, i) => (
              <div key={n} style={{ display: "flex", width: 34, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 6, background: i === 0 ? "#fff" : "transparent", color: i === 0 ? "#000" : "#555" }}>
                {n}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", color: "#fff" }}>~</div>
          <div style={{ display: "flex" }}>parth-os</div>
        </div>
        {/* name + terminal line */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", flex: 1, padding: "0 64px 64px" }}>
          <div style={{ display: "flex", fontSize: 104, fontWeight: 300, letterSpacing: -5, lineHeight: 1 }}>Parth Awana</div>
          <div style={{ display: "flex", fontSize: 28, color: "#a3a3a3", marginTop: 18 }}>cs + ai at indiana university · building toward fintech</div>
          <div style={{ display: "flex", marginTop: 34, padding: "14px 20px", border: "1px solid #2a2a2a", borderRadius: 10, fontSize: 22, color: "#a3a3a3", alignSelf: "flex-start", background: "#000" }}>
            <span style={{ color: "#fff", marginRight: 14 }}>~ $</span>
            boot it up: code · btop · yazi · a trading game · 10 secrets
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist Mono", data: regular, weight: 400, style: "normal" },
        { name: "Geist Mono", data: light, weight: 300, style: "normal" },
      ],
    },
  );
}
