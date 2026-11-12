# Canvas desktop workspace

Windows 10 22H2 / Windows 11. No account or telemetry. Product display name is configured in `product.json`.

Prerequisites: Node 22 LTS, Rust stable MSVC, Visual Studio C++ build tools with Windows SDK, WebView2 Evergreen Runtime, and `cargo install tauri-cli --version '^2' --locked`.

```
npm ci
npm run desktop
```

`npm run dev` runs the canvas in a browser for UI development; native terminals require the desktop host. `npm run check` runs frontend checks. `npm run native:check` runs Rust formatting, Clippy and the core Windows ConPTY tests against `Cargo.lock`.

For a desktop build you can open directly:

```powershell
npm run desktop:build -- --debug
.\artifacts\windows-debug\agent-canvas-desktop.exe
```

Debug builds may show a console alongside the canvas window. `npm run desktop:build` creates the optimized build in `artifacts/windows-portable/`. Both folders include `agent-canvas-desktop.exe` and the required `pty-host.exe`; keep them together. The scripts build both binaries in the same profile and derive the display name from `product.json`. Source build outputs remain under `src-tauri/target/`. Installer packaging comes in M7.

The optional Git Bash roundtrip test needs an unrestricted Windows host with Git Bash installed. Run it explicitly with `cargo test --manifest-path src-tauri/Cargo.toml --locked --test conpty -- --ignored`; Windows CI also runs it separately. The restricted agent host cannot create MSYS2 signal pipes, although the user-launched application's Git Bash prompt has been visually verified.

On this restricted development host, use `$env:CANVAS_NO_SUBPROCESS='1'` in PowerShell before `npm run check` to enable the documented in-process compiler fallback. This is a verification aid; it does not provide a native runtime. See [third-party dependency provenance](THIRD_PARTY.md) for the offline xterm dependency constraints.

Workspaces autosave after 750 ms and flush before switching or closing. Use the workspace button in the sidebar to create a named workspace, switch recent workspaces, or open an existing folder. Each folder contains a versioned `workspace.json`, a previous-save backup, and a `notes/` folder. The recent-workspace catalog is stored in the application's local data directory. `AGENTCANVAS_DATA_DIR` overrides that directory for isolated development runs.

On relaunch, the last workspace restores its canvas and starts fresh shells in their saved startup directories. Commands, terminal output and undo history are session-only. Missing directories remain visible as failed terminal nodes; select one and use Restart to correct its directory. Save failures pause autosave and remain visible; a failed save prevents a normal switch or close. Truncated layouts can recover from their backup, while unsupported schemas and external edits are preserved and reported.

Use **Note** to create a Markdown sticky backed by `notes/<UUID>.md`. Edit Markdown or read the offline preview; content autosaves after 600 ms independently of layout. Notes support up to 512 KiB of UTF-8 text. The bounded preview supports headings, lists, quotes, code and emphasis; HTML stays text, links are displayed without navigation and remote images are never fetched. Use **Reload disk** for external edits. Conflicting saves preserve both the disk version and the local draft; resolve them before switching or closing. Removing a note node retains its file and can be undone.

The floating whiteboard palette draws rectangles, ellipses, text, arrows and freehand strokes. Drag on the canvas to draw; Escape cancels. Select **Connector**, then click two nodes to attach a visual arrow that follows them. This is a whiteboard annotation; agent messaging comes in M5. Select a text shape to edit its text in the inspector. Shapes support selection, drag, resize, color, layering, undo/redo and workspace restoration.

See [architecture](docs/ARCHITECTURE.md) and [verification](docs/VERIFICATION.md). The current milestone is M4; agent links, shared memory, browser nodes and installers remain planned.
