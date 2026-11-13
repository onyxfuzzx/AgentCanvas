# Canvas desktop workspace

See [the orchestration milestone roadmap](docs/MILESTONES.md) for the implemented M0–M8 baseline and proposed M9–M12 work.

Windows 10 22H2 / Windows 11. No account or telemetry. Product display name is configured in `product.json`.

Prerequisites: Node 22 LTS, Rust stable MSVC, Visual Studio C++ build tools with Windows SDK, WebView2 Evergreen Runtime, and `cargo install tauri-cli --version '^2' --locked`.

```
npm ci
npm run desktop
```

`npm run dev` runs the canvas in a browser for UI development; native terminals require the desktop host. `npm run check` runs frontend checks. `npm run native:check` runs Rust formatting, Clippy and the core Windows ConPTY tests against `Cargo.lock`.

Formatting commands expect a Git checkout and check tracked plus non-ignored new source files, without traversing generated caches or build outputs.

For a desktop build you can open directly:

```powershell
npm run desktop:build -- --debug
.\artifacts\windows-debug\agent-canvas-desktop.exe
```

Debug builds may show a console alongside the canvas window. `npm run desktop:build` creates the optimized build in `artifacts/windows-portable/`, plus a ZIP, manifest and SHA-256 checksums. Keep `agent-canvas-desktop.exe`, `pty-host.exe` and `agentcanvas-peer.exe` together. The scripts build all three binaries in the same profile and derive the display name from `product.json`. Source build outputs remain under `src-tauri/target/`. The build script also supports the official Tauri CLI installed under `.tools/tauri/` on this development host.

Run `npm run desktop:release` to build the portable release and NSIS/MSI installers in `artifacts/windows-installers/`. NSIS installs for the current user; MSI uses Windows Installer. Both include the two helper executables. Packages require the WebView2 Evergreen Runtime to be installed already and do not download it during installation. Builds are unsigned unless signing is configured separately. Set `AGENTCANVAS_BUILD_TAG=m7` to stage a separate set of milestone artifacts.

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

## Agent presets and roles (M8)

Select **Agent presets** in the sidebar to create reusable roles and Codex/Claude Code launch presets. Builder, Reviewer and Tester roles are provided initially. The app detects installed native CLIs; an optional absolute `codex.exe` or `claude.exe` path supports custom locations. Install and sign in to each CLI separately. Detection confirms an executable exists; it does not check authentication or version compatibility.

Select **+ Agent**, choose a preset, and set the agent name and working directory. You can adjust its role instructions and executable for this node before starting. Launches use a real ConPTY and preserve the installed CLI's authentication and approval configuration. No task is submitted automatically. Role instructions are supplied as session arguments, without editing the project's instructions files.

Agent nodes save a copy of their launch settings. Editing or deleting a library preset does not change existing nodes. Reopened agents stay paused; select **Start agent** in the node to launch, or **Edit launch settings** in the inspector to change settings first. Failed or exited agents can be restarted through the inspector. Layout undo does not roll launch settings back after a restart. CLI output, input, credentials and process handles are not included in workspace saves.

The reusable library is `agents.json` in the local app data directory, with a last-good backup and conflict detection. A corrupt primary can recover from its backup; saving archives the corrupt original. **Reload from disk** discards the editor draft, so copy any changes you want to retain before reloading. Instructions are limited to 4096 UTF-8 bytes, and the library supports 32 roles and 32 presets. M8 does not add task scheduling, automatic delegation or worktree isolation. See [the M8 desktop checks](docs/M8-MANUAL-CHECK.md).

## Durable tasks (M9)

Open **Tasks** to create a brief, acceptance criteria, dependencies and a terminal/agent assignment. Save the draft, mark it ready, start the assigned terminal explicitly, then dispatch to its cooperative inbox. Dispatch does not type into the CLI. Prompt your installed agent to query its inbox using `agentcanvas-peer task <request-UUID> --stdin`; new agent launches include protocol guidance. Agent reports move a task to Review; **Accept result** marks it done.

Tasks save independently in `tasks.json` with atomic replacement, validation, deduplicated mutation receipts and a last-good backup. Attempts have 120-second leases and require cooperative heartbeats. Missing/expired process generations become blocked for explicit reconciliation; nothing is replayed automatically. Stop the old terminal before resolving uncertain work. Resolve as Draft to repair an assignment. Cancellation requests need acknowledgement or a terminal stop; file edits are not undone.

See [the task protocol and limits](docs/M9-PROTOCOL.md) and [desktop acceptance checklist](docs/M9-MANUAL-CHECK.md). Provider authentication and compliance require separate verification. Git isolation and automatic team coordination remain future milestones.

## Browser nodes

Select **Browser** in the toolbar, enter a full HTTP or HTTPS address, and select **Open**. Up to eight pages can run at once. Use Back, Forward, Reload and Stop in the node toolbar. Drag the header, resize the corner, or zoom/pan from the canvas controls; wheel input inside a page scrolls that page. Click the canvas before using its keyboard shortcuts.

Browser nodes save their layout and the last address submitted with Open. Relaunching or switching workspaces restores them paused until you explicitly open a page. In-page history, cookies and page content are not saved to workspace JSON. Hidden pages remain live until stopped. Popups, downloads, browser permissions, file URLs and app-native commands are blocked. Browser nodes require the Windows desktop host; web preview shows placeholders.

## Activity and keyboard access

Select a terminal to see its local activity summary and recent output evidence. Automatic labels use heuristics: **quiet** means no recent traffic, and **possible input prompt** is inferred from text. They do not prove that an agent is idle, finished or awaiting approval. You can choose a manual activity label or return to Automatic. Summaries and labels stay in memory and never execute commands or send data to a service.

Choose System, Light or Dark in the sidebar. Tab to a node header or focus the canvas, then use arrows to move selected nodes, Alt+arrows to resize, and Shift for grid-sized steps. Use Ctrl+Z to undo layout changes. Dialogs contain keyboard focus until closed; Escape dismisses them when no operation is pending. Terminal and form input retain their own keyboard handling.

See [architecture](docs/ARCHITECTURE.md), [verification](docs/VERIFICATION.md), and the [M7 acceptance checklist](docs/M7-MANUAL-CHECK.md). M6's basic page loading and alignment were confirmed by the user; deeper browser checks remain documented in [the M6 checklist](docs/M6-MANUAL-CHECK.md).
