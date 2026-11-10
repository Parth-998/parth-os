/**
 * Monaco (the editor inside VS Code) set up for the site's own source: every file becomes a model,
 * TypeScript checks them for real (errors, autocomplete, hover), and each site theme gets a
 * matching editor theme. Callers supply the workers, since the site and the labs bundle them differently.
 */
import * as monaco from "./monaco-lite";
import { conf as tsConf, language as tsLang } from "monaco-editor/languages/definitions/typescript/typescript";
import type { ThemePreset } from "@/content/themes";
import { SYNTAX } from "./palettes";

export { monaco };
export type Snapshot = { built: string; files: Record<string, string>; types?: Record<string, string> };

let ready = false;

/** what the site's source imports that isn't in the snapshot (react, next, fonts): typed loosely */
const SHIMS = `
declare module "csstype" { export interface Properties<A = any, B = any> { [k: string]: any } export interface PropertiesHyphen<A = any, B = any> { [k: string]: any } export type Property = any; }
declare module "monaco-editor" {
  export const editor: any, languages: any, typescript: any, Uri: any, KeyMod: any, KeyCode: any, MarkerSeverity: any;
  export namespace editor { type IMarker = any; type IStandaloneCodeEditor = any; type IStandaloneDiffEditor = any; type ICodeEditorViewState = any; }
  export namespace languages { type IMonarchLanguage = any; type IMonarchLanguageRule = any; type LanguageConfiguration = any; }
  export type Environment = any;
}
declare module "next" { export type Metadata = any; export type Viewport = any; export type NextConfig = any; }
declare module "next/*" { const x: any; export default x; }
declare module "geist/font/*" { export const GeistSans: any; export const GeistMono: any; }
declare module "monaco-editor/*" { const m: any; export = m; }
declare module "*.css";
declare namespace JSX { interface IntrinsicElements { [name: string]: any } type Element = any; }
interface ImportMeta { url: string; env: any }
`;

