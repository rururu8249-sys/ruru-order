// Test-only loader: execute the actual Next route and every local helper under
// Node 24. Only the Next/Supabase integration boundaries are replaced.
import { registerHooks, stripTypeScriptTypes } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const boundaryKey = "ruru.order-submit.runtime-test.20261122";
const mockModules = {
  "next/server": `
    const context = () => globalThis[Symbol.for(${JSON.stringify(boundaryKey)})];
    export const NextRequest = Request;
    export const NextResponse = Response;
    export function after(callback) {
      if (typeof callback !== "function") throw new Error("after requires a callback");
      context().after.push(callback);
    }
  `,
  "@supabase/supabase-js": `
    export function createClient(url, key, options) {
      return globalThis[Symbol.for(${JSON.stringify(boundaryKey)})]
        .createClient(url, key, options);
    }
  `,
};

function resolveLocal(url) {
  const filename = fileURLToPath(url);
  for (const candidate of [filename, `${filename}.ts`, `${filename}.mjs`, `${filename}.js`]) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  throw new Error(`Missing actual production helper: ${filename}`);
}

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (Object.hasOwn(mockModules, specifier)) {
      return { url: `order-submit-test:${specifier}`, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      return { url: resolveLocal(pathToFileURL(path.join(repoRoot, specifier.slice(2)))), shortCircuit: true };
    }
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      return { url: resolveLocal(new URL(specifier, context.parentURL)), shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("order-submit-test:")) {
      return { format: "module", source: mockModules[url.slice("order-submit-test:".length)], shortCircuit: true };
    }
    if (url.startsWith("file:") && url.endsWith(".ts")) {
      return {
        format: "module",
        // transform mode also supports the real AutomationError constructor's
        // TypeScript parameter property; erase-only loading cannot execute it.
        source: stripTypeScriptTypes(readFileSync(fileURLToPath(url), "utf8"), {
          mode: "transform", sourceUrl: url,
        }),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

export function unregisterOrderSubmitTestLoader() { hooks.deregister(); }
