---
name: lt-bots
description: "Implement fair Last Train solo bots and simulation policies in src/bots. Use for legal move selection, deadline planning, difficulty and bot evaluation."
---

# Last Train bots

Read [architecture](../../../docs/architecture.md), the bot and timing rules in `docs/concept.md`, and `src/shared/types.ts`. Own `src/bots/**` and assigned `scripts/simulate.ts`; ask the core owner for missing public route queries.

Export `chooseBotCommand(observation, difficulty='normal')` from `src/bots/index.ts`. Choose deterministically from `Observation`. If randomness becomes useful, request an explicit bot-randomness contract from the integrator. Do not import or accept full game state, deck order, core PRNG state, opponents' hands or objectives. Simulation must use visible information or explicit beliefs, never a hidden copy of the real state.

The match runner in `scripts/simulate.ts` may hold full state to execute the core. Pass only `getObservation(state, seat)` into the decision policy. Keep runner state outside policy closures and evaluation helpers.

Choose a valid fallback before evaluating candidates. Respect unfinished draw phases and current action rights. Score a small set of repair, draw, express and order plans by reachable groups, own objectives, delivery time, closure deadlines and visible competition. Use core legality and public route queries instead of copying rules.

Start with a normal heuristic. Easy difficulty shortens its planning and chooses among near-best valid plans. Preserve deadline checks. Keep computation bounded and measure it before introducing workers or deeper search. A late worker result must carry revision, turnId and controlEpoch to the session.

Verify that equal observations and equal bot randomness give equal decisions even when underlying hidden states differ. Verify legal commands and completed matches for 2, 3 and 4 brigades. Evaluate tuning on fresh seeds with seat permutations. Report completion, losses, repair use and scores; do not claim human enjoyment from bot results.

Hand off the decision entrypoint, observation requirements, measured budget, seeds tested and known weak plans.
