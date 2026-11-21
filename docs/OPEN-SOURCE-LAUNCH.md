# Open-source launch and GitHub presentation

This is the publication runbook for `onyxfuzzx/AgentCanvas`. It separates prepared repository files from settings, hosted CI, demos and releases that still need owner action or evidence. Do not mark a gate complete because a file exists.

## What visitors should see

The first screen should answer: what is AgentCanvas, who can use it today, what does the workflow look like, how can I try it, and where can I help?

| GitHub surface    | Content                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| About description | **A local spatial workspace for coding agents, terminals, tasks, Git worktrees, and review.**                                                                                                                       |
| Website           | The GitHub Pages site is prepared in `site/`; follow [the deployment guide](../site/README.md). Set `https://onyxfuzzx.github.io/AgentCanvas/` only after a successful live deployment.                             |
| Topics            | `coding-agents`, `developer-tools`, `terminal`, `tauri`, `rust`, `react`, `typescript`, `git-worktree`, `vscode-extension`, `windows`, `local-first`, `codex`, `claude-code`.                                       |
| README            | Product purpose, labeled workflow illustration, implemented features, preview limits, source quickstart, contribution path and links to detailed docs.                                                              |
| Social preview    | Use the curated workflow still under `docs/assets/readme/`; label it as an illustration. A future dedicated image should use GitHub's recommended 1280×640 size and stay below 1 MB.                                |
| Real demo         | Record a disposable project: canvas → task → isolated work → review → explicit acceptance → recovery. Identify CLI versions, actual checks and limits. Do not present simulated cooperation as a real provider run. |
| Issues            | Bug/feature forms, a small set of well-scoped contribution tasks and reproducible qualification gaps.                                                                                                               |
| Pull requests     | Clear before/after behavior, relevant checks, sanitized evidence and remaining limits.                                                                                                                              |
| Security          | Verified private vulnerability reporting and a visible security policy before launch.                                                                                                                               |
| Releases          | Source tag/commit, release notes, tested host/OS/CLI matrix, signed/unsigned status, exact artifacts, license notices and SHA-256 checksums.                                                                        |

Keep screenshots free of personal paths, provider identity, private repositories, API keys and actual user transcripts. The existing GIF/PNG is a workflow illustration, not an app screenshot or performance claim. Add real screenshots only after privacy review and UI verification.

## Repository layout

