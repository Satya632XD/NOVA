# NOVA IDE — Phase 1B

NOVA is a mobile-first, web-native IDE designed for browser-based development and cloud-accelerated Android builds.

## Phase 1B

- Mobile-first dashboard
- Project file explorer
- Create, rename, and delete files
- Multi-file editor tabs
- Persistent local project storage
- Live HTML/WebGL preview
- Preview console and error reporting
- Vercel serverless API foundation
- GitHub Actions cloud-build foundation

## Browser-first development

NOVA does not require a local terminal, Termux, or Acode for this architecture.

The frontend is deployed by Vercel and the `/api` directory contains serverless endpoints.

## Repository

```text
nova/
├── README.md
├── app.js
├── index.html
├── package.json
├── styles.css
├── vercel.json
├── api/
│   ├── build.js
│   └── health.js
├── src/
│   ├── compiler.js
│   ├── editor.js
│   ├── filesystem.js
│   └── preview.js
└── .github/
    └── workflows/
        └── android-build.yml
```
