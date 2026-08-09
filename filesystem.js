const STORAGE_KEY = "nova-phase1b-project";

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
    return Object.keys(this.project.files);
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
}
