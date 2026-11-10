// Copies the site's own source into public/parth-os.json, so the terminal's ~/parth-os folder
// always shows exactly the code that's running. Runs before every build.
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const TOP = ["README.md", "package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs", ".gitignore"];
const files = {};
for (const f of TOP) {
  try {
    files[f] = readFileSync(join(root, f), "utf8");
  } catch {}
}
const walk = (d) => {
  for (const n of readdirSync(d).sort()) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|css|mjs)$/.test(n)) files[relative(root, p)] = readFileSync(p, "utf8");
  }
};
walk(join(root, "src"));
walk(join(root, "scripts"));
// React's real type definitions, so the editor's TypeScript checks and autocompletes React code
const types = {};
for (const f of ["index.d.ts", "global.d.ts", "jsx-runtime.d.ts"]) {
  try {
    types[`node_modules/@types/react/${f}`] = readFileSync(join(root, "node_modules/@types/react", f), "utf8");
  } catch {}
}
const out = JSON.stringify({ built: new Date().toISOString(), files, types });
writeFileSync(join(root, "public", "parth-os.json"), out);
console.log(`snapshot: ${Object.keys(files).length} files, ${(out.length / 1024).toFixed(0)} KB`);
