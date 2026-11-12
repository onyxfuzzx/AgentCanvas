# Architecture

## Decisions and module boundaries

Use the recommended stack unchanged: Tauri 2/WebView2, React/TypeScript/Vite, Zustand, portable-pty (ConPTY on Windows), xterm.js with optional WebGL and DOM fallback, custom CSS-transformed graph and SVG overlays. All dependencies ship locally. `product.json` is the single product-name source; Vite and Tauri build configuration derive their display name from it.

`src/canvas/` owns geometry, layout history and pointer interaction. `src/terminal/` owns xterm views and a process-independent session registry. `src-tauri/src/pty.rs` owns native process handles, bounded output queues, reader workers, resizing and shutdown. Rust commands are the only privileged surface. Canvas zoom transforms pointer coordinates; xterm fits against unscaled CSS dimensions, so zoom never changes shell columns. Device pixel ratio is handled by xterm/WebView2.

Render xterm only within an expanded viewport. Keep PTYs draining into 1 MiB native queues; a frontend session pump batches visible output at ~30 Hz and hidden output at ~2 Hz, waiting for each xterm parse callback before polling again. Hidden sessions retain their xterm emulator and 2,000-line scrollback with the DOM detached; there are no hidden WebGL contexts. At most six visible nodes acquire WebGL; the rest use xterm's fallback renderer. Cap terminal count at 20 initially. Layout UI subscribes separately from terminal output. Output pressure drops oldest queued bytes with a visible truncation indicator and parser reset rather than exhausting memory.

Terminal surfaces counteract the canvas CSS scale and scale actual font size instead. Mouse coordinates stay in xterm's native CSS space and WebView2 handles physical DPI. Logical rows/columns change on node resize, never on canvas zoom; measured font fitting avoids clipping from integer glyph metrics at small zoom. Real zoom, selection, font and multi-monitor behavior still requires interactive acceptance.

## Model

`Workspace { version: 1, id, name, viewport: {x,y,zoom}, nodes, edges, settings }`.
`Node { id, kind, x,y,width,height,z,title,color }`; discriminated payloads: terminal `{shell,cwd}`, note `{relativePath}`, browser `{url}`, shape `{shape,text,points}`. Runtime status, process IDs, selection and output do not belong in saved JSON.
`Edge { id, source, target, kind: agent|memory, policy: approval|auto }`. IDs are UUIDs. Undo/redo stores bounded immutable layout snapshots; pointer gestures produce one history entry. Process creation/termination is a side effect, not replayed by layout undo. Closed terminals are not resurrected by undo.

M2 reports actual process lifecycle (starting, running, exited, error) and supports explicitly manual idle/running/waiting activity labels in the node inspector. Terminal byte streams cannot reliably distinguish an idle shell from an agent awaiting input; future shell/agent integration can supply automatic activity signals without guessing.

## Native command protocol (M2)

`shells`, `terminal_spawn {id,shell,cwd,cols,rows}`, `terminal_write {id,data}`, `terminal_resize {id,cols,rows}`, `terminal_poll {id,maxBytes}`, `terminal_close {id}`. Poll replies contain raw bytes (xterm streaming UTF-8 decoder preserves split multibyte characters), dropped-byte count and exit status. IDs, dimensions, input size and session count are validated. Shell executable and arguments are fixed presets; cwd must exist. No general-purpose shell execution command is exposed.

Windows jobs use kill-on-close process-tree ownership. The backend creates a named job, spawns a small console-subsystem `pty-host.exe` through ConPTY, and that trusted host joins the job **before** spawning the user's shell. The host fails closed if ownership cannot be established. This avoids the user-shell spawn/assignment race and preserves console stdio while the main application uses the Windows GUI subsystem. The backend owns the only persistent job handle, so backend death also kills Windows descendants. App exit drains the session registry and kills jobs before PTY handles drop. A reader thread always drains ConPTY, independently of rendering; on child exit the backend closes HPCON to permit final EOF. Resizing goes through portable-pty. Shell presets cover Windows PowerShell, cmd, WSL and Git Bash when installed in supported locations. New terminals start in the selected directory or user home. WSL guest process cleanup needs separate verification because Linux processes are outside Windows Job Objects.

Executable paths use native Windows separators: cmd can misparse forward slashes in its own invocation path even when the filesystem accepts that path. ConPTY emits an initial cursor-position query; xterm answers it before its view is mounted, and native byte-level tests emulate the same reply. Git Bash receives `CHERE_INVOKING=1` to preserve the selected directory.

The base Tauri config always contains a main window, so direct Cargo builds cannot silently become windowless. Desktop build scripts reuse that geometry, set the configured display name, and stage both executables into `artifacts/windows-debug/` or `artifacts/windows-portable/`. Original icon resources are committed; `scripts/generate_icon.py` optionally regenerates them with Pillow. For restricted development hosts, the app respects the per-process [`WEBVIEW2_USER_DATA_FOLDER`](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/webview2-idl) override before Tauri creates its default data folder. No global environment or system settings are changed by the app.

