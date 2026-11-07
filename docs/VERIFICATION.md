# Milestone verification

Record executed checks and remaining limitations here. A code milestone is not fully accepted until native build, tests and an interactive desktop run all pass.

Initial environment: empty directory, Git initialized by this session. Node 20.20.2 and npm 10.8.2 available, MSVC 2019 build tools present. Rust/cargo absent. Network is restricted (proxy rejects connections); no attempt to bypass it. Cached npm dependencies may support frontend verification. Native build/run is blocked until Rust and crates are provisioned.

## M0 — scaffold (implementation; native acceptance blocked)

- React/TypeScript/Vite, Rust/Tauri shell, system-theme baseline, CSP and main-window capabilities, npm checks, Windows CI, portable build entrypoint.
- Frontend dependencies installed from the existing local npm cache. Lockfile registry URLs normalized back to the public npm registry for other developers.
- This Windows host rejects child-process stdio pipes (`spawn EPERM`), including esbuild and Vite's `net use` realpath probe. `CANVAS_NO_SUBPROCESS=1` enables an in-process TypeScript transform, preserves symlinks and skips minification for local verification. Default builds retain esbuild. Use native config loading for both modes.
- `npm run native:check`: attempted; blocked with `spawnSync cargo ENOENT`. No native build, Rust tests or native launch verified.
- Browser UI automation attempted; stopped by automation runtime because it could not determine the browser URL confidently. No interactive UI behavior claimed verified.
- M0 frontend formatting/lint, test runner and production build passed with `CANVAS_NO_SUBPROCESS=1`. Native acceptance remains blocked.
- `git add` and `git commit` attempted at the M0 boundary; both blocked because `.git` is read-only under the workspace permission profile (`index.lock: Permission denied`). Later staging was also rejected. Repository inspection subsequently found commit `d05d16d` created outside these tool calls; it has been preserved. This agent could not create the requested separate milestone commits; subsequent fixes remain working-tree changes.

## M1 — canvas (implementation; interactive acceptance blocked)

- Custom world-coordinate canvas with pointer-captured pan/move/resize, cursor-anchored zoom, trackpad pan, grid snapping, marquee and additive selection, z-order, bounded undo/redo, clickable SVG minimap and fit-to-content.
- Original CSS mark and system-font interface; system light/dark theme, custom native titlebar, explorer and node inspector. Generic cards are layout nodes, not file-backed notes.
- Six initial tests cover configuration, negative-coordinate fitting, zoom anchoring/clamps, visibility margin, gesture history, history branching and terminal deletion irreversibility.
- Manual drag, resize, wheel, multi-monitor and native titlebar checks remain unverified because UI automation stopped. No manual acceptance claimed.

## M2 — terminals (implementation; native acceptance blocked)

- Rust portable-pty commands, fixed PowerShell/cmd/WSL/Git Bash presets, validated working directory, dimensions and IDs; 20-session limit. Dedicated console host joins a kill-on-close job before launching the shell. Independent reader workers, 1 MiB bounded queues, streamed raw UTF-8 bytes, resize and EOF handling, shutdown and cancellation paths.
- xterm sessions survive viewport detachment. At most six WebGL contexts, fallback renderer for the rest, 2,000-line scrollback, visible/hidden polling, serialized input with a 1 MiB pending limit and 8 KiB chunks, coalesced native resize, Ctrl-based copy/paste and OSC 52 suppression. Canvas zoom does not resize the PTY grid.
- Final frontend `npm run check` **passed with `CANVAS_NO_SUBPROCESS=1`**: formatting, ESLint, TypeScript, 16 tests across four files and Vite production build. Includes actual xterm parsing of split UTF-8, cursor movement, truecolor and completed-line resize reflow; session tests cover output throttling, startup/close ordering, concurrent close, parse cancellation, binary input, resize coalescing and surfaced failures.
- Dependency lock graph loaded successfully: 159 package records, zero invalid dependency edges. Local xterm runtimes came from installed MIT distributions; online clean installation and upstream type checking are unverified. See `THIRD_PARTY.md`.
- Compiled frontend preview started on `http://127.0.0.1:4173`; HTTP entry-page check returned 200 with the compiled entry asset. This verifies serving, not visual behavior. Native terminal creation is explicitly disabled in the browser preview.
- `npm run native:check` and `npm run desktop:build` both attempted and blocked with `spawnSync cargo ENOENT`. Rust formatting/clippy/unit tests, the two Windows integration tests, native compilation and native launch **have not run**. No installer or native executable has been produced.
- Windows integration tests are ready to exercise real cmd roundtrip/resize/idempotent close and PowerShell descendant process termination. They are not evidence of passing behavior until run with Rust on Windows.
- Remaining acceptance: native shell input/output (all four presets), interactive copy/paste/ANSI TUIs, selection and font fit at 25–200% zoom, high-DPI and multi-monitor transitions, 20-terminal performance, and app-exit/process-tree cleanup. WSL Linux guest cleanup needs explicit verification because Windows jobs own only Windows processes.
- Process lifecycle is reported as starting/running/exited/error; the inspector supports manually setting idle/running/waiting activity labels, explicitly marked manual in the terminal footer. Automatic detection is deferred until a reliable shell/agent signal exists; terminal silence alone is not sufficient. Manual label interaction remains part of pending UI acceptance.

## Scope boundary

No M3–M7 work has been started. Layout is session-only; notes, whiteboard, links/named-pipe helper, shared memory, browser nodes, summaries and installers remain planned. The `pty-host.exe` console launcher is internal lifecycle infrastructure, not the M5 messaging CLI.
