# Sanitized examples

`team-plan.json` demonstrates the current M11 plan shape: two independent tasks followed by a dependent task, with manual review/acceptance. It is documentation data and performs no actions by itself. Reusable template import/export is planned in M12; this is not an implemented template-import feature.

Before using it in the Team run plan editor, replace every agent UUID with an existing node, choose appropriate managed checkout areas and adapt the task briefs/criteria. Adoption validates IDs, dependencies, permissions and limits; launching and dispatch remain explicit. Use disposable repositories when learning the flow. Never add personal paths, credentials, agent transcripts or actual workspace/recovery exports to examples.

See the [team protocol](../docs/M11-TEAM-PROTOCOL.md) and [Git area guide](../docs/guides/git-areas.md). Contributions should keep examples minimal, non-executing and independent of a contributor's local filesystem.
