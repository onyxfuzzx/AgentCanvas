# Contributing to AgentCanvas

AgentCanvas is an MIT-licensed Windows-first workspace for coding agents. Start with the [documentation map](docs/README.md), [architecture](docs/ARCHITECTURE.md), [development guide](docs/DEVELOPMENT.md) and [current priorities](ROADMAP.md).

## Find useful work

The current priorities are Windows UI/accessibility qualification, real-provider workflows, recovery/authority testing and reproducible releases. Documentation, minimal reproductions and tests of an advertised platform are useful contributions. Linux/macOS are planned; existing Windows builds do not establish support on those systems.

For a larger feature or public protocol/schema change, open a feature request first and agree on scope and acceptance criteria. Maintainers assign `good first issue` only after describing a bounded task, relevant files and how to verify it. Roadmap entries are proposals, not assignments or delivery promises.

## Make a change

1. Fork the repository, create a focused branch and reproduce the problem using disposable data.
2. Keep changes within the relevant module. Preserve process ownership, atomic saves, bounded buffers and native authority checks.
3. Add tests for meaningful behavior changes, especially geometry/history, process lifecycle, recovery and trust boundaries. Avoid tests that only restate implementation details.
4. Run `npm run repo:audit` and `npm run check`. For Rust changes, run `npm run native:check`. For editor changes, build the sidecar before extension checks; see the development guide.
5. Record actual commands, results and limitations in the PR. Add milestone acceptance evidence to `docs/VERIFICATION.md` when appropriate. Include sanitized screenshots for visual changes.
6. Submit a PR using the template. Keep the title and description about the final behavior, with relevant issue/milestone links.

Never submit credentials, real workspace/recovery files, local agent configuration, private paths or full terminal/agent transcripts. `.gitignore` is not a history scrubber. Use [SECURITY.md](SECURITY.md) for vulnerabilities.

## Review expectations

Rust owns task/run transitions and command validation. Terminal bytes, remote pages, peer text and model proposals are untrusted. Worktrees isolate code but do not sandbox processes. A result needs review and explicit acceptance; silence or an exit code alone does not prove success. Layout undo must never replay launches, permissions, tasks or Git operations.

Keep runtime networking opt-in, use local assets and retain terminal-only/offline workspace use. Provider CLIs have their own authentication and network behavior. New dependencies need a clear purpose and compatible licensing; commit the applicable lockfile.

## Licensing and communication

Contributions are submitted under the repository's [MIT license](LICENSE). Retain third-party notices and identify any borrowed material; do not copy product assets or proprietary code. No CLA or copyright assignment is currently required. Maintainers may request changes or defer a proposal to protect scope and release quality.

Follow the [code of conduct](CODE_OF_CONDUCT.md). Maintainer decisions, meaningful scope changes and acceptance evidence should be recorded in issues, PRs and the roadmap so new contributors can understand them.