The root is a product/contributor entry point: `README.md`, `ROADMAP.md`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md` and build manifests. `docs/README.md` indexes architecture, development, guides, status and evidence. Detailed operator documentation lives in `docs/guides/`; sanitized inert examples live in `examples/`.

Keep `src/`, `src-tauri/`, `extension/` and their colocated tests stable. This retains the shared frontend/native boundary and avoids a cosmetic monorepo migration that breaks Tauri or extension packaging. Only curated artwork/icons belong in source; build outputs and real workspace/profile/recovery data stay ignored.

## OS0 — public source preview

### Prepared in this source tree

- [x] MIT license approved by the owner, with package/Cargo metadata and project-license packaging.
- [x] Concise README, public roadmap, documentation index, architecture/development guides and sanitized example.
- [x] Contributor, support, security and conduct policies; issue/PR templates, ownership and dependency update configuration.
- [x] Expanded ignore rules, shared editor/line-ending conventions and removal of the accidental empty `rustup` file.
- [x] Read-only source/link/recognized-secret audit with optional history scan; matching values are never printed.
- [x] CI definition builds the editor sidecar before extension tests. Manual candidate packaging is separate from PR checks.

### Verify before making the repository public

- [x] Run and record `npm run repo:audit -- --history --public`: the initial preparation scan checked 30 retained commits, 223 text files and 119 local documentation links with zero failures after fixing six unavailable historical references. No recognized key markers were found. This is not proof that all secrets or private data have been identified.
- [ ] Review all retained history, author/committer emails, old attachments and GitHub logs. Ignore rules do not remove committed data. Future commits can use a verified GitHub noreply address; history rewriting requires a separate deliberate decision.
- [ ] Perform a clean online `npm ci` and locked Rust build from a fresh checkout on a normal Windows host. Resolve the historical prerelease xterm/integrity/typings provenance issue before calling installation reproducible.
- [ ] Get the actual GitHub `Windows checks` job green on the intended public branch. Local runs do not prove a hosted workflow passed.
- [ ] Enable and test private vulnerability reporting, secret scanning/push protection and dependency alerts where available. New configuration files do not turn on repository settings by themselves.
- [ ] Review maintainer ownership and contact routes. Confirm `@onyxfuzzx` has the necessary permissions.
- [ ] Confirm About/topics/social preview/default branch links, issue forms and contributor docs render on GitHub.
- [ ] Choose visibility and publish the reviewed source snapshot. This runbook does not change visibility or push commits automatically.

No application accounts, cloud service, registry publication or website deployment are required for the source preview. The root npm package stays `private` and the Rust package stays non-publishable to registries; those flags do not prevent GitHub open-source distribution.

## Organize work on GitHub

Create one Project with **Backlog → Ready → In progress → Review → Done**, plus a visible **Blocked** status. Use fields for milestone, area, platform, acceptance evidence and priority. Give each issue a concrete trigger/outcome, owner when assigned, dependencies and a reproducible acceptance gate. Done requires linked verification; a feature being coded is separate from release qualification.

Suggested milestones: **OS0 Public source preview**, **Windows qualification**, **OS1 Windows public prerelease**, **M12 Complete local workflow**, **M13 Portable core**, **M14 Linux**, **M15 macOS**, **M16 Editor ports**, **M17 Cross-platform beta**. Keep M18–M28 as planned epics until their prerequisites are measurable.

Start with a small label set: `bug`, `enhancement`, `documentation`, `testing`, `accessibility`, `needs reproduction`, `blocked`, `good first issue`, `help wanted`, `area:canvas`, `area:native`, `area:extension`, `platform:windows`. Apply `good first issue` only to bounded tasks with file pointers, reproduction steps and expected checks. Do not automatically publish private security reports as labeled issues.

Useful pinned issues:

1. **Public preview status and known limits** — current source/package versions and supported hosts.
2. **Build from a clean Windows checkout** — dependency provenance, exact commands and CI evidence.
3. **Windows qualification tracker** — WS2–WS6 with reproducible sub-issues and evidence.
4. **How to contribute** — scoped starter tasks and architectural boundaries.

Enable Discussions only when someone can maintain it. Keep bug reports actionable and use discussion threads for workflow ideas. Require the uniquely named `Windows checks` status before merging once it has run successfully. Require PRs/conversation resolution, disable force pushes/deletion on the public branch, and choose a review rule that the maintainer team can actually meet. Do not lock a sole maintainer out by requiring their own approval.

## OS1 — Windows public prerelease

OS1 depends on relevant WS2–WS6 qualification and OS0 publication readiness. It is not a synonym for M28 stable.

- [ ] Select release scope, synchronize the intended component versions and name an immutable source tag/commit. Desktop and VSIX currently have separate development versions.
- [ ] Complete the fresh-user task/review journey and authorized real Codex/Claude checks; publish the tested CLI/OS/editor versions and limitations.
- [ ] Complete UI/accessibility, recovery/authority and capacity checks for the claims in the release notes.
- [ ] Build portable ZIP, chosen installers and VSIX from that exact source. Include project licensing and complete required third-party notices; review installer notice presentation separately.
- [ ] Test extracted/installed artifacts on declared clean Windows baselines, including update/uninstall, data preservation and missing WebView2 behavior.
- [ ] Make a signing decision and state unsigned status clearly where applicable. Do not advise users to disable security software.
- [ ] Verify SHA-256, archive CRC/inventory, executable provenance and no workspace/config/transcript leakage.
- [ ] Record a real sanitized demo and prepare release notes: behavior, install/update steps, support matrix, known issues and recovery instructions.
- [ ] Publish a GitHub **prerelease** with intentional assets and checksums. Keep binaries out of source commits. Manual CI artifacts are candidates, not published releases.

Suggested release assets: a Windows portable ZIP and its checksum, chosen NSIS/MSI installers and checksums, a Windows VSIX and checksum, plus source-bound release notes and notice/provenance information. Upload only artifacts actually qualified; do not publish every internal debug/milestone build.

## Progress and claims

Track build reproducibility, onboarding success, recovery without draft loss, process cleanup, task/review correctness, accessibility and measured capacity. For benchmarks, state the machine/workload, versions, repetitions, method and limits. Use provider-supplied usage only when reliable. Avoid fake coverage, popularity, platform or security badges and unmeasured competitor comparisons.

## GitHub references

- [Community profiles and supported files](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories)
- [Private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)
- [Social preview requirements](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)
- [Branch protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

These are setup references, not evidence that settings have been enabled or that a public release exists.
