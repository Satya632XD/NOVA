/**
 * NOVA Terminal — UI + Executor
 *
 *   Terminal UI -> Command Engine -> Executor
 *
 * This file owns the two outer layers:
 *
 *   - BrowserExecutor: the Phase 1 "Executor". It is the ONLY
 *     place that touches NOVA's real project data. It talks
 *     directly to the existing FileSystemService for every
 *     filesystem command, and to the existing
 *     PreviewService/RuntimeService/CompilerService for
 *     "nova preview" / "nova run" / "nova build" — it never
 *     creates a second copy of the project or a second preview
 *     runtime. Phase 2 can add a NativeExecutor with the same
 *     `execute(name, args, context)` shape and swap it in here
 *     without touching the Command Engine or the UI.
 *
 *   - TerminalController: owns terminal state (cwd, command
 *     history, output buffer) and renders it into the DOM,
 *     talking to the Command Engine (terminalCommands.js) to
 *     parse and run each line.
 *
 * Security: every command name is checked against the
 * whitelist in terminalCommands.js before it reaches
 * BrowserExecutor. BrowserExecutor never uses eval(), never
 * builds or runs a shell string, and only ever calls concrete
 * FileSystemService/PreviewService/RuntimeService/
 * CompilerService methods with arguments treated as plain data.
 */

import { FileSystemService } from "./filesystem.js";
import {
  parseCommand,
  runCommand,
  splitFlags
} from "./terminalCommands.js";

const HISTORY_STORAGE_KEY = "nova-terminal-history";
const MAX_HISTORY = 200;

function formatBytes(content) {
  return new Blob([content ?? ""]).size;
}

/**
 * The Phase 1 browser executor. Every method here is a thin,
 * whitelisted wrapper around NOVA's existing services — it adds
 * no new storage, no new preview/runtime, and no server calls
 * beyond the ones CompilerService already makes.
 */
export class BrowserExecutor {
  constructor({ fileSystem, preview, runtime, compiler, onViewChange }) {
    this.fileSystem = fileSystem;
    this.preview = preview;
    this.runtime = runtime;
    this.compiler = compiler;
    this.onViewChange = onViewChange || (() => {});
  }

  async execute(name, args, context) {
    switch (name) {
      case "pwd":
        return this.pwd(context);
      case "ls":
        return this.ls(args, context);
      case "cd":
        return this.cd(args, context);
      case "mkdir":
        return this.mkdir(args, context);
      case "touch":
        return this.touch(args, context);
      case "cat":
        return this.cat(args, context);
      case "rm":
        return this.rm(args, context);
      case "cp":
        return this.cp(args, context);
      case "mv":
        return this.mv(args, context);
      case "echo":
        return this.echo(args);
      case "clear":
        return { clear: true };
      case "history":
        return this.history(context);
      case "help":
        return this.help();
      case "nova":
        return this.nova(args, context);
      default:
        return {
          lines: [`nova: command not found: ${name}`],
          error: true
        };
    }
  }

  resolve(context, inputPath) {
    return FileSystemService.resolvePath(context.cwd, inputPath ?? "");
  }

  displayPath(path) {
    return path === "" ? "/" : `/${path}`;
  }

  pwd(context) {
    return { lines: [this.displayPath(context.cwd)] };
  }

  ls(args, context) {
    const { positional, flags } = splitFlags(args);
    const target = this.resolve(context, positional[0]);

    const { directories, files } =
      this.fileSystem.listDirectory(target);

    if (directories.length === 0 && files.length === 0) {
      return { lines: ["(empty directory)"] };
    }

    if (flags.has("l")) {
      const lines = [
        ...directories.map(dir => `d  --        ${dir}/`),
        ...files.map(file => {
          const fullPath = target === "" ? file : `${target}/${file}`;
          const size = formatBytes(this.fileSystem.readFile(fullPath));
          return `-  ${String(size).padStart(6, " ")}b  ${file}`;
        })
      ];

      return { lines };
    }

    const entries = [
      ...directories.map(dir => `${dir}/`),
      ...files
    ];

    return { lines: [entries.join("  ")] };
  }

