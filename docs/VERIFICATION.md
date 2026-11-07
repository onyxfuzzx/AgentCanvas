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
- `git add` and `git commit` attempted at the M0 boundary; both blocked because `.git` is read-only under the workspace permission profile (`index.lock: Permission denied`). No commits created.

## M1 — canvas (implementation; interactive acceptance blocked)

- Custom world-coordinate canvas with pointer-captured pan/move/resize, cursor-anchored zoom, trackpad pan, grid snapping, marquee and additive selection, z-order, bounded undo/redo, clickable SVG minimap and fit-to-content.
- Original CSS mark and system-font interface; system light/dark theme, custom native titlebar, explorer and node inspector. Generic cards are layout nodes, not file-backed notes.
- Six initial tests cover configuration, negative-coordinate fitting, zoom anchoring/clamps, visibility margin, gesture history, history branching and terminal deletion irreversibility.
- Manual drag, resize, wheel, multi-monitor and native titlebar checks remain unverified because UI automation stopped. No manual acceptance claimed.
