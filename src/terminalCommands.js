/**
 * NOVA Terminal — Command Engine
 *
 * This module is the "Command Engine" layer of:
 *
 *   Terminal UI -> Command Engine -> Executor
 *
 * It owns:
 *   - the whitelist of supported command names
 *   - argument parsing (a small, safe tokenizer — never eval,
 *     never a real shell grammar)
 *   - dispatching a parsed command to the active Executor
 *
 * It deliberately knows NOTHING about how a command is actually
 * carried out. In Phase 1 that work is done by the
 * BrowserExecutor (see terminal.js), which is backed by NOVA's
 * existing FileSystemService/PreviewService/RuntimeService. In a
 * later phase, a NativeExecutor with the same interface
 * (`execute(name, args, context)`) could be swapped in without
 * changing this file.
 */

/** The full whitelist of commands NOVA's terminal understands.
 * Anything not in this list is rejected before it ever reaches
 * an executor — arguments are always treated as inert data, and
 * NOVA never calls eval() or forwards raw input to a shell. */
export const SUPPORTED_COMMANDS = [
  // Filesystem
  "pwd",
  "ls",
  "cd",
  "mkdir",
  "touch",
  "cat",
  "rm",
  "cp",
  "mv",

  // Utilities
  "echo",
  "clear",
  "history",
  "help",

  // NOVA
  "nova"
];

/** Native/toolchain-style commands NOVA recognizes by name so it
 * can give a clear, honest "not available in Phase 1" message
 * instead of silently failing with "command not found". */
export const NATIVE_COMMANDS = [
  "gcc",
  "g++",
  "rustc",
  "cargo",
  "javac",
  "java",
  "kotlinc",
  "python",
  "python3",
  "php",
  "node",
  "npm"
];

export const PHASE1_NATIVE_MESSAGE =
  "NOVA Phase 1: Native process execution is unavailable in " +
  "browser mode. This will be supported by the native Android " +
  "runtime in Phase 2.";

/**
 * Tokenize a single line of terminal input.
 *
 * Supports simple double-quoted and single-quoted arguments
 * ("like this" / 'like this') so file names or echoed text can
 * contain spaces. There is no globbing, no piping, no command
 * chaining, no environment-variable expansion, and no
 * subshells — this is a fixed, safe grammar, not a shell
 * parser.
 */
export function tokenize(line) {
  const tokens = [];
  let current = "";
  let quote = null;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === " " || char === "\t") {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Parse a raw input line into a structured command, without
 * executing it. Returns null for a blank line.
 */
export function parseCommand(line) {
  const trimmed = (line ?? "").trim();

  if (!trimmed) {
    return null;
  }

  const tokens = tokenize(trimmed);
  const [name, ...args] = tokens;

  return {
    raw: trimmed,
    name: name.toLowerCase(),
    args
  };
}

/**
 * Split a list of arguments into positional arguments and
 * "-x" / "--flag" style flags. Flags are returned as a Set of
 * their bare names (e.g. "-r" -> "r", "--recursive" ->
 * "recursive") so callers can do `flags.has("r")`.
 */
export function splitFlags(args) {
  const positional = [];
  const flags = new Set();

  for (const arg of args) {
    if (arg.startsWith("--") && arg.length > 2) {
      flags.add(arg.slice(2));
    } else if (arg.startsWith("-") && arg.length > 1) {
      for (const char of arg.slice(1)) {
        flags.add(char);
      }
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags };
}

export function isSupportedCommand(name) {
  return SUPPORTED_COMMANDS.includes(name) || name === "nova";
}

export function isNativeCommand(name) {
  return NATIVE_COMMANDS.includes(name);
}

/**
 * Run a single parsed command against an executor.
 *
 * `executor` must expose `execute(name, args, context) ->
 * Promise<CommandResult>`. `context` carries whatever state the
 * executor needs (cwd, history, etc.) — the engine itself is
 * stateless between calls; state lives in the caller
 * (TerminalController in terminal.js) so the UI layer can be
 * swapped independently of state management.
 *
 * A CommandResult is `{ output?: string, lines?: string[],
 * error?: boolean, clear?: boolean }`.
 */
export async function runCommand(parsed, executor, context) {
  if (!parsed) {
    return { lines: [] };
  }

  const { name, args } = parsed;

  if (isNativeCommand(name)) {
    return {
      lines: [PHASE1_NATIVE_MESSAGE],
      error: true
    };
  }

  if (!isSupportedCommand(name)) {
    return {
      lines: [
        `nova: command not found: ${name}`,
        `Type "help" to see available commands.`
      ],
      error: true
    };
  }

  try {
    const result = await executor.execute(name, args, context);
    return result ?? { lines: [] };
  } catch (error) {
    return {
      lines: [error?.message || String(error)],
      error: true
    };
  }
}
