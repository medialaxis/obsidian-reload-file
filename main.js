const { MarkdownView, Notice, Plugin } = require("obsidian");

module.exports = class ReloadFilePlugin extends Plugin {
  async onload() {
    this.viewsWithButton = new WeakSet();

    this.addCommand({
      id: "reload-current-file-from-disk",
      name: "Reload current file from disk",
      icon: "refresh-cw",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) return false;

        if (!checking) {
          void this.reloadCurrentFile(view);
        }
        return true;
      },
    });

    // Diagnostic/manual fallback: this uses exactly the same addAction call as
    // the automatic registration, but only when explicitly invoked.
    this.addCommand({
      id: "add-reload-button-to-current-view",
      name: "Add reload button to current view",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return false;

        if (!checking) {
          const added = this.addReloadButton(view, true);
          new Notice(added ? "Reload button added" : "Reload button already registered for this view");
        }
        return true;
      },
    });

    const attachToActiveMarkdownView = () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view) this.addReloadButton(view, false);
    };

    // Try immediately in case the layout is already available.
    attachToActiveMarkdownView();

    this.registerEvent(this.app.workspace.on("layout-change", attachToActiveMarkdownView));
    this.registerEvent(this.app.workspace.on("active-leaf-change", attachToActiveMarkdownView));
    this.app.workspace.onLayoutReady(attachToActiveMarkdownView);
  }

  addReloadButton(view, force) {
    if (!force && this.viewsWithButton.has(view)) return false;

    const buttonEl = view.addAction(
      "refresh-cw",
      "Reload file from disk",
      () => void this.reloadCurrentFile(view)
    );

    this.viewsWithButton.add(view);
    this.register(() => buttonEl.remove());
    return true;
  }

  async reloadCurrentFile(view) {
    const file = view.file;
    const editor = view.editor;

    if (!file) {
      new Notice("No active Markdown file to reload");
      return;
    }

    try {
      // Read the underlying file directly, bypassing Obsidian's cached vault read.
      const diskContents = await this.app.vault.adapter.read(file.path);

      const cursor = editor.getCursor();
      const scroll = editor.getScrollInfo ? editor.getScrollInfo() : null;

      editor.setValue(diskContents);

      // Restore the cursor as closely as possible.
      const lastLine = Math.max(0, editor.lineCount() - 1);
      const line = Math.min(cursor.line, lastLine);
      const ch = Math.min(cursor.ch, editor.getLine(line).length);
      editor.setCursor({ line, ch });

      if (scroll && editor.scrollTo) {
        editor.scrollTo(scroll.left, scroll.top);
      }

      new Notice(`Reloaded ${file.name} from disk`);
    } catch (error) {
      console.error("Reload File: failed to reload file from disk", error);
      new Notice(`Failed to reload ${file.name} from disk`);
    }
  }
};
