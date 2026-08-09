const STORAGE_KEY = "nova-phase1b-project";

// Sentinel suffix used to mark an explicitly-created empty
// directory in the flat files map (see the directory-aware
// extensions near the bottom of this class). Declared up top so
// every method in the class can reference it directly.
export const DIR_MARKER_SUFFIX = ".novadir";

const DEFAULT_PROJECT = {
  name: "NOVA Project",

  files: {
    "index.html": `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NOVA Preview</title>
</head>

<body>
  <h1>NOVA WebGL Preview</h1>

  <script>
    const canvas = document.createElement("canvas");
    document.body.appendChild(canvas);

    canvas.width = innerWidth;
    canvas.height = innerHeight;

    const gl = canvas.getContext("webgl");

    if (!gl) {
      document.body.innerHTML += "<p>WebGL is not supported.</p>";
    }
  </script>
</body>
</html>`,

    "style.css": `body {
  margin: 0;
  min-height: 100vh;
  background: #050505;
  color: white;
  font-family: system-ui, sans-serif;
}

h1 {
  padding: 24px;
}`,

    "app.js": `console.log("NOVA project running");`
  }
};

function cloneProject(project) {
  return JSON.parse(JSON.stringify(project));
}

export class FileSystemService {
  constructor() {
    this.project = this.load();
  }

  load() {
    try {
      const stored = localStorage.getItem(
        STORAGE_KEY
      );

      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn(
        "Could not load NOVA project:",
        error
      );
    }

    return cloneProject(DEFAULT_PROJECT);
  }

