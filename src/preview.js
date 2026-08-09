export class PreviewService {
  constructor({
    iframe,
    consoleOutput,
    onStatus = () => {}
  }) {
    this.iframe = iframe;
    this.consoleOutput = consoleOutput;
    this.onStatus = onStatus;
  }

  clearConsole() {
    if (this.consoleOutput) {
      this.consoleOutput.innerHTML = "";
    }
  }

  log(type, message) {
    if (!this.consoleOutput) {
      return;
    }

    const row =
      document.createElement("div");

    row.className =
      `preview-console-line ${type}`;

    row.textContent =
      `[${type}] ${message}`;

    this.consoleOutput.appendChild(row);

    this.consoleOutput.scrollTop =
      this.consoleOutput.scrollHeight;
  }

  buildDocument(files) {
    let html = files["index.html"];

    if (!html) {
      html = `<!DOCTYPE html>
<html>
<body></body>
</html>`;
    }

    const css = files["style.css"] ||
      files["styles.css"];

    const js = files["app.js"] ||
      files["main.js"];

    if (css) {
      const styleTag =
        `<style>${css}</style>`;

      if (html.includes("</head>")) {
        html = html.replace(
          "</head>",
          `${styleTag}</head>`
        );
      } else {
        html =
          `${styleTag}${html}`;
      }
    }

    if (js) {
      const scriptTag =
        `<script>
          window.addEventListener("error", event => {
            parent.postMessage({
              source: "nova-preview",
              type: "error",
              message: event.message
            }, "*");
          });

          console.log = (...args) => {
            parent.postMessage({
              source: "nova-preview",
              type: "log",
              message: args.join(" ")
            }, "*");
          };

          ${js}
        <\/script>`;

      if (html.includes("</body>")) {
        html = html.replace(
          "</body>",
          `${scriptTag}</body>`
        );
      } else {
        html += scriptTag;
      }
    }

    return html;
  }

  render(files) {
    if (!this.iframe) {
      return;
    }

    this.clearConsole();

    this.onStatus("Updating preview…");

    const html =
      this.buildDocument(files);

    const blob =
      new Blob(
        [html],
        { type: "text/html" }
      );

    const url =
      URL.createObjectURL(blob);

    this.iframe.onload = () => {
      URL.revokeObjectURL(url);
      this.onStatus("Live");
    };

    this.iframe.src = url;
  }

  attachMessageListener() {
    window.addEventListener(
      "message",
      event => {
        if (
          !event.data ||
          event.data.source !==
            "nova-preview"
        ) {
          return;
        }

        const {
          type,
          message
        } = event.data;

        this.log(
          type === "error"
            ? "error"
            : "log",
          message
        );
      }
    );
  }
}
