# M5 desktop acceptance check

Run `artifacts/windows-debug-m5/agent-canvas-desktop.exe`, keeping both helper executables beside it. Use a disposable named workspace. These checks use local PowerShell shells and files only.

1. Create two terminal nodes titled **Agent A** and **Agent B** and move them apart. Drag A's **↔ header handle** onto B. A green link should appear. Open **Links** and confirm **Require approval** is selected.
2. In A, run `agentcanvas-peer peers`. Copy B's ID from the JSON result. Run `agentcanvas-peer send B-ID "M5 hello"`, replacing `B-ID`. A pending-message badge and an escaped per-link log should appear. Approve typing: B should receive the text without Enter. Clear B's input with Ctrl+C.
3. Select **Auto-send** for that link and repeat the send. B should receive it without an approval prompt, and the log should reach `delivered`. Clear B's input, then restore **Require approval**.
4. In B, run `Write-Output 'M5 peer output'`. In A, run `agentcanvas-peer read B-ID`. The JSON text should include that output. No visible terminal output should disappear as a result of reading it.
5. Create a Markdown note and connect its handle to both terminals. Run `agentcanvas-peer notes` in each: both should report the same Windows file path. In A, append a line to that file; in B, read it. Use **Reload disk** on the sticky to see the external edit. Note-path environment values are startup snapshots; the helper reports live paths.
6. Disconnect the agent link. A's `peers` result should become empty and another send to B should fail. Existing shared-note links should still work. Reconnect A/B and leave approval enabled.
7. Save, close and reopen the app. Layout, agent/note links and approval policy should restore. Shells should be fresh in saved directories, note content should remain, and old tokens/terminal output/message logs should not restore.

Report which step failed and any visible error. WSL/Git Bash helper PATH behavior, custom profiles, multi-monitor DPI and two-user pipe ACL isolation need separate verification.