  save() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(this.project)
    );
  }

  listFiles() {
    return Object.keys(this.project.files).filter(
      key => !key.endsWith(`/${DIR_MARKER_SUFFIX}`)
    );
  }

  exists(fileName) {
    return Object.prototype.hasOwnProperty.call(
      this.project.files,
      fileName
    );
  }

  readFile(fileName) {
    return this.project.files[fileName] ?? "";
  }

  writeFile(fileName, content) {
    this.project.files[fileName] = content;
    this.save();
  }

  createFile(fileName, content = "") {
    if (!fileName) {
      throw new Error("File name is required.");
    }

    if (this.exists(fileName)) {
      throw new Error(
        `File "${fileName}" already exists.`
      );
    }

    this.project.files[fileName] = content;
    this.save();
  }

  renameFile(oldName, newName) {
    if (!this.exists(oldName)) {
      throw new Error(
        `File "${oldName}" does not exist.`
      );
    }

    if (
      oldName !== newName &&
      this.exists(newName)
    ) {
      throw new Error(
        `File "${newName}" already exists.`
      );
    }

    const content =
      this.project.files[oldName];

    delete this.project.files[oldName];

    this.project.files[newName] = content;

    this.save();
  }

  deleteFile(fileName) {
    if (!this.exists(fileName)) {
      return;
    }

    delete this.project.files[fileName];
    this.save();
  }

  snapshot() {
    return cloneProject(this.project);
  }

  reset() {
    this.project = cloneProject(
      DEFAULT_PROJECT
    );

    this.save();
  }

  /*
   * ---------------------------------------------------------------
   * Directory-aware extensions (added for the NOVA terminal).
   *
   * NOVA's project storage remains a flat map of
   * "path" -> content, where "path" may contain "/" separators
   * (e.g. "src/app.js"). Directories are NOT stored as their own
   * entries by default; they are inferred from file paths. An
   * explicit empty directory is represented by a key ending in
   * "/" whose value is the sentinel DIR_MARKER, so "mkdir" on an
   * empty folder is still visible to "ls" before any file is
   * created inside it.
   *
   * These methods only ADD capability on top of the existing
   * files map and never change the existing readFile/writeFile/
   * createFile/deleteFile/renameFile API or the on-disk format
   * used by save()/load(), so every previously-working feature
   * (editor, file manager, preview, build) keeps working exactly
   * as before.
   * ---------------------------------------------------------------
   */

  static normalizePath(path) {
    if (!path) return "";

    // Collapse backslashes, repeated slashes, and strip a
    // leading "./" or "/" so paths behave the same whether the
    // user typed "a/b", "./a/b", or "/a/b".
    let normalized = String(path)
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    if (normalized.startsWith("./")) {
      normalized = normalized.slice(2);
    }

    if (normalized.startsWith("/")) {
      normalized = normalized.slice(1);
    }

    if (normalized.endsWith("/") && normalized.length > 1) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  }

  /** Resolve a (possibly relative, possibly containing "." / "..")
   * path against a current working directory, returning a
   * normalized absolute-style path with no leading slash. */
  static resolvePath(cwd, inputPath) {
    if (!inputPath || inputPath === ".") {
      return FileSystemService.normalizePath(cwd);
    }

    const isAbsolute = inputPath.startsWith("/");

    const base = isAbsolute
      ? []
      : FileSystemService.normalizePath(cwd)
          .split("/")
          .filter(Boolean);

    const parts = inputPath
      .replace(/\\/g, "/")
      .split("/")
      .filter(Boolean);

    const stack = [...base];

    for (const part of parts) {
      if (part === "." || part === "") {
        continue;
      }

      if (part === "..") {
        stack.pop();
        continue;
      }

      stack.push(part);
    }

    return stack.join("/");
  }

  /** True if `dirPath` (normalized, no trailing slash, "" = root)
   * exists — either because a directory marker was created for
   * it, or because some file lives inside it. Root always
   * exists. */
  directoryExists(dirPath) {
    const normalized = FileSystemService.normalizePath(dirPath);

    if (normalized === "") {
      return true;
    }

    const prefix = `${normalized}/`;

    for (const key of Object.keys(this.project.files)) {
      if (key === `${normalized}/${DIR_MARKER_SUFFIX}`) {
        return true;
      }

      if (key.startsWith(prefix)) {
        return true;
      }
    }

    return false;
  }

  /** True if `filePath` is a regular file (not a directory). */
  fileExists(filePath) {
    const normalized = FileSystemService.normalizePath(filePath);

    return (
      this.exists(normalized) &&
      !normalized.endsWith(`/${DIR_MARKER_SUFFIX}`)
    );
  }

  /** List the immediate children of `dirPath`: both
   * subdirectories (inferred + explicit) and files, one level
   * deep, similar to a real "ls". */
  listDirectory(dirPath) {
    const normalized = FileSystemService.normalizePath(dirPath);

    if (normalized !== "" && !this.directoryExists(normalized)) {
      throw new Error(
        `No such directory: "${dirPath}"`
      );
    }

    const prefix = normalized === "" ? "" : `${normalized}/`;

    const dirs = new Set();
    const files = [];

    for (const key of Object.keys(this.project.files)) {
      if (prefix && !key.startsWith(prefix)) {
        continue;
      }

      const rest = key.slice(prefix.length);

      if (!rest) {
        continue;
      }

      const slashIndex = rest.indexOf("/");

      if (slashIndex === -1) {
        if (rest !== DIR_MARKER_SUFFIX) {
          files.push(rest);
        }
      } else {
        dirs.add(rest.slice(0, slashIndex));
      }
    }

    return {
      directories: [...dirs].sort(),
      files: files.sort()
    };
  }

  /** Create a directory (and, implicitly, any missing parent
   * directories) by writing an empty directory marker file. A
   * no-op if the directory already exists. */
  makeDirectory(dirPath, { recursive = true } = {}) {
    const normalized = FileSystemService.normalizePath(dirPath);

    if (!normalized) {
      throw new Error("Directory name is required.");
    }

    if (this.fileExists(normalized)) {
      throw new Error(
        `A file named "${dirPath}" already exists.`
      );
    }

    const segments = normalized.split("/");

    if (!recursive) {
      const parent = segments.slice(0, -1).join("/");

      if (parent && !this.directoryExists(parent)) {
        throw new Error(
          `No such directory: "${parent}"`
        );
      }
    }

    if (this.directoryExists(normalized)) {
      return;
    }

    const markerKey = `${normalized}/${DIR_MARKER_SUFFIX}`;

    this.project.files[markerKey] = "";
    this.save();
  }

  /** Remove a file or, when recursive, a directory and
   * everything inside it. */
  removePath(targetPath, { recursive = false } = {}) {
    const normalized = FileSystemService.normalizePath(targetPath);

    if (this.fileExists(normalized)) {
      this.deleteFile(normalized);
      return;
    }

    if (!this.directoryExists(normalized)) {
      throw new Error(
        `No such file or directory: "${targetPath}"`
      );
    }

    if (!recursive) {
      throw new Error(
        `"${targetPath}" is a directory (use rm -r to remove it).`
      );
    }

    const prefix = `${normalized}/`;

    for (const key of Object.keys(this.project.files)) {
      if (key.startsWith(prefix) || key === normalized) {
        delete this.project.files[key];
      }
    }

    this.save();
  }

  /** Copy a file to a new path. Directory copies are not
   * supported in Phase 1 (mirrors most minimal shells' base
   * "cp" without "-r"). */
  copyFile(sourcePath, destinationPath) {
    const from = FileSystemService.normalizePath(sourcePath);
    let to = FileSystemService.normalizePath(destinationPath);

    if (!this.fileExists(from)) {
      throw new Error(
        `No such file: "${sourcePath}"`
      );
    }

    if (this.directoryExists(to)) {
      const baseName = from.split("/").pop();
      to = to === "" ? baseName : `${to}/${baseName}`;
    }

    this.project.files[to] = this.project.files[from];
    this.save();
  }

  /** Move/rename a file to a new path (also works across
   * inferred directories). */
  moveFile(sourcePath, destinationPath) {
    const from = FileSystemService.normalizePath(sourcePath);
    let to = FileSystemService.normalizePath(destinationPath);

    if (!this.fileExists(from)) {
      throw new Error(
        `No such file: "${sourcePath}"`
      );
    }

    if (this.directoryExists(to)) {
      const baseName = from.split("/").pop();
      to = to === "" ? baseName : `${to}/${baseName}`;
    }

    if (to !== from && this.exists(to)) {
      throw new Error(
        `"${destinationPath}" already exists.`
      );
    }

    this.project.files[to] = this.project.files[from];
    delete this.project.files[from];
    this.save();
  }

  /** Create an empty file (like "touch"), or, if it already
   * exists, leave its contents untouched — matching real touch
   * semantics of "create if missing". */
  touchFile(filePath) {
    const normalized = FileSystemService.normalizePath(filePath);

    if (!normalized) {
      throw new Error("File name is required.");
    }

    if (this.directoryExists(normalized)) {
      throw new Error(
        `"${filePath}" is a directory.`
      );
    }

    if (!this.exists(normalized)) {
      this.project.files[normalized] = "";
      this.save();
    }
  }
}
