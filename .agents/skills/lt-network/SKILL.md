---
name: lt-network
description: "Implement Last Train private multiplayer in server and src/network after the solo MVP. Use for rooms, authoritative commands, private observations, persistence and reconnects."
---

# Last Train network

Read [architecture](../../../docs/architecture.md), the online stage in [development](../../../docs/development.md), and `src/shared/types.ts`. Confirm the integrator has assigned the online stage and network paths. Do not advertise online from a local solo session.

Keep the server authoritative. Validate session control, match, revision, turnId, controlEpoch and phase before core legality. Serialize commands per room. Assign seats atomically. Invitation access does not grant an occupied seat.

Deduplicate `(matchId, seatId, commandId)`. The same ID and payload returns its previous result. A different payload with that ID fails. Commit state, command journal and acknowledgement in one SQLite transaction before memory updates or broadcasts. Test a lost acknowledgement after commit.

Send per-seat observations constructed by the core. Keep hidden hands, objectives, deck order and randomness outside public packets, logs and error details. Shuffle online decks with server cryptographic randomness and persist the order privately.

Use one timer for the entire turn. A timeout bot completes the current draw/order phase. Control changes increment controlEpoch. Reject late socket, timer and worker results after a control change. Return human control at the start of that seat's next turn.

Pause when all humans disconnect. On restart, restore the committed phase and grant a fresh turn budget. Verify duplicate commands, interrupted draws, restart, seat races and human → bot → human with multiple clients before declaring private online ready.

Hand off protocol examples, persistence schema, tested failures and local server startup. Hosting or paid infrastructure is a separate user decision.
