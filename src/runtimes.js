/**
 * NOVA Phase 1C runtime registry.
 *
 * The browser is the local runtime for web/graphics projects.
 * TypeScript is transpiled locally to JavaScript.
 * Python is executed locally through Pyodide/WebAssembly.
 */

export const RUNTIMES = {
  web: {
    id: "web",
    name: "NOVA Web Runtime",
    supports: ["html", "css", "javascript", "webgl", "threejs", "babylonjs"],
    available: true
  },
  typescript: {
    id: "typescript",
    name: "NOVA TypeScript Runtime",
    supports: ["typescript"],
    available: true,
    strategy: "transpile-to-javascript"
  },
  python: {
    id: "python",
    name: "NOVA Python Runtime",
    supports: ["python"],
    available: true,
    strategy: "pyodide-webassembly"
  }
};

export function getRuntimeForTechnology(technology) {
  if (!technology) return null;

  if (technology.runner === "web") return RUNTIMES.web;
  if (technology.runner === "typescript") return RUNTIMES.typescript;
  if (technology.runner === "python") return RUNTIMES.python;

  return null;
}

export function canRunLocally(technology) {
  const runtime = getRuntimeForTechnology(technology);
  return Boolean(technology?.canRunLocally && runtime?.available);
}