  cd(args, context) {
    const target = args[0] ?? "";
    const resolved = this.resolve(context, target);

    if (!this.fileSystem.directoryExists(resolved)) {
      throw new Error(`cd: no such directory: ${target || "/"}`);
    }

    context.setCwd(resolved);

    return { lines: [] };
  }

  mkdir(args, context) {
    const { positional, flags } = splitFlags(args);

    if (positional.length === 0) {
      throw new Error("mkdir: missing directory name");
    }

    for (const raw of positional) {
      const resolved = this.resolve(context, raw);
      this.fileSystem.makeDirectory(resolved, {
        recursive: flags.has("p")
      });
    }

    return { lines: [] };
  }

  touch(args, context) {
    if (args.length === 0) {
      throw new Error("touch: missing file name");
    }

    for (const raw of args) {
      const resolved = this.resolve(context, raw);
      this.fileSystem.touchFile(resolved);
    }

    return { lines: [] };
  }

  cat(args, context) {
    if (args.length === 0) {
      throw new Error("cat: missing file name");
    }

    const lines = [];

    for (const raw of args) {
      const resolved = this.resolve(context, raw);

      if (!this.fileSystem.fileExists(resolved)) {
        throw new Error(`cat: no such file: ${raw}`);
      }

      const content = this.fileSystem.readFile(resolved);
      lines.push(...(content.length ? content.split("\n") : [""]));
    }

    return { lines };
  }

  rm(args, context) {
    const { positional, flags } = splitFlags(args);

    if (positional.length === 0) {
      throw new Error("rm: missing file or directory name");
    }

    const recursive = flags.has("r") || flags.has("R");

    for (const raw of positional) {
      const resolved = this.resolve(context, raw);
      this.fileSystem.removePath(resolved, { recursive });
    }

    return { lines: [] };
  }

  cp(args, context) {
    const { positional } = splitFlags(args);

    if (positional.length !== 2) {
      throw new Error("cp: usage: cp <source> <destination>");
    }

    const [source, destination] = positional;

    this.fileSystem.copyFile(
      this.resolve(context, source),
      this.resolve(context, destination)
    );

    return { lines: [] };
  }

  mv(args, context) {
    const { positional } = splitFlags(args);

    if (positional.length !== 2) {
      throw new Error("mv: usage: mv <source> <destination>");
    }

    const [source, destination] = positional;

    this.fileSystem.moveFile(
      this.resolve(context, source),
      this.resolve(context, destination)
    );

    return { lines: [] };
  }

  echo(args) {
    return { lines: [args.join(" ")] };
  }

  history(context) {
    if (context.history.length === 0) {
      return { lines: ["(no history yet)"] };
    }

    return {
      lines: context.history.map(
        (entry, index) => `${index + 1}  ${entry}`
      )
    };
  }

  help() {
    return {
      lines: [
        "NOVA Terminal — supported commands",
        "",
        "Filesystem:",
        "  pwd                 print working directory",
        "  ls [-l] [path]      list directory contents",
        "  cd [path]           change directory",
        "  mkdir [-p] <dir>    create a directory",
        "  touch <file>        create an empty file",
        "  cat <file>          print file contents",
        "  rm [-r] <path>      remove a file (or directory with -r)",
        "  cp <src> <dest>     copy a file",
        "  mv <src> <dest>     move or rename a file",
        "",
        "Utilities:",
        "  echo <text>         print text",
        "  clear               clear the terminal output",
        "  history             show command history",
        "  help                show this message",
        "",
        "NOVA:",
        "  nova help           show NOVA command help",
        "  nova project        show project name and file count",
        "  nova files          list every file in the project",
        "  nova preview        open the live web preview",
        "  nova run            run the active/current file",
        "  nova build          queue a cloud Android build",
        "",
        "Native toolchains (gcc, python, node, npm, ...) are not",
        "available in Phase 1's browser sandbox."
      ]
    };
  }

