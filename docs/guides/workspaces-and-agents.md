# Workspace and agent guide

[Documentation index](../README.md) · [Getting started](../DEVELOPMENT.md)

The details below cover the behavior and limits behind the feature overview.

<details>
<summary><strong>Workspaces, autosave and restart recovery</strong></summary>

Workspaces autosave after 750 ms and flush before switching or closing. Use the workspace button in the sidebar to create a named workspace, switch recent workspaces, or open an existing folder. Each folder contains a versioned `workspace.json`, a previous-save backup, and a `notes/` folder. The recent-workspace catalog is stored in the application's local data directory. `AGENTCANVAS_DATA_DIR` overrides that directory for isolated development runs.

On relaunch, the last workspace restores its canvas and starts fresh shells in their saved startup directories. Commands, terminal output and undo history are session-only. Missing directories remain visible as failed terminal nodes; select one and use Restart to correct its directory. Save failures pause autosave and remain visible; a failed save prevents a normal switch or close. Truncated layouts can recover from their backup, while unsupported schemas and external edits are preserved and reported.

</details>

<details>
<summary><strong>Agent presets, roles and launch settings</strong></summary>

Select **Agent presets** in the sidebar to create reusable roles and Codex/Claude Code launch presets. Builder, Reviewer and Tester roles are provided initially. The app detects installed native CLIs; an optional absolute `codex.exe` or `claude.exe` path supports custom locations. Install and sign in to each CLI separately. Detection confirms an executable exists; it does not check authentication or version compatibility.

Select **+ Agent**, choose a preset, and set the agent name and working directory. You can adjust its role instructions and executable for this node before starting. Launches use a real ConPTY and preserve the installed CLI's authentication and approval configuration. No task is submitted automatically. Role instructions are supplied as session arguments, without editing the project's instructions files.

Agent nodes save a copy of their launch settings. Editing or deleting a library preset does not change existing nodes. Reopened agents stay paused; select **Start agent** in the node to launch, or **Edit launch settings** in the inspector to change settings first. Failed or exited agents can be restarted through the inspector. Layout undo does not roll launch settings back after a restart. CLI output, input, credentials and process handles are not included in workspace saves.

The reusable library is `agents.json` in the local app data directory, with a last-good backup and conflict detection. A corrupt primary can recover from its backup; saving archives the corrupt original. **Reload from disk** discards the editor draft, so copy any changes you want to retain before reloading. Instructions are limited to 4096 UTF-8 bytes, and the library supports 32 roles and 32 presets. Task scheduling, Git isolation and bounded team coordination are supplied by M9–M11.

</details>

<details>
<summary><strong>Durable tasks and cooperative dispatch</strong></summary>

Open **Tasks** to create a brief, acceptance criteria, dependencies and a terminal/agent assignment. Save the draft, mark it ready, start the assigned terminal explicitly, then dispatch to its cooperative inbox. Dispatch does not type into the CLI. Prompt your installed agent to query its inbox using `agentcanvas-peer task <request-UUID> --stdin`; new agent launches include protocol guidance. Agent reports move a task to Review; **Accept result** marks it done.

Tasks save independently in `tasks.json` with atomic replacement, validation, deduplicated mutation receipts and a last-good backup. Attempts have 120-second leases and require cooperative heartbeats. Missing/expired process generations become blocked for explicit reconciliation; nothing is replayed automatically. Stop the old terminal before resolving uncertain work. Resolve as Draft to repair an assignment. Cancellation requests need acknowledgement or a terminal stop; file edits are not undone.

See [the task protocol and limits](../M9-PROTOCOL.md), [managed Git areas](git-areas.md) and [the team protocol](../M11-TEAM-PROTOCOL.md). M10 Git isolation and M11 bounded team coordination are implemented; authenticated provider workflows and deeper release qualification remain open. Reusable templates, project context tools and agent browser automation are proposed M12 work.

</details>

<details>
<summary><strong>Markdown notes and the whiteboard</strong></summary>

Use **Note** to create a Markdown sticky backed by `notes/<UUID>.md`. Edit Markdown or read the offline preview; content autosaves after 600 ms independently of layout. Notes support up to 512 KiB of UTF-8 text. The bounded preview supports headings, lists, quotes, code and emphasis; HTML stays text, links are displayed without navigation and remote images are never fetched. Use **Reload disk** for external edits. Conflicting saves preserve both the disk version and the local draft; resolve them before switching or closing. Removing a note node retains its file and can be undone.

The floating whiteboard palette draws rectangles, ellipses, text, arrows and freehand strokes. Drag on the canvas to draw; Escape cancels. Select **Connector**, then click two nodes to attach a visual arrow that follows them. This is a whiteboard annotation. Select a text shape to edit its text in the inspector. Shapes support selection, drag, resize, color, layering, undo/redo and workspace restoration.

</details>

<details>
<summary><strong>Peer links, approvals and helper commands</strong></summary>

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

</details>

<details>
<summary><strong>Desktop browser nodes</strong></summary>

Select **Browser** in the toolbar, enter a full HTTP or HTTPS address, and select **Open**. Up to eight pages can run at once. Use Back, Forward, Reload and Stop in the node toolbar. Drag the header, resize the corner, or zoom/pan from the canvas controls; wheel input inside a page scrolls that page. Click the canvas before using its keyboard shortcuts.

Browser nodes save their layout and the last address submitted with Open. Relaunching or switching workspaces restores them paused until you explicitly open a page. In-page history, cookies and page content are not saved to workspace JSON. Hidden pages remain live until stopped. Popups, downloads, browser permissions, file URLs and app-native commands are blocked. Browser nodes require the Windows desktop host; web preview shows placeholders.

</details>

<details>
<summary><strong>Activity labels, themes and keyboard controls</strong></summary>

Select a terminal to see its local activity summary and recent output evidence. Automatic labels use heuristics: **quiet** means no recent traffic, and **possible input prompt** is inferred from text. They do not prove that an agent is idle, finished or awaiting approval. You can choose a manual activity label or return to Automatic. Summaries and labels stay in memory and never execute commands or send data to a service.

Choose System, Light or Dark in the sidebar. Tab to a node header or focus the canvas, then use arrows to move selected nodes, Alt+arrows to resize, and Shift for grid-sized steps. Use Ctrl+Z to undo layout changes. Dialogs contain keyboard focus until closed; Escape dismisses them when no operation is pending. Terminal and form input retain their own keyboard handling.

</details>
