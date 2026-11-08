# Repository conventions

- Windows-first desktop app: Tauri 2, Rust, React, TypeScript, Vite, Zustand and xterm.js. Product name lives in `product.json`; configuration and UI consume it.
- `src/`: UI and pure canvas model. `src-tauri/`: native PTY ownership and IPC. `docs/`: design decisions and milestone verification.
- Use world coordinates in state, screen coordinates only at the viewport boundary. Terminal processes outlive viewport renderers, but never the application.
- No telemetry, accounts, remote fonts, runtime CDN dependencies, or unsolicited network access. Treat terminal bytes and future peer messages as untrusted data.
- Keep undoable layout separate from transient terminal state. Validate all Rust command inputs. Never interpolate shell command strings.
- Commands: `npm ci`, `npm run dev` (web UI), `npm run desktop` (native app), `npm run check` (format/lint/types/tests/build), `npm run native:check` (Rust format/clippy/tests), `npm run desktop:build` (portable executable; installers in M7).
- Add meaningful tests for coordinate math, history, PTY lifecycle and bounded buffers. Run the app and record actual verification in `docs/VERIFICATION.md`; do not claim unexecuted checks passed.
- Commit at each milestone. M0–M2 are implemented; the current authorized milestone is M3 (workspace persistence and restore). Stop after M3; M4–M7 remain planned.
- Workspace saves must be atomic, versioned and validated. Preserve corrupt originals and last-good backups. Flush autosave before workspace switches and normal close. Never persist terminal output, process handles or command history.
