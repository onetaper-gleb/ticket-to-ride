---
name: lt-review
description: "Independently review Last Train rules, bot fairness, player flow and readiness. Use for milestone acceptance, concrete gameplay defects and architecture boundary checks."
---

# Last Train review

Read [architecture](../../../docs/architecture.md), the current milestone in [development](../../../docs/development.md), and the relevant concept rules. Review files read-only unless the integrator explicitly assigns a fix path.

Choose reproducible scenarios that can disprove readiness. Check a train loading at F, express stopping after service, an empty contested queue, one repair credit, a flooded train and final tie/zero-delivery outcomes. Compare core preview with execution. Trace cards and groups through the complete match.

Inspect bot inputs and imported queries. Run equal-observation cases with different hidden states. Confirm that UI handlers emit commands and do not change scores, resources or movement. Verify complete human turns and restore after a partial draw.

For an online milestone, inspect packets for private information and exercise duplicate commit, restart and changed controlEpoch. Use the actual clients and persistence layer, not only mocked handlers.

Separate a defect from a balance hypothesis. Each defect includes trigger, expected rule, observed result, owning file and a minimal test or browser reproduction. A tuning suggestion includes measured evidence or states that it needs playtests. Keep fixes within assigned ownership.

Return blocking defects first, followed by completed scenarios and untested limits. Passing unit tests alone does not establish browser playability or multiplayer recovery.
