# AgentCanvas for VS Code and Antigravity IDE

Run the existing spatial agent workspace in an editor tab: local ConPTY terminals, Codex/Claude CLI presets, linked agents, Markdown notes, whiteboard, durable tasks, isolated Git areas and the bounded M11 team coordinator. No account, telemetry, service, network listener or runtime downloads are added. Installed agent CLIs retain their own authentication and approval settings.

This package targets **local Windows x64** VS Code 1.90+ and compatible Antigravity IDE builds. It bundles the Rust backend and both helper executables; Rust, Node and the standalone desktop app are not needed to use the installed extension. Remote editor windows, virtual workspaces, macOS and Linux are not supported by this build.

## Install and open

1. Build from the repository root with `npm ci` and `npm run extension:package` (requires the desktop Rust/MSVC build prerequisites).
2. In either editor, run **Extensions: Install from VSIX...** and choose `artifacts/agentcanvas-0.1.2-win32-x64.vsix`.
3. Open a trusted local folder. Run **AgentCanvas: Open Canvas** in the command palette, or select the canvas activity-bar icon and **Open canvas**.
4. Add a terminal or agent. Its working directory defaults to the selected project, the active file's project, or the first open folder. With no project open, a blank directory uses your home folder. Existing desktop workspace folders can be opened from the canvas workspace picker; close the desktop copy first because workspace locks are preserved.

CLI installation in VS Code: `code --install-extension artifacts/agentcanvas-0.1.2-win32-x64.vsix`. Antigravity IDE also supports **Install from VSIX...**; its executable name varies by installation.

## First-run setup

The first canvas opening presents a three-step guide: choose a canvas workspace, optionally configure installed Codex/Claude Code presets, then review and save. You can keep the current workspace, create a named workspace or open a saved one. Project selection controls the working-directory default for new terminals/agents. Changing a canvas workspace saves the current layout and stops its shells.

Agent setup offers automatic executable detection, an explicit native `.exe` path, file browsing and **Check executable**. These checks inspect local files; CLI version and authentication stay **not checked**. Help buttons open the providers' [Codex CLI](https://developers.openai.com/codex/cli) / [authentication](https://developers.openai.com/codex/auth) and [Claude Code setup](https://code.claude.com/docs/en/setup) / [authentication](https://code.claude.com/docs/en/authentication) guides only after a click. Setup never downloads installers, runs sign-in commands, reads credentials or starts agents.

Leave both providers unchecked to finish with terminals, notes and the whiteboard. Selected presets use the existing validated atomic library save; other presets, roles and existing agent nodes keep their settings. Setup is marked complete only after preset saves and workspace flushing succeed. Retrying a partial save keeps preset IDs. **Set up later** leaves completion unset. Reopen the guide from **AgentCanvas: Setup and CLI Troubleshooting**, the canvas command palette, or Settings. Completion is a versioned editor preference; each editor has its own setting.

## Editor behavior

- The new-terminal/agent dialog offers the editor's open project folders and **Browse folders...**. Selecting a project changes the default for subsequent launches in that editor window; browsing or typing a custom directory applies to that launch. **AgentCanvas: Choose Project Folder** changes the same default from the command palette. Saved terminal directories are preserved on restart. Managed task areas keep their validated checkout directory.
- In Review, **Open in editor** opens the current file from its managed checkout at the first changed line. File inspection also offers the action for a typed relative path. Deleted files cannot be opened. Rust validates checkout ownership, path boundaries, reparse/symlink exclusions, regular-file type and the existing 256 KiB file limit before returning a canonical local path. The editor opens the working file; edits are subject to the existing stale-review/commit checks.

- Hiding or moving the canvas tab retains terminal processes and the renderer. Closing the canvas tab stops its backend and processes. Reopening restores layout and starts fresh shells; saved agent launches remain paused. Closing/reloading the editor also stops the backend through stdio closure. Terminal output, command history, handles and tokens are never persisted.
- Layout and notes autosave with the desktop conflict, backup and atomic-write rules. Pending durable edits are mirrored to the extension host and flushed on ordinary tab disposal. Use **AgentCanvas: Save Workspace** to flush explicitly and see save errors before closing, or **AgentCanvas: Close Canvas** for the full frontend close handshake. If a conflict blocks a disposal flush, pending drafts are preserved in a versioned recovery JSON file under the editor's extension storage and the path is shown in an error. Forced process termination cannot guarantee delivery of the last webview message.
- Browser nodes retain their address and open the default browser after an explicit click. The editor webview does not embed the desktop WebView2 browser surface. Network resources, frames and command links are blocked inside the canvas webview.
- Each editor has its own extension data directory and recent-workspace catalog. The same workspace folder format can be used in either host, one at a time.
- Trust is required before local processes can start. All RPC calls use a fixed command allowlist and the existing Rust validation. The sidecar communicates only through inherited stdio; peer collaboration keeps the existing same-user named-pipe boundary.
- The package uses public stable VS Code APIs. It does not control Antigravity's built-in agent or depend on private editor APIs.

## Development

Run `npm run extension:build -- --debug`, then launch the **AgentCanvas Extension** debug configuration in VS Code or start either editor with `--extensionDevelopmentPath=<absolute repository>/extension`. Run `npm run check`, `npm run extension:check` and `npm run native:check`. See the repository's `docs/VERIFICATION.md` for executed checks and remaining limitations. M12 remains future work.
