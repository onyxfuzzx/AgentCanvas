# Security policy

## Reporting a vulnerability

Do not post exploit details, tokens, private workspace files or agent transcripts in a public issue.

Use [GitHub private vulnerability reporting](https://github.com/onyxfuzzx/AgentCanvas/security/advisories/new) when the repository's **Security → Advisories → Report a vulnerability** action is available. Maintainers must enable and verify that channel before public launch; adding this file does not enable it. If it is unavailable, ask `@onyxfuzzx` for a private reporting channel without including sensitive details or identifying affected users publicly.

Include the source commit or app/VSIX version, Windows/editor versions, affected boundary, a minimal disposable reproduction, impact and any suggested mitigation. Send only information needed to investigate. There is no guaranteed response time or paid bounty program.

## Support scope

AgentCanvas is a development preview, not a security-audited stable product. Fixes target the current development branch; there is no maintained backport/LTS matrix yet. Release notes must identify the source commit and affected versions. Installed provider CLIs and their services are separate products and should be reported to their maintainers when appropriate.

## Boundaries contributors must preserve

- Validate all privileged requests natively; a webview, terminal, note, peer message or model output cannot grant itself authority.
- Keep the local named-pipe boundary restricted to the current Windows user and process generation.
- Stop owned processes on backend/application death and confirm old process-tree shutdown before replacement.
- Persist intentional workspace/task/note data using validated atomic saves. Do not add transcript, token, credential or process-handle persistence.
- Preserve corrupt originals and backups; block stale/conflicting writes and uncertain task replay.
- Treat Git worktrees as checkout isolation, not an OS security sandbox. Launched CLIs run with the user's local access.
- Browser pages receive no native application privileges. Provider CLIs retain their own approvals, authentication and network policies.

The [architecture](docs/ARCHITECTURE.md), [verification record](docs/VERIFICATION.md) and [launch checklist](docs/OPEN-SOURCE-LAUNCH.md) distinguish implemented controls from qualification still pending.
