# Documentation

Start with the [project README](../README.md), then choose the path that matches your task.

## Use AgentCanvas

| Guide                                                    | Covers                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [Editor extension](../extension/README.md)               | VS Code/Antigravity setup, project selection, drafts and backend restart.          |
| [Workspaces and agents](guides/workspaces-and-agents.md) | Persistence, presets, tasks, peer links, notes, whiteboard and browser boundaries. |
| [Managed Git areas](guides/git-areas.md)                 | Checkout isolation, review evidence, integration and cleanup.                      |
| [Task protocol](M9-PROTOCOL.md)                          | Cooperative inbox, acknowledgments, results, leases and reconciliation.            |
| [Team protocol](M11-TEAM-PROTOCOL.md)                    | Bounded execution, coordinator authority and independent review.                   |
| [Examples](../examples/README.md)                        | Sanitized task-plan examples that do not launch anything.                          |
| [Support](../SUPPORT.md)                                 | Troubleshooting and useful bug-report evidence.                                    |

## Develop and contribute

- [Contribution guide](../CONTRIBUTING.md)
- [Development/build/verification](DEVELOPMENT.md)
- [Project website and GitHub Pages](../site/README.md)
- [Live desktop and provider QA checklist](LIVE-QA.md)
- [Architecture and module boundaries](ARCHITECTURE.md)
- [Security policy](../SECURITY.md), [community conduct](../CODE_OF_CONDUCT.md) and [third-party provenance](../THIRD_PARTY.md)

## Understand the plan and evidence

- [Public roadmap](../ROADMAP.md): priorities and product outcomes.
- [Milestone specifications](MILESTONES.md): dependencies, deliverables and acceptance gates through M28.
- [Project status](PROJECT-STATUS.md): current release work and remaining qualification.
- [Verification record](VERIFICATION.md): dated executed evidence and historical limits. Earlier entries describe their source snapshot; newer entries supersede current status without rewriting history.
- [Open-source launch and GitHub presentation](OPEN-SOURCE-LAUNCH.md): owner actions, presentation, source/release checks and publication gates.

Keep user guides here rather than expanding the root README. Keep tests beside the relevant implementation, and put only sanitized, non-executing examples under `examples/`. Do not move runtime source directories just for appearance; build scripts, Tauri paths and extension packaging depend on their boundaries.
