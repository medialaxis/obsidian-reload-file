const { MarkdownView, Notice, Plugin } = require("obsidian");

module.exports = class ReloadFilePlugin extends Plugin {
  async onload() {
    this.addCommand({
      id: "reload-current-file-from-disk",
      name: "Reload current file from disk",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) return false;

        if (!checking) {
          void this.reloadCurrentFile(view);
        }
        return true;
      },
    });
  }

  async reloadCurrentFile(view) {
    const file = view.file;
    const editor = view.editor;

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
