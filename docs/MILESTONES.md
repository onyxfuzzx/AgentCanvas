# AgentCanvas orchestration roadmap

Updated: 2026-11-14. Baseline: commit `8880ada` (M8).

This roadmap through M12 was written from the current implementation; it does not recover an earlier M9–M12 plan. The user authorized M9, full M10 and full M11 on 2026-11-14. M0–M11 are implemented; automated checks, debug builds and desktop smoke evidence are recorded in VERIFICATION.md alongside remaining acceptance limits. M12 remains proposed and unimplemented. See AGENTS.md for the current scope boundary.

## Product goal

Turn the existing spatial terminal workspace into a dependable local control plane for coding agents: give it a goal, inspect its proposed work, run independent tasks in isolated checkouts, review evidence, and integrate the accepted result. Preserve direct terminal access and manual control throughout.

Maestri is a useful interaction reference. Its documentation describes a spatial workspace, manager agents that recruit and connect teammates, isolated floors, and saved team arrangements. Matching those workflows is the baseline. Our proposed differentiation is explicit task state, recoverable execution, traceable evidence, bounded resource use and controlled integration. These are design goals, not claims that Maestri lacks these capabilities or that AgentCanvas already outperforms it.

Reference material checked on 2026-11-13:

- [Maestri introduction](https://www.themaestri.app/en/docs/intro): spatial workspace and installed-agent model.
- [Maestro Mode](https://www.themaestri.app/en/docs/maestro): manager-led recruitment, roles and connections.
- [Floors](https://www.themaestri.app/en/docs/floors): isolated work areas.
- [Partituras](https://www.themaestri.app/en/docs/partituras): reusable team arrangements.
- Installed Maestri CLI skill references: manager, peer messaging and workspace/floor workflows. No Maestri agents or workspaces were created for this document.

## What exists today

| Milestone | Implemented modules                                                              | Acceptance status                                                                       |
| --------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| M0        | Native app foundation, product configuration and desktop shell                   | Implemented; historical platform limits remain                                          |
| M1        | Canvas geometry, navigation, selection, resizing, minimap and layout history     | Implemented; some gesture/DPI checks remain                                             |
| M2        | ConPTY terminals, xterm sessions, bounded output and Windows process ownership   | Implemented; WSL cleanup and full UI load need verification                             |
| M3        | Named workspaces, atomic autosave, backups, validation and restoration           | Implemented; destructive-environment/recovery UI checks remain                          |
| M4        | File-backed Markdown notes and SVG whiteboard                                    | Implemented; large-canvas and some conflict/DPI checks remain                           |
| M5        | Peer links, approval policies, helper CLI, shared notes and session logs         | Implemented; broader shell, approval UI and isolation checks remain                     |
| M6        | Embedded browser pages, navigation, clipping and restricted app IPC              | Implemented; basic smoke confirmed, deeper native UI checks remain                      |
| M7        | Local activity summaries, themes, keyboard controls and Windows packages         | Implemented; basic smoke confirmed, installation/accessibility/load acceptance remains  |
| M8        | Codex/Claude presets, reusable roles, executable detection and explicit launches | Implemented; basic CLI startup confirmed, authenticated workflow/recovery checks remain |

The latest verification record reports 59 frontend tests, 38 standard native tests and a fixture harness for both provider adapters. Those are historical results, not checks rerun for this roadmap. M8 has a debug build; M7 release packages predate M8. See [VERIFICATION.md](VERIFICATION.md) for exact evidence and limitations.

Current peer sends type into another terminal. Delivery does not prove that an agent accepted, understood or completed a task. Activity labels are heuristics. Browser nodes display pages; they are not an agent browser-automation API. Roles and launch presets are not a task scheduler.

## Milestone sequence

| Milestone | Outcome                                                 | Depends on                              | Status                                 |
| --------- | ------------------------------------------------------- | --------------------------------------- | -------------------------------------- |
| M9        | Durable tasks and reliable agent communication          | M8; relevant existing acceptance checks | Implemented; deeper acceptance pending |
| M10       | Isolated execution and reviewable Git integration       | M9                                      | Implemented; see verification          |
| M11       | Bounded coordinator and team operations                 | M9 + M10                                | Implemented; see verification          |
| M12       | Reusable workflows, project tools and qualified release | M9–M11                                  | Proposed                               |

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

## Architecture and implementation boundaries

Proposed boundaries build on existing modules; these paths are suggestions, not existing implementations.

| Responsibility                        | Proposed home                                        | Rule                                                               |
| ------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ |
| Task model and state-machine tests    | `src/tasks/`, `src-tauri/src/tasks.rs`               | Rust owns authoritative durable transitions; UI renders snapshots  |
| Structured inbox and capabilities     | Existing `ipc.rs`, `collaboration.rs`, helper binary | Preserve bounded same-user transport and process-generation checks |
| Provider capabilities and submission  | `src-tauri/src/agents/` or extracted adapters        | No shell interpolation; no assumed status from terminal scraping   |
| Checkout provisioning and integration | `src-tauri/src/areas.rs`, `src/areas/`               | Native validation, exact refs and recoverable operations           |
| Dispatch, leases and resource policy  | `src-tauri/src/orchestrator.rs`                      | Deterministic policy; coordinator proposes actions                 |
| Review and check records              | `src/review/`, native validated records              | Bind findings/checks/approval to commit and attempt                |
| Templates and context                 | `src/templates/`, `src/context/`                     | Versioned data, explicit launch and bounded filesystem access      |

Before M9 implementation, choose and document the task-store format and transaction boundaries. A bounded versioned snapshot plus operation journal fits the existing atomic-file approach; evaluate SQLite if task/event volume or multi-record transactions require it. Do not scatter task state across layout JSON, notes and provider transcripts. Design migration, retention, backup and corruption recovery together.

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

Build M9's task/protocol/recovery foundation first, then M10 isolation, then M11 automation. Templates and additional tools should consume those foundations. Do not start automatic multi-agent dispatch merely because agents can already type into each other's terminals.

Remote execution, cloud synchronization, multi-user collaboration, account/credential management, plugin marketplaces, mobile emulators and unattended recurring schedules are outside this M9–M12 proposal. Consider them after the local orchestration and release gates pass. Keep no telemetry, no runtime CDN dependencies and no unsolicited network access as repository requirements. Provider/network actions remain explicit user-authorized execution through configured tools.

## Completion checklist

- [x] Record M0–M8 implementation baseline and its acceptance limitations.
- [ ] Close M8 launch/persistence/restart checks needed for orchestration.
- [x] M9: durable task protocol, adapter capabilities and restart reconciliation (deeper acceptance remains).
- [x] M10: isolated checkouts, commit-bound evidence and controlled integration (limits in VERIFICATION.md).
- [x] M11: bounded coordinator, team lifecycle, permissions and failure handling (provider/platform limits in VERIFICATION.md).
- [ ] M12: templates, context/browser tools and qualified release artifacts.
- [ ] Run repeatable outcome comparisons before claiming improvement over another product.
