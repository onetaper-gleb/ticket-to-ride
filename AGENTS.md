# Last Train project

Read docs/concept.md and docs/architecture.md before game changes. This is a playable solo MVP first; the network milestone is separate. Keep all player-facing text Russian.

Project skills are under .agents/skills. Select and read the relevant SKILL.md: lt-core for rules/data; lt-bots for decisions; lt-ui for panels/scene; lt-network for future server; lt-review for independent verification; lt-release for build/publish; lt-orchestrate for task ownership and integration. Use these files explicitly; no global skill installation is needed.

Ownership: root integrator owns src/shared, src/session, src/main.tsx, package/config files and release. Core agent owns src/core and src/data. UI agent owns src/ui and src/scene. Bot agent owns src/bots and scripts/simulate.ts. Architect owns docs/development.md, docs/architecture.md and .agents/skills. Review reads all code; fixes need explicit file ownership transfer. Do not edit another active agent's files.

src/shared/types.ts is the stable interface. Request a change before editing it. The core reducer is the sole rules authority. Bots only receive Observation. UI renders Observation; root session owns GameState. Do not import graphical modules into core, or secrets into bots/UI.

Use small typed functions and data-driven rules. No speculative generic frameworks. Test meaningful invariants and phase boundaries. Format with pnpm format; run pnpm format:check, pnpm check, pnpm test and pnpm build before release; complete a human-turn browser check and a finite full-match simulation. Keep reproducible failures, not screenshots claiming playability without interaction.
