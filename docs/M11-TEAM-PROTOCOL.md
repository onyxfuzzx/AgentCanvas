# M11 bounded team execution

Open **Team run** in the sidebar. Existing terminal and agent nodes are discovered before recruitment. Reuse a stopped member, or explicitly recruit through an installed-agent preset. Role/replacement editing uses the existing node ID, preserving links and launch-snapshot behavior. It stops the previous process; it does not transfer an unresolved attempt automatically. Old attempts retain their original agent ID and checkout reference.

Create a run with a goal, optional coordinator, limits and explicit permissions. Planning can be entirely human. Add jobs using the form or edit plan JSON, validate/adopt the whole graph, then explicitly start manual or automatic dispatch. Adoption does not launch a process or execute a command. Automatic dispatch uses existing live processes, dependency gates and capacity; it never recruits, runs checks or integrates on its own. A missing worker stays queued. A blocked worker, failed attempt or expired coordinator heartbeat stops dispatch and raises attention. Retry/revision and handoff remain explicit user actions after stop/reconciliation. No terminal prompt or quiet output establishes completion.

## Data and transaction boundary

The existing versioned task snapshot gains an optional run. Task attempts, dispatch counters, review bindings and the bounded decision timeline commit in the same atomic task-store transaction. A failed save cannot create an inbox attempt or consume a dispatch counter in memory. Existing M9/M10 documents load through optional defaults. Unknown schemas/fields remain refused; backups, corrupt-original preservation, locks and optimistic external-edit checks remain in force. Runtime process handles, tokens, output and command history are not added to persistence.

Limits default to two concurrent tasks, 32 queued tasks including reviews, three attempts per task, 24 total dispatches including retries/reviews, one hour of active run elapsed time, and five seconds of retry backoff. Bounds are enforced natively even for manual task dispatch. An explicitly adopted plan must fit its minimum dispatch budget. Counters cannot be reset by a proposal or resume. Restart/workspace reopen always pauses the run and reconciles old generations; there is no automatic restart or task replay. Switch and normal close pause native dispatch before flushing saves or stopping processes. Emergency stop revokes run capabilities and stops processes even when cancellation cannot be saved, reporting remaining shutdown/save errors. Exhausted execution budgets stop team processes; a pause only stops new dispatches.

## Coordinator helper

A user-designated coordinator uses the existing capability-scoped helper:

```text
agentcanvas-peer task <new-request-UUID> --stdin
```

Send one JSON action on stdin. `{"type":"team"}` returns the current run, task state and existing node identities/roles/directories, without tokens or process handles. `{"type":"coordinatorHeartbeat"}` refreshes the 120-second lease; heartbeat about every 30 seconds. `{"type":"propose","plan":...}` stores an untrusted draft for the user to edit and adopt. The helper's existing action payload limit is 8 KiB; larger plans can be edited in the UI, which has a 128 KiB editor bound. A proposal never replaces an adopted plan automatically, changes budgets or grants permissions. Workers continue using M9 inbox/ack/progress/result/cancel actions. A peer link is not a coordinator capability, and a worker cannot designate itself coordinator, accept a result or control a run.

Example plan shape (replace placeholder IDs with new UUIDs and existing node/area IDs):

```json
{
  "goal": "Implement and review a change",
  "jobs": [
    {
      "id": "NEW-TASK-UUID",
      "title": "Fix parser",
      "brief": "Handle split input in the assigned checkout",
      "criteria": "Regression test passes and independent review is clean",
      "dependencies": [],
      "agent": "EXISTING-BUILDER-NODE-UUID",
      "area": "MANAGED-AREA-UUID",
      "reviewer": "EXISTING-REVIEWER-NODE-UUID",
      "reviewTask": "NEW-REVIEW-TASK-UUID"
    }
  ],
  "checks": [],
  "repositories": []
}
```

Dependencies reference builder job IDs in the same plan. Cycles, missing/duplicate IDs, invalid paths, excessive queues and identical builder/reviewer identities are refused. Independent review requires a managed checkout and a distinct agent launched in that checkout. Only one active or uncertain task can own a checkout; actual launch directories are also checked for shared-directory writers. Worktrees remain code isolation, not an OS sandbox.

## Independent review and checks

A builder reports a structured result into `review`. Its reviewer can then dispatch while the builder result awaits acceptance; other dependencies still require user-accepted `done`. Review dispatch captures the exact clean commit and builder attempt. First accept the independent review, then require current passing checks, then accept the builder. Any changed commit, dirty checkout or old builder attempt invalidates that acceptance path. A new builder dispatch clears the previous review and queues fresh review. Explicit bounded revision stages both tasks for another attempt, preserves attempt history, applies backoff and pauses until user resume. An exhausted review/attempt budget requires user intervention rather than another loop.

An adopted check declaration contains `id`, builder `task`, `name`, absolute `.exe` `program`, an explicit `args` array, and `timeoutMs` (100–120000). These declarations are intentional reviewed configuration, not captured terminal history. Never put credentials in them. Checking the **checks** permission does not run them. Clicking a declared check runs that exact vector locally after all app terminals stop, with stdin/output discarded, a timeout and a kill-on-close job. There is no shell-string interpolation. Emergency stop cancels checks. Revocation, cancellation, changed commit or checkout modifications prevent passing evidence from being recorded. Every declared check for a builder must be present and passing at the reviewed commit before builder acceptance. The M10 panel also supports explicit user evidence records.

## Permissions and manual control

Dispatch, peer messaging, launching existing run members, provisioning/cleanup, checks/evidence and integration have separate native permissions. Changing them pauses dispatch and cancels queued disallowed messages. The scoped Git panel additionally checks adopted repository/area scope; review/integration still use M10 exact-head approval. Declared checks revalidate permissions before launch and before recording evidence. Launches revalidate scope after startup and stop a process whose permission was revoked during startup. Direct manual terminal/Git controls remain user actions; coordinator/helper text cannot invoke them or grant their permissions. No coordinator tool executes provisioning, arbitrary commands or integration automatically.

The timeline retains the latest 256 structured events, with source and time. The UI reports ready/running/review/blocked tasks, attempts, elapsed time, dispatch count, live members and active checks. Cost and tokens remain unknown because these subscription CLI adapters supply no reliable usage stream; there is no promised monetary cap. Authenticated model cooperation is separate from deterministic fixture transport and scheduler verification. See VERIFICATION.md for executed evidence and remaining platform/provider limits. M12 workflows, browser automation and release qualification remain outside this milestone.
