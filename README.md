# Canvas desktop workspace

Windows 10 22H2 / Windows 11. No account or telemetry. Product display name is configured in `product.json`.

Prerequisites: Node 22 LTS, Rust stable MSVC, Visual Studio C++ build tools with Windows SDK, WebView2 Evergreen Runtime, and `cargo install tauri-cli --version '^2' --locked`.

```
npm ci
npm run desktop
```

`npm run dev` runs the canvas in a browser for UI development; native terminals require the desktop host. `npm run check` runs frontend checks. `npm run native:check` runs Rust checks, including Windows ConPTY integration tests. `npm run desktop:build` builds `agent-canvas-desktop.exe` and `pty-host.exe` in `src-tauri/target/release/`. Keep **both executables together** for a portable distribution. Always use the desktop scripts; they build the console host and derive window configuration from `product.json`. Installer packaging comes in M7.

On this restricted development host, use `$env:CANVAS_NO_SUBPROCESS='1'` in PowerShell before `npm run check` to enable the documented in-process compiler fallback. This is a verification aid; it does not provide a native runtime. See [third-party dependency provenance](THIRD_PARTY.md) for the offline xterm dependency constraints.

See [architecture](docs/ARCHITECTURE.md) and [verification](docs/VERIFICATION.md). This session targets M0–M2 only; workspaces are not yet persisted.
