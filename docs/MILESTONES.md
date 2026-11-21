# AgentCanvas roadmap through M28

Updated: 2026-11-21. Roadmap baseline: commit `11a67fb`; WS1/WS7 verification now includes the IPC responsiveness fix and extension backend recovery. The original M9–M12 proposal was written against `8880ada` (M8) on 2026-11-14.

The user authorized planning through M28, including Linux and macOS, on 2026-11-19. M0–M11 are implemented; M12–M28 are planned and unimplemented. This request expands the product roadmap, not the current implementation authorization beyond M11. The original M9–M12 proposal and its acceptance requirements are retained below. [PROJECT-STATUS.md](PROJECT-STATUS.md) tracks release blockers and milestone status; [VERIFICATION.md](VERIFICATION.md) records executed evidence. There are no delivery-date commitments until platform prototypes, dependencies and team capacity are measured.

## Product goal

Turn the existing spatial terminal workspace into a dependable control plane for coding agents on Windows, Linux and macOS: give it a goal, inspect its proposed work, run independent tasks in isolated checkouts, review evidence, and integrate the accepted result. Preserve direct terminal access, offline local workspace use and manual control throughout. Remote execution, shared workspaces and schedules arrive later as opt-in capabilities. The core requires no AgentCanvas account, telemetry or cloud service.

The owner approved MIT open-source preparation on 2026-11-21. The public roadmap is [ROADMAP.md](../ROADMAP.md); [OPEN-SOURCE-LAUNCH.md](OPEN-SOURCE-LAUNCH.md) defines the public-source and release gates. Build quality, recoverability, accessible interaction, clear contribution paths and published evidence guide the project. Public preparation is authorized; future application milestones still require their own implementation request.

## Open-source checkpoints before the next feature milestone

| Checkpoint | Outcome                                                                                                                              | Gate                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OS0        | Public source preview: MIT, clear documentation/structure, contribution policies/templates, source/history audit and reproducible CI | Local preparation and checks plus fresh online install/hosted CI, owner privacy/history review, verified reporting/security settings and an explicit visibility decision. |
| OS1        | Windows public prerelease: real demo, qualified packages, support matrix, notices, release notes and checksums                       | Relevant WS2–WS6 acceptance, exact-source artifact validation and explicit prerelease publication.                                                                        |

OS0 is source/public-project work; OS1 reuses Windows qualification rather than inventing a second feature backlog. Source can be published as a development preview before stable binary qualification. A built artifact, an illustrated workflow and an authenticated provider success are separate evidence. No source visibility change, remote push or public release is implied by updating this document.

Keep `src/`, `src-tauri/` and `extension/` stable; organize user/contributor information through `docs/README.md`, `docs/guides/`, root community files and sanitized `examples/`. Every significant milestone should have scoped contributor tasks, documented failure behavior, appropriate checks and release-note evidence. Give M13–M17 portable lifecycle/accessibility and real-machine qualification priority before optional hosted services.

Maestri is a useful interaction reference. Its documentation describes a spatial workspace, manager agents that recruit and connect teammates, isolated floors, and saved team arrangements. Matching those workflows is the baseline. Our proposed differentiation is explicit task state, recoverable execution, traceable evidence, bounded resource use and controlled integration. These are design goals, not claims that Maestri lacks these capabilities or that AgentCanvas already outperforms it.

Reference material checked on 2026-11-13:

