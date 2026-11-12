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

Debug builds may show a console alongside the canvas window. `npm run desktop:build` creates the optimized build in `artifacts/windows-portable/`. Keep `agent-canvas-desktop.exe`, `pty-host.exe` and `agentcanvas-peer.exe` together. The scripts build all three binaries in the same profile and derive the display name from `product.json`. Source build outputs remain under `src-tauri/target/`. Installer packaging comes in M7.

The optional Git Bash roundtrip test needs an unrestricted Windows host with Git Bash installed. Run it explicitly with `cargo test --manifest-path src-tauri/Cargo.toml --locked --test conpty -- --ignored`; Windows CI also runs it separately. The restricted agent host cannot create MSYS2 signal pipes, although the user-launched application's Git Bash prompt has been visually verified.

On this restricted development host, use `$env:CANVAS_NO_SUBPROCESS='1'` in PowerShell before `npm run check` to enable the documented in-process compiler fallback. This is a verification aid; it does not provide a native runtime. See [third-party dependency provenance](THIRD_PARTY.md) for the offline xterm dependency constraints.

Workspaces autosave after 750 ms and flush before switching or closing. Use the workspace button in the sidebar to create a named workspace, switch recent workspaces, or open an existing folder. Each folder contains a versioned `workspace.json`, a previous-save backup, and a `notes/` folder. The recent-workspace catalog is stored in the application's local data directory. `AGENTCANVAS_DATA_DIR` overrides that directory for isolated development runs.

On relaunch, the last workspace restores its canvas and starts fresh shells in their saved startup directories. Commands, terminal output and undo history are session-only. Missing directories remain visible as failed terminal nodes; select one and use Restart to correct its directory. Save failures pause autosave and remain visible; a failed save prevents a normal switch or close. Truncated layouts can recover from their backup, while unsupported schemas and external edits are preserved and reported.

Use **Note** to create a Markdown sticky backed by `notes/<UUID>.md`. Edit Markdown or read the offline preview; content autosaves after 600 ms independently of layout. Notes support up to 512 KiB of UTF-8 text. The bounded preview supports headings, lists, quotes, code and emphasis; HTML stays text, links are displayed without navigation and remote images are never fetched. Use **Reload disk** for external edits. Conflicting saves preserve both the disk version and the local draft; resolve them before switching or closing. Removing a note node retains its file and can be undone.

The floating whiteboard palette draws rectangles, ellipses, text, arrows and freehand strokes. Drag on the canvas to draw; Escape cancels. Select **Connector**, then click two nodes to attach a visual arrow that follows them. This is a whiteboard annotation. Select a text shape to edit its text in the inspector. Shapes support selection, drag, resize, color, layering, undo/redo and workspace restoration.

For agent collaboration, drag a terminal's **↔ header handle** onto another terminal. Drag a note handle onto a terminal to share its file; the same note can connect to multiple agents. Open **Links** to inspect connections, choose **Require approval** (default) or **Auto-send**, and review every attempted linked send/read in its session log. An agent link permits reciprocal recent-output reads immediately. Approving a message types untrusted text into the peer shell; newlines and appended Enter can execute commands. Auto-send dispatches messages without approval, with the same logs and rate limits.

Inside any canvas terminal, the helper is available on PATH:

```text
agentcanvas-peer peers
agentcanvas-peer notes
agentcanvas-peer read <peer-id>
agentcanvas-peer send <peer-id> "hello"
agentcanvas-peer send <peer-id> --enter "text"
agentcanvas-peer send <peer-id> --stdin
agentcanvas-peer status <message-id>
```

Responses are JSON; inspect `ok`, `result` and `error`. Sends report `pending` or `queued`; use `status` to observe `delivering`, `delivered`, `rejected`, `cancelled` or `failed`. Recent output is a bounded, non-consuming, control-sequence-stripped transcript. Logs show escaped payloads, explicit Enter, direction and status. Limits: 64 KiB frames, 8 KiB messages/recent reads, five-request burst then two requests/second per agent link, 20 pending approvals and 20 queued/in-progress deliveries globally, 200 log records and 512 KiB logged text. Slow destinations have independent FIFO writer queues. Disconnect/restart cancels pending and queued work; a write already delivering can finish in its pinned original process.

Each shell receives `AGENTCANVAS_NODE_ID`, `AGENTCANVAS_PIPE`, `AGENTCANVAS_TOKEN`, `AGENTCANVAS_PEERS` (JSON IDs) and `AGENTCANVAS_NOTE_PATHS` (JSON paths). Peer/path lists are startup snapshots; query `peers` and `notes` for current links, or restart for new environment values. A terminal's note-path snapshot is limited to 16 KiB. Shared note files survive relaunch; link policy is saved, while tokens/output/message logs stay in memory. Link permission changes are outside layout undo; undoing a removed node does not silently reconnect it.

PowerShell/cmd use `agentcanvas-peer` or `agentcanvas-peer.exe`. WSL uses `agentcanvas-peer.exe` through Windows interop, with WSLENV forwarding. Returned note paths are Windows paths; convert with `wslpath` in Linux. Custom shell profiles, disabled Windows PATH import and custom WSL automounts need separate verification.

The transport is a local Windows named pipe restricted to the current user, with per-node tokens, bounded workers and timeouts; it uses no cloud service or TCP listener. This does not sandbox agents that already have the user's filesystem/process access.

See [architecture](docs/ARCHITECTURE.md) and [verification](docs/VERIFICATION.md). The current milestone is M5; browser nodes, activity summaries, polish and installers remain planned for M6–M7.