  async nova(args, context) {
    const sub = (args[0] || "help").toLowerCase();

    switch (sub) {
      case "help":
        return this.help();

      case "project": {
        const project = this.fileSystem.snapshot();
        const fileCount = Object.keys(project.files).length;

        return {
          lines: [
            `Project: ${project.name}`,
            `Files: ${fileCount}`,
            `Working directory: ${this.displayPath(context.cwd)}`
          ]
        };
      }

      case "files": {
        const names = this.fileSystem.listFiles().sort();

        if (names.length === 0) {
          return { lines: ["(no files)"] };
        }

        return { lines: names };
      }

      case "preview": {
        this.preview.render(this.fileSystem.project.files);
        this.onViewChange("preview");

        return { lines: ["Opening live preview…"] };
      }

      case "run": {
        const activeFile = context.getActiveFile();

        if (!activeFile) {
          throw new Error("nova run: no active file is open");
        }

        const result = await this.runtime.run(
          activeFile,
          this.fileSystem.project.files
        );

        if (result?.type === "preview") {
          this.preview.render(this.fileSystem.project.files);
        }

        this.onViewChange("preview");

        return { lines: [`Ran ${activeFile}`] };
      }

      case "build": {
        const result = await this.compiler.build(
          this.fileSystem.snapshot()
        );

        return {
          lines: [
            `Build ${result.buildId} queued (${result.status}).`
          ]
        };
      }

      default:
        return {
          lines: [
            `nova: unknown subcommand: ${sub}`,
            `Try "nova help".`
          ],
          error: true
        };
    }
  }
}

/**
 * Owns terminal UI state (open/closed, cwd, history, output
 * buffer) and wires it into the DOM. Delegates actual command
 * behavior to the Command Engine + Executor.
 */
export class TerminalController {
  constructor({ executor, getActiveFile }) {
    this.executor = executor;
    this.getActiveFile = getActiveFile || (() => null);

    this.cwd = "";
    this.history = this.loadHistory();
    this.historyIndex = this.history.length;
    this.isOpen = false;

    this.root = null;
    this.outputEl = null;
    this.inputEl = null;
    this.toggleButtons = [];
  }

