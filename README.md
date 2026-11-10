# parth-os

Parth Awana's portfolio: a Linux-style desktop you log into. Boot screen, auto-typed login, five tiling
workspaces, a working terminal, live ASCII wallpapers, a paper-trading game and a few secrets.

## Run it

```sh
npm install
npm run dev        # http://localhost:3000
```

## Change things

Almost everything you'd edit lives in `src/content/site.ts`: about lines, interests, projects and case
studies, experience, education, contact links, theme, wallpaper and music. Save, push, and Vercel redeploys.

- **Music:** drop an MP3 in `public/music/` and add a line to `music.tracks` with its title and artist.
  `music.bonus` is the soundcloud song unlocked in the music app by finding all 10 secrets (null for none).
- **Resume:** `public/resume.pdf` is the web copy (no phone number or address).
- **Notes:** `src/content/notes.ts`. Each note is markdown; `draft: true` shows a draft tag until you're happy with it.
- **Default wallpaper and theme:** `background.style` and `theme`.

## What's in it

- **Workspaces:** home, projects, about, activity, contact. Windows snap to a grid; drag, resize, swap and
  fullscreen them (alt + arrows, alt + shift + arrows, alt + j, alt + f). `shortcuts` in the terminal lists every key.
- **Wallpapers:** sharks, rain (with a hidden smoke break: click the man), waves, chicago (`bg` in the terminal, or the wallpaper picker). Each one is
  interactive, has its own konami-code reaction and its own screensaver (2 minutes idle, or `screensaver`).
- **Terminal:** help, fetch, ls, cd, cat, grep, tree, code, notes, files, music, projects, open, theme, bg, reset, reboot, shutdown and more. `~/parth-os` is the site's own source.
- **Paper trading** (activity): live Hyperliquid prices for BTC, ETH and SOL, falling back to a simulator.
  Spot or perps up to 10x, take profit and stop loss, liquidations, achievements; progress is saved in the browser.
- **Apps** (float above the desktop; × or `alt c` closes, `alt f` fills the screen):
  - **code:** the site's real source in Monaco (VS Code's editor): autocomplete, type errors, search, source control with diffs and a pretend git. Edits stay in the tab; saving `~/.config/parth-os/config` applies your settings.
  - **notes:** write-ups, starting with how this site was built.
  - **files:** a ranger-style file manager over the whole machine.
  - **music:** Tidal-style. The parth-os radio plus Parth's SoundCloud tracks and likes, played through SoundCloud's official widget (no API key).
- **Launcher:** `alt space` or the search button in the bar. Finds apps, projects, files, notes, songs, themes, commands.
- **Settings:** themes, wallpaper, cursor themes, fonts, text size, window gaps/corners/borders/opacity, bar position and clock, screensaver timing, do not disturb, clearing saved data, and an about page.
- **Links:** `#code/src/lib/tiling.ts`, `#notes/how-this-site-was-built`, `#music`, `#projects/stocktracker`, `#about` open straight to that thing.
- **Secrets:** 10 easter eggs, tracked in `~/.secrets` (`ls -a`, `cat .secrets`).
- **Phones:** a simpler scrolling layout; the trading game is laptop-only.

## Where things are

| Path | What |
| --- | --- |
| `src/content/site.ts` | All the content and settings |
| `src/content/themes.ts` | Colour themes, and the time-of-day tint for the chicago wallpaper |
| `src/components/App.tsx` | Boot → login → desktop flow, toasts, global keys, konami, screensaver timer |
| `src/components/Entry.tsx` | Boot lines and the login screen |
| `src/components/Desktop.tsx`, `src/lib/tiling.ts` | Workspaces, scrolling, window tiling and keybinds |
| `src/components/Terminal.tsx` | The terminal and its commands |
| `src/components/TradingSim.tsx`, `src/lib/ascii/market.ts`, `feed.ts` | Paper trading and the live price feed |
| `src/components/Meltdown.tsx` | What `sudo rm -rf --no-preserve-root /` does |
| `src/components/Screensaver.tsx` | Screensavers |
| `src/lib/secrets.ts`, `src/components/SecretsFile.tsx` | The secrets and `cat .secrets` |
| `src/lib/ascii/` | Canvas engines and wallpapers (sharks adapted from MIT-licensed ascii-sharks) |
| `src/components/apps/` | The floating apps: notes, files, music, and the window layer |
| `src/components/code/` | The code editor (Monaco setup, editor themes, the config file) |
| `src/components/Launcher.tsx` | The launcher (alt space) |
| `src/lib/prefs.ts` | System settings: cursor, font, windows, bar, screensaver, notifications |
| `src/lib/apps.ts` | Opening apps and the #links |
| `scripts/snapshot.mjs` | Copies the source into `public/parth-os.json` before every build |
| `src/lib/hooks.ts` | Theme, clock, music player, storage helpers |
| `src/app/globals.css` | Colour tokens, window style, tilings, effects |

## Deploy

1. Push this folder to a GitHub repo.
2. On vercel.com, import the repo. No settings needed.
3. Add a custom domain later in the Vercel project settings.

## Credits

The shark wallpaper engine is adapted from [ascii-sharks](https://github.com/stackedlol/ascii-sharks) by
drewdi (MIT). The license is kept at `src/lib/ascii/LICENSE-ascii-sharks`. The songs in rotation are
original tracks credited to parth-os radio.
