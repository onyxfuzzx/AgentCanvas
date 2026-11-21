# AgentCanvas roadmap

Build a dependable local workspace for planning, running, reviewing and integrating coding-agent work across Windows, Linux and macOS. Keep direct terminal access, explicit authority and offline workspace use throughout.

Dates follow evidence and capacity. A milestone is complete only when its acceptance behavior is demonstrated; implementation and qualification are tracked separately. This page summarizes direction. [MILESTONES.md](docs/MILESTONES.md) defines scope; [PROJECT-STATUS.md](docs/PROJECT-STATUS.md) tracks work; [VERIFICATION.md](docs/VERIFICATION.md) records executed checks.

## Now: prepare a public project people can build and trust

- **OS0 — public source preview:** MIT license and attribution, concise README and indexed docs, contribution/security policies, issue/PR templates, source/history audit, reproducible clean-checkout Windows CI, and repository settings checked before publication. This preparation does not itself publish the repository or enable GitHub settings.
- **Windows qualification:** WS1 team execution and WS7 backend recovery are implemented and verified. Finish WS2 UI/accessibility, WS3 real-provider workflows, WS4 recovery/authority, WS5 measured capacity and WS6 final distributions.
- **OS1 — public Windows prerelease:** publish only intentionally selected artifacts built from a named tag, with checksums, license notices, compatibility/known-limit notes and a real sanitized demo. The source preview can precede binary qualification; unqualified builds must remain labeled development previews.

## Next: a complete local workflow

| Milestone | Outcome                                                                                                     | Acceptance focus                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| M12       | Reusable teams/templates, project files/search, shared documents, guided workflows and scoped browser tools | Fresh user can inspect a plan, execute isolated work, review evidence and integrate; imports stay paused and permission failures are clear. |
| M13       | Portable runtime contracts and Unix process/IPC/storage foundation                                          | Prove shutdown, secure local communication and atomic persistence on real Unix hosts while Windows regression checks pass.                  |
| M14–M16   | Linux desktop, macOS desktop and native editor extensions                                                   | Qualify real OS/architecture packages, platform input/accessibility, startup environments and recovery.                                     |
| M17       | Three-platform beta                                                                                         | Installed builds pass the same local task-to-review journey on the advertised support matrix.                                               |

## Later: deeper orchestration and optional services

| Milestone | Outcome                                                                              |
| --------- | ------------------------------------------------------------------------------------ |
| M18–M19   | Structured conversations/routing and bounded project knowledge with provenance.      |
| M20–M21   | Visual workflows, controlled automation and reviewable Git delivery/external checks. |
| M22       | Archival, portability and local recovery.                                            |
| M23–M24   | Extensible tools/device capabilities, local packages and optional catalogs.          |
| M25–M27   | Opt-in remote/container execution, shared workspaces/selective sync and scheduling.  |
| M28       | Stable cross-platform release for explicitly included, qualified scope.              |

## What makes progress meaningful

Measure fresh-checkout build success, onboarding completion, recovery without lost drafts, process cleanup, task/review correctness, accessibility and measured capacity. Publish the environment, sample/workload, result and limits beside any performance or provider-success claim. Local deterministic fixtures and authenticated provider sessions are different evidence.

Use small reviewed contributions with explicit acceptance criteria. Qualify the three-platform core at M17 while later optional services remain separate work. There are no promised dates, token-cost caps for opaque subscription CLIs, or claims of outperforming another product without repeatable comparisons.
