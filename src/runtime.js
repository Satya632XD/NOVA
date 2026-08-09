import { canRunLocally, getRuntimeForTechnology } from "./runtimes.js";
import { detectLanguage } from "./languages.js";

let pyodidePromise = null;
let typescriptPromise = null;

async function loadTypeScript() {
  if (!typescriptPromise) {
    typescriptPromise = import(
      "https://esm.sh/typescript@5.8.3"
    );
  }

  return typescriptPromise;
}

async function loadPyodide() {
  if (pyodidePromise) return pyodidePromise;

  pyodidePromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[data-nova-pyodide="true"]'
    );

    const start = () => {
      if (!window.loadPyodide) {
        reject(new Error("Pyodide failed to load."));
        return;
      }

      window.loadPyodide({
        indexURL:
          "https://cdn.jsdelivr.net/pyodide/v0.28.2/full/"
      })
        .then(resolve)
        .catch(reject);
    };

    if (existing) {
      existing.addEventListener("load", start, { once: true });
      if (window.loadPyodide) start();
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/pyodide/v0.28.2/full/pyodide.js";
    script.dataset.novaPyodide = "true";
    script.onload = start;
    script.onerror = () =>
      reject(new Error("Could not load the Python runtime."));

    document.head.appendChild(script);
  });

  return pyodidePromise;
}

function captureConsole() {
  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error
  };

  const messages = [];

  for (const method of Object.keys(original)) {
    console[method] = (...args) => {
      messages.push({
        type: method,
        message: args.map(String).join(" ")
      });
      original[method](...args);
    };
  }

  return {
    messages,
    restore() {
      Object.assign(console, original);
    }
  };
}

export class RuntimeService {
  constructor({ onOutput = () => {}, onStatus = () => {} } = {}) {
    this.onOutput = onOutput;
    this.onStatus = onStatus;
  }

  async run(fileName, files) {
    const technology = detectLanguage(fileName);

    if (!canRunLocally(technology)) {
      throw new Error(
        `${technology.name} is currently editor-only in the browser build.`
      );
    }

    const runtime = getRuntimeForTechnology(technology);
    this.onStatus(`Running with ${runtime.name}…`);

    if (runtime.id === "web") {
      return {
        type: "preview",
        files
      };
    }

    if (runtime.id === "typescript") {
      return this.runTypeScript(fileName, files[fileName] ?? "");
    }

    if (runtime.id === "python") {
      return this.runPython(files[fileName] ?? "");
    }

    throw new Error("No runtime adapter is available.");
  }

  async runTypeScript(fileName, source) {
    const ts = await loadTypeScript();
    const result = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
        sourceMap: false
      },
      fileName
    });

    const capture = captureConsole();

    try {
      const blob = new Blob(
        [
          `${result.outputText}\n//# sourceURL=${fileName}`
        ],
        { type: "text/javascript" }
      );

      const url = URL.createObjectURL(blob);

      try {
        await import(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    } finally {
      capture.restore();
    }

    for (const message of capture.messages) {
      this.onOutput(message.type, message.message);
    }

    this.onStatus("TypeScript finished.");

    return {
      type: "console",
      messages: capture.messages
    };
  }

  async runPython(source) {
    this.onStatus("Loading Python runtime…");

    const pyodide = await loadPyodide();
    const output = [];

    pyodide.setStdout({
      batched: text => {
        output.push(text);
        this.onOutput("stdout", text);
      }
    });

    pyodide.setStderr({
      batched: text => {
        output.push(text);
        this.onOutput("stderr", text);
      }
    });

    try {
      await pyodide.runPythonAsync(source);
    } catch (error) {
      this.onOutput("error", error.message);
      throw error;
    }

    this.onStatus("Python finished.");

    return {
      type: "console",
      output
    };
  }
}