- [Maestri introduction](https://www.themaestri.app/en/docs/intro): spatial workspace and installed-agent model.
- [Maestro Mode](https://www.themaestri.app/en/docs/maestro): manager-led recruitment, roles and connections.
- [Floors](https://www.themaestri.app/en/docs/floors): isolated work areas.
- [Partituras](https://www.themaestri.app/en/docs/partituras): reusable team arrangements.
- Installed Maestri CLI skill references: manager, peer messaging and workspace/floor workflows. No Maestri agents or workspaces were created for this document.

## What exists today

| Milestone | Implemented modules                                                               | Acceptance status                                                                          |
| --------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| M0        | Native app foundation, product configuration and desktop shell                    | Implemented; historical platform limits remain                                             |
| M1        | Canvas geometry, navigation, selection, resizing, minimap and layout history      | Implemented; some gesture/DPI checks remain                                                |
| M2        | ConPTY terminals, xterm sessions, bounded output and Windows process ownership    | Implemented; WSL cleanup and full UI load need verification                                |
| M3        | Named workspaces, atomic autosave, backups, validation and restoration            | Implemented; destructive-environment/recovery UI checks remain                             |
| M4        | File-backed Markdown notes and SVG whiteboard                                     | Implemented; large-canvas and some conflict/DPI checks remain                              |
| M5        | Peer links, approval policies, helper CLI, shared notes and session logs          | Implemented; broader shell, approval UI and isolation checks remain                        |
| M6        | Embedded browser pages, navigation, clipping and restricted app IPC               | Implemented; basic smoke confirmed, deeper native UI checks remain                         |
| M7        | Local activity summaries, themes, keyboard controls and Windows packages          | Implemented; basic smoke confirmed, installation/accessibility/load acceptance remains     |
| M8        | Codex/Claude presets, reusable roles, executable detection and explicit launches  | Implemented; basic CLI startup confirmed, authenticated workflow/recovery checks remain    |
| M9        | Durable tasks, cooperative inbox protocol and restart reconciliation              | Implemented; authenticated provider and recovery acceptance remains                        |
| M10       | Managed Git areas, commit-bound review evidence and controlled integration        | Implemented; deeper failure and distribution acceptance remains                            |
| M11       | Bounded team planning, dispatch, independent review, checks and emergency stop    | Implemented; mixed-team fixture fixed and native suite green; deeper qualification remains |
| Extension | Windows editor host, project selection, setup, draft and backend restart recovery | Implemented through VSIX v0.1.4; deeper editor qualification remains                       |

The latest recorded verification (2026-11-21) reports passing `npm run check` with 94 frontend and 37 extension tests, and passing `npm run native:check` with formatting, Clippy, 67 library tests and all enabled native integrations. The mixed-team fixture passes after moving Git validation outside the collaboration lock and refusing stale results; no deadlines were increased. Git Bash also passed separately during WS1. VSIX v0.1.4 includes that fix and WS7 backend recovery: 31 checks passed in each installed editor’s isolated runner, and package contents/checksums match the optimized build. The standalone desktop distribution and deeper release qualification remain outstanding. See [VERIFICATION.md](VERIFICATION.md).

M5 peer sends still type into another terminal. Delivery does not prove that an agent accepted, understood or completed a task; M9 adds a separate cooperative inbox and structured task protocol. Activity labels remain heuristics. Desktop browser nodes display pages and editor browser nodes open the default browser; neither is an agent browser-automation API. Roles and launch presets alone do not provide M11's bounded scheduler.

## Milestone sequence

| Milestone | Outcome                                                     | Depends on                                | Status                                    |
| --------- | ----------------------------------------------------------- | ----------------------------------------- | ----------------------------------------- |
| M9        | Durable tasks and reliable agent communication              | M8; relevant acceptance checks            | Implemented; deeper acceptance pending    |
| M10       | Isolated execution and reviewable Git integration           | M9                                        | Implemented; see verification             |
| M11       | Bounded coordinator and team operations                     | M9 + M10                                  | Implemented; release blockers remain      |
| OS0       | MIT public-source preparation and contributor readiness     | Current source; owner publication gates   | Local preparation; external gates open    |
| OS1       | Qualified Windows public prerelease                         | OS0 + relevant WS2–WS6                    | Planned; acceptance and publication gates |
| M12       | Reusable workflows, project tools and Windows qualification | WS1–WS7; M9–M11                           | Planned; 19 feature items                 |
| M13       | Portable native foundation                                  | WS1 + WS7; M12 data contracts             | Planned                                   |
| M14       | Linux desktop                                               | M13                                       | Planned                                   |
| M15       | macOS desktop                                               | M13                                       | Planned                                   |
| M16       | Linux and macOS editor extensions                           | M13–M15                                   | Planned                                   |
| M17       | Three-platform beta release                                 | M12–M16; current release gates            | Planned                                   |
| M18       | Structured agent conversations and routing                  | M17; documented provider interfaces       | Planned                                   |
| M19       | Project context and durable knowledge                       | M12.2 + M17                               | Planned                                   |
| M20       | Visual workflows and controlled automation                  | M12.1 + M12.4 + M18 + M19                 | Planned                                   |
| M21       | Git delivery and external checks                            | M17 + M20                                 | Planned                                   |
| M22       | Archival, portability and local recovery                    | M19 + M20; existing atomic stores         | Planned                                   |
| M23       | Extensible tools and device automation                      | M12.3 + M13 + M18 + M20                   | Planned; device support gated             |
| M24       | Local packages and optional catalogs                        | M20 + M22 + M23                           | Planned; catalog publication gated        |
| M25       | Remote and container execution                              | M17 + M20–M23                             | Planned; opt-in                           |
| M26       | Shared workspaces and selective synchronization             | M22 + M24 + M25                           | Planned; identity/storage design gate     |
| M27       | Scheduled workflows                                         | M20 + M22; M25/M26 for remote/shared runs | Planned; opt-in                           |
| M28       | Stable cross-platform release                               | M17–M27 for included release scope        | Planned; evidence-based release gate      |

Complete and commit each milestone independently. Split each into the stages below so a large milestone does not hide incomplete behavior. Record executed checks and remaining limits in VERIFICATION.md. Finish M8's relevant launch, persistence and restart acceptance before depending on it for unattended execution.

## M9 — durable tasks and reliable communication

### Deliverables

1. **M9.1: Task model and board.** Add tasks with a user-authored brief, acceptance criteria, dependency IDs, assigned agent, checkout reference, attempt history and artifact references. Provide list/board views linked to canvas nodes, an attention inbox, search and explicit blocked reasons. Reject cycles and invalid transitions.
2. **M9.2: Structured protocol.** Extend the helper with versioned task claim, acknowledgement, progress, result, cancellation and inbox operations. Give every request an ID and every execution an attempt ID. Use acknowledgements, deduplication, bounded mailboxes, leases and explicit delivery errors. Validate capability, workspace, task and process generation on every mutation.
3. **M9.3: Persistence and reconciliation.** Store task metadata separately from layout history using versioned, atomic saves, locking, backups and migration validation. Reload after restart without replaying tasks automatically. Expired or uncertain attempts require reconciliation before reassignment; never silently start a second writer.
4. **M9.4: Provider capability boundary.** Define adapters for launch, readiness, task submission, cooperative status, cancel and optional resume. Show supported/unsupported/unknown per provider and version. Prefer documented structured interfaces where available; keep PTY-only operation explicitly cooperative. Successful typing is only transport delivery. Never infer task success from silence, a prompt or an exit code alone.

### State and data rules

- Task states: `draft -> ready -> running -> review -> done`, with explicit `blocked`, `failed` and `cancelled` transitions. Attempts separately record queued, dispatched, acknowledged, running, interrupted and terminal outcomes. A ready task may remain queued while capacity is unavailable.
- Distinguish process lifecycle, observed activity, agent-reported progress and verified completion in the UI. Every reported state includes source and timestamp.
- Persist only explicit task briefs, structured status and selected artifacts. Do not persist terminal output, command history, credentials, pipe tokens or process handles. Test evidence should reference an intentional artifact or a structured check record; raw logs require a separately designed opt-in policy.
- Provider resume identifiers, if supported, are opaque references, not saved terminal sessions. Relaunch remains explicit. A workspace switch stops active processes and leaves their tasks interrupted for reconciliation.
- Keep existing M5 peer messages and approvals compatible. Task control messages must not turn arbitrary terminal text into privileged application operations.

### Acceptance gate

- A user can create a task, assign it to either provider, see acknowledgement, receive a structured result and accept or reject it.
- Tests cover cycle detection, stale generation writes, duplicate requests/results, lost acknowledgements, lease expiry and cancellation racing completion.
- Kill/restart at each dispatch boundary: task metadata recovers, processes do not survive app shutdown, and an ambiguous attempt is never automatically duplicated.
- A fake cooperative agent verifies the protocol deterministically; real Codex and Claude smoke checks verify the supported adapter path separately.

## M10 — Git isolation, evidence and integration

### Deliverables

1. **M10.1: Execution areas.** Add task areas analogous to floors, each with a canvas/layout scope, managed checkout and branch. Use Git worktrees by default; show repository, base commit, branch and absolute directory before launch. Non-Git or shared-directory execution must be explicitly labeled and must not imply isolation.
2. **M10.2: Safe provisioning.** Validate repository ownership, paths and refs. Run Git with argument vectors. Handle dirty source trees, existing branches/worktrees, linked worktrees, long Windows paths and files in use. Do not copy ignored secrets, dependencies or local settings by default. Show an explicit allowlist for optional bootstrap files and scripts.
3. **M10.3: Review surface.** Add bounded file/diff browsing, changed/untracked file lists, test-check records, reviewer findings and a task-to-commit trail. Mark checks as passed, failed, not run or stale. Bind evidence to the exact reviewed commit; new changes invalidate approval and checks as appropriate.
4. **M10.4: Integration lifecycle.** Provide preview, conflict detection and an explicit integration action into a chosen target branch. Revalidate source/target heads, cleanliness and evidence immediately before integrating. Preserve rejected/conflicted work. Cleanup is a separate operation, refuses dirty/untracked work and active users, and checks canonical paths and Git ownership before removing anything.

### Acceptance gate

- Two agents modify the same relative filename in separate task areas without changing each other's checkout or the user's main working tree.
- Clean integration succeeds; conflicts, dirty targets, stale approvals and moved branch heads produce actionable refusals without lost changes.
- Crash during create/integrate/cleanup leaves a recoverable operation record and discoverable branches/worktrees. Startup reconciliation never deletes unknown directories.
- Windows tests cover spaces, Unicode, junction/reparse escapes, locked files and process shutdown. A worktree is code isolation, not an OS security sandbox.

## M11 — coordinator and bounded team execution

### Deliverables

1. **M11.1: Planning and dispatch.** Add an optional coordinator role that proposes a task dependency graph and agent assignments. Users can edit the plan and choose manual dispatch or scoped automatic execution. The native scheduler owns state transitions; model output is an untrusted proposal.
2. **M11.2: Team lifecycle.** Discover existing agents before launching more. Support recruit/reuse, role assignment, replacement while retaining node connections, explicit stop and task handoff. Preserve the M8 launch snapshot rules. Reassigning work first reconciles and stops the old attempt.
3. **M11.3: Scheduler limits.** Add concurrency, queue, retry, elapsed-time and iteration limits, with backoff and a visible stop reason. Default to a small team and independent tasks. Prevent dependency deadlocks, recursive recruitment, duplicate writers and repeated reviewer/implementer loops. Resume a paused run only through a user action.
4. **M11.4: Authority and feedback.** Separate permissions for messaging, launching agents, provisioning checkouts, running declared checks and integrating changes. A peer link does not grant coordinator powers. Add a local decision/event timeline, attention notifications, pause-dispatch, cancellation and emergency stop. Stop must explain any process or operation still shutting down.
5. **M11.5: Review and budgets.** Provide builder -> independent reviewer -> checks -> user acceptance workflows, with explicit revision loops. Track agent count, runtime and retries. Display cost/token usage only when a provider supplies reliable data; show unknown otherwise. Do not promise a hard monetary cap for an opaque subscription CLI.

### Acceptance gate

- Run a repository fixture with three tasks: two independent changes execute concurrently; their dependent integration waits for both accepted outputs.
- A reviewer rejection returns work to a bounded revision cycle. A blocked worker alerts the user without recruiting replacements indefinitely.
- Failure injection covers an unresponsive coordinator, agent crash, stale heartbeat, exhausted budget, permission revocation and restart. Work stops or becomes visibly blocked with no duplicate execution.
- Terminal bytes, browser content and peer text cannot grant capabilities, approve their own changes or bypass an integration gate.
- An end-to-end run works with a mixed Codex/Claude team. Human users can perform the same task flow without a coordinator.

## M12 — reusable workflows, project tools and release qualification

Status: planned and unimplemented; implementation requires a separate request. The [feature checklist](PROJECT-STATUS.md#m12-planned-future-features-19-items) expands M12.1–M12.4 into 19 tracked items. M12.5 shares release acceptance work with WS1–WS6 and must not be double-counted; the editor also needs WS7. Existing project selection, setup and recovery are foundations, not completion of this milestone. M12 qualifies the Windows workflow; M13–M17 carry it to Linux and macOS.

### Deliverables

1. **M12.1: Team templates.** Save/import/export role snapshots, team topology, task patterns, note templates, area requirements and layout. Preview changes before insertion, remap IDs, detect missing providers, and validate schema/paths. Exclude credentials, runtime output and handles. Importing a template must not launch processes, execute setup scripts or initiate network requests.
2. **M12.2: Project context and tools.** Add a bounded local file tree, file preview, scoped search, named shared documents and discoverable helper/API documentation. Exclude secret/build/dependency paths by default; resist traversal and reparse escapes. Shared context uses revision checks and provenance. Task briefs and retrieved files remain distinct from trusted application policy.
3. **M12.3: Scoped browser capability.** Design a separate opt-in browser automation boundary for explicitly connected agents: navigation, snapshot, screenshot and basic interaction, with revocable permissions and bounded results. Validate command inputs and allowed destinations; remote pages receive no native app privileges. Sensitive submissions and downloads need separately defined policy. Embedded browsing alone does not satisfy this deliverable.
4. **M12.4: Workflow experience.** Ship bug-fix, feature-build and review templates; show goal, task board, active agents, review evidence and next required action together. Add keyboard navigation, onboarding, actionable errors and documented cancellation/recovery behavior. Local notifications are useful; no cloud account is required.
5. **M12.5: Qualification.** Close the relevant M5–M8 acceptance gaps and run the new orchestration failure suite. Rebuild optimized portable and installer artifacts from the final source. Verify clean Windows 10/11 install, upgrade, uninstall/data preservation, WebView2 prerequisites and signing/distribution behavior. Publish measured capacity and supported provider/version combinations.

### Acceptance gate

- A new user can choose a template, configure installed providers, inspect the plan, run an isolated task, review its diff/checks and integrate it without manually repairing configuration files.
- Export/import into another workspace remaps references correctly and stays paused until execution is explicitly requested.
- Browser tool permission denial and malicious-page cases are exercised in live WebView2, alongside native command-boundary tests.
- Benchmark 20 live terminals, including four concurrent task attempts and four browser pages, on a named reference machine. Record CPU, memory, input latency, pan/zoom frame times and behavior during at least 30 minutes of noisy output. Set and document release thresholds before declaring this gate passed; reduce the advertised capacity if necessary.
- Record authenticated provider smoke checks, full keyboard/DPI checks and clean-machine package results. Automated tests alone cannot close these desktop acceptance gates.

## Delivery strategy and platform targets

WS1's native team-fixture failure and WS7's backend recovery gap are resolved. Complete the remaining Windows qualification and, when authorized, M12's local workflow contracts, then port the underlying runtime before adding more automation. M14 and M15 can be developed independently after M13, but both need their own real-machine acceptance. M17 is a usable beta checkpoint; users do not have to wait until M28 to get a qualified three-platform core.

| Platform | Initial target to qualify                                                                  | Distribution plan                                                              | Acceptance condition                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows  | Current Windows x64 support matrix, reviewed against runtime/vendor support before release | Portable ZIP, NSIS/MSI and win32-x64 VSIX                                      | Existing WS1–WS7 evidence plus regression coverage for every shared change                                                                                 |
| Linux    | One named maintained Ubuntu LTS baseline on x86_64; exact release selected in M13          | DEB and AppImage first; RPM and ARM64 after their own qualification            | Native PTY, permissions, filesystem recovery and desktop behavior on the declared baseline; test Wayland and X11 or state the supported session explicitly |
| macOS    | Apple Silicon first; minimum supported macOS release selected in M13                       | App/DMG and darwin-arm64 VSIX; Intel/universal builds only after Intel testing | Native process cleanup, application launch environment, keyboard/UI behavior, signed distribution and notarization                                         |

These are target decisions, not current compatibility claims. Linux ARM64, macOS Intel and Windows ARM64 require representative hardware/runners and provider availability before being advertised. Choose minimum OS, native webview/runtime and editor versions using the vendor support information current at implementation time; do not infer support from a successful compile.

Keep one shared canvas/task/review model and introduce narrow native platform interfaces for process ownership, IPC, executable resolution, filesystem rules and browser capabilities. Persist portable intent separately from machine-specific paths and shell choices. Opening a workspace on another OS must preview required path/provider mappings and leave agents paused. Browser capabilities may differ by host; show an explicit supported action or fallback rather than claiming embedded-browser parity.

Every milestone below needs reviewed scope, bounded data/queues, appropriate automated checks, an actual run on each affected supported platform, recorded limitations and a milestone commit. Feature flags stay off for unqualified capabilities. Optional network, device, catalog and shared-workspace features require explicit setup; imports and workspace reopening remain inert.

## M13 — portable native foundation

**Outcome:** platform contracts that can support the existing task workflow without weakening Windows behavior. **Depends on:** WS1, WS7 and M12's persistence/capability contracts; the Unix feasibility spike can start before the rest of M12 is finished.

### Deliverables

1. **M13.1: Runtime interfaces.** Extract process ownership, PTY lifecycle, local IPC, shell/home/config discovery, agent resolution and native capability reporting. Audit `.exe`, Windows environment names, path comparison and generated package paths across Rust, UI, helpers and build scripts. Retain the current `portable-pty` integration where it satisfies the platform contract.
2. **M13.2: Process ownership prototype.** Design Linux and macOS supervision for shells, helpers, declared checks and descendants. Exercise normal close, backend EOF, parent crash, force termination, blocked writes and spawn/stop races. Process groups alone do not prove cleanup of detached descendants. If ownership cannot satisfy the application-lifetime requirement, block that platform/launch mode pending a design decision; do not silently relax it.
3. **M13.3: Unix local transport.** Add a local transport equivalent to the current named pipe, with a private per-user runtime directory, restricted socket access, peer-identity checks where available, process-generation validation and bounded framing. No TCP fallback or persisted capability tokens.
4. **M13.4: Portable storage and CI.** Specify case sensitivity, symlinks/reparse points, executable permission, Unicode, atomic replacement, locks, backup and directory-flush behavior per OS. Separate host paths from portable workspace references, version migrations and add Linux/macOS native build/test jobs with explicit runner requirements.

### Acceptance gate

- Windows checks remain green; native Unix builds and protocol/storage fixtures run on both Unix targets. Shared fixtures reject stale peers, cross-user access, invalid paths and unsupported schemas.
- A disposable shell and its supported descendants terminate after each ownership-failure scenario on Linux and macOS. Missing containment is a release blocker, not a passing limitation hidden by a timeout.
- Record the minimum supported OS/runtime matrix and architecture decisions before M14/M15 claim runtime support.

## M14 — Linux desktop

**Outcome:** the complete local canvas-to-review workflow on a qualified Linux baseline. **Depends on:** M13.

### Deliverables

1. **M14.1: Native shells and agents.** Support detected Bash/Zsh and explicit executable selection, environment inheritance, resize, Unicode input, clipboard, TUI rendering and cancellation. Resolve installed Codex/Claude executables without Windows package assumptions or shell interpolation.
2. **M14.2: Linux persistence and Git.** Qualify managed worktrees, file modes, symlink/traversal refusal, case-sensitive paths, locks, autosave, corruption recovery and suspend/resume. App data and runtime IPC use documented user-owned locations.
3. **M14.3: Desktop experience.** Qualify focus, shortcuts, accessibility, themes, notifications, scaling and the declared display-server sessions. Expose only tested browser capabilities; provide an explicit external-browser action while native embedding/automation is unqualified.
4. **M14.4: Installable builds.** Produce architecture-labeled packages and manifests with declared native runtime dependencies. Test DEB and AppImage install/launch/update/removal on clean machines without development tools. Additional formats and architectures need separate matrix rows.

### Acceptance gate

- An authenticated supported provider and deterministic mixed-team fixtures complete create → isolated task → review → checks → acceptance → integration on Linux; restart leaves uncertain work blocked and agents paused.
- Native PTY/descendant cleanup, IPC permission tests, save failure recovery and the declared display/runtime matrix pass. A clean installed package runs the workflow; Linux support is not inferred from a Windows or headless run.

## M15 — macOS desktop

**Outcome:** the same local workflow with native macOS behavior and a distributable application. **Depends on:** M13; independent of Linux feature completion.

### Deliverables

1. **M15.1: Native shells and agents.** Support Zsh/Bash and explicit executable paths, including application-launch versus terminal-launch environment differences. Qualify provider detection on Apple Silicon and any separately supported Intel target.
2. **M15.2: Lifecycle and storage.** Qualify ownership after crashes, sleep/wake, closing the last window and app quit. Test APFS path/case behavior, symlink boundaries, permissions, locking, atomic replacement, backups and Git worktree cleanup.
3. **M15.3: Native interaction.** Implement consistent Command/Control shortcuts, menus, clipboard, focus, input methods, Retina scaling, accessibility, notifications and theme changes. Preserve terminal-specific key handling. Report browser capability differences explicitly.
4. **M15.4: Application packaging.** Build an architecture-correct App/DMG including helpers. Document signing identities, helper signing, entitlements and notarization. Protect release credentials outside workspace data; require an explicit signing setup before public distribution qualification.

### Acceptance gate

- Run the full task/review/integration and recovery fixture on a real Apple Silicon Mac, plus each additional advertised architecture. Test both Finder-launched and terminal-launched builds.
- A downloaded signed/notarized candidate starts on a clean supported Mac, keeps helper/process ownership intact and preserves workspace data across upgrade/removal. Development ad-hoc signing is not public-release evidence.

## M16 — Linux and macOS editor extensions

**Outcome:** the shared canvas in supported local VS Code/Antigravity installations on all three operating systems. **Depends on:** M13–M15.

### Deliverables

1. **M16.1: Native sidecar packages.** Package the correct backend/helpers per target, including Unix executable modes, target metadata and architecture checks. Add linux-x64 and darwin-arm64 packages first; add other platform targets only with matching native evidence.
2. **M16.2: Host behavior.** Port project selection, executable/folder pickers, setup, reviewed-file opening, save/close, recovery and backend restart. Handle each host's environment without assuming a Windows `.exe` or inherited terminal PATH.
3. **M16.3: Trust and ownership.** Preserve workspace-trust gates, fixed RPC permissions, stdio bounds and generation isolation. Closing/reloading/disabling the extension stops the sidecar and descendants; hiding a canvas tab preserves live processes.
4. **M16.4: Editor compatibility matrix.** Verify packaged install/update/disable/removal in each available supported editor/OS combination. Record actual editor and API versions. Keep browser nodes as explicit external-browser actions in editor webviews.

### Acceptance gate

- Installed VSIX builds pass the project/setup/recovery/restart/task/review smoke flow on every advertised local target, without Rust/Node development tools or the standalone app installed.
- Wrong-architecture packages fail clearly; untrusted workspaces start no backend. Remote editor hosts and virtual filesystems remain separately gated by M25 rather than being implied by local extension support.

## M17 — three-platform beta release

**Outcome:** a usable, qualified local product on Windows, Linux and macOS. **Depends on:** M12–M16 and WS1–WS7.

### Deliverables

1. **M17.1: Parity matrix.** Publish capability rows for canvas, terminals, notes, tasks, teams, review, recovery, browser actions and editor hosting. Identify each OS/architecture, minimum version and known limit; unsupported controls offer actionable explanations.
2. **M17.2: Native release pipeline.** Build/package on the correct hosts, retain manifests/checksums/provenance, verify bundled helpers and licenses, and define signing/upgrade/rollback policy. macOS distribution includes signing/notarization; Windows signing and Linux package provenance have explicit release decisions.
3. **M17.3: Platform qualification.** Run fresh-user onboarding, authorized provider tasks, manual planning, mixed teams, cancellation, recovery, accessibility and installer lifecycle on the declared matrix. Resolve the prerelease xterm dependency/reproducible-install issue before promoting packages.
4. **M17.4: Capacity and support.** Measure CPU, memory, input latency, frame times and shutdown on named machines, including the existing 20-terminal/four-task/four-page target where those capabilities exist. Set thresholds first and advertise only passing capacity. Provide local diagnostics export with preview and sensitive-data exclusions.

### Acceptance gate

- A fresh user on each OS completes an isolated task and controlled integration using installed artifacts, and can stop/recover the run without terminal-output persistence or an AgentCanvas account.
- No release-blocking lifecycle, corruption, authority or fixture failures remain. Platform-specific UI/runtime failures cannot be waived by passing shared unit tests. Publish beta artifacts only after the release action is authorized.

## M18 — structured agent conversations and routing

**Outcome:** a readable conversation surface without losing native CLI access or inventing provider state. **Depends on:** M17 and validated provider interfaces.

### Deliverables

1. **M18.1: Provider contracts.** Version adapters for documented structured events, submission, approval, cancellation and optional resume. Test each supported provider/version; retain a terminal-based path when a provider lacks a reliable interface. Show token/cost data only when a documented source provides reliable values; otherwise retain elapsed-time/retry limits and unknown monetary usage. Do not build chat by guessing from ANSI output or reading credential stores.
2. **M18.2: Conversation UI.** Show user messages, structured responses, tool activity, approval requests and errors with source/time. Link to the native terminal and current task. Distinguish transport delivery, provider acknowledgement and accepted task completion.
3. **M18.3: Routing and mentions.** Route `@agent`/task/document references only to explicitly connected authorized recipients. Preview recipients and shared context; bound groups, message sizes and queues. Mentions never grant launch, filesystem, check or integration capabilities.
4. **M18.4: Privacy and recovery.** Keep conversation/terminal streams session-only under current policy. Persist only intentionally saved task briefs, notes and selected evidence references. Shared provider credentials do not create per-person privacy boundaries. Provider resume, where validated, stays explicit and distinct from workspace restoration.

### Acceptance gate

- Run structured input, approval, long-tool heartbeat, interrupt, crash and stale-generation scenarios with every advertised provider. Unsupported status/resume capabilities display as unavailable or unknown.
- A routed message reaches only authorized recipients; revocation prevents later sends. Reopening an AgentCanvas workspace does not restore a stored chat transcript or silently resume provider work.

## M19 — project context and durable knowledge

**Outcome:** agents find relevant project information with bounded, inspectable context. **Depends on:** M12.2 and M17.

### Deliverables

1. **M19.1: Local indexing.** Incrementally index selected project files with ignore rules, size/type limits, cancellation and CPU/memory budgets. Exclude secrets, dependency/build directories and out-of-root links by default; make the selected scope visible.
2. **M19.2: Retrieval and citations.** Search code/docs and assemble context with path, source revision and line references. Preview what will be shared and report stale/deleted sources. Provider context budgets use reliable capability data; unknown limits stay visible.
3. **M19.3: Reviewed project knowledge.** Add named runbooks, architecture/decision notes and project instructions with provenance, revision checks and explicit save/accept actions. Agent suggestions remain proposals; files and retrieved content cannot overwrite trusted policy.
4. **M19.4: Index lifecycle.** Rebuild, invalidate, pause and delete indexes safely across branch changes, worktrees and moved projects. Prefer lexical/local retrieval first; semantic indexing needs measured benefit, a storage design and explicit provider/network consent if external services are used.

### Acceptance gate

- On a named large-repository fixture, relevant files can be found within declared latency/resource bounds; ignored secrets and files outside the selected roots do not enter the index or sent context.
- Branch changes, renames, simultaneous note edits and index corruption preserve source files and produce accurate stale-source/conflict states. Knowledge saving does not capture terminal output or conversation history.

## M20 — visual workflows and controlled automation

**Outcome:** repeatable workflows beyond a one-off task graph, with explicit control at every consequential stage. **Depends on:** M12.1, M12.4, M18 and M19.

### Deliverables

1. **M20.1: Workflow model and editor.** Define versioned steps for planning, tasks, independent review, declared checks, bounded revision and human approval. Provide a visual editor, validation and a dry-run preview of dependencies, required roles, areas and permissions.
2. **M20.2: Reusable execution.** Instantiate bug-fix/feature/review flows with parameter validation, ID remapping and immutable run snapshots. Editing a template does not alter an active run. Model-generated changes require validation/adoption.
3. **M20.3: Scoped automation.** Extend native scheduling to explicitly authorized member recruitment, task dispatch and declared checks within adopted scope. Keep independent-review and exact-commit integration gates. Enforce aggregate concurrency, time, retries and nested-workflow limits; reconcile old attempts before handoff.
4. **M20.4: Attention and recovery.** Show the current step, next action, blocked reason and decision timeline. Support pause, cancel, emergency stop and explicit reconciliation/resume. Never restart a workflow from a saved template or reopened workspace alone.

### Acceptance gate

- Execute deterministic success, reviewer rejection, check failure, permission revocation and crash-at-each-step fixtures without duplicate writers or unbounded loops. The same workflow remains operable manually.
- A novice can preview and run a template, resolve a blocked step and integrate only the accepted commit. A workflow cannot broaden its own capabilities, overwrite user changes or reset exhausted budgets.

## M21 — Git delivery and external checks

**Outcome:** a reviewed result can move cleanly from local worktree to the user's chosen delivery path. **Depends on:** M17 and M20.

### Deliverables

1. **M21.1: Target selection and review.** Add explicit target branch/ref selection with freshness/cleanliness checks, changed-file navigation and commit-bound review/check history. Preserve conflicted work and provide clear recovery actions; never discard dirty work automatically.
2. **M21.2: Controlled Git actions.** Add reviewed commit/fetch/push operations using argument vectors, separate network/write permissions and exact repository/ref scope. Preserve the existing restrictions around untrusted hooks, filters and merge drivers until individually designed and tested.
3. **M21.3: Optional issue/PR integration.** Link a task to a selected issue and prepare branch/PR metadata, review requests and CI status through explicit configured connectors. Preview external writes and use provider/OS credential facilities; keep credentials out of templates, workspace files and diagnostics.
4. **M21.4: Evidence integrity.** Bind external CI/check results to the exact commit, run ID, source and time. Separate reported CI status from locally executed checks and human approval; moved heads invalidate affected evidence.

### Acceptance gate

- Exercise clean delivery, dirty targets, conflicts, branch movement, denied credentials, cancelled network requests and stale/forged check reports using disposable repositories and mocked connectors before authorized live runs.
- The approved commit alone is delivered to the selected destination. A failed push/PR action remains visible and retryable without duplicate delivery or a false success state.

## M22 — archival, portability and local recovery

**Outcome:** long-running projects can retain useful structured evidence without filling live stores or collecting transcripts. **Depends on:** M19, M20 and existing atomic persistence.

### Deliverables

1. **M22.1: Task/run archives.** Archive completed tasks, attempts, decisions and selected evidence references with explicit retention, bounded indexes and paginated search. Keep active/uncertain work out of destructive archival operations and preserve referential integrity.
2. **M22.2: Export and import.** Preview/export selected workspace metadata, notes, templates and archives. Validate schemas, remap identities and detect conflicts on import. Exclude credentials, handles, terminal output, command history and provider transcripts; artifacts need explicit selection.
3. **M22.3: Backup and migration.** Add user-controlled local backups, migration previews and restore-as-copy across OSes. Require host path/provider/shell remapping rather than silently running saved Windows settings on Unix. Preserve originals and last-good copies.
4. **M22.4: Storage controls.** Show store sizes, archive limits and explicit delete/export actions. Handle missing artifacts, unavailable disks and interrupted compaction. Any future database adoption needs a measured need and equivalent atomicity, backup, validation and corruption recovery.

### Acceptance gate

- A project exceeding the live-task capacity can archive completed work and continue without losing evidence links. Crash/failure injection during archive, migration and restore preserves the original valid state or a recoverable copy.
- Windows → Linux → macOS round-trip import retains portable intent and notes, requires invalid host paths to be mapped and starts no agents. Export inspection confirms excluded data is absent.

## M23 — extensible tools and device automation

**Outcome:** agents can use explicitly configured external tools through the same native authority model. **Depends on:** M12.3, M13, M18 and M20.

### Deliverables

1. **M23.1: Tool registry.** Add versioned local tool definitions and an MCP integration boundary with schemas, capability scopes, timeouts, cancellation, bounded responses and source attribution. Prefer local stdio; network endpoints require explicit configuration and authentication design.
2. **M23.2: Native enforcement.** Apply filesystem, process, browser and network permissions at invocation and before recording effects/evidence. Treat tool descriptions/results as untrusted input. A tool cannot grant itself permissions, accept its own result or inject a privileged command through a text reply.
3. **M23.3: Portable browser tools.** Carry M12 browser navigation/snapshot/screenshot/interaction contracts to qualified hosts, separating display surfaces from automation backends. Show destination scope, revocation and unsupported capabilities; sensitive submissions/downloads remain policy-gated.
4. **M23.4: Device tools.** Add an opt-in Android emulator path for bounded screenshots/accessibility inspection, taps, text entry and app launch. Reuse an explicitly selected existing device/emulator; no automatic SDK/image downloads or permission prompts. Evaluate an iOS Simulator adapter on macOS only after an available documented interface and lifecycle model are proven.

### Acceptance gate

- Mocked tool contracts and authorized real local tools cover malformed/large replies, timeout, revocation, cancellation, malicious content and helper death without authority escalation or abandoned app-owned processes.
- Demonstrate browser and Android test flows on each advertised host. Device support needs an explicit compatibility matrix and stop/disconnect behavior; iOS support is not implied by the Android or macOS milestone.

## M24 — local packages and optional catalogs

**Outcome:** workflows and tool configurations can be reused without making a marketplace or account mandatory. **Depends on:** M20, M22 and M23.

### Deliverables

1. **M24.1: Package format.** Bundle declarative workflows, roles, note/context templates and tool requirements with version, compatibility, provenance, license and content hashes. Keep secrets, local absolute paths, output and runtime state out of distributable packages.
2. **M24.2: Installation lifecycle.** Preview permissions and changes before import/install; detect missing providers and incompatible versions. Support local file import, pinned versions, update preview, rollback and removal while preserving user data and active-run snapshots.
3. **M24.3: Execution boundary.** Start with declarative packages. Executable tools remain separately configured local commands with explicit trust and capabilities; do not describe a worktree or third-party tool as a security sandbox.
4. **M24.4: Optional discovery.** Add a user-initiated curated catalog only after package integrity, publishing ownership and abuse/update policy are defined. Cache descriptions for offline use; no background fetching, runtime CDN dependency, automatic installation or required AgentCanvas account. A broader public marketplace is a gated extension of this design.

### Acceptance gate

- An offline package can be inspected, imported, used, upgraded and removed without process launch on import or loss of existing data. Reject tampered packages, traversal, unsupported schemas and undeclared executable requirements.
- Catalog outages leave local workflows usable. No listing or package update can silently add capabilities, replace an active run's definition or enable unsolicited network access.

## M25 — remote and container execution

**Outcome:** selected tasks can run in explicit remote/development environments while the local canvas remains the control surface. **Depends on:** M17 and M20–M23.

### Deliverables

1. **M25.1: Execution hosts.** Define host identity, filesystem roots, supported runtime/provider capabilities and path ownership separately from the local workspace. Begin with one documented SSH host path and one supported container workflow; treat WSL/remote editor hosting as explicit matrix entries.
2. **M25.2: Transport and credentials.** Use configured SSH/OS authentication facilities and argument vectors without reading/copying private keys into workspace data. Authenticate both endpoints, scope every action to a host/run/generation and bound messages, retries and reconnect attempts.
3. **M25.3: Remote supervision.** Design a remote supervisor with expiring execution authority, stop acknowledgement and orphan reconciliation. Loss of the application/connection must stop owned work within a declared lease bound; if that contract cannot be enforced, the execution mode is unsupported. A lease-bound remote shutdown changes today's strict application-lifetime contract and needs an explicit recorded scope decision before remote execution is enabled. Reconnect cannot blindly replay a command or create a second writer.
4. **M25.4: Remote editor and review.** Run the sidecar on the declared workspace host, validate paths there and fetch only explicitly selected bounded evidence for local review. Qualify supported remote editor/virtual filesystem schemes individually rather than treating arbitrary URIs as local paths.

### Acceptance gate

- Inject dropped/reordered connections, local crash, remote crash, lease expiry, changed host keys and stop during provisioning. Remote processes terminate within the published bound; uncertain writes stay blocked until reconciled.
- A task can be created, reviewed and explicitly integrated using the chosen remote/container fixture without leaking local credentials, crossing host roots or modifying the wrong checkout. Offline local work remains usable.

## M26 — shared workspaces and selective synchronization

**Outcome:** distinct people can coordinate on selected project state with clear identity, ownership and privacy. **Depends on:** M22, M24 and M25. Identity, storage and data policy are explicit design gates.

### Deliverables

1. **M26.1: Sharing model.** Define separate user/device identities, invitation/revocation and roles for viewing, proposing, executing, reviewing and integrating. A shared provider login is not a collaboration identity or a per-person privacy boundary. Keep AgentCanvas's local mode account-free.
2. **M26.2: Single execution authority.** Design a host-authoritative event/lease model so only one controller can dispatch a task or own a checkout. Handle simultaneous edits, disconnected users and stale approvals without last-writer-wins task execution or duplicate work.
3. **M26.3: Selective sync.** Let users preview which notes, task records, templates and evidence references are shared. Exclude provider transcripts, terminal output, command history, secrets and host-local paths. Define conflict resolution, encryption/key ownership, retention, export and deletion behavior before enabling remote storage.
4. **M26.4: Service boundary.** Start with explicitly configured authenticated/self-hosted collaboration. Store any required long-lived credentials in approved OS credential facilities, never workspace files. Hosted cloud sync or application accounts require a separate product/privacy decision, remain optional and cannot become prerequisites for local use.

### Acceptance gate

- Two distinct users on different supported OSes edit selected state and propose/execute/review work without duplicate dispatch. Exercise revocation mid-action, conflicts, disconnects, delayed messages and ownership recovery.
- Unauthorized identities cannot read shared content or use another user's execution capabilities. Export/delete and key-loss recovery follow the documented policy. Synchronization does not replay tasks after restart or upload excluded history.

## M27 — scheduled workflows

**Outcome:** explicit recurring work with bounded execution and predictable missed-run behavior. **Depends on:** M20 and M22; remote/shared schedules additionally require M25/M26.

### Deliverables

1. **M27.1: Schedule model.** Configure a selected immutable workflow version, parameters, timezone, recurrence, owner, scope and next occurrence. Preview upcoming times, including daylight-saving changes, and bind the schedule to specific permissions/budgets.
2. **M27.2: Bounded triggering.** Require explicit arming. Default to an open running application and skip missed occurrences; offer an explicit catch-up choice rather than replaying a backlog. Prevent overlap, duplicate triggers and unbounded accumulated queues.
3. **M27.3: Recovery and control.** Provide run-now, pause, disarm, next-run visibility, local notifications and per-run evidence. App crash, workspace reopen, changed permissions, missing providers or changed templates disarm/block pending work until reviewed; saved schedules alone never restart execution.
4. **M27.4: Optional remote scheduling.** A remote trigger requires a configured supervised host, an identified owner and lease/cancellation guarantees. Background services or start-at-login behavior need a separate explicit enablement and lifecycle design; they are not silently installed.

### Acceptance gate

- Deterministic clock fixtures cover timezone/DST changes, clock adjustments, sleep/wake, crashes, workspace switching, duplicate delivery and overlapping schedules with no duplicate task execution.
- A revoked or exhausted schedule stops visibly. Reopening the app does not execute missed runs, and local scheduling requires neither cloud connectivity nor an AgentCanvas account.

## M28 — stable cross-platform release

**Outcome:** a supported stable release with measured reliability, clear compatibility and maintainable delivery. **Depends on:** M17–M27 for the features selected for inclusion; deferred deliverables require an explicit recorded scope decision and remain open rather than being marked implemented.

### Deliverables

1. **M28.1: Release scope and compatibility.** Freeze included features, OS/architecture/editor/provider matrices, minimum runtimes, data schemas and migration policy. Mark optional modules by capability and maturity; do not advertise unqualified targets or future marketplace/device/cloud behavior.
2. **M28.2: Reliability and authority.** Run repeated deterministic/failure suites plus authorized real-provider workflows across the supported matrix. Cover process cleanup, corruption, backup/migration, permission revocation, malicious content, remote loss and shared/scheduled duplicate prevention where enabled. Explain flaky failures by root cause rather than increasing deadlines until they pass.
3. **M28.3: Performance and usability.** Publish capacity and latency thresholds on named machines, long noisy-output soaks, index/archive limits and end-to-end task acceptance time. Verify keyboard/screen-reader/contrast/reduced-motion/scaling behavior and onboarding with fresh users. Record interventions and failures, not only successes.
4. **M28.4: Distribution and maintenance.** Produce verified signed/notarized artifacts as appropriate, checksums, manifests and dependency/license inventories from identified source. Test upgrade, interrupted migration, compatible rollback and uninstall/data preservation. Document manual updates, security reporting and support policy; any automatic updater requires a separate explicit network/consent design.

### Acceptance gate

- Every advertised desktop and editor target passes the installation → setup → task → review → integration → stop/recovery journey using final artifacts. Required native, UI, provider and distribution evidence is recorded before a stable tag/publication is authorized.
- No known release-blocking data-loss, orphan-process, authority or duplicate-execution defect remains. Capacity claims match measurements; optional module failures cannot corrupt the core. A local workspace still works without an AgentCanvas account, telemetry or service dependency.

## Architecture and implementation boundaries

The following table originated in the M9–M12 proposal. Task, area, review and orchestration modules now exist; future template/context and platform interfaces should build on them rather than duplicate authoritative state. Extract modules only where the platform/tool boundary needs it.

| Responsibility                        | Proposed home                                        | Rule                                                               |
| ------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| Task model and state-machine tests    | `src/tasks/`, `src-tauri/src/tasks.rs`               | Rust owns authoritative durable transitions; UI renders snapshots  |
| Structured inbox and capabilities     | Existing `ipc.rs`, `collaboration.rs`, helper binary | Preserve bounded same-user transport and process-generation checks |
| Provider capabilities and submission  | `src-tauri/src/agents/` or extracted adapters        | No shell interpolation; no assumed status from terminal scraping   |
| Checkout provisioning and integration | `src-tauri/src/areas.rs`, `src/areas/`               | Native validation, exact refs and recoverable operations           |
| Dispatch, leases and resource policy  | `src-tauri/src/orchestrator.rs`                      | Deterministic policy; coordinator proposes actions                 |
| Review and check records              | `src/review/`, native validated records              | Bind findings/checks/approval to commit and attempt                |
| Templates and context                 | `src/templates/`, `src/context/`                     | Versioned data, explicit launch and bounded filesystem access      |

The current task/run snapshot keeps related transitions in one atomic store; managed Git operations have recoverable intent records. Preserve those transaction boundaries while adding features. Evaluate SQLite only if measured task/event volume or multi-record transactions require it, with equivalent migration, backup and recovery design. Do not scatter authoritative task state across layout JSON, notes and provider transcripts.

Durable task events are separate from M5's session-only transport logs. Record structured decisions and references, not raw message payloads or terminal streams. Apply size limits, retention and explicit user deletion/export to new stores. Any future expansion of stored content requires a documented privacy decision.

## What would make this better in practice

Use reproducible scenarios rather than feature counts or an unsupported superiority claim. Run the same fixture, provider versions and task budgets against a manual single-agent baseline and, where available, a comparable Maestri workflow. Record human intervention and failures as well as successes; use repeated trials because model behavior varies.

| Desired advantage        | Evidence to collect                                                  |
| ------------------------ | -------------------------------------------------------------------- |
| Trustworthy progress     | Reported completion versus accepted checks; false completion count   |
| Reliable recovery        | Interrupted runs reconciled; duplicate attempts and lost work        |
| Useful parallelism       | Accepted-task elapsed time, review defects and integration conflicts |
| Predictable resource use | Concurrent sessions, runtime, retries and provider-reported usage    |
| Clear human control      | Time to locate blocked work, cancel it and inspect the proposed diff |
| Reusable workflows       | Successful setup from a fresh workspace without manual repair        |

The target is fewer coordination mistakes and faster accepted changes, while preserving understandable behavior. More agents do not by themselves improve the result.

## Priorities and exclusions

Resolve current release blockers first, then build on M9 tasks, M10 isolation and M11 bounded authority. M12 provides reusable workflows; M13–M17 establish a qualified three-platform base before the richer M18–M24 features. M25–M27 add optional operational capabilities after their trust/lifecycle designs pass. Milestone numbers express delivery order, not permission to skip acceptance gates; independent prototypes may overlap after their dependencies are stable.

Linux/macOS, remote execution, device tools, package discovery, collaboration and schedules now have planned milestones above; none is implemented by this documentation change. Hosted cloud sync/accounts and a public marketplace remain gated product decisions within M26/M24. No required accounts, telemetry, runtime CDN dependency, unsolicited network traffic or transcript persistence are introduced by the plan. Provider/network actions remain explicit user-authorized execution through configured tools.

### Decisions that can block delivery

| Decision or risk                                                                | Resolve in             | Required evidence                                                                                       |
| ------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------- |
| Unix and remote process ownership may not match Windows kill-on-close semantics | M13–M15, M25           | Force-kill, detached-descendant, stop-race and lease-expiry prototypes; block unsupported modes         |
| Native browser and editor hosts expose different capabilities                   | M13–M17, M23           | Per-host feature matrix, malicious-page/permission tests and explicit qualified fallback                |
| Provider protocols, authentication and usage data differ and change             | M18, then each release | Versioned compatibility fixtures and authorized real-provider runs; show unsupported/unknown accurately |
| Signing, native runners and extra architectures need external access/resources  | M13–M17                | Named machines/runners, signing setup, clean-machine packages and a supported-platform decision         |
| Collaboration, catalogs and scheduling add authority and data flows             | M24–M27                | Reviewed identity/storage/consent policies, revocation and no-duplicate/no-replay tests before enabling |

### Primary technical references

Official pages checked on 2026-11-19 for this plan:

- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/): use OS-specific development/runtime prerequisites and select maintained Linux/macOS baselines at implementation time.
- [Tauri macOS code signing](https://v2.tauri.app/distribute/sign/macos/): plan Apple signing/notarization and native release resources separately from a successful development build.
- [VS Code platform-specific extension publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension): package native sidecars for the matching OS/architecture and qualify each advertised target.

These references informed the plan; they are not evidence of a Linux/macOS build or product test. Platform implementation remains unexecuted.

## Completion checklist

- [ ] OS0: public source preview with verified hosted CI, privacy/history review and owner-enabled reporting/security settings.
- [ ] OS1: exact-source, qualified Windows public prerelease with real demo, license notices and checksums.
- [x] Record M0–M8 implementation baseline and its acceptance limitations.
- [ ] Close M8 launch/persistence/restart checks needed for orchestration.
- [x] M9: durable task protocol, adapter capabilities and restart reconciliation (deeper acceptance remains).
- [x] M10: isolated checkouts, commit-bound evidence and controlled integration (limits in VERIFICATION.md).
- [x] M11: bounded coordinator, team lifecycle, permissions and failure handling (provider/platform limits in VERIFICATION.md).
- [ ] M12: templates, context/browser tools and qualified release artifacts.
- [ ] M13: portable native foundation and Unix lifecycle feasibility.
- [ ] M14: Linux desktop and clean-machine packages.
- [ ] M15: macOS desktop and signed/notarized distribution.
- [ ] M16: Linux/macOS editor packages and lifecycle parity.
- [ ] M17: qualified Windows/Linux/macOS beta release.
- [ ] M18: structured conversations and authorized routing.
- [ ] M19: bounded project context and reviewed knowledge.
- [ ] M20: visual workflows and controlled automation.
- [ ] M21: Git delivery and exact-commit external checks.
- [ ] M22: structured archives, portability and local recovery.
- [ ] M23: scoped external tools, browser and device automation.
- [ ] M24: local packages and gated optional discovery.
- [ ] M25: supervised remote/container execution.
- [ ] M26: authenticated sharing and selective synchronization.
- [ ] M27: explicitly armed, bounded scheduled workflows.
- [ ] M28: stable cross-platform release qualification.
- [ ] Run repeatable outcome comparisons before claiming improvement over another product.