export function setupMonaco(getWorker: (label: string) => Worker) {
  if (ready) return monaco;
  ready = true;
  (self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = { getWorker: (_id, label) => getWorker(label) };

  // the same tokenizer VS Code's monaco ships, plus calls, properties, control keywords and CONSTANTS
  const lang = { ...tsLang, ctl: ["if", "else", "for", "while", "do", "return", "break", "continue", "switch", "case", "default", "try", "catch", "finally", "throw", "await", "yield"] } as monaco.languages.IMonarchLanguage & Record<string, unknown>;
  const common = (tsLang.tokenizer as Record<string, monaco.languages.IMonarchLanguageRule[]>).common;
  const ident = { cases: { "@ctl": "keyword.control", "@keywords": "keyword", "@default": "identifier" } };
  lang.tokenizer = {
    ...tsLang.tokenizer,
    common: [
      [/(\.)(#?[a-zA-Z_$][\w$]*)(?=\s*\()/, ["delimiter", "function"]],
      [/(\.)(#?[a-zA-Z_$][\w$]*)/, ["delimiter", "property"]],
      [/#?[a-z_$][\w$]*(?=\s*(<[^>]*>)?\()/, { cases: { "@ctl": "keyword.control", "@keywords": "keyword", "@default": "function" } }],
      [/[A-Z][A-Z0-9_]+\b/, "constant"],
      [/#?[a-z_$][\w$]*/, ident],
      ...common.slice(1),
    ],
  } as monaco.languages.IMonarchLanguage["tokenizer"];
  monaco.languages.setMonarchTokensProvider("typescript", lang);
  monaco.languages.setLanguageConfiguration("typescript", tsConf);

  const ts = monaco.typescript;
  ts.typescriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.Preserve,
    allowNonTsExtensions: true,
    allowJs: true,
    strict: true,
    noEmit: true,
    esModuleInterop: true,
    baseUrl: "file:///",
    paths: { "@/*": ["src/*"] },
    lib: ["es2022", "dom", "dom.iterable"],
  });
  // ignore what only fails because react/next aren't in the snapshot
  ts.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false, diagnosticCodesToIgnore: [2307, 2792, 7016, 2875, 2686, 17004, 1259, 2614, 7006, 7031] });
  ts.typescriptDefaults.setEagerModelSync(true);
  ts.typescriptDefaults.addExtraLib(SHIMS, "file:///shims.d.ts");
  return monaco;
}

/** React's own type definitions from the snapshot, so React code checks for real */
let typesAdded = false;
export function addTypes(snap: Snapshot) {
  if (typesAdded || !snap.types) return;
  typesAdded = true;
  for (const [p, t] of Object.entries(snap.types)) monaco.typescript.typescriptDefaults.addExtraLib(t, `file:///${p}`);
}

export const uriOf = (path: string) => monaco.Uri.parse(`file:///${path}`);

export function languageOf(path: string) {
  if (/\.tsx?$/.test(path)) return "typescript";
  if (/\.m?js$/.test(path)) return "javascript";
  if (/\.json$/.test(path)) return "json";
  if (/\.css$/.test(path)) return "css";
  if (/\.md$/.test(path)) return "markdown";
  if (/config$|\.gitignore$/.test(path)) return "ini";
  return "plaintext";
}

/** One model per file, created once. */
export function modelFor(path: string, text: string) {
  const uri = uriOf(path);
  return monaco.editor.getModel(uri) ?? monaco.editor.createModel(text, languageOf(path), uri);
}

const strip = (c: string) => c.replace("#", "");
const mix = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return "#" + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("");
};

/** A monaco theme for a site theme: chrome from the site's colours, syntax from its real editor theme. */
export function defineTheme(t: ThemePreset) {
  const y = SYNTAX[t.id] ?? SYNTAX.monochrome;
  const name = `parth-${t.id}`;
  const dark = t.mode === "dark";
  monaco.editor.defineTheme(name, {
    base: dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [
      { token: "", foreground: strip(y.var) },
      { token: "identifier", foreground: strip(y.var) },
      { token: "keyword", foreground: strip(y.kw) },
      { token: "keyword.control", foreground: strip(y.ctl) },
      { token: "string", foreground: strip(y.str) },
      { token: "string.escape", foreground: strip(y.constant) },
      { token: "number", foreground: strip(y.num) },
      { token: "regexp", foreground: strip(y.str) },
      { token: "comment", foreground: strip(y.com), fontStyle: "italic" },
      { token: "type.identifier", foreground: strip(y.type) },
      { token: "type", foreground: strip(y.type) },
      { token: "function", foreground: strip(y.fn) },
      { token: "property", foreground: strip(y.prop) },
      { token: "constant", foreground: strip(y.constant) },
      { token: "delimiter", foreground: strip(y.punc) },
      { token: "delimiter.bracket", foreground: strip(y.punc) },
      // json, css, markdown, the config file
      { token: "string.key.json", foreground: strip(y.prop) },
      { token: "string.value.json", foreground: strip(y.str) },
      { token: "attribute.name", foreground: strip(y.prop) },
      { token: "attribute.value", foreground: strip(y.str) },
      { token: "tag", foreground: strip(y.kw) },
      { token: "keyword.md", foreground: strip(y.kw) },
      { token: "metatag", foreground: strip(y.type) },
    ],
    colors: {
      "editor.background": t.winFocus,
      "editor.foreground": y.var,
      "editorLineNumber.foreground": t.faint,
      "editorLineNumber.activeForeground": t.fg,
      "editor.lineHighlightBackground": mix(t.winFocus, t.fg, 0.045),
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": mix(t.winFocus, t.accent, 0.28),
      "editor.inactiveSelectionBackground": mix(t.winFocus, t.accent, 0.14),
      "editorCursor.foreground": t.fg,
      "editorIndentGuide.background1": mix(t.winFocus, t.faint, 0.35),
      "editorIndentGuide.activeBackground1": mix(t.winFocus, t.faint, 0.8),
      "editorWhitespace.foreground": mix(t.winFocus, t.faint, 0.3),
      "editorWidget.background": t.win,
      "editorWidget.border": t.line,
      "editorSuggestWidget.background": t.win,
      "editorSuggestWidget.border": t.line,
      "editorSuggestWidget.selectedBackground": mix(t.win, t.fg, 0.1),
      "editorHoverWidget.background": t.win,
      "editorHoverWidget.border": t.line,
      "quickInput.background": t.win,
      "input.background": t.winFocus,
      "input.border": t.line,
      "list.hoverBackground": mix(t.win, t.fg, 0.06),
      "list.activeSelectionBackground": mix(t.win, t.fg, 0.12),
      "list.focusBackground": mix(t.win, t.fg, 0.12),
      "minimap.background": t.winFocus,
      "scrollbarSlider.background": mix(t.winFocus, t.fg, 0.1) + "",
      "scrollbarSlider.hoverBackground": mix(t.winFocus, t.fg, 0.18),
      "editorBracketHighlight.foreground1": y.brackets[0],
      "editorBracketHighlight.foreground2": y.brackets[1],
      "editorBracketHighlight.foreground3": y.brackets[2],
      "editorBracketMatch.background": mix(t.winFocus, t.fg, 0.08),
      "editorBracketMatch.border": mix(t.winFocus, t.fg, 0.3),
      "diffEditor.insertedTextBackground": dark ? "#2ea04326" : "#2ea04333",
      "diffEditor.removedTextBackground": dark ? "#f8514926" : "#f8514933",
      "diffEditor.insertedLineBackground": dark ? "#2ea04314" : "#2ea0431f",
      "diffEditor.removedLineBackground": dark ? "#f8514914" : "#f851491f",
    },
  });
  return name;
}
