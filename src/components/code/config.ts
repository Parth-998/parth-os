/**
 * ~/.config/parth-os/config: the visitor's settings as a text file. The editor shows the current
 * settings in it; saving it parses the file and applies whatever changed, with real-looking errors
 * for anything it doesn't understand.
 */
import { THEMES } from "@/content/themes";

export const CONFIG_PATH = ".config/parth-os/config";

export type SiteConfig = {
  theme: string;
  mode: "dark" | "light";
  wallpaper: string;
  clock: "24h" | "12h";
  music: { volume: number };
};

const WALLPAPERS = ["sharks", "rain", "waves", "chicago"];

export function configText(c: SiteConfig) {
  return `# ~/.config/parth-os/config
# your settings for this visit. edit, then save (ctrl+s) to apply.
# "reset" in the terminal puts everything back.

theme     = "${c.theme}"      # ${THEMES.map((t) => t.id).join(", ")}
wallpaper = "${c.wallpaper}"  # ${WALLPAPERS.join(" | ")}
clock     = "${c.clock}"         # 24h | 12h

[music]
volume    = ${c.music.volume}            # 0-100
`;
}

type Parsed = { ok: true; config: SiteConfig; changes: string[] } | { ok: false; line: number; error: string };

export function parseConfig(text: string, prev?: SiteConfig): Parsed {
  const out: Partial<SiteConfig> & { music?: { volume: number } } = {};
  let section = "";
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/#.*$/, "").trim();
    if (!raw) continue;
    const sec = raw.match(/^\[([a-z]+)\]$/);
    if (sec) {
      if (sec[1] !== "music") return { ok: false, line: i + 1, error: `unknown section [${sec[1]}]` };
      section = sec[1];
      continue;
    }
    const kv = raw.match(/^([a-z]+)\s*=\s*(.+)$/);
    if (!kv) return { ok: false, line: i + 1, error: `expected key = value, got "${raw}"` };
    const key = kv[1];
    const val = kv[2].trim().replace(/^"(.*)"$/, "$1");
    if (section === "music") {
      if (key !== "volume") return { ok: false, line: i + 1, error: `unknown key "${key}" in [music]` };
      const n = Number(val);
      if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, line: i + 1, error: `volume must be 0-100, got "${val}"` };
      out.music = { volume: Math.round(n) };
    } else if (key === "theme") {
      const t = THEMES.find((x) => x.id === val || x.name === val);
      if (!t) return { ok: false, line: i + 1, error: `unknown theme "${val}"` };
      out.theme = t.id;
      out.mode = t.mode;
    } else if (key === "wallpaper") {
      if (!WALLPAPERS.includes(val)) return { ok: false, line: i + 1, error: `unknown wallpaper "${val}" (${WALLPAPERS.join(", ")})` };
      out.wallpaper = val;
    } else if (key === "clock") {
      if (val !== "24h" && val !== "12h") return { ok: false, line: i + 1, error: `clock must be 24h or 12h, got "${val}"` };
      out.clock = val;
    } else return { ok: false, line: i + 1, error: `unknown key "${key}"` };
  }
  const config = { theme: "monochrome", mode: "dark", wallpaper: "sharks", clock: "24h", music: { volume: 60 }, ...prev, ...out } as SiteConfig;
  const changes = prev ? (["theme", "wallpaper", "clock"] as const).filter((k) => prev[k] !== config[k]).map((k) => `${k} = ${config[k]}`) : [];
  if (prev && prev.music.volume !== config.music.volume) changes.push(`volume = ${config.music.volume}`);
  return { ok: true, config, changes };
}
