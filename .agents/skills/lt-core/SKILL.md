---
name: lt-core
description: "Implement Last Train rules, routing, scenario data and invariants in src/core and src/data. Use for game-state transitions, deadlines, scoring and replay behavior."
---

# Last Train core

Read [architecture](../../../docs/architecture.md), the relevant rules in `docs/concept.md`, and `src/shared/types.ts`. Own only the paths assigned in the architecture. Request shared-contract changes from the integrator.

Keep one pure transition as the authority for legality and mutation. Rejected commands preserve the input. Preview and execution share routing and deadline calculations. Inject reproducible randomness. Do not import React, Three.js, browser storage, timers or bot code into the core.

Implement the fixed exports in `src/core/index.ts`: `createGame`, `applyCommand`, `getObservation`, `getLegalCommands`, `previewOrder`, and `getGameResult`. Begin with `setup` and `chooseObjectives` before action phases. Preserve `drawsRemaining` through partial draws and restores.

Preserve these rules when implementing phases:

- Every brigade acts before movement. Resolve ordinary steps, express second steps, then the wave.
- Loading, unloading and reaching a positioning target end that train's movement for the round.
- A station closing after F allows departure in F. Loading in F does not permit same-round departure.
- A flooded train stays unavailable. It does not return to a shelter.
- Credit a repair only after a successful delivery uses its line. Credit each line once, within the brigade cap.
- Use the public initiative schedule from scenario data. Preserve group IDs through queue, cargo, delivery and loss.

Construct observations from allowed fields. Keep deck order, PRNG state and opponents' hands or objectives outside them. Route queries used by bots must accept public board data, not require full state.

Test phase boundaries, card and group conservation, nonnegative resources, rejected actions, bounded completion and replay determinism. Use concrete failing scenarios when fixing rules. Hand off exports, changed behavior, verification and unresolved decisions.
