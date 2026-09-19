# Reload File

Minimal Obsidian plugin for Android that provides two recovery actions when externally synced Markdown files become stale in Obsidian.

## Install manually

Clone or copy this repository to:

```text
<vault>/.obsidian/plugins/reload-file/
```

Then in Obsidian:

1. Go to **Settings → Community plugins**.
2. Disable Restricted Mode if needed.
3. Reload Obsidian.
4. Enable **Reload File**.

## Buttons

The active Markdown view gets two buttons:

- **Reload file** — reads the active Markdown file directly through Capacitor's native Filesystem API and replaces the editor contents with that copy.
- **Reload app** — runs Obsidian's built-in `app:reload` command as a heavier fallback when the live Android/Obsidian filesystem state is stuck.

Matching command-palette commands are also registered:

- **Reload File: Reload current file**
- **Reload File: Reload app**
- **Reload File: Debug reload state**

Successful file reloads are silent. Errors still show a notice.

## Direct Android read

For **Reload file**, the plugin uses the vault adapter's Android `basePath` only to locate the current file, then reads it with:

```js
Capacitor.Plugins.Filesystem.readFile({
  path: fullPath,
  encoding: "utf8",
});
```

The returned text is placed directly into the current editor. Manual reload intentionally treats that copy as authoritative.

## Automatic reload

Automatic reload remains optional and is **disabled by default**.

When enabled, the plugin periodically checks the active Markdown file while Obsidian is visible. The interval can be set to 5, 10, 30, or 60 seconds; the default is 10 seconds.

Automatic reload is conservative and does not overwrite editor contents when local edits are detected.

## Diagnostics

**Debug reload state** compares:

- current editor contents
- Obsidian adapter read
- Obsidian cached read
- direct Capacitor read
- file modification metadata

The report contains lengths, equality checks, and first-difference positions, but not the note text. It is copied to the clipboard when possible.
