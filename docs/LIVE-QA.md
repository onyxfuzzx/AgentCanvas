# Live desktop and provider QA

Use a disposable repository and a separate application data directory. Keep the real project out of agent scope. Record observed results in [VERIFICATION.md](VERIFICATION.md); an unchecked step is pending, not passed.

The current local QA candidate is `artifacts/windows-portable-live-qa/agent-canvas-desktop.exe`. Its prepared desktop workspace is **Live AI desktop QA**, under `.cache/live-qa-559404ea`. Test data and launchers are intentionally ignored by Git. If first-run setup opens, choose **Set up later**, then select the prepared workspace.

## 1. Desktop and canvas

- [ ] Window opens with the prepared note and two terminal cards; no error banner.
- [ ] Pan, zoom, fit and minimap navigate correctly. Move and resize a card; undo/redo restores layout.
- [ ] Edit the briefing note and wait for save. Switch away and back; the edit survives.
- [ ] Terminal input, selection, copy/paste and resizing work at normal and reduced zoom.
- [ ] Pan a running terminal off-screen, then return; its process and output remain available.
- [ ] Try keyboard navigation, the command palette, light/dark themes and a narrow window. Record display scaling and any focus or clipping issues.

## 2. Real Codex and Antigravity work

The prepared fixture contains deliberately broken addition and three Node regression tests. The builder may change only `calculator.mjs` and `evidence/implementation.md`. The reviewer must leave the checkout unchanged. Neither role may push, recruit more agents or access user projects.

1. Inspect **Team run**: one builder job, a distinct independent reviewer, a declared Node check, concurrency two and a ten-minute run budget. Adoption is paused and has not launched providers.
2. Start both PowerShell cards. In **Codex Builder**, run `node ..\..\..\launch-provider.mjs codex`. In **Antigravity Reviewer**, run `node ..\..\..\launch-provider.mjs antigravity`. These launchers are outside the checkout and do not change its files. They avoid depending on PowerShell script execution settings.
3. Start automatic dispatch. Review any provider trust, sign-in or command approval prompts yourself. Report a prompt that prevents progress; do not disable the CLI's permission policy to make a test pass.
4. Observe the builder moving from dispatched to acknowledged/running, then reporting a structured result. Confirm the reviewer receives its own attempt after the builder result.
5. Inspect the diff, the implementation artifact and both result summaries. Tests and harness files must be unchanged, with a clean committed checkout.
6. Pause dispatch. Accept the independent review. Stop both terminal processes, run the declared check and verify it passes at the reviewed commit. Then accept the builder.
7. Optionally preview, approve and integrate into the **disposable repository only**. Run `node --test calculator.test.mjs` there and confirm all three tests pass.

- [ ] Both installed CLIs reach their models through canvas terminals.
- [ ] Actual agent actions use the inherited helper for inbox, acknowledgement, progress and result.
- [ ] Independent review and check evidence gate builder acceptance.
- [ ] No duplicate attempt, unexpected file change or implicit integration occurs.

The current automated run is blocked at helper access: Codex reported Windows access denied, while Antigravity's tool subprocess reported a missing helper even with an absolute path that exists on the native host. The interactive launchers keep provider approval prompts available. Do not mark the workflow passed until actual acknowledgements, results and review/check evidence are observed. If a provider remains blocked, stop its terminal and use the task UI's explicit reconciliation controls; an expired attempt cannot simply resume.

The user also reproduced missing connection variables from a manually started Codex session inside the Builder card. Its process lacked `--no-daemon`. Exit that CLI to the canvas PowerShell prompt and use `codex --no-daemon --no-alt-screen`, or use the app's Codex preset. A separate fresh native-terminal probe reported all three required connection variables present, and the user confirmed `missingVariables: []` after reopening the actual Builder session with those flags. Actual peer delivery still requires a successful helper call and, for approval links, approval in **Links**.

**Completed sample:** after that relaunch, the user ran the scoped send script, approved its Links request and confirmed that AGY received the instruction to write Python `print("hello")`. This verifies approved peer delivery for that session. The task/result/review/check checklist above remains open.

The earlier fixture used `agy.exe` through a PowerShell node. The newer `cli-presets` candidate adds a first-class Antigravity preset alongside Codex and Claude Code. Use **+ Agent** and select its preset to exercise the native adapter. Existing shell nodes remain shells until explicitly replaced or edited, and the earlier shell-delivery result does not qualify the new adapter's authenticated task behavior. For the prepared task flow, keep the assigned node IDs and managed checkout when editing launch settings.

## 3. Stop, save and reopen

- [ ] Pause prevents new dispatches. Emergency stop ends fixture processes and records its outcome.
- [ ] Close normally and reopen with the same isolated data directory. Note contents, layout, task results and review evidence survive.
- [ ] Providers stay stopped and the team stays paused; no work or shell command replays.
- [ ] Restart an agent explicitly and confirm old attempts cannot receive new results.

## 4. Additional release qualification

The checks above do not establish every release gate. [PROJECT-STATUS.md](PROJECT-STATUS.md) retains the full WS2–WS6 scope: embedded browser interaction, accessibility, mixed-DPI monitors, WSL guest cleanup, failure injection in the GUI, multi-user pipe isolation, sustained performance, and clean-machine install/upgrade/uninstall. Record each environment and result before closing those items.

Store concise results and intentional code artifacts. Do not attach credentials, raw terminal transcripts or command history to a public issue or commit.
