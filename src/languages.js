/**
 * NOVA Language & Technology Registry
 *
 * This is the source of truth for the Phase 1C editor/runtime matrix.
 */

export const NOVA_LANGUAGES = {
  html: {
    id: "html",
    name: "HTML",
    extensions: [".html", ".htm"],
    category: "web",
    canEdit: true,
    canRunLocally: true,
    runner: "web"
  },
  css: {
    id: "css",
    name: "CSS",
    extensions: [".css"],
    category: "web",
    canEdit: true,
    canRunLocally: true,
    runner: "web"
  },
  javascript: {
    id: "javascript",
    name: "JavaScript",
    extensions: [".js", ".mjs", ".cjs"],
    category: "language",
    canEdit: true,
    canRunLocally: true,
    runner: "web"
  },
  typescript: {
    id: "typescript",
    name: "TypeScript",
    extensions: [".ts", ".tsx"],
    category: "language",
    canEdit: true,
    canRunLocally: true,
    runner: "typescript"
  },
  python: {
    id: "python",
    name: "Python",
    extensions: [".py", ".pyw"],
    category: "language",
    canEdit: true,
    canRunLocally: true,
    runner: "python"
  },
  c: {
    id: "c",
    name: "C",
    extensions: [".c", ".h"],
    category: "native",
    canEdit: true,
    canRunLocally: false
  },
  cpp: {
    id: "cpp",
    name: "C++",
    extensions: [".cpp", ".cc", ".cxx", ".hpp", ".hh"],
    category: "native",
    canEdit: true,
    canRunLocally: false
  },
  rust: {
    id: "rust",
    name: "Rust",
    extensions: [".rs"],
    category: "native",
    canEdit: true,
    canRunLocally: false
  },
  java: {
    id: "java",
    name: "Java",
    extensions: [".java"],
    category: "native",
    canEdit: true,
    canRunLocally: false
  },
  kotlin: {
    id: "kotlin",
    name: "Kotlin",
    extensions: [".kt", ".kts"],
    category: "native",
    canEdit: true,
    canRunLocally: false
  },
  php: {
    id: "php",
    name: "PHP",
    extensions: [".php"],
    category: "server",
    canEdit: true,
    canRunLocally: false
  }
};

export const NOVA_FRAMEWORKS = {
  webgl: {
    id: "webgl",
    name: "WebGL",
    category: "graphics",
    canEdit: true,
    canRunLocally: true,
    runner: "web"
  },
  threejs: {
    id: "threejs",
    name: "Three.js",
    category: "graphics",
    canEdit: true,
    canRunLocally: true,
    runner: "web"
  },
  babylonjs: {
    id: "babylonjs",
    name: "Babylon.js",
    category: "graphics",
    canEdit: true,
    canRunLocally: true,
    runner: "web"
  }
};

const allEntries = [
  ...Object.values(NOVA_LANGUAGES),
  ...Object.values(NOVA_FRAMEWORKS)
];

export function detectLanguage(fileName = "") {
  const lowerName = fileName.toLowerCase();

  for (const language of Object.values(NOVA_LANGUAGES)) {
    if (language.extensions.some(extension => lowerName.endsWith(extension))) {
      return language;
    }
  }

  return NOVA_LANGUAGES.javascript;
}

export function getLanguageById(id) {
  return NOVA_LANGUAGES[id] ?? null;
}

export function getTechnologyById(id) {
  return NOVA_LANGUAGES[id] ?? NOVA_FRAMEWORKS[id] ?? null;
}

export function getSupportedTechnologies() {
  return [...allEntries];
}

export function getRunnableTechnologies() {
  return allEntries.filter(item => item.canRunLocally);
}

export function getEditableTechnologies() {
  return allEntries.filter(item => item.canEdit);
}
