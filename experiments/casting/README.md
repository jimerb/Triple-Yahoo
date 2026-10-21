# Triple Yahoo: concurrent-round multiplayer experiment

This experiment is isolated on the `multiplayer` branch in draft [PR #3](https://github.com/jimerb/Triple-Yahoo/pull/3). **DO NOT MERGE.** It may change substantially. The original game, scoring engine, saved games, and released `main` remain unchanged.

## Play together

1. The organizer enters a nickname and creates a room.
2. Everyone nearby scans the room's QR, edits or confirms a nickname, and taps **Join Game**. Opening a QR alone does not take a seat. Up to six players can join before the organizer starts.
3. All players play round 1 at the same time, each with their own five dice and scorecard. Each gets up to three rolls and commits one empty scoring box. Selected dice are the ones to reroll, matching the original rules.
4. Finished players keep their final dice and score visible while the others finish. Once every remaining player has scored, the next round opens automatically. After 39 rounds, show all winners, standings, and completed cards.
5. The organizer can choose **Play again** to return the same group to the lobby, review the roster, and start another game.

There are no remote-player roles, share-invitation buttons, separate-place sound groups, or remote viewer pages. QR invitations are bearer links under the hood: someone could photograph or forward one. QR-only UX does not prove physical presence or geofence a room. Joining closes at game start; nicknames are labels and do not grant another player's seat.

## Phones, TV, and sound

Each phone always controls its own card and dice; dice remain visible while the card scrolls. A collapsible shared board lets players inspect the group without moving their controls. The shared TV is an independent fixed grid containing everyone's dice, reroll choices, scorecard, total, and finished/reconnecting status. It never cycles through a single active player.

An Android player can cast and play on the same phone. A spare Wi-Fi Android can scan a separate TV-setup QR without occupying a seat. The registered Custom Receiver remains **12757F35** at the existing HTTPS Sites `/receiver.html` URL. No TV application installation or router/port changes are part of this design. iOS remains a browser controller and is not expected to initiate casting.

One device supplies room sound: initially the organizer's phone, then the TV only after its audio is ready. **Use this phone** transfers that single sound source; **Mute** silences locally. Bursts of simultaneous sounds are coalesced instead of producing six overlapping effects. Reconnecting snapshots never replay old rolls. Actual TV sound, mobile backgrounding, and the earlier physical Cast launch failure still need device verification.

## Recovery and safety

The hosted service owns each player's dice, rolls, card, and revision, plus a shared round barrier. Another player's move or a sound heartbeat cannot invalidate your move. Writes validate the seat, game, round, and personal revision. Duplicate commands cannot grant another roll or score. Dice selection gives immediate local feedback while the confirmed result remains authoritative.

A missing player holds up the next round. The organizer can explicitly remove that seat; its partial card remains visible and it no longer blocks progress. No automatic moves or skips occur. If the organizer has been offline for more than 45 seconds, a remaining player can explicitly **Take over organizing**, then remove a departed player if necessary. Old organizer credentials are revoked. Refresh restores saved seats; nicknames alone cannot reclaim them. Rooms expire after four hours. Earlier single-controller trial rooms require a new room.

The public Sites trial provides HTTPS and persistent shared rooms; nearby players still need internet. The organizer's phone is not a web server. The local Node preview below stores rooms in memory and loses them on restart. Local HTTP preview does not prove Cast discovery or launching.

## Development

Run `node experiments/casting/server.mjs` from the repository for the loopback preview on port 4318. Set `HOST` to a specifically intended interface only for authorized LAN testing. `CAST_APP_ID` is an optional configuration value, not a secret. Real casting should use the existing HTTPS trial site.

Run:

```text
node --test tests.mjs experiments/casting/tests.mjs experiments/casting/rounds.test.mjs experiments/casting/controller-state.test.mjs experiments/casting/cast-recovery.test.mjs
```

The original scoring tests, full six-player 39-round completion, independent controls, barrier/idempotency, reconnect/removal, organizer recovery, sound leases, HTTP access boundaries, and Cast lifecycle logic are covered. The Sites adapter separately tests concurrent database writes and Worker transport. Vendored QR generation is Nayuki's MIT-licensed encoder; its license is retained under `vendor/`.

Browser QA: an actual rendered QR decoded independently, two browser seats joined with editable names, rolled independently, waited at the barrier and advanced together. Six complete cards and dice fit a 1280 by 720 shared board. A 375 CSS-pixel phone view retained visible dice above the scrolling card without horizontal overflow. These desktop checks do not establish physical iOS/Android or Chromecast success.

## Earlier physical casting evidence

The September 30 trial launched on the household Chromecast and updated scores, but the TV dice were blank, selection was slow, and a native popup showed localhost. Later launches failed after TV selection. Existing SVG pips, immediate selection feedback, session polling, staged timeouts, explicit receiver acknowledgements, and bounded reset/stop recovery are retained. Their physical-device outcome remains unverified; this redesign does not claim to solve the underlying launch cause.
