<p align="center">
  <img src="src-tauri/icons/mark.svg" width="76" height="76" alt="AgentCanvas logo" />
</p>

<h1 align="center">AgentCanvas</h1>

<p align="center">
  <strong>Plan, run, and review coding-agent work on one canvas.</strong><br />
  Local terminals, isolated Git worktrees, durable tasks, shared notes, and decisions you control.
</p>

<p align="center">
  <a href="https://github.com/onyxfuzzx/AgentCanvas/actions/workflows/check.yml"><img src="https://github.com/onyxfuzzx/AgentCanvas/actions/workflows/check.yml/badge.svg" alt="Windows CI status" /></a>
  &nbsp; <a href="LICENSE">MIT license</a> &nbsp;·&nbsp; Windows x64 preview &nbsp;·&nbsp; Desktop + editor
</p>

<p align="center">
  <a href="#get-started">Get started</a> &nbsp;·&nbsp;
  <a href="#what-you-can-do">Features</a> &nbsp;·&nbsp;
  <a href="ROADMAP.md">Roadmap</a> &nbsp;·&nbsp;
  <a href="CONTRIBUTING.md">Contribute</a> &nbsp;·&nbsp;
  <a href="docs/README.md">Documentation</a>
</p>

<p align="center">
  <img src="docs/assets/readme/workflow.gif" width="1200" alt="Illustrated workflow: define a task, build in isolated worktrees, review evidence, then accept the change." />
  <br /><sub>A workflow illustration, not a recording of a provider run. <a href="docs/assets/readme/workflow.png">Still image</a>.</sub>
</p>

## Why AgentCanvas

Coding-agent work spans terminals, instructions, task state, branches and review. AgentCanvas puts those pieces in one spatial workspace, while native code enforces the boundaries around execution, persistence and acceptance.

Use it as a terminal canvas, organize a manually planned task flow, or run a small bounded team through a structured cooperative protocol. Your installed Codex, Antigravity and Claude Code CLIs keep their own authentication and approval settings.

## What you can do

| Capability               | Current behavior                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Spatial workspace        | Arrange terminals, agents, Markdown notes and whiteboards; pan, zoom, use the minimap and undo layout changes.                              |
| Installed agent CLIs     | Launch Codex, Antigravity or Claude Code with saved roles and per-node launch settings. CLI detection does not verify authentication.       |
| Durable task board       | Track briefs, acceptance criteria, dependencies, acknowledgments, attempts and review. Dispatch uses a cooperative inbox.                   |
| Git isolation and review | Work in managed worktrees, inspect bounded diffs and commit-bound evidence, then explicitly approve and integrate.                          |
| Bounded teams            | Adopt a plan and control concurrency, retries, time, permissions, pause and emergency stop. Automatic dispatch reuses existing live agents. |
| Editor recovery          | Run the shared canvas in VS Code or Antigravity; preserve drafts and explicitly restart a failed native backend.                            |
| Browser nodes            | Desktop embeds restricted pages; editor nodes open the default browser after a click. Agent browser automation is future work.              |

## Status and boundaries

**Development preview for local Windows x64.** Desktop and editor hosts through M11 are implemented; WS1 team execution and WS7 backend recovery have passing recorded checks. UI/accessibility, authenticated provider workflows, failure scenarios, performance and final distributions still need qualification. Packages remain unsigned.

Linux/macOS and remote execution are planned. There is no published stable compatibility promise, security audit, provider-success benchmark or fixed delivery date. See [current status](docs/PROJECT-STATUS.md) and [executed verification](docs/VERIFICATION.md).

- Local workspace use requires no AgentCanvas account or telemetry.
- Terminal output, command history, tokens and process handles are excluded from workspace saves.
- Model output, peer text and terminal bytes cannot grant authority or accept their own work.
- Git worktrees isolate checkouts; they do not sandbox processes.
- Provider CLIs have their own network, account and data policies.

## Get started

