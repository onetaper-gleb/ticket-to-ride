---
name: lt-orchestrate
description: "Coordinate authorized Last Train subagents, contracts, ownership and development gates. Use to start a milestone, integrate modules or resolve competing game proposals."
---

# Last Train orchestration

Read [development](../../../docs/development.md), [architecture](../../../docs/architecture.md), the current concept and root `AGENTS.md`. Respect the available concurrency limit. Use subagents only when delegation is authorized.

Pick the next complete player scenario and its acceptance gate. Resolve missing game rules before dependent code: a generator proposes options, a critic supplies counterexamples, a realist estimates implementation cost, and the integrator selects and records one rule. Skip this loop when the rule is already settled.

The integrator owns `src/shared/types.ts`, composition, package scripts and local session. Assign core/data, bots and UI/scene to separate owners. Each delegation names writable paths, contract, exports and concrete verification. No two active agents edit the same file. Transfer ownership explicitly when needed.

Freeze the shared command and observation shape before parallel implementation. Route contract requests through the integrator. Require limited bot observations and core-owned rule queries. Never unblock integration by giving a bot full state or calculating rules inside UI.

Integrate one vertical scenario at a time. After code handoffs, resolve imports/types, run relevant tests, then exercise the browser. Request independent review of meaningful boundaries and send reproductions to owners. Release only after the current gate passes.

Keep solo MVP first. Online, new scenarios and decorative assets do not delay a complete basic match. Notify the user when that verified milestone exists, with a working URL, startup commands and limits. Do not replace implementation with plans or claim future features are complete.
