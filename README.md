# Reload File

Minimal Obsidian plugin that reloads the currently open Markdown file from disk.

This is intended for cases where an external sync tool such as Syncthing updates a note on disk but Obsidian keeps showing stale editor contents, especially on Android.

## Install manually

Clone or copy this repository to:

```text
<vault>/.obsidian/plugins/reload-file/
```

The folder name should match the plugin id: `reload-file`.

Then in Obsidian:

1. Go to **Settings → Community plugins**.
2. Disable Restricted Mode if needed.
3. Reload Obsidian.
4. Enable **Reload File**.

The plugin adds a **reload button** to the active Markdown view and also registers the command **Reload current file from disk**.

## Behavior

The button and command read the active Markdown file directly through Obsidian's low-level vault adapter, bypassing Obsidian's cached file read. They then replace the current editor contents with that disk copy and restore the cursor and scroll position as closely as possible.

Reloading intentionally discards any editor contents that differ from the version currently on disk.

## Mobile support

The plugin uses only Obsidian APIs and no Node.js or Electron APIs, so it is intended to work on Android and iOS as well as desktop.
