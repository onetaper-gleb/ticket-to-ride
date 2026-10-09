---
name: lt-ui
description: 'Build Last Train React panels and Three.js diorama in src/ui and src/scene. Use for player input, forecasts, train visualization, accessibility and presentation assets.'
---

# Last Train interface

Read [architecture](../../../docs/architecture.md), the user flow in `docs/concept.md`, and `src/shared/types.ts`. Own only assigned interface and scene files. The integrator owns sessions and shared contracts.

Render the player's observation and core previews. Emit commands through the session callback. Do not mutate game state, resolve turns, calculate scores or reproduce route legality in components. Animation interpolates accepted events and cannot decide an arrival or wave.

Export `App` as default from `src/ui/App.tsx` with `AppProps`. Handle `observation=null` as the menu. Render setup selection from the self objective options and emit `chooseObjectives`. Use `onCommand`, `onStart`, `onContinue`, `onMenu` and `onClearError` rather than creating a second session.

Keep the player flow complete: configure solo → understand forecast → take action → issue train orders → end turn → see movement/wave → read result → restart. Show current phase, remaining action, train cargo, route ETA and the next closing stations. Distinguish a safe preview from a plan conditional on future repair. A risky order needs explicit confirmation.

Use the desktop tabletop direction in `docs/redesign-research.md`: physical table, model city, seated dispatchers, foreground 3D hands and a real card fan. Prioritize desktop composition at 1280–1920 px. Use a seated perspective and an explicit high planning view. Keep station labels, route state and deadlines readable above decor. Pair colors with symbols. Preserve menus and cards if WebGL fails. Dispose scene resources, including textures, on teardown and keep resize/DPR handling bounded.

The first visual checkpoint has been reviewed by the user. Current direction: remove the gameplay HUD and put controls and information into world objects, following `docs/diegetic-interface.md`. In seated mode, broad regions select collections; always retain a logical option and step through neighboring items with relative mouse movement. Keep a fixed camera anchor per region, remembered item IDs, unavailable inspection, border hysteresis and revision/drag protection. Never raycast seated items with a hidden cursor. Neutral LMB or Space opens a close board view with a visible cursor for rails, trains and stations; Space/Escape returns. Mandatory discard closes the board and forces the hand. Draw score/round/forecast on chalk surfaces. Preserve phase transitions, risk confirmation and complete result/restart flow. Menu and WebGL fallback may use DOM. Use local IBM Plex fonts. Characters follow `docs/characters.md`: original faceted meshes with distinct silhouettes, connected hands and public card backs only.

Read `docs/onboarding.md` for the first-launch flow. The tutorial may use a readable DOM coach over the 3D table. Ordinary gameplay retains world controls. Explain personal score, the separate city result, district bonuses and delivery before adding more options. Keep one immediate instruction and a scene cue.

`getTutorialLesson` advances from accepted `Observation`. A click, preview, cue or elapsed timer cannot confirm an order or complete a lesson. Completion requires delivered cargo. `tutorialCommandAllowed` limits teaching intent. Core legality remains authoritative. Do not create a parallel rules engine or script movement in the renderer.

Session owns independent IndexedDB slots `current` and `tutorial`. Preserve ordinary save/continue when starting, skipping, restoring or repeating training. Keep `last-train-onboarding-v1` versioned: `seen` dismisses the welcome, `complete` requires real delivery. Support menu and physical-help entry, exit, repeat and restored partial draws.

Never hide a mandatory second draw, discard or risk confirmation behind inspection or a tutorial step. A selected refuge is still a draft until an accepted order appears in the observation.

At the seated distance station plates show names only. Add queue and flood deadline in board mode. Put full context on the operation sheet. Print materials and district bonuses with large semantic text, distinct symbols, progress and reward. Allow ordinary hand-card and accepted-bonus inspection. Keep discard activation distinct.

Highlight stations of an inspected district and visibly mark the logically selected zone item. Explain fixed scenario data and seed behavior instead of presenting recurring district cards as new tasks. Browser screenshots must verify actual text size and contrast, not just Canvas resolution.

Add imported or generated assets only when they improve the current scene. Record source, license, transformations and hash. Raster generation supplies references or illustrations, not 3D meshes. Do not add paid asset dependencies to the MVP.

Check a full human turn and result flow in the browser. Inspect screenshots at desktop and narrow widths. Check selection, disabled actions, camera input, reduced motion and save/continue feedback. Report visual defects with reproducible steps and owned-file fixes.

Reset UI drafts, objective choices, rules and camera on `AppProps.sessionId` changes, including when one setup operation is replaced by another at revision 0. Do not infer a new session solely from phase, active player or `revision === 0`; they can be identical across two operations. Tutorial focus keys also include session identity.
