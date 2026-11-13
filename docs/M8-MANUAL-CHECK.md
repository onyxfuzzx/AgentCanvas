# M8 desktop checks

These checks require the Windows desktop host and separately installed, signed-in Codex and Claude Code CLIs. Detection is a filesystem check. Do not record a visual or authenticated behavior as passed based only on unit tests or a running process.

Confirmed on 2026-11-13: the user reported **“Presets and both CLIs open”** for the M8 build's preset editor and Start agent controls. The complete steps below, including persistence and role-compliance checks, remain separate acceptance work.

## Basic smoke check

1. Open the M8 app. Select **Agent presets** in the sidebar. Confirm Codex and Claude show their detected paths. Add a role, edit its instructions, create a preset using that role, and save. Reopen the editor and confirm it persisted.
2. Select **+ Agent**. Choose Codex Builder, give it a distinct name and a disposable working directory, then start. Confirm the interactive Codex CLI opens. Repeat with Claude Reviewer. Handle any sign-in or directory trust prompt directly in the CLI.
3. Ask each agent to state its assigned name and role without changing files. Confirm the injected identity and role instructions are present. This sends a prompt to the provider using that CLI's account; it is a user-performed check.
4. Close and reopen the app. Confirm both agent nodes restore paused and no agent CLI starts until **Start agent** is selected. Select an agent and use **Edit launch settings** to verify its saved name, role, instructions, executable override and directory.

## Deeper acceptance checks

- Edit/delete a reusable preset and edit its role. Existing nodes retain their saved settings. Choosing a preset explicitly in the restart form loads its current values.
- Start a node using a working directory containing spaces and Unicode. Drag, resize, zoom and move it outside the viewport; its process survives renderer changes. Close its node and check the agent and its descendants exit. Normal app close shuts down every agent.
- Rename a paused node before starting it; its next session receives the current name. Restart with different settings, then undo a layout move; launch settings stay current.
- Try a missing CLI executable/directory and an invalid wrapper path. The failed node shows an error and can be repaired through Restart. An unsigned/incompatible CLI may need an update outside the app; detection does not install or update it.
- Enter more than 4096 UTF-8 bytes of instructions. Saving/launching is refused. Test multibyte text, quotes and backslashes. Role and node names reject control characters natively.
- With the editor open, externally edit `agents.json`. Save must refuse the stale draft and leave both versions available. Copy wanted draft edits before choosing Reload from disk.
- With the app closed, truncate a disposable `agents.json` that has a valid backup. The editor shows recovery; saving archives the corrupt original. An unsupported valid JSON schema is refused and preserved.
- Verify existing shell terminals, link approvals, shared notes, activity summaries, theme controls and browser modal hiding still behave correctly.

Automated coverage uses local fixture executables for both adapters. It cannot establish provider authentication, actual CLI UI behavior, directory trust handling or model compliance with role instructions.
