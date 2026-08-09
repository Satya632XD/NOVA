import { EditorService } from "./src/editor.js";
import { FileSystemService } from "./src/filesystem.js";
import { PreviewService } from "./src/preview.js";
import { CompilerService } from "./src/compiler.js";
import { RuntimeService } from "./src/runtime.js";
import { BrowserExecutor, TerminalController } from "./src/terminal.js";

const fileSystem =
  new FileSystemService();

const elements = {
  editor: document.querySelector("#editor"),
  fileList: document.querySelector("#file-list"),
  tabs: document.querySelector("#editor-tabs"),
  preview: document.querySelector("#preview-frame"),
  console: document.querySelector("#preview-console"),
  status: document.querySelector("#status"),
  fileName: document.querySelector("#current-file"),
  filesView: document.querySelector("#files-view"),
  codeView: document.querySelector("#code-view"),
  previewView: document.querySelector("#preview-view"),
  createFile: document.querySelector("#create-file"),
  run: document.querySelector("#run"),
  build: document.querySelector("#build"),
  terminalMount: document.querySelector("#terminal-mount"),
  terminalToggle: document.querySelector("#terminal-toggle")
};

let activeFile = null;
let openTabs = [];

function setStatus(message) {
  if (elements.status) {
    elements.status.textContent = message;
  }
}

function renderFiles() {
  elements.fileList.innerHTML = "";

  for (const fileName of fileSystem.listFiles()) {
    const item =
      document.createElement("button");

    item.className =
      "file-item";

    if (fileName === activeFile) {
      item.classList.add("active");
    }

    item.textContent = fileName;

    item.addEventListener(
      "click",
      () => openFile(fileName)
    );

    elements.fileList.appendChild(item);
  }
}

function renderTabs() {
  elements.tabs.innerHTML = "";

  for (const fileName of openTabs) {
    const tab =
      document.createElement("button");

    tab.className =
      "editor-tab";

    if (fileName === activeFile) {
      tab.classList.add("active");
    }

    tab.textContent = fileName;

    tab.addEventListener(
      "click",
      () => openFile(fileName)
    );

    elements.tabs.appendChild(tab);
  }
}

const editor =
  new EditorService({
    mountEl: elements.editor,

    onChange(content) {
      if (!activeFile) {
        return;
      }

      fileSystem.writeFile(
        activeFile,
        content
      );

      setStatus("Saved locally");
    },

    onCursorChange({ line, column }) {
      const cursor =
        document.querySelector(
          "#cursor-position"
        );

      if (cursor) {
        cursor.textContent =
          `Ln ${line}, Col ${column}`;
      }
    }
  });

const preview =
  new PreviewService({
    iframe: elements.preview,
    consoleOutput: elements.console,
    onStatus: setStatus
  });

preview.attachMessageListener();

const compiler =
  new CompilerService({
    onStatus: setStatus
  });

const runtime =
  new RuntimeService({
    onStatus: setStatus,
    onOutput(type, message) {
      preview.log(type, message);
    }
  });

const terminalExecutor =
  new BrowserExecutor({
    fileSystem,
    preview,
    runtime,
    compiler,
    onViewChange: view => showView(view)
  });

const terminal =
  new TerminalController({
    executor: terminalExecutor,
    getActiveFile: () => activeFile
  });

if (elements.terminalMount) {
  terminal.mount(elements.terminalMount);
}

if (elements.terminalToggle) {
  terminal.registerToggleButton(elements.terminalToggle);
}

// Keep the file explorer and the open editor tab in sync with
// any filesystem changes made from the terminal (touch, mkdir,
// rm, cp, mv, or edits made indirectly). This does not create a
// second source of truth: it just re-reads NOVA's existing
// FileSystemService after each terminal command.
function syncAfterTerminalCommand() {
  renderFiles();
  renderTabs();

  if (activeFile && fileSystem.exists(activeFile)) {
    const latest = fileSystem.readFile(activeFile);

    if (editor.view && latest !== editor.getValue()) {
      editor.loadFile(activeFile, latest);
    }
  } else if (activeFile && !fileSystem.exists(activeFile)) {
    activeFile = null;
    elements.fileName.textContent = "No file";
  }
}

const terminalForm = elements.terminalMount?.querySelector(
  "[data-terminal-form]"
);

terminalForm?.addEventListener("submit", () => {
  // Runs after TerminalController's own submit handler has
  // executed the command (listeners fire in the order they were
  // attached), so the filesystem is already up to date here.
  window.setTimeout(syncAfterTerminalCommand, 0);
});

function openFile(fileName) {
  activeFile = fileName;

  if (!openTabs.includes(fileName)) {
    openTabs.push(fileName);
  }

  elements.fileName.textContent =
    fileName;

  const content = fileSystem.readFile(fileName);

  if (!editor.view) {
    editor.mount(
      fileName,
      content
    );
  } else {
    editor.loadFile(
      fileName,
      content
    );
  }

  renderFiles();
  renderTabs();

  showView("code");
}

function showView(view) {
  elements.filesView.classList.toggle(
    "active",
    view === "files"
  );

  elements.codeView.classList.toggle(
    "active",
    view === "code"
  );

  elements.previewView.classList.toggle(
    "active",
    view === "preview"
  );

  document
    .querySelectorAll("[data-view]")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.view === view
      );
    });

  if (view === "preview") {
    preview.render(
      fileSystem.project.files
    );
  }
}

elements.createFile?.addEventListener(
  "click",
  () => {
    const fileName =
      window.prompt(
        "New file name:"
      );

    if (!fileName) {
      return;
    }

    try {
      fileSystem.createFile(
        fileName
      );

      renderFiles();
      openFile(fileName);
    } catch (error) {
      window.alert(
        error.message
      );
    }
  }
);

elements.run?.addEventListener(
  "click",
  async () => {
    if (!activeFile) {
      setStatus("Open a file first.");
      return;
    }

    preview.clearConsole();

    try {
      const result =
        await runtime.run(
          activeFile,
          fileSystem.project.files
        );

      if (result.type === "preview") {
        preview.render(
          fileSystem.project.files
        );
        showView("preview");
      } else {
        showView("preview");
      }
    } catch (error) {
      preview.log("error", error.message);
      setStatus("Runtime error");
      showView("preview");
    }
  }
);

elements.build?.addEventListener(
  "click",
  async () => {
    try {
      setStatus(
        "Preparing cloud build…"
      );

      const result =
        await compiler.build(
          fileSystem.snapshot()
        );

      window.alert(
        `Build ${result.buildId} queued.`
      );
    } catch (error) {
      window.alert(
        error.message
      );
    }
  }
);

document
  .querySelectorAll("[data-view]")
  .forEach(button => {
    button.addEventListener(
      "click",
      () => {
        showView(
          button.dataset.view
        );
      }
    );
  });

renderFiles();

const firstFile =
  fileSystem.listFiles()[0];

if (firstFile) {
  openFile(firstFile);
}

showView("code");
setStatus("Ready");