  loadHistory() {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.slice(-MAX_HISTORY);
        }
      }
    } catch (error) {
      console.warn("Could not load terminal history:", error);
    }

    return [];
  }

  saveHistory() {
    try {
      localStorage.setItem(
        HISTORY_STORAGE_KEY,
        JSON.stringify(this.history.slice(-MAX_HISTORY))
      );
    } catch (error) {
      console.warn("Could not save terminal history:", error);
    }
  }

  /** Build the terminal DOM and mount it. Called once at
   * startup; the terminal then toggles visibility rather than
   * being re-created. */
  mount(mountPoint) {
    const root = document.createElement("div");
    root.className = "terminal-panel";
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "NOVA terminal");

    root.innerHTML = `
      <div class="terminal-header">
        <div class="terminal-title">
          <span class="terminal-dot"></span>
          <span>Terminal</span>
        </div>
        <div class="terminal-header-actions">
          <button
            type="button"
            class="terminal-icon-button"
            data-terminal-clear
            aria-label="Clear terminal"
            title="Clear"
          >⌫</button>
          <button
            type="button"
            class="terminal-icon-button"
            data-terminal-close
            aria-label="Close terminal"
            title="Close"
          >✕</button>
        </div>
      </div>
      <div class="terminal-output" data-terminal-output></div>
      <form class="terminal-input-row" data-terminal-form autocomplete="off">
        <span class="terminal-prompt" data-terminal-prompt>/ $</span>
        <input
          type="text"
          class="terminal-input"
          data-terminal-input
          placeholder="Type a command…"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          inputmode="text"
          enterkeyhint="go"
          aria-label="Terminal command input"
        />
      </form>
    `;

    mountPoint.appendChild(root);

    this.root = root;
    this.outputEl = root.querySelector("[data-terminal-output]");
    this.inputEl = root.querySelector("[data-terminal-input]");
    this.promptEl = root.querySelector("[data-terminal-prompt]");

    const form = root.querySelector("[data-terminal-form]");
    form.addEventListener("submit", event => {
      event.preventDefault();
      this.submitCurrentInput();
    });

    this.inputEl.addEventListener("keydown", event => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.stepHistory(-1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        this.stepHistory(1);
      } else if (event.key === "Tab") {
        // Prevent focus from leaving the input on mobile
        // on-screen keyboards that surface a Tab key.
        event.preventDefault();
      }
    });

    root
      .querySelector("[data-terminal-clear]")
      .addEventListener("click", () => this.clearOutput());

    root
      .querySelector("[data-terminal-close]")
      .addEventListener("click", () => this.close());

    // Keep the output scrolled to the latest line whenever the
    // panel is resized (e.g. Android on-screen keyboard opening
    // changes the viewport height).
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", () => {
        if (this.isOpen) {
          this.scrollToBottom();
        }
      });
    }

    this.printWelcome();
    this.updatePrompt();
  }

  printWelcome() {
    this.printLines([
      "NOVA Terminal — Phase 1 (browser)",
      'Type "help" to see available commands.',
      ""
    ]);
  }

  updatePrompt() {
    const display = this.cwd === "" ? "/" : `/${this.cwd}`;
    if (this.promptEl) {
      this.promptEl.textContent = `${display} $`;
    }
  }

  open() {
    this.isOpen = true;
    this.root?.classList.add("open");
    document.body.classList.add("terminal-open");

    for (const button of this.toggleButtons) {
      button.classList.add("active");
      button.setAttribute("aria-expanded", "true");
    }

    // Delay focus slightly so the panel's open transition has
    // started before the on-screen keyboard animates in.
    window.setTimeout(() => this.inputEl?.focus(), 50);
    this.scrollToBottom();
  }

  close() {
    this.isOpen = false;
    this.root?.classList.remove("open");
    document.body.classList.remove("terminal-open");

    for (const button of this.toggleButtons) {
      button.classList.remove("active");
      button.setAttribute("aria-expanded", "false");
    }

    this.inputEl?.blur();
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /** Register an external button (e.g. in the topbar) that
   * toggles this terminal open/closed. */
  registerToggleButton(button) {
    if (!button) return;

    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", () => this.toggle());
    this.toggleButtons.push(button);
  }

  clearOutput() {
    if (this.outputEl) {
      this.outputEl.innerHTML = "";
    }
  }

  printLines(lines, { error = false, echo = false } = {}) {
    if (!this.outputEl) return;

    for (const line of lines) {
      const row = document.createElement("div");
      row.className = "terminal-line";

      if (error) row.classList.add("error");
      if (echo) row.classList.add("echo");

      row.textContent = line;
      this.outputEl.appendChild(row);
    }

    this.scrollToBottom();
  }

  scrollToBottom() {
    if (!this.outputEl) return;
    this.outputEl.scrollTop = this.outputEl.scrollHeight;
  }

  stepHistory(direction) {
    if (this.history.length === 0) return;

    this.historyIndex = Math.min(
      Math.max(this.historyIndex + direction, 0),
      this.history.length
    );

    const value = this.history[this.historyIndex] ?? "";
    this.inputEl.value = value;

    // Move cursor to the end of the restored command.
    window.requestAnimationFrame(() => {
      this.inputEl.setSelectionRange(value.length, value.length);
    });
  }

  async submitCurrentInput() {
    const line = this.inputEl.value;
    this.inputEl.value = "";

    const promptText = this.promptEl?.textContent || "$";
    this.printLines([`${promptText} ${line}`], { echo: true });

    const trimmed = line.trim();
    if (trimmed) {
      this.history.push(trimmed);
      if (this.history.length > MAX_HISTORY) {
        this.history = this.history.slice(-MAX_HISTORY);
      }
      this.saveHistory();
    }
    this.historyIndex = this.history.length;

    const parsed = parseCommand(line);

    if (!parsed) {
      return;
    }

    const context = {
      cwd: this.cwd,
      history: this.history,
      setCwd: nextCwd => {
        this.cwd = nextCwd;
        this.updatePrompt();
      },
      getActiveFile: this.getActiveFile
    };

    const result = await runCommand(parsed, this.executor, context);

    if (result.clear) {
      this.clearOutput();
      return;
    }

    const lines = result.lines ?? (result.output ? [result.output] : []);

    if (lines.length > 0) {
      this.printLines(lines, { error: Boolean(result.error) });
    }
  }
}
