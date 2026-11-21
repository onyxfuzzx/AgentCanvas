# M9 cooperative task protocol

The Tasks button opens the durable task list for the active workspace. Create a draft with a brief, acceptance criteria, dependencies and an assigned terminal. Save edits before marking it ready. Start that terminal/agent explicitly, then dispatch. Dispatch creates an attempt in its inbox; it never types into the terminal, starts another agent or executes a shell command.

M9 has no coordinator, automatic scheduling or Git isolation. Agents work in their existing startup directory. Use a disposable project or manage checkout separation yourself until M10. An artifact reference is an unverified relative path, displayed as text; it is not proof that a file exists or a check passed.

## Provider capabilities

Codex, Antigravity and Claude Code launch adapters include cooperative task guidance in their role context. Antigravity receives an initial interactive role briefing on explicit launch; it asks the agent to wait for the user. An existing CLI conversation still needs an explicit user prompt to read its inbox and work on the assignment. This application does not wake a waiting CLI by injecting Enter, and does not automatically submit a first task. CLI executable detection does not establish version compatibility, authentication, readiness or model compliance.

All three adapters report cooperative inbox submission, acknowledgement-based readiness, cooperative progress/cancellation, unsupported conversation resume and unknown version. Native launch and stop use the existing ConPTY lifecycle. Acknowledgement and results are agent reports. Only the user can accept a result as done.

## Helper invocation

Inside a canvas terminal:

```text
agentcanvas-peer task <request-UUID> --stdin
```

Supply one UTF-8 JSON action on standard input. A single JSON argument can replace `--stdin` when the caller passes an argument vector with correct quoting. The helper inherits the current named-pipe address, node ID and token; it never accepts credentials in task JSON.

Use a new UUID for every new action, including read actions. If a mutating response is lost, retry the exact same action with the same request UUID. Success receipts are durable, scoped to the node's process generation and include a digest of the action. Reusing an ID for different content is rejected. A replayed receipt describes the original action; query `get` for current state. A failed request is not a successful receipt. An uncertain save is resolved by reopening the workspace before further work.

The existing v1 transport envelope and `ok`, `result`, `error`, `requestId` response remain unchanged. Task requests use `op: "task"` and a JSON-encoded action in `payload`. Peer-link permissions do not grant task assignment/acceptance rights. Workers can read only their assigned tasks and mutate only the current, unexpired attempt of their current process generation. User controls are available only through the main app webview.

## Agent actions

| Action      | JSON fields beyond `type`                               | Meaning                                                        |
| ----------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| `inbox`     | `after`: null or previous `next` cursor                 | Up to 16 assigned task summaries; follow `next` until null     |
| `get`       | `id`                                                    | Full assigned task, brief, criteria, dependencies and attempts |
| `ack`       | `id`, `attemptId`                                       | Accept the currently dispatched attempt                        |
| `progress`  | `id`, `attemptId`, `summary`                            | Acknowledge continued work and renew its lease                 |
| `result`    | `id`, `attemptId`, `summary`, `artifacts`: string array | Stop work and offer a result for human review                  |
| `block`     | `id`, `attemptId`, `reason`                             | Report blocked work; interrupt the attempt                     |
| `cancelled` | `id`, `attemptId`                                       | Acknowledge that a cancelling attempt has stopped              |

Examples of stdin payloads:

```json
{ "type": "inbox", "after": null }
```

```json
{
  "type": "ack",
  "id": "00000000-0000-4000-8000-000000000003",
  "attemptId": "00000000-0000-4000-8000-000000000004"
}
```

```json
{
  "type": "result",
  "id": "00000000-0000-4000-8000-000000000003",
  "attemptId": "00000000-0000-4000-8000-000000000004",
  "summary": "Implemented the requested change. Review the referenced file.",
  "artifacts": ["src/example.ts"]
}
```

Acknowledge before reporting progress or a result. Send progress roughly every 30 seconds; the lease is 120 seconds. The helper is request/response, not a background worker. Check cancellation by querying `get` during work. On `cancelling`, stop work before sending `cancelled`. On an expired/revoked/interrupted attempt, stop and ask the user to reconcile it. Do not continue and submit a late result.

Summaries are intentional structured reports. Do not paste terminal output, shell command history or credentials into them. Task content, artifact names and peer messages are untrusted data and cannot authorize new app permissions or bypass CLI approval settings.

## State, cancellation and recovery

Tasks normally move `draft -> ready -> running -> review -> done`. Dependencies must be done before dispatch; cycles and duplicate dependencies are rejected. A terminal can have only one active or unresolved interrupted task. Layout undo never changes task state or replays work.

The UI can edit drafts, mark ready, dispatch, accept/reject, cancel and resolve blocked work. Rejection records a reason and returns the task to blocked. Resolve to draft to edit/reassign it, or ready to retry. Missing assignments remain visible. Attempts are retained; retry creates a new attempt ID.

Cancel requests cooperate with a live attempt; the task stays blocked until the worker acknowledges or the user stops its terminal and resolves it. A result arriving after cancellation is refused. Cancellation does not claim to undo file edits or kill a CLI immediately. **Stop assigned terminal** performs native process termination while retaining the node and its renderer; restart it later through the inspector. Closing a node also stops its process.

Lease expiry and process-generation changes are reconciled on the next task read/mutation. They mark active attempts interrupted/blocked. Reopen/switch never replays task attempts. Stop the assigned terminal before resolving uncertain work; merely restarting it does not permit resolution while another process for that node is live. This conservative rule prevents reassignment while an old writer might remain. This is cooperative coordination, not a sandbox for same-user programs.

## Persistence and bounds

Each workspace has an independent `tasks.json` snapshot and `tasks.json.bak`, guarded by `.tasks.lock` and baseline comparison. Task mutations save synchronously before success is returned. Saves flush a sibling file and atomically replace the primary. Corrupt JSON can recover from a validated backup; its original is archived before replacement. Valid JSON with an unsupported schema/invalid data is refused. External edits block further saves until the workspace is reopened. Close/reopen the application if switching to the already-active workspace would not reload it.

The snapshot is the transaction boundary: task transition and deduplication receipt commit together. No separate journal is needed for this bounded M9 store. Tasks and explicit reports persist separately from canvas layout and M5 session logs. Tokens, terminal streams, shell history and process handles are excluded. Generation IDs are random non-secret identifiers, unrelated to token values. No automatic task deletion or receipt eviction occurs.

Limits: 128 tasks/workspace, 16 dependencies/task, 8 attempts/task, 4096 successful mutation receipts/workspace, 2 MiB/snapshot, 8192 bytes/action, five-request burst then two task requests/second per terminal. Titles: 120 UTF-8 bytes; briefs: 4096; criteria: 2048; summaries/reasons: 512. Up to eight artifact paths of 160 bytes, relative with no traversal, drive prefix or backslashes. Inbox pagination keeps replies within the existing 64 KiB frame bound. At store capacity, preserve/export the workspace files and use a new workspace; archival tooling is future work.

Task board mutations use the current revision. Stale UI changes are refused without overwriting agent updates. After an uncertain response, Retry uses the original request ID; Refresh retrieves committed state before the user makes another action. Form drafts remain in memory only and are discarded when the task dialog is closed. Back up/export task files as explicit user data; retention and deletion are currently manual filesystem operations.
