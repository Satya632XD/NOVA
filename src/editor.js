import { EditorState } from "https://esm.sh/@codemirror/state";

import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter
} from "https://esm.sh/@codemirror/view";

import {
  defaultKeymap,
  history,
  historyKeymap
} from "https://esm.sh/@codemirror/commands";

import { javascript } from "https://esm.sh/@codemirror/lang-javascript";
import { html } from "https://esm.sh/@codemirror/lang-html";
import { css } from "https://esm.sh/@codemirror/lang-css";

import { oneDark } from "https://esm.sh/@codemirror/theme-one-dark";

import {
  syntaxHighlighting,
  defaultHighlightStyle
} from "https://esm.sh/@codemirror/language";


function languageForFile(fileName) {
  if (fileName.endsWith(".html")) {
    return html();
  }

  if (fileName.endsWith(".css")) {
    return css();
  }

  return javascript();
}


export class EditorService {
  constructor({
    mountEl,
    onChange,
    onCursorChange
  }) {
    this.mountEl = mountEl;
    this.onChange = onChange;
    this.onCursorChange = onCursorChange;

    this.view = null;
    this.currentFile = null;
  }


  mount(fileName, content) {
    this.currentFile = fileName;

    const state = EditorState.create({
      doc: content,

      extensions: [
        lineNumbers(),

        history(),

        keymap.of([
          ...defaultKeymap,
          ...historyKeymap
        ]),

        highlightActiveLine(),
        highlightActiveLineGutter(),

        syntaxHighlighting(
          defaultHighlightStyle,
          {
            fallback: true
          }
        ),

        oneDark,

        languageForFile(fileName),

        EditorView.updateListener.of(
          update => {
            if (update.docChanged) {
              this.onChange?.(
                update.state.doc.toString()
              );
            }

            if (update.selectionSet) {
              this.updateCursor();
            }
          }
        ),

        EditorView.theme({
          "&": {
            height: "100%"
          },

          ".cm-scroller": {
            fontFamily:
              '"JetBrains Mono", "Fira Code", "SFMono-Regular", Consolas, monospace',
            overflow: "auto"
          },

          ".cm-content": {
            padding: "12px 0"
          },

          ".cm-gutters": {
            backgroundColor: "#080b10",
            borderRight: "1px solid #252b38"
          },

          ".cm-activeLine": {
            backgroundColor:
              "rgba(255, 255, 255, 0.035)"
          },

          ".cm-activeLineGutter": {
            backgroundColor:
              "rgba(124, 92, 255, 0.12)"
          }
        })
      ]
    });

    this.view = new EditorView({
      state,
      parent: this.mountEl
    });

    this.updateCursor();
  }


  loadFile(fileName, content) {
    this.currentFile = fileName;

    if (!this.view) {
      return;
    }

    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: content
      },

      // Switching files should not save the old file's
      // content into the newly selected file.
      userEvent: "select.change"
    });

    this.updateCursor();
    this.focus();
  }


  getValue() {
    if (!this.view) {
      return "";
    }

    return this.view.state.doc.toString();
  }


  focus() {
    if (this.view) {
      this.view.focus();
    }
  }


  updateCursor() {
    if (!this.view) {
      return;
    }

    const position =
      this.view.state.selection.main.head;

    const textBeforeCursor =
      this.view.state.doc
        .toString()
        .slice(0, position);

    const lines =
      textBeforeCursor.split("\n");

    const line = lines.length;

    const column =
      lines[lines.length - 1].length + 1;

    this.onCursorChange?.({
      line,
      column
    });
  }
}
