// monaco ships its typescript tokenizer without types; this is the shape we use
declare module "monaco-editor/languages/definitions/typescript/typescript" {
  import type { languages } from "monaco-editor";
  export const conf: languages.LanguageConfiguration;
  export const language: languages.IMonarchLanguage;
}
