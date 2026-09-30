# Casting trial

**Status: implemented and checked in desktop Chrome; actual Android-to-TV casting is not yet proven.**

This isolated experiment tests a separate TV board while the casting phone remains a usable controller. It reuses the existing scoring engine without editing any working-game files. One controller takes all turns for one to six nicknames. This is deliberately smaller than the planned multiplayer release: no QR player joining, separate player seats, production persistence, or full-game UI changes.

## What is ready

- A controller with **Show on TV**, playable roll/reroll/score controls, and zero-score confirmation.
- A custom Cast web receiver with a large shared board. It receives a room invitation and reads game state directly from the trial service; the phone never supplies a mirrored screen or forwards ongoing moves.
- A TV setup link for a spare Android, or a second Android resuming the same board, without taking a player seat.
- One room sound source. The phone stays audible until display audio is ready. A short display lease restores phone sound after loss. **Play sound here** transfers sound back; a late heartbeat cannot reclaim it.
- A separate watcher who explicitly chooses together/quiet or separately/own sound. Joining by link never infers location.
- Credential separation: viewers cannot roll, display invitations do not contain controller credentials, and another room cannot take over an attached board.
- Reconnecting starts with a silent current-state snapshot. It does not reroll dice or replay old sounds.

The trial uses simpler dice animation and approximate roll audio to expose casting mechanics. The final build must retain the existing game's polished animation and sound behavior.

## Local development

From the repository root, using Node.js:

```sh
node experiments/casting/server.mjs
node --test tests.mjs experiments/casting/tests.mjs
```

Open `http://127.0.0.1:4318` on the development PC. The working game continues using its unchanged server and port 4317. The trial server binds to loopback by default. This local preview is not a phone-accessible hosted link and does not prove casting.

### Optional home-network preview

Keep that trial server running and start a second terminal:

```sh
node experiments/casting/lan-preview.mjs
```

The helper prints the address to open on a phone or another PC on the same home subnet. If there is more than one private network address, pass the intended PC address as an argument. It binds only to that address, rejects requests from outside its local subnet, and forwards to the existing trial so rooms and the localhost preview remain intact. Keep both processes running. Windows Firewall must allow the Node runtime to receive these connections; no router port forwarding is needed.

This HTTP LAN preview allows controller, board-preview and watcher testing. It does not supply HTTPS or enable browser casting; the secure Sites trial and registered receiver application are still needed for that proof.

Optional browser checks require Playwright and Chrome (or set `TRIAL_BROWSER` to another installed Playwright channel):

```sh
node experiments/casting/browser-check.cjs
node experiments/casting/cast-check.cjs
```

`cast-check.cjs` uses explicit Google SDK test doubles. Passing it verifies our adapter contract; it says nothing about display discovery, native dialogs, Google registration, or physical TV behavior. The board-preview browser check uses the real trial service and real browser audio readiness, not a TV.

## Checks recorded on September 30, 2026

| Check | Result |
| --- | --- |
| Existing scoring/turn rule tests | All 5 passed; existing engine and tests unchanged. |
| New trial state, access, expiry, sound, replay and HTTP tests | All 9 passed, including a complete six-player game. |
| Independent controller, board and separate viewer in Chrome | Passed shared dice/turn/score updates, late display attachment, controller refresh and closure. |
| Sound ownership in the browser preview | Passed TV-ready handoff, transfer back to phone, no automatic reclaim, and separate watcher behavior. This is not a by-ear sound check. |
| Layout | 390px phone and 1280×720 board passed; six long nicknames fit the TV board without overflow. |
| Google SDK adapter test doubles | Passed app configuration, callback order, custom namespace, credential isolation, spare Android setup flow and different-room rejection. |
| Real Android Chrome Cast button and TV selection | Not tested. |
| Actual LG display compatibility, audible sounds and sleep/takeover | Not tested. |
| Public HTTPS test hosting | Not deployed. |
| Custom Cast application registration | Not completed; developer console currently requests account signup. |

