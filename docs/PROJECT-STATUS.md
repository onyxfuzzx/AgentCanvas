# AgentCanvas: project status and roadmap through M28

Updated: 2026-11-21. Roadmap baseline commit: `11a67fb`; the latest WS1/WS7 fixes and executed checks are recorded below. This page summarizes the repository's rules, release work and future features. It draws on `AGENTS.md`, `README.md`, `docs/*.md`, `extension/README.md` and `src/areas/README.md`. This page is the single list of remaining work; milestone scope lives in [MILESTONES.md](MILESTONES.md) and executed evidence in [VERIFICATION.md](VERIFICATION.md). The user requested a complete plan through M28, including Linux and macOS, on 2026-11-19. M12–M28 are planned, not implemented; the current implementation authorization still ends at M11.

## Progress at a glance

Open-source preparation was authorized on 2026-11-21 under MIT. OS0 source/community preparation is implemented locally; the [publication checklist](OPEN-SOURCE-LAUNCH.md) still requires fresh online installation, hosted CI and owner decisions/settings. OS1 is a future Windows public prerelease gated by the relevant existing qualification. The numeric totals below remain WS1–WS7/M12 totals; OS0/OS1 use a separate checklist and do not double-count release work.

OS0 local verification passed the read-only source/history audit and application checks (94 frontend/37 extension tests). The MIT-licensed VSIX 0.1.5 was built and its 20-file inventory, license, metadata, checksum and optimized bytes verified. This is a development artifact, not a published public release; see the [OS0 evidence](VERIFICATION.md#os0--public-source-repository-preparation--2026-11-21).

| Scope                                              | Status                                                                             | Tracked items |
| -------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------: |
| M0–M11 implementation                              | Implemented and committed; acceptance limits remain                                |             — |
| Extension backlog 1–4 (projects, setup, recovery)  | Completed; VSIX v0.1.4 includes backend restart recovery                           |             — |
| WS1: native team fixture                           | Completed 2026-11-21; full native check and separate Git Bash test pass            |             7 |
| WS7: extension backend restart recovery            | Completed 2026-11-21; both editors and VSIX content checks pass                    |            10 |
| WS2: Windows UI and accessibility qualification    | P1, mostly unverified                                                              |            22 |
| WS3: real provider session qualification           | P1; Codex/Antigravity model connections pass, task-helper handoff blocked          |            13 |
| WS4: recovery, failure and authority qualification | P1                                                                                 |            21 |
| WS5: performance and supported capacity            | P1, not measured                                                                   |            11 |
| WS6: final Windows distribution                    | P1; packages need final source rebuild/qualification                               |            18 |
| **Current release work (WS1–WS7)**                 | 17 completed; 85 remain                                                            |       **102** |
| M12 features (M12.1–M12.4)                         | Planned; implementation not started                                                |            19 |
| **Current release + M12 checklist only**           | 104 remain; excludes estimates for M13–M28                                         |       **121** |
| M13–M17                                            | Planned: portable core, Linux, macOS, editor ports and beta                        |  5 milestones |
| M18–M24                                            | Planned: conversations, context, workflows, delivery, archives, tools and packages |  7 milestones |
| M25–M27                                            | Planned: opt-in remote execution, collaboration/sync and scheduling                |  3 milestones |
| M28                                                | Planned: stable cross-platform qualification                                       |   1 milestone |

Last recorded results (2026-11-21): `npm run check` passed with 94 frontend tests and 37 extension tests. `npm run native:check` and the optional Git Bash lifecycle test passed again. A fresh optimized `live-qa` portable desktop build and its six manifest hashes passed; the app is open with isolated test data. Codex 0.171.0 and Antigravity CLI 1.5.13 returned real model responses, but native task-helper handoff failed, so authenticated orchestration remains unqualified. VSIX v0.1.5 MIT packaging is verified; the earlier v0.1.4 WS7 runs passed 31 checks in each installed editor. Full desktop UI and distribution qualification remain open; see [VERIFICATION.md](VERIFICATION.md) and the [live checklist](LIVE-QA.md).

## Rules

### Scope and process

- The user approved planning through M28, including Linux and macOS. Implementation beyond M11 still needs a separate instruction; roadmap entries are not completed features or authorization to start them.
- Commit at each milestone.
- Record actual results in `docs/VERIFICATION.md` and never claim an unexecuted check passed. Automated tests alone cannot close desktop, visual, provider or installer acceptance gates.
- Check off an item on this page only after recording its evidence. Do not treat a larger timeout as proof of correct behavior.
- Submit provider tasks (Codex/Claude) only with the user's authorization. Use disposable workspaces and projects for testing.
- Add meaningful tests for coordinate math, history, PTY lifecycle and bounded buffers.

### Commands

| Command                                                                               | Purpose                                                           |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `npm ci`                                                                              | Install dependencies                                              |
| `npm run dev`                                                                         | Web UI only (no native terminals)                                 |
| `npm run desktop`                                                                     | Native app                                                        |
| `npm run check`                                                                       | Format, lint, types, tests, build and extension checks            |
| `npm run native:check`                                                                | Rust format, Clippy and tests                                     |
| `npm run desktop:build` (`-- --debug`)                                                | Portable EXE, ZIP, manifest and checksums                         |
| `npm run desktop:release`                                                             | Portable build plus NSIS and MSI installers                       |
| `npm run extension:build` / `extension:package` / `extension:check`                   | Build the extension, create the VSIX, test the bridge and sidecar |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked --test conpty -- --ignored` | Optional Git Bash test (unrestricted host only)                   |

On the restricted development host, set `$env:CANVAS_NO_SUBPROCESS='1'` before `npm run check`.

### Architecture

- Current build: Windows-first Tauri 2, Rust, React, TypeScript, Vite, Zustand and xterm.js. Linux/macOS runtime and editor support are planned in M13–M17. Keep a shared model and explicit platform capability boundaries. The product name comes only from `product.json`.
- `src/` holds the UI and the pure canvas model. `src-tauri/` holds native PTY ownership and IPC. `extension/` holds the VS Code/Antigravity host and its Rust stdio sidecar.
- State uses world coordinates. Screen coordinates appear only at the viewport boundary.
- Terminal processes outlive viewport renderers but never the application. Windows kill-on-close jobs own process trees. WSL guest cleanup needs separate verification.
- Keep undoable layout separate from transient terminal, task, Git and permission state. Undo never replays processes, tasks or permissions.
- Rust owns authoritative task and run transitions. The UI renders snapshots, and model or coordinator output is an untrusted proposal.
- Editor browser nodes open the default browser explicitly and create no native webview surfaces.

### Security and privacy

- No telemetry, accounts, remote fonts, runtime CDN dependencies or unsolicited network access.
- Treat terminal bytes, peer messages, notes, browser content and task text as untrusted data. They can never grant capabilities or approve their own work.
- Validate every Rust command input. Never interpolate shell command strings; use argument vectors only.
- A peer link does not grant coordinator authority. Workers cannot accept their own results. Permissions are rechecked before each action and before evidence is recorded.
- Browser pages get no native app privileges. Popups, downloads, permission requests, `file:` URLs and other non-HTTP(S) addresses are blocked.
- Git worktrees provide code isolation, not an OS sandbox.

### Persistence

- Workspace, task, agent-library and area saves are atomic, versioned and validated, and use locks and baseline checks.
- Preserve corrupt originals and last-good backups. Refuse unsupported schemas rather than overwriting them.
- Flush autosave before workspace switches and normal close. A failed save blocks the switch or close.
- Never persist terminal output, command history, process handles, tokens or credentials.
- Restart or reopen never replays tasks automatically. Uncertain attempts stay blocked until the user reconciles them, and team runs stay paused.

## Remaining work

### OS0 / OS1: public source and Windows prerelease

- **Prepared locally:** MIT license and metadata, repository ignore/editor conventions, public README/roadmap, indexed guides/architecture/development docs, contribution/security/conduct/support policies, GitHub templates/ownership/dependency configuration, a sanitized example, source/history audit and corrected CI sidecar ordering.
- **Verify before source publication:** read-only audit/results, retained-history/email/privacy review, clean online dependency installation and hosted Windows CI, active private-reporting/security settings, GitHub rendering/metadata and an explicit public visibility decision. See [the full OS0 checklist](OPEN-SOURCE-LAUNCH.md#os0--public-source-preview).
- **Qualify before binary prerelease:** relevant WS2–WS6 evidence, complete dependency notices/installer licensing, exact-source builds, support/version matrix, real sanitized demo and explicit prerelease publication. Source preparation does not complete those gates.

### Current application qualification

WS1 and WS7 are complete. Continue with WS2–4 (fixing defects as they appear) → WS5 → WS6. The planned feature sequence is M12 → M13 → M14/M15 → M16 → M17 beta → M18–M24 → opt-in M25–M27 → M28 stable qualification, following the dependency table in [MILESTONES.md](MILESTONES.md#milestone-sequence). Linux and macOS prototypes can progress independently after M13; actual implementation needs a separate request.

### WS1: fix the failing native team fixture (completed 2026-11-21, 7 items)

- [x] Diagnose the `team_run` failure using task, attempt, worker-lifecycle and scheduler diagnostics.
- [x] Fix the root cause, or document a reproducible host or test limitation.
- [x] Pass the concurrent mixed-provider phase: two isolated changes, then the dependent third task.
- [x] Pass the independent-review phase: stale-commit refusal, then a fresh review before builder acceptance.
- [x] Verify cleanup after both success and failure, with no leftover processes and no automatic restart of uncertain work.
- [x] Get `npm run native:check` fully green from the release source.
- [x] Run the optional Git Bash test on an unrestricted host, or document its limit.

Evidence and remaining qualification limits: [WS1 verification](VERIFICATION.md#ws1--native-team-fixture-and-ipc-responsiveness--2026-11-21).

### WS7: extension backend restart recovery (completed 2026-11-21, 10 items)

- [x] Add backend states: starting, connected, failed, stopping and restarting.
- [x] Add a Restart Backend command and an actionable failure view.
- [x] Preserve pending layout and note edits before replacing a failed backend.
- [x] Reject or settle old in-flight requests, and isolate old replies from the new backend generation.
- [x] Confirm the old process and its children have stopped before replacement work begins.
- [x] Restore durable state conservatively, keeping agent launches and team resume explicit.
- [x] Reattach the renderer without stale sessions overwriting state or losing drafts.
- [x] Bound repeated restart failures and show a visible stop reason.
- [x] Test crash, broken stdio, an unresponsive process, partial saves, reload, and close during restart.
- [x] Run the flow in both editors and package the VSIX.

Evidence: [WS7 verification](VERIFICATION.md#ws7--extension-backend-restart-recovery--2026-11-21). Failure injection uses native and port tests; editor runners exercise crash/restart/reload and real renderer/save/disposal handshakes. Pointer, screen-reader and DPI qualification remain WS2; authenticated provider work remains WS3.

### WS2: Windows UI and accessibility (P1, 22 items)

- **Canvas and terminals:** drag, resize, pan, zoom, marquee, fit, minimap, layering and undo/redo. Terminal input, selection, copy/paste, reflow and TUI apps. Process survival off-screen. PowerShell, cmd, WSL and Git Bash, including WSL guest cleanup. Pickers and setup forms. Recovery UI. Task, team and review flows. Note conflicts and large whiteboards.
- **Keyboard, themes and displays:** keyboard-only traversal, focus and the command palette. Light, Dark and System on every page. Live OS theme changes, high contrast, reduced motion and screen readers. The full DPI matrix (200% is untested). Mixed-DPI monitors and minimize/maximize. Narrow windows. Touch and stylus, or a documented limit. Parity with the HTML reference, if still required.
- **Embedded browser (EXE):** navigation and focus routing. Clipping under overlaps at different zoom and DPI. The eight-page cap and paused restoration. Refusal of popups, downloads and permission requests. The live-runtime IPC boundary.

### WS3: real provider sessions (P1, 13 items)

Current partial evidence: Codex and Antigravity CLI model connection probes passed on 2026-11-21. Native-terminal helper probes failed before acknowledgement; no real builder/reviewer/check/accept chain has passed. Codex/Claude remain the implemented presets; Antigravity is being tested through a shell and has no first-class adapter. Keep the qualification items open until the handoff and full workflow pass.

- Record CLI versions, authentication and trust prompts. Verify that name, role and instructions reach each agent, including Unicode text and executable overrides. Verify that launch snapshots survive preset edits and restarts.
- Verify linked messaging (approval and auto-send), shared notes and revocation, plus the inbox, ack, heartbeat and result protocol during long tools.
- Run task → dispatch → work → review → accept with each provider. Exercise revision, cancellation, late-result refusal, lease expiry and reassignment.
- Run a full mixed team (two independent tasks plus a dependent task). Run the builder → reviewer → checks → acceptance path, including rejection.
- Verify coordinator limits, pause, emergency stop, budgets and heartbeat loss. Repeat the workflow with manual planning. Record the supported provider and version combinations.

### WS4: recovery, failure handling and authority (P1, 21 items)

- **Persistence:** close or switch during in-flight saves. Disk full, read-only storage, locked files, external edits and missing directories. Backup and corrupt-file recovery through the UI. Refusal of unsupported schemas. Two GUI instances on one workspace. Recovery copies and receipts. No leakage between workspaces. Saved data excludes secrets and output.
- **Process and Git:** kill the app at dispatch, ack, result and accept boundaries. Restart leaves work blocked or paused with no replay. Failures during worktree creation, integration and cleanup. Conflicts, dirty targets and stale approvals in the UI. Termination and revocation during blocked writes. Power loss and network shares, only if they will be claimed.
- **Trust and authority:** workspace-trust prompts in both editors. Malicious terminal, peer, note and browser content. Peer links cannot grant authority. Permission rechecks. Named-pipe ACL with two Windows user accounts.

### WS5: performance and capacity (P1, 11 items)

- [ ] Name the reference machine and the Windows, WebView2, editor and provider versions.
- [ ] Set CPU, memory, latency, frame-time and shutdown limits **before** measuring.
- [ ] Run 20 noisy terminals for 30+ minutes, with four task attempts and four browser pages.
- [ ] Measure large notes, whiteboards, boards, timelines and diff pagination.
- [ ] Verify queue, buffer, mailbox and retry bounds under load. Check resource retention and real OS-write backpressure.
- [ ] Assess the Vite bundle-size advisory.
- [ ] Separate product latency from test-host contention.
- [ ] Publish only the capacity that actually passes.

### WS6: final Windows distribution (P1, 18 items)

- **Packages:** pick the version and source commit. Rebuild the EXE, helpers, ZIP, NSIS installer and MSI. Verify checksums, CRCs and file inventories. Run the extracted and installed builds. Update the release record.
- **Clean machines:** Windows 10 and 11 without development tools. A missing WebView2 runtime. Each installer's install, upgrade, repair and uninstall. Data preservation. Paths with spaces and Unicode, and long-path limits. Standard-user permissions. A code-signing decision (current builds are unsigned).
- **Extension:** VSIX install, update, disable and removal in both editors. Storage survival across updates. Packaged installs, not only development runners. Publisher, license and branding. Marketplace listing, only if chosen.

### M12: planned future features (19 items)

The feature scope below expands [the M12 deliverables](MILESTONES.md#m12--reusable-workflows-project-tools-and-release-qualification). Existing project-folder selection, guided CLI setup and draft recovery cover parts of the experience, but do not complete M12. Planning is approved; implementation still requires a separate request after the current release work. There are no committed dates. M12 qualifies Windows; M13–M17 port and qualify that workflow on Linux and macOS.

#### M12.1: reusable teams and workflow templates (5 items)

- [ ] Save reusable role and launch snapshots, agent connections, task patterns, note templates, area requirements and canvas layouts.
- [ ] Export and import versioned template files without credentials, terminal output, command history or process handles.
- [ ] Preview what an import will add and identify missing providers before insertion.
- [ ] Remap node, task, note and area references; validate schema, paths and relationships before saving.
- [ ] Keep imported work paused. Import alone must not launch agents, execute setup scripts or initiate network requests.

#### M12.2: local project context and shared documents (5 items)

- [ ] Add a bounded local project file tree and file previews, beyond the current managed-area review surface.
- [ ] Add scoped project search with result and content limits.
- [ ] Add named shared documents with revision checks and provenance, building on existing linked Markdown notes.
- [ ] Make helper commands, API documentation and supported provider capabilities discoverable from the workflow.
- [ ] Exclude secret, build and dependency paths by default; validate file access against traversal and reparse escapes. Retrieved content must not become trusted application policy.

#### M12.3: opt-in agent browser automation (4 items)

- [ ] Define a separate agent browser capability for navigation, page snapshots, screenshots and basic interactions. Current desktop browser nodes only display pages; editor nodes open the default browser.
- [ ] Require explicit connections and revocable permissions; validate destinations, inputs and bounded results.
- [ ] Define policy for sensitive submissions and downloads before enabling either; preserve the boundary between remote pages and native app privileges.
- [ ] Verify permission denial, revocation and malicious-page handling in live WebView2 as well as native command-boundary tests. Define editor-host support separately before claiming parity.

#### M12.4: guided end-to-end workflows (5 items)

- [ ] Provide bug-fix, feature-build and independent-review templates.
- [ ] Bring the goal, task board, active agents, review evidence and next required action into a coherent workflow.
- [ ] Extend the existing first-run setup through plan inspection, isolated task execution, review and integration without manual configuration repair.
- [ ] Complete keyboard navigation, actionable errors and documented cancellation/recovery behavior across those workflows.
- [ ] Add local attention notifications without requiring a cloud account or telemetry.

#### M12.5: qualification shared with current release work

This is an acceptance gate, not an additional feature count. It overlaps WS1–WS6; the editor also requires WS7. Close relevant existing acceptance gaps and exercise the new orchestration failure cases. Verify template import into a second workspace, the fresh-user workflow, authorized real-provider runs, keyboard/DPI behavior, measured capacity, and rebuilt Windows portable/installable packages. Existing setup/editor smoke results do not close these gates.

### M13–M28: planned milestones

All sixteen milestones now have defined deliverables, dependencies and acceptance gates in [MILESTONES.md](MILESTONES.md). They are new proposals written for the user's request on 2026-11-19, not recovered historical plans. All remain unimplemented. The 121-item subtotal above covers only existing release work plus M12; M13–M28 are not task-estimated and are not included in that count.

| Milestone                                                                                             | Planned feature scope                                                                                               | Dependency                            | Completion evidence                                                                           |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------- |
| [M13: portable native foundation](MILESTONES.md#m13--portable-native-foundation)                      | Platform interfaces, Unix PTY/process ownership, secure local sockets, executable/path/storage rules and native CI  | WS1 + WS7; M12 contracts              | Windows regression checks and Unix lifecycle/IPC/storage prototypes pass                      |
| [M14: Linux desktop](MILESTONES.md#m14--linux-desktop)                                                | Linux shells/agents, Git/recovery/UI, DEB and AppImage on a declared x86_64 baseline                                | M13                                   | Installed Linux package completes the task/review flow and process cleanup                    |
| [M15: macOS desktop](MILESTONES.md#m15--macos-desktop)                                                | Apple Silicon shells/agents, native keyboard/lifecycle behavior, App/DMG and signing/notarization                   | M13                                   | Real-Mac workflow, recovery and clean signed-install acceptance                               |
| [M16: Linux/macOS editor extensions](MILESTONES.md#m16--linux-and-macos-editor-extensions)            | Platform-specific sidecars/VSIX, setup, trust, save/recovery, backend restart and local editor parity               | M13–M15                               | Packaged VSIX passes on every advertised editor/OS combination                                |
| [M17: three-platform beta](MILESTONES.md#m17--three-platform-beta-release)                            | Capability matrix, platform packages, onboarding, accessibility, measured capacity and local diagnostics            | M12–M16 + WS1–WS7                     | Installed Windows/Linux/macOS release candidates pass the common journey                      |
| [M18: conversations and routing](MILESTONES.md#m18--structured-agent-conversations-and-routing)       | Documented structured provider adapters, chat surface, approvals, explicit mentions and context routing             | M17; validated provider interfaces    | Real provider/version flows and recipient/revocation checks; streams stay session-only        |
| [M19: project context and knowledge](MILESTONES.md#m19--project-context-and-durable-knowledge)        | Bounded local index/search, cited context, reviewed runbooks/decisions and context preview                          | M12.2 + M17                           | Relevant retrieval stays within limits and excludes secrets/out-of-scope files                |
| [M20: visual workflows](MILESTONES.md#m20--visual-workflows-and-controlled-automation)                | Workflow editor, versioned run snapshots, scoped recruitment/checks, bounded revision and human gates               | M12.1 + M12.4 + M18 + M19             | Failure/recovery fixtures and a complete manually controllable workflow                       |
| [M21: Git delivery and checks](MILESTONES.md#m21--git-delivery-and-external-checks)                   | Target selection, controlled Git network actions, optional issue/PR connectors and exact-commit CI evidence         | M17 + M20                             | Stale heads, conflicts and failed/retried external writes cannot deliver the wrong result     |
| [M22: archives and portability](MILESTONES.md#m22--archival-portability-and-local-recovery)           | Task/run archives, selected structured export, local backups, restore-as-copy and cross-OS mapping                  | M19 + M20                             | Archive/load beyond live limits and interrupted cross-OS restore retain valid originals       |
| [M23: tools and devices](MILESTONES.md#m23--extensible-tools-and-device-automation)                   | Scoped tool/MCP registry, portable browser tools and opt-in Android emulator automation; iOS feasibility gate       | M12.3 + M13 + M18 + M20               | Tool/device failures and malicious content cannot bypass native permissions                   |
| [M24: reusable packages/catalogs](MILESTONES.md#m24--local-packages-and-optional-catalogs)            | Offline declarative packages, integrity/version/permission previews, update/rollback and optional curated discovery | M20 + M22 + M23                       | Offline package lifecycle passes; imports/updates cannot silently execute or expand scope     |
| [M25: remote/container work](MILESTONES.md#m25--remote-and-container-execution)                       | Authenticated execution hosts, remote supervision, host-local path validation and qualified remote editors          | M17 + M20–M23                         | Disconnect/crash/lease tests stop owned work without duplicate replay                         |
| [M26: sharing and selective sync](MILESTONES.md#m26--shared-workspaces-and-selective-synchronization) | Separate identities/roles, one execution authority, conflict handling and explicitly selected shared data           | M22 + M24 + M25                       | Cross-OS two-user flow, revocation, privacy and no-duplicate execution tests                  |
| [M27: scheduled workflows](MILESTONES.md#m27--scheduled-workflows)                                    | Explicitly armed recurrence, timezone/next-run preview, non-overlap, missed-run policy and disarm controls          | M20 + M22; M25/M26 when remote/shared | Clock/sleep/crash fixtures never replay missed work or create duplicate tasks                 |
| [M28: stable release](MILESTONES.md#m28--stable-cross-platform-release)                               | Compatibility freeze, reliability/security/accessibility/soak qualification, final artifacts and maintenance policy | Included scope from M17–M27           | Every advertised platform passes final-artifact installation, work, review and recovery gates |

### Platform rollout and product boundaries

- **Windows:** retain the working x64 desktop/editor path and fix its current acceptance blockers first. Share new core behavior rather than creating a separate Windows product.
- **Linux:** qualify one maintained Ubuntu LTS x86_64 baseline first, including native runtime prerequisites and supported Wayland/X11 sessions. Additional distributions, package formats and ARM64 require their own evidence.
- **macOS:** qualify Apple Silicon first with native process ownership, application-launch environment, Command-key behavior and signed/notarized distribution. Intel/universal support requires Intel qualification.
- **All platforms:** preserve the same task/review schema and bounded authority. Preview host path/shell/provider mappings on import; keep agents paused. Browser and editor features follow an explicit capability matrix.
- **Local default:** no required AgentCanvas account, telemetry, automatic cloud upload or transcript persistence. Provider CLIs retain their own authentication/data policies. M18 conversation UI does not add saved history.
- **Optional later modules:** remote execution, tools/devices, catalogs, sharing and schedules require explicit setup and native permissions. Hosted cloud/accounts, public marketplace publication and iOS tools remain explicit design/feasibility decisions inside their milestones.
- **Estimation:** select exact platform baselines and prove Unix supervision in M13; qualify a usable three-platform beta in M17. Estimate work and dates after those risks and team capacity are measured. Planning through M28 does not imply all modules must delay the M17 beta.

## Documented product limits (keep, or change by explicit decision)

- Terminal output and live sessions are not persisted. Reopened shells are fresh; agent nodes reopen paused.
- Automatic team dispatch uses only existing live agents. Recruitment, checks and integration are explicit actions.
- Subscription CLI cost and token usage is unknown; there is no monetary cap.
- Integration targets the currently checked-out branch, and branch switching is manual. Custom Git filters and merge drivers need manual handling. Managed checkout paths are limited to 230 UTF-16 units.
- The current shipped target remains local Windows x64. Linux/macOS desktop and editor support are planned in M13–M17; device tools, catalogs, remote work, sharing and schedules are planned in M23–M27. These capabilities are not implemented by this update. Hosted accounts/cloud storage and public marketplace publication have explicit decision gates and remain optional.
- The xterm prerelease pins (`5.6.0-beta.136`) need a clean online `npm ci`, and an upgrade to a stable release, before release ([THIRD_PARTY.md](../THIRD_PARTY.md)).

## Definition of finished

- **Standalone EXE:** WS1–WS6 closed with recorded evidence, a release version and source identified, and the final portable build and installers passing the Windows acceptance matrix.
- **Editor extension:** the above plus WS7 and the editor-specific distribution items.
- **Full M12 product:** the above plus M12.1–M12.4 and their qualification gates after implementation is requested.
- **Three-platform beta (M17):** M12–M16 accepted, installed Windows/Linux/macOS desktop and local editor packages qualified, and the published platform/capacity matrix supported by actual evidence.
- **Stable release (M28):** every included milestone and advertised target passes its final-artifact gates. Any deferred feature needs an explicit recorded scope decision and stays open; optional services cannot become requirements for local use.
