/**
 * Editor colours for every site theme. Named themes use their official VS Code theme's colours;
 * the site's own themes borrow calm real ones: Vesper for monochrome, Min Dark for graphite,
 * GitHub Dark Dimmed for slate, GitHub Light for the light themes.
 */
export type Syntax = {
  ctl: string; // if, for, return
  kw: string; // const, function, this
  str: string;
  num: string;
  fn: string; // function and method calls
  var: string;
  prop: string; // after a dot
  type: string; // Capitalised names
  constant: string; // ALL_CAPS, true/false/null
  com: string;
  punc: string;
  brackets: [string, string, string];
};

const VESPER: Syntax = { ctl: "#A0A0A0", kw: "#A0A0A0", str: "#99FFE4", num: "#FFC799", fn: "#FFC799", var: "#FFFFFF", prop: "#D4D4D4", type: "#FFFFFF", constant: "#FFC799", com: "#5F5F5F", punc: "#8B8B8B", brackets: ["#A0A0A0", "#A0A0A0", "#A0A0A0"] };
const MIN_DARK: Syntax = { ctl: "#F97583", kw: "#F97583", str: "#FFAB70", num: "#79B8FF", fn: "#B392F0", var: "#E1E4E8", prop: "#D1D5DA", type: "#B392F0", constant: "#79B8FF", com: "#6B737C", punc: "#B0B0B0", brackets: ["#B0B0B0", "#B0B0B0", "#B0B0B0"] };
const GH_DIMMED: Syntax = { ctl: "#F47067", kw: "#F47067", str: "#96D0FF", num: "#6CB6FF", fn: "#DCBDFB", var: "#ADBAC7", prop: "#6CB6FF", type: "#F69D50", constant: "#6CB6FF", com: "#768390", punc: "#ADBAC7", brackets: ["#ADBAC7", "#ADBAC7", "#ADBAC7"] };
const GH_LIGHT: Syntax = { ctl: "#CF222E", kw: "#CF222E", str: "#0A3069", num: "#0550AE", fn: "#8250DF", var: "#24292F", prop: "#0550AE", type: "#953800", constant: "#0550AE", com: "#6E7781", punc: "#24292F", brackets: ["#24292F", "#24292F", "#24292F"] };

export const SYNTAX: Record<string, Syntax> = {
  monochrome: VESPER,
  graphite: MIN_DARK,
  slate: GH_DIMMED,
  nord: { ctl: "#81A1C1", kw: "#81A1C1", str: "#A3BE8C", num: "#B48EAD", fn: "#88C0D0", var: "#D8DEE9", prop: "#D8DEE9", type: "#8FBCBB", constant: "#81A1C1", com: "#616E88", punc: "#ECEFF4", brackets: ["#ECEFF4", "#ECEFF4", "#ECEFF4"] },
  "tokyo-night": { ctl: "#BB9AF7", kw: "#9D7CD8", str: "#9ECE6A", num: "#FF9E64", fn: "#7AA2F7", var: "#C0CAF5", prop: "#73DACA", type: "#2AC3DE", constant: "#FF9E64", com: "#565F89", punc: "#89DDFF", brackets: ["#698CD6", "#68B3DE", "#9A7ECC"] },
  catppuccin: { ctl: "#CBA6F7", kw: "#CBA6F7", str: "#A6E3A1", num: "#FAB387", fn: "#89B4FA", var: "#CDD6F4", prop: "#B4BEFE", type: "#F9E2AF", constant: "#FAB387", com: "#9399B2", punc: "#9399B2", brackets: ["#9399B2", "#9399B2", "#9399B2"] },
  kanagawa: { ctl: "#957FB8", kw: "#957FB8", str: "#98BB6C", num: "#D27E99", fn: "#7E9CD8", var: "#DCD7BA", prop: "#E6C384", type: "#7AA89F", constant: "#FFA066", com: "#727169", punc: "#9CABCA", brackets: ["#9CABCA", "#9CABCA", "#9CABCA"] },
  "rose-pine": { ctl: "#31748F", kw: "#31748F", str: "#F6C177", num: "#EBBCBA", fn: "#EBBCBA", var: "#E0DEF4", prop: "#C4A7E7", type: "#9CCFD8", constant: "#F6C177", com: "#6E6A86", punc: "#908CAA", brackets: ["#908CAA", "#908CAA", "#908CAA"] },
  gruvbox: { ctl: "#FB4934", kw: "#FE8019", str: "#B8BB26", num: "#D3869B", fn: "#8EC07C", var: "#EBDBB2", prop: "#83A598", type: "#FABD2F", constant: "#D3869B", com: "#928374", punc: "#A89984", brackets: ["#A89984", "#A89984", "#A89984"] },
  everforest: { ctl: "#E67E80", kw: "#E69875", str: "#A7C080", num: "#D699B6", fn: "#83C092", var: "#D3C6AA", prop: "#7FBBB3", type: "#DBBC7F", constant: "#D699B6", com: "#859289", punc: "#9DA9A0", brackets: ["#9DA9A0", "#9DA9A0", "#9DA9A0"] },
  // the site's tinted themes: one hue family each, kept calm
  matrix: { ctl: "#5FD47A", kw: "#5FD47A", str: "#A8FFBF", num: "#E6FFEC", fn: "#00E05A", var: "#C8FFD4", prop: "#8FE3A4", type: "#B8F5C6", constant: "#E6FFEC", com: "#2F6B3F", punc: "#4FA866", brackets: ["#4FA866", "#4FA866", "#4FA866"] },
  red: { ctl: "#D98C8C", kw: "#D98C8C", str: "#F2C4BC", num: "#FF6B76", fn: "#FF3344", var: "#F5E6E6", prop: "#E0B8B8", type: "#F2C4BC", constant: "#FF6B76", com: "#6E4444", punc: "#B08A8A", brackets: ["#B08A8A", "#B08A8A", "#B08A8A"] },
  gold: { ctl: "#C9A86A", kw: "#C9A86A", str: "#E9D8A6", num: "#E8B931", fn: "#E8B931", var: "#F3EAD8", prop: "#D8C7A3", type: "#F0D58C", constant: "#E8B931", com: "#6E6040", punc: "#B3A27F", brackets: ["#B3A27F", "#B3A27F", "#B3A27F"] },
  paper: GH_LIGHT,
  beige: { ...GH_LIGHT, ctl: "#8B1E1E", kw: "#8B1E1E" },
  fog: { ...GH_LIGHT, ctl: "#3D5A80", kw: "#3D5A80" },
};
