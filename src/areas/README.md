# Git area frontend

The user-facing guide lives in [docs/guides/git-areas.md](../../docs/guides/git-areas.md).

- `AreasPanel.tsx`: provisioning, scope, recovery and cleanup UI.
- `ReviewPage.tsx` and `diff.ts`: bounded diff browsing and exact-commit evidence.
- `model.ts` and `runtime.ts`: shared types and serialized frontend operations.
- `src-tauri/src/areas.rs`: authoritative ownership, Git validation and journaled operations.

Keep this directory focused on the frontend; native checks remain authoritative.
