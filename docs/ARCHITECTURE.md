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

M2 status is deliberately conservative: starting, running, exited, error. Terminal byte streams cannot reliably distinguish an idle shell from an agent awaiting input; future shell/agent integration can supply idle/waiting without guessing.

## Native command protocol (M2)

`shells`, `terminal_spawn {id,shell,cwd,cols,rows}`, `terminal_write {id,data}`, `terminal_resize {id,cols,rows}`, `terminal_poll {id,maxBytes}`, `terminal_close {id}`. Poll replies contain raw bytes (xterm streaming UTF-8 decoder preserves split multibyte characters), dropped-byte count and exit status. IDs, dimensions, input size and session count are validated. Shell executable and arguments are fixed presets; cwd must exist. No general-purpose shell execution command is exposed.

Windows jobs use kill-on-close process-tree ownership. The backend creates a named job, spawns a small console-subsystem `pty-host.exe` through ConPTY, and that trusted host joins the job **before** spawning the user's shell. The host fails closed if ownership cannot be established. This avoids the user-shell spawn/assignment race and preserves console stdio while the main application uses the Windows GUI subsystem. The backend owns the only persistent job handle, so backend death also kills Windows descendants. App exit drains the session registry and kills jobs before PTY handles drop. A reader thread always drains ConPTY, independently of rendering; on child exit the backend closes HPCON to permit final EOF. Resizing goes through portable-pty. Shell presets cover Windows PowerShell, cmd, WSL and Git Bash when installed in supported locations. New terminals start in the selected directory or user home. WSL guest process cleanup needs separate verification because Linux processes are outside Windows Job Objects.

## Persistence (M3, planned)

Each named folder contains `workspace.json`, `notes/<uuid>.md`, and optional local recovery files. Autosave debounces layout edits, writes a temporary sibling, flushes, then atomically replaces JSON; version migrations and corrupt-file recovery are explicit. Resolve note paths below the workspace root. Restore layout and respawn saved shells/cwd; never replay terminal commands. M0–M2 keep layout only in memory and state this in the UI.

## Agent IPC and memory (M5, planned)

Local per-app named pipe `\\.\pipe\agentcanvas-<random-session-id>` with current-user-only ACL. Helper CLI in each terminal's PATH receives node ID, pipe path, per-node secret and linked note paths via environment. Environment is a startup snapshot; CLI resolves current authorized peers/notes through the server. Length-prefixed UTF-8 JSON v1 requests `{version,requestId,token,nodeId,op,targetId,payload}`; replies `{requestId,ok,result,error}`. Maximum frame 64 KiB, message 8 KiB; bounded per-link token bucket, pending approvals and logs. Authorize source token and live edge for every operation. Operations: `peers`, `send`, `readRecent`, `notes`; explicit error codes, no arbitrary file reads. All cross-terminal text is untrusted. Log before delivery, default require approval; auto-send is per-link opt-in. Read output has bounded limits. Never interpret received text as privileged app instructions.

## Later milestones

M4 file-backed Markdown and SVG/freehand shapes. M6 browser child WebView2 surfaces clipped/repositioned with canvas, isolated from native IPC and restricted to explicit user navigation; native child windows need separate zoom/focus testing. M7 pluggable `ActivitySummarizer` with deterministic heuristic first, theme/accessibility/performance polish, NSIS/MSI and portable packaging. No cloud APIs.
