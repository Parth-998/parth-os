/** Every keybind, in one place: the ? menu, settings → shortcuts and the `shortcuts` command all read this. */
export function keybinds(mac: boolean): [string, string][] {
  const alt = mac ? "⌥" : "alt";
  const mod = mac ? "⌘" : "ctrl";
  return [
    ["1 – 5", "jump to a workspace"],
    ["space / page down", "next workspace"],
    [`${alt} space`, "launcher: search apps, projects, files, themes"],
    [`${alt} q`, "jump to the terminal"],
    [`${alt} c`, "close the app on top (code, notes, files, music)"],
    [`${alt} arrows`, "move between windows (the one you're on gets a bright border)"],
    [`${alt} shift arrows`, "swap the window you're on with the one next to it"],
    [`${alt} j`, "flip the window you're on and its neighbour: side by side ↔ stacked"],
    [`${alt} f`, "fullscreen the window you're on (in an app: fill the screen)"],
    ["m", "mute"],
    [`${mod} k`, "settings"],
    ["esc", "close"],
  ];
}
