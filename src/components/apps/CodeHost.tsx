"use client";
/**
 * Loads the editor only when someone opens it: the source snapshot, Monaco and its TypeScript worker
 * (the whole compiler, so a few MB) arrive on first open and stay cached after.
 */
import { useEffect, useState } from "react";
import { loadRepo } from "@/lib/repo";
import type { ThemePreset } from "@/content/themes";
import type { SiteConfig } from "../code/config";
import { setupMonaco, type Snapshot } from "../code/setup";
import CodeApp from "../code/CodeApp";
import { AppLoading } from "./AppLayer";

let ready = false;
function start() {
  if (ready) return;
  ready = true;
  setupMonaco((label) =>
    label === "typescript" || label === "javascript"
      ? new Worker(new URL("../../../node_modules/monaco-editor/esm/vs/languages/features/typescript/ts.worker.js", import.meta.url), { type: "module" })
      : new Worker(new URL("../../../node_modules/monaco-editor/esm/vs/editor/editor.worker.js", import.meta.url), { type: "module" }),
  );
}

export default function CodeHost({
  file,
  theme,
  config,
  onConfig,
  onClose,
  titleProps,
  onRoute,
}: {
  file?: string;
  theme: ThemePreset;
  config: SiteConfig;
  onConfig: (c: SiteConfig) => void;
  onClose: () => void;
  titleProps: object;
  onRoute: (r?: string) => void;
}) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    start();
    loadRepo().then((s) => (s ? setSnap(s as Snapshot) : setErr(true)));
  }, []);
  if (err) return <AppLoading what="couldn't load the source. check your connection and open code again" />;
  if (!snap) return <AppLoading what="starting code" />;
  return <CodeApp snapshot={snap} theme={theme} config={config} onConfig={onConfig} onClose={onClose} initialFile={file ?? "README.md"} titleProps={titleProps} onRoute={onRoute} />;
}