These checks ran in a local Windows checkout of `multiplayer`, not the published cloud environment. The files and commands can be used in that environment later. No claim is made that a cloud task, public endpoint, or physical TV test has run.

## Developer setup before the physical trial

1. Serve this separate experiment from an HTTPS Node-compatible host. A static GitHub Pages deployment alone cannot run the room service. Do not change the existing game's Pages configuration or expose the user's home computer. Keep the trial to one process/instance: rooms are in memory, expire after two hours, and disappear on service restart. This is not production storage.
2. Register a **Custom Receiver** in the Google Cast Developer Console. Its URL is the hosted trial's `/receiver.html`; use the registered application ID as the server environment variable `CAST_APP_ID`. An empty ID disables Show on TV honestly, while board preview remains available. Never substitute Google's Default Media Receiver or a made-up application ID for the game board.
3. Google requires a one-time, non-refundable **$5 developer account registration** if there is no account yet. Account terms/payment need the owner's authorization. Players do not need Google developer accounts or game passwords.
4. For an unpublished receiver trial, register the actual Cast device in the developer console, wait until it is ready for testing, and restart it as Google instructs. This is a developer test step, not the intended household setup. Do not publish the receiver broadly just to avoid registering a test device.
5. Establish the actual LG model/casting path. YouTube appearing on the TV alone is not proof that a custom Google Cast receiver can run there. If that display supports only an app-specific YouTube path, test an existing compatible Cast device attached to it; disclose any hardware requirement before changing the product plan. An Android app cannot turn an incompatible television into a custom Cast receiver.

The Dockerfile can package this trial for a Node-compatible host, using the repository root as build context:

```sh
docker build -f experiments/casting/Dockerfile -t triple-yahoo-cast-trial .
```

The container listens on port 8080; its hosting service supplies HTTPS. The Docker build itself has not been run in this workspace.

## The short physical test

Once the developer setup is complete, the user steps should be:

1. Open the secure trial link in Android Chrome. Enter two nicknames and tap **Start trial**.
2. Tap **Show on TV** and choose the living-room display. The phone retains its controls while the TV shows its separate board.
3. Roll, select dice to reroll, and score. The TV follows the same dice and active scorecard. Confirm by ear that room sounds come from the TV once and the phone is quiet.
4. Open the watcher link on a second device and choose **Separately**. Confirm it hears every roll while the original room remains quiet on its phones. Choose **Together** in another watcher to confirm it stays quiet.
5. Refresh the controller, then briefly lock it and reopen it. Check that dice, scores and turn survive and old sounds do not replay. Close the original controller and observe whether the actual TV keeps its board; record the result rather than assuming it.
6. Use the TV setup link on another compatible Android and select the existing display. The same room and board must resume without a new game. Try a different room to confirm it cannot silently replace the active board.
7. Stop the TV. Confirm the original phone can continue and room sound returns once. The separate watcher's sound remains independent.

Record the Android/browser versions, actual TV/Cast model, each result, and any recovery steps. **The casting milestone passes only after the real Android/TV checks pass.** If browser casting fails on the actual Android, the next trial is one integrated Android sender app with the game controls and Cast button, using this same registered receiver and room service.

## Official references

- [Google Web Sender setup and supported platforms](https://developers.google.com/cast/docs/web_sender)
- [Sender integration, custom Cast buttons and session lifecycle](https://developers.google.com/cast/docs/web_sender/integrate)
- [Custom web receiver](https://developers.google.com/cast/docs/web_receiver/basic)
- [Receiver custom-message channels](https://developers.google.com/cast/docs/web_receiver/core_features#custom_messages)
- [Non-media receiver options](https://developers.google.com/cast/docs/reference/web_receiver/cast.framework.CastReceiverOptions)
- [App/device registration and the developer account fee](https://developers.google.com/cast/docs/registration)