## Persistence (M3)

Each named workspace folder contains `workspace.json`, `workspace.json.bak`, a `notes/` directory reserved for M4, and a lock file. Schema v1 stores identity, name, revision, nodes, viewport, empty future edges and snap settings. Unknown versions/kinds/fields are rejected rather than discarded. Geometry, IDs, colors, shell presets, directory syntax and file sizes are bounded. Missing saved directories remain valid layout data; shell restart errors are shown on their nodes. The saved directory is the configured startup directory, not an inferred interactive `cd`.

Rust owns a local recent-workspace catalog and last-active ID under app-local data (`AGENTCANVAS_DATA_DIR` may override it per process for testing). New workspaces default to its `workspaces/<id>/` subfolder or an explicit absolute folder. Opening another folder registers its existing layout. No deletion or silent reset is performed on load failures. Native commands: `workspace_list`, `workspace_create`, `workspace_open`, `workspace_open_folder`, `workspace_save`, `workspace_release`, `workspace_activate`. Disk I/O runs off the UI thread.

Open workspace lock handles prevent another app instance writing the same folder. Saves compare the on-disk bytes against the loaded baseline to catch external edits, retain a last-good backup, flush a temporary sibling, and atomically replace JSON (Windows replace/write-through flags). Recovery from a valid backup is visible and does not silently overwrite the corrupt primary on load. Catalog updates also use atomic writes and a short-lived exclusive lock.

The frontend coalesces persistent edits with a 750 ms debounce, serializes saves, and flushes before switches/close. Selection, history, runtime status and output are excluded. Switching validates/locks the destination before closing old PTYs, resets selection/history, then respawns saved presets/directories with limited concurrency. A per-node restart form handles failed restores. No terminal commands or scrollback are replayed. M4–M7 are not part of this milestone.

## Notes and whiteboard (M4)

Schema v1 is extended with optional, validated `relativePath` for note nodes and `shape` payloads for whiteboard nodes. Existing M3 layouts load unchanged; older binaries reject new kinds instead of discarding them. Notes use `notes/<UUID>.md`, UTF-8, at most 512 KiB. Native note commands only access an open workspace and reject traversal/reparse paths. Content saves compare the expected disk text, keep a last-good `.md.bak`, then atomically replace the primary. External edits require explicit reload; no raw HTML or remote resources are rendered. A small offline Markdown preview supports headings, lists, quotes, fenced code and inline emphasis/code. Editing uses a plain-text textarea with native text undo; layout undo is separate. Removing a note from the canvas retains its file, so layout undo can restore it.

Note drafts and their serialized autosave queues live outside React viewport mounts. Notes flush before layout saves, switches and normal close; failures block those operations. A new note file is created before its layout node, so interrupted creation may leave an unreferenced file but cannot create a node pointing to an unwritten draft. Notes are not permanently deleted in M4.

Whiteboard rectangles, ellipses, text, arrows, attached connectors and freehand strokes are SVG-backed shape nodes. Drawing uses world coordinates, bounded normalized points and one undo entry per stroke. Connectors attach to two non-connector nodes, follow their bounds and are removed with their endpoints. Shape content and geometry are included in layout history and persistence. Selection, drag, resize, accent color and z-order reuse the canvas model. No M5 agent messaging is enabled by a whiteboard connector.

## Agent IPC and memory (M5, planned)

Local per-app named pipe `\\.\pipe\agentcanvas-<random-session-id>` with current-user-only ACL. Helper CLI in each terminal's PATH receives node ID, pipe path, per-node secret and linked note paths via environment. Environment is a startup snapshot; CLI resolves current authorized peers/notes through the server. Length-prefixed UTF-8 JSON v1 requests `{version,requestId,token,nodeId,op,targetId,payload}`; replies `{requestId,ok,result,error}`. Maximum frame 64 KiB, message 8 KiB; bounded per-link token bucket, pending approvals and logs. Authorize source token and live edge for every operation. Operations: `peers`, `send`, `readRecent`, `notes`; explicit error codes, no arbitrary file reads. All cross-terminal text is untrusted. Log before delivery, default require approval; auto-send is per-link opt-in. Read output has bounded limits. Never interpret received text as privileged app instructions.

## Later milestones

M5 agent links and shared memory. M6 browser child WebView2 surfaces clipped/repositioned with canvas, isolated from native IPC and restricted to explicit user navigation; native child windows need separate zoom/focus testing. M7 pluggable `ActivitySummarizer` with deterministic heuristic first, theme/accessibility/performance polish, NSIS/MSI and portable packaging. No cloud APIs.