Build from source on Windows x64 with **Node.js 22** (the CI version), Rust stable MSVC, Visual Studio C++ build tools/Windows SDK and WebView2 Evergreen. Follow [Tauri's Windows prerequisites](https://v2.tauri.app/start/prerequisites/) and our [development guide](docs/DEVELOPMENT.md).

```powershell
git clone https://github.com/onyxfuzzx/AgentCanvas.git
cd AgentCanvas
npm ci
cargo install tauri-cli --version '^2' --locked
npm run desktop
```

For VS Code or Antigravity:

```powershell
npm run extension:package
```

Run **Extensions: Install from VSIX...**, select the generated Windows VSIX under `artifacts/`, then run **AgentCanvas: Open Canvas** in a trusted local project. The installed extension bundles its native helpers. [Editor setup and recovery guide](extension/README.md).

`npm run dev` serves the browser UI only; native terminals require a desktop/editor host. Provider CLIs are installed and signed in separately. Fresh-machine installation and stable xterm dependency qualification remain launch gates.

## A deliberate workflow

1. Define a task, its acceptance criteria and dependencies.
2. Create a managed Git area and start an agent in that checkout.
3. Dispatch the task and instruct the agent to use the cooperative inbox.
4. Review the exact commit, independent findings and declared checks.
5. Accept the result and explicitly approve/integrate the reviewed change.

See the [task protocol](docs/M9-PROTOCOL.md), [team protocol](docs/M11-TEAM-PROTOCOL.md), [Git area guide](docs/guides/git-areas.md) and [example plan](examples/README.md). A delivered message or quiet terminal is not verified completion.

## Roadmap

Our goal is a dependable, local-first workspace for agent work on Windows, Linux and macOS. The next checkpoints make the public project reproducible and its Windows preview trustworthy.

| Stage   | Outcome                                                                                                    | Status                                      |
| ------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| OS0     | MIT licensing, clear documentation, contributor workflows, repository/history review and fresh-checkout CI | Preparation in progress                     |
| OS1     | Verified Windows public prerelease, real demo, supported-version matrix, release notes and checksums       | Planned; existing qualification gates apply |
| M12     | Reusable team templates, project context, guided workflows and scoped browser tooling                      | Planned                                     |
| M13–M17 | Portable core, Linux/macOS desktop and editor ports, three-platform beta                                   | Planned                                     |
| M18–M24 | Conversations, project knowledge, visual workflows, Git delivery, recovery and extensibility               | Planned                                     |
| M25–M28 | Opt-in remote work, collaboration, schedules and stable cross-platform qualification                       | Planned                                     |

The [public roadmap](ROADMAP.md) explains priorities. [Milestone specifications](docs/MILESTONES.md) define dependencies and acceptance gates. Public-source preparation does not authorize or claim implementation of future milestones.

## Repository structure

```text
.github/       CI, issue forms, PR template and ownership
docs/          Documentation index, architecture, launch plan and verification
docs/guides/   Detailed workspace/agent and Git-area guides
examples/      Sanitized, non-executing examples
extension/     VS Code / Antigravity host and recovery controller
scripts/       Build, packaging, audit and verification tools
site/          Static project website and GitHub Pages guide
src/           Shared React UI and pure canvas/state models
src-tauri/     Rust runtime, ConPTY, IPC, task/Git authority and native tests
```

Build outputs, local profiles, credentials and workspaces are ignored. Keep `package-lock.json`, `src-tauri/Cargo.lock`, source icons and curated documentation assets tracked. [Architecture and module map](docs/ARCHITECTURE.md).

## Contribute

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Useful early contributions include reproducible Windows bug reports, accessibility work, failure/recovery tests and onboarding improvements. Agree on scope before implementing larger roadmap features.

```powershell
npm run repo:audit
npm run check
npm run native:check
```

Extension native tests need a built sidecar; the [development guide](docs/DEVELOPMENT.md) gives the order. Report vulnerabilities through [SECURITY.md](SECURITY.md), usage problems through [SUPPORT.md](SUPPORT.md), and follow the [code of conduct](CODE_OF_CONDUCT.md).

## Documentation

- [Documentation index](docs/README.md)
- [Project website and GitHub Pages deployment](site/README.md)
- [Development and verification](docs/DEVELOPMENT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Current status](docs/PROJECT-STATUS.md) and [verification evidence](docs/VERIFICATION.md)
- [GitHub presentation and launch checklist](docs/OPEN-SOURCE-LAUNCH.md)

## License

AgentCanvas source is licensed under [MIT](LICENSE). Dependencies retain their own licenses; see [THIRD_PARTY.md](THIRD_PARTY.md). Provider CLIs are separate software and are not bundled.
