/**
 * The notes app. Each note is markdown: # headings, paragraphs, - lists, `code`, **bold**,
 * [links](https://…) and ``` blocks. Add a note by adding an entry; the newest goes first.
 * `draft: true` shows a small draft tag in the app until you're happy with it.
 */
export type Note = { slug: string; title: string; date: string; draft?: boolean; body: string };

export const NOTES: Note[] = [
  {
    slug: "how-this-site-was-built",
    title: "how this site was built",
    date: "nov 2026",
    draft: true,
    body: `
# how this site was built

next.js 16 · react 19 · typescript · canvas · no ui library

this site is a fake linux desktop you log into. it boots, asks you to log in, then drops you on a tiling desktop with live wallpapers drawn in ascii. here's how each part works.

## boot and login

the boot screen is a timed list of kernel-style lines, with one line that changes per wallpaper. the login screen uses the real time and remembers your last visit, like a real lock screen. \`reboot\` in the terminal plays it again.

## the wallpapers

every wallpaper is a grid of characters redrawn on a canvas many times a second. each cell gets a brightness, and the renderer picks a glyph for it. so the sharks, the rain, the sea and the skyline are all the same engine with a different scene plugged in.

\`\`\`
scene.step(dt)   → move things: fish, rain, waves, lights
scene.fill(grid) → write a glyph + brightness per cell
renderer.draw()  → paint the grid in the theme's colours
\`\`\`

- **sharks**: adapted from drewdi's mit-licensed ascii-sharks. fish school together and scatter from your cursor; the number of sharks scales with your screen.
- **rain**: a man with an umbrella under a street lamp. click to walk him somewhere; his feet stay planted as he walks. the lamp's light is computed per cell.
- **waves**: the sea at night. the swell is layered sine waves; dragging leaves a wake.
- **chicago**: the skyline lit by the real chicago time, from sunrise to the windows coming on at night.

## the tiling window manager

windows snap to a 24-column grid, inspired by hyprland. you can drag, resize, swap and fullscreen them, all from the keyboard with alt shortcuts. when windows overlap, a settle pass slides or trims the ones in the way, and a window is never made too small to show its content.

## the terminal

a small shell with real-feeling commands: \`ls -a\`, \`cd\`, \`cat\`, \`fetch\`, \`grep\`, \`tree\`, tab completion and history. \`~/parth-os\` is this site's actual source code, copied in at every build so it never goes stale.

## code

\`code <file>\` opens the source in monaco, the editor inside vs code: real autocomplete, real type errors, search, a diff view and a pretend git you can commit to. edits stay in your tab. \`~/.config/parth-os/config\` is the exception: save it and your settings change.

## the trading game

paper trading on live hyperliquid prices for btc, eth and sol. spot or perps up to 10x, with take profit, stop loss and liquidation, run against the real price feed. your balance and positions save in your browser.

## music

the radio plays songs made for the site. the music app adds soundcloud: it loads soundcloud's own player out of sight and drives it from a tidal-style library.

## secrets

ten easter eggs are hidden around the machine, and a hidden file keeps track of the ones you've found. \`ls -a\` is a good place to start.

## themes and the screensaver

every colour on the site comes from one theme preset, so switching themes recolours the windows, the editor and the wallpaper together. after a couple of minutes idle, the screensaver fades in a version of the wallpaper you're on.
`,
  },
];
