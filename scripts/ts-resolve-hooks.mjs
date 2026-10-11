// Node module-resolution hook so `node scripts/learn-selfcheck.mts` can import
// the TypeScript engine/generators with their extension-less relative imports
// (Node's built-in type stripping handles .ts files but not missing extensions).
// It also tags .ts files as ES-module TypeScript so Node does not have to
// sniff the format (the repo's package.json has no "type" field).
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const EXTENSIONS = [".ts", ".tsx", ".mts", "/index.ts"];

export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier) || /\.(json|mjs|cjs)$/.test(specifier);
  let target = specifier;
  if (isRelative && !hasExtension && context.parentURL) {
    const base = new URL(specifier, context.parentURL);
    for (const ext of EXTENSIONS) {
      const candidate = base.href + ext;
      if (existsSync(fileURLToPath(candidate))) {
        target = candidate;
        break;
      }
    }
  }
  const result = await nextResolve(target, context);
  if (/\.ts$/.test(result.url)) {
    return { ...result, format: "module-typescript" };
  }
  return result;
}
