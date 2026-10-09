---
name: lt-ui
description: "Build Last Train React panels and Three.js diorama in src/ui and src/scene. Use for player input, forecasts, train visualization, accessibility and presentation assets."
---

# Last Train interface

Read [architecture](../../../docs/architecture.md), the user flow in `docs/concept.md`, and `src/shared/types.ts`. Own only assigned interface and scene files. The integrator owns sessions and shared contracts.

Render the player's observation and core previews. Emit commands through the session callback. Do not mutate game state, resolve turns, calculate scores or reproduce route legality in components. Animation interpolates accepted events and cannot decide an arrival or wave.

Export `App` as default from `src/ui/App.tsx` with `AppProps`. Handle `observation=null` as the menu. Render setup selection from the self objective options and emit `chooseObjectives`. Use `onCommand`, `onStart`, `onContinue`, `onMenu` and `onClearError` rather than creating a second session.

Keep the player flow complete: configure solo → understand forecast → take action → issue train orders → end turn → see movement/wave → read result → restart. Show current phase, remaining action, train cargo, route ETA and the next closing stations. Distinguish a safe preview from a plan conditional on future repair. A risky order needs explicit confirmation.

Use a low-poly tabletop style, a near-orthographic camera and procedural objects for the MVP. Keep station labels, route state and deadlines readable above decor. Pair colors with symbols. Preserve menus and cards if WebGL fails. Dispose scene resources on teardown and keep resize/DPR handling bounded.

Add imported or generated assets only when they improve the current scene. Record source, license, transformations and hash. Raster generation supplies references or illustrations, not 3D meshes. Do not add paid asset dependencies to the MVP.

Check a full human turn and result flow in the browser. Inspect screenshots at desktop and narrow widths. Check selection, disabled actions, camera input, reduced motion and save/continue feedback. Report visual defects with reproducible steps and owned-file fixes.
