const {
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
} = require("obsidian");

const DEFAULT_SETTINGS = {
  autoReload: false,
  autoReloadIntervalSeconds: 10,
};

module.exports = class ReloadFilePlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.viewsWithButton = new WeakSet();
    this.fileStates = new Map();
    this.autoReloadInterval = null;

    this.addSettingTab(new ReloadFileSettingTab(this.app, this));

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

    this.addCommand({
      id: "debug-reload-state",
      name: "Debug reload state",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) return false;

        if (!checking) {
          void this.debugReloadState(view);
        }
        return true;
      },
    });

    const attachToActiveMarkdownView = () => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view || this.viewsWithButton.has(view)) return;

      this.viewsWithButton.add(view);

      const buttonEl = view.addAction(
        "refresh-cw",
        "Reload file from disk",
        () => void this.reloadCurrentFile(view)
      );

      this.register(() => buttonEl.remove());
    };

    this.registerEvent(this.app.workspace.on("layout-change", attachToActiveMarkdownView));
    this.app.workspace.onLayoutReady(attachToActiveMarkdownView);

    this.restartAutoReloadTimer();
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.restartAutoReloadTimer();
  }

  restartAutoReloadTimer() {
    if (this.autoReloadInterval !== null) {
      window.clearInterval(this.autoReloadInterval);
      this.autoReloadInterval = null;
    }

    if (!this.settings.autoReload) return;

    this.autoReloadInterval = window.setInterval(
      () => void this.checkForExternalChange(),
      this.settings.autoReloadIntervalSeconds * 1000
    );
    this.registerInterval(this.autoReloadInterval);
  }

  async checkForExternalChange() {
    if (document.hidden) return;

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) return;

    const file = view.file;

    try {
      const stat = await this.app.vault.adapter.stat(file.path);
      if (!stat) return;

      const previous = this.fileStates.get(file.path);

      if (!previous) {
        const diskContents = await this.app.vault.adapter.read(file.path);
        this.fileStates.set(file.path, { mtime: stat.mtime, diskContents });
        return;
      }

      if (previous.mtime === stat.mtime) return;

      const diskContents = await this.app.vault.adapter.read(file.path);

      // Automatic reload must never discard local editor changes.
      if (view.editor.getValue() === previous.diskContents) {
        this.replaceEditorContents(view, diskContents);
      }

      this.fileStates.set(file.path, { mtime: stat.mtime, diskContents });
    } catch (error) {
      console.error("Reload File: automatic reload check failed", error);
    }
  }

  replaceEditorContents(view, diskContents) {
    const editor = view.editor;
    if (editor.getValue() === diskContents) return;

    const cursor = editor.getCursor();
    const scroll = editor.getScrollInfo ? editor.getScrollInfo() : null;

    editor.setValue(diskContents);

    const lastLine = Math.max(0, editor.lineCount() - 1);
    const line = Math.min(cursor.line, lastLine);
    const ch = Math.min(cursor.ch, editor.getLine(line).length);
    editor.setCursor({ line, ch });

    if (scroll && editor.scrollTo) {
      editor.scrollTo(scroll.left, scroll.top);
    }
  }

  async reloadCurrentFile(view) {
    const file = view.file;

    if (!file) {
      new Notice("No active Markdown file to reload");
      return;
    }

    try {
      const diskContents = await this.app.vault.adapter.read(file.path);
      this.replaceEditorContents(view, diskContents);

      const stat = await this.app.vault.adapter.stat(file.path);
      if (stat) {
        this.fileStates.set(file.path, { mtime: stat.mtime, diskContents });
      }
    } catch (error) {
      console.error("Reload File: failed to reload file from disk", error);
      new Notice(`Failed to reload ${file.name} from disk`);
    }
  }

  async debugReloadState(view) {
    const file = view.file;
    if (!file) return;

    try {
      const editorContents = view.editor.getValue();
      const [adapterContents, cachedContents, adapterStat] = await Promise.all([
        this.app.vault.adapter.read(file.path),
        this.app.vault.cachedRead(file),
        this.app.vault.adapter.stat(file.path),
      ]);

      const adapterType =
        this.app.vault.adapter?.constructor?.name ?? "unknown";
      const tracked = this.fileStates.get(file.path);

      const report = [
        "Reload File diagnostics",
        `timestamp: ${new Date().toISOString()}`,
        `path: ${file.path}`,
        `adapter: ${adapterType}`,
        `view mode: ${typeof view.getMode === "function" ? view.getMode() : "unknown"}`,
        `TFile mtime: ${file.stat?.mtime ?? "unknown"}`,
        `adapter mtime: ${adapterStat?.mtime ?? "unknown"}`,
        `adapter size: ${adapterStat?.size ?? "unknown"}`,
        `tracked mtime: ${tracked?.mtime ?? "none"}`,
        `editor length: ${editorContents.length}`,
        `adapter.read length: ${adapterContents.length}`,
        `vault.cachedRead length: ${cachedContents.length}`,
        `editor == adapter.read: ${editorContents === adapterContents}`,
        `editor == cachedRead: ${editorContents === cachedContents}`,
        `adapter.read == cachedRead: ${adapterContents === cachedContents}`,
        `first diff editor/adapter: ${firstDifferenceIndex(editorContents, adapterContents)}`,
        `first diff editor/cached: ${firstDifferenceIndex(editorContents, cachedContents)}`,
        `first diff adapter/cached: ${firstDifferenceIndex(adapterContents, cachedContents)}`,
      ].join("\n");

      console.log("Reload File diagnostics:\n" + report);

      try {
        await navigator.clipboard.writeText(report);
        new Notice("Reload diagnostics copied to clipboard");
      } catch (clipboardError) {
        console.error("Reload File: failed to copy diagnostics", clipboardError);
        new Notice("Reload diagnostics written to console");
      }
    } catch (error) {
      console.error("Reload File: failed to collect diagnostics", error);
      new Notice("Failed to collect reload diagnostics");
    }
  }
};

function firstDifferenceIndex(a, b) {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? "none" : length;
}

class ReloadFileSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Automatic reload")
      .setDesc("Periodically check the active Markdown file for external changes. Disabled by default.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.autoReload)
          .onChange(async (value) => {
            this.plugin.settings.autoReload = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Reload interval")
      .setDesc("How often to check the active file while Obsidian is visible.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("5", "5 seconds")
          .addOption("10", "10 seconds")
          .addOption("30", "30 seconds")
          .addOption("60", "60 seconds")
          .setValue(String(this.plugin.settings.autoReloadIntervalSeconds))
          .onChange(async (value) => {
            this.plugin.settings.autoReloadIntervalSeconds = Number(value);
            await this.plugin.saveSettings();
          })
      );
  }
}
