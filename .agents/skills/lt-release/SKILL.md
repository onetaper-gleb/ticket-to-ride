---
name: lt-release
description: "Prepare a verified local Last Train milestone with build, playable browser result and startup instructions. Use when reporting the solo MVP or private-online readiness."
---

# Last Train release

Read the current gate in [development](../../../docs/development.md), `package.json`, and the latest review. Confirm the milestone scope with the integrator. Use scripts actually defined by the project.

Run the production build and checks appropriate to changed behavior. Complete a browser match with a human seat, then save, reload and finish another match. Run 2/3/4-brigade simulations. Check the result screen, new game, continue, resource loading and console errors.

Keep evidence: commands and exits, reproducible seed, tested browser, completed scenarios and known limitations. Confirm that the reported URL opens the built or running game. Open it in Codex when useful.

Report the milestone as implemented. Solo readiness does not imply rooms, final balance, human playtesting or measured FPS. Do not describe target budgets as measurements. Leave failed checks visible and send fixes to their owners.

Keep output artifacts under the project's deliverable directory. Include startup and test commands in the project README through its owner. User approval is not needed for local reversible verification. Publishing, hosting, paid services and external accounts remain outside this release task unless the user authorized them.
