# Validation log

## First playable version (2026-09-28)

- Read the original Windows Write manual (`MANUAL.WRI`) as text. The original program was not run.
- Automated rule tests pass: category scoring and edge cases, bonus thresholds for all three columns, reroll and turn limits, and complete 39-turn games for one to four players.
- In the browser: rolled, marked a die, rerolled, scored Pot luck in the triple column, and confirmed the 66 points survived a page reload.
- Two-player game: confirmed the "pass the dice" pause and the handoff to player 2.

## Interface refresh (2026-09-28)

- Headless Chromium at 1440×900, 1280×720, 1180×820, 820×1180, 744×930, 390×664, 360×640 and 844×390: no sideways overflow; no page scroll on tablets and desktops; on phones the scorecard scrolls with the dice tray docked.
- Played a full two-player game (78 turns) through the interface with animation off: handoff, zero confirmation, results and top ten all worked with no JavaScript errors.

## Scorecard and full-screen update (2026-09-28)

- Scorecard fits with no scrolling at 1333×596, 1280×560, 1366×625, 1024×600, 800×600, 600×800, 700×900, 744×930, 768×1024, 820×1180, 1180×820, 1333×750, 1920×1080 and 1920×1000.
- Upper-section ▲/▼ pace arrows and per-column running totals checked against hand-calculated values.
- Full-screen button: enter, exit, F key and Esc all work; the layout is identical in and out of full screen.
- Rule tests still pass.

## Solid dice and recorded sound (2026-09-28)

- Dice rebuilt as solid bodies: flat faces, 12 rounded edge strips and 8 rounded corner caps, with a hidden core. Checked close-ups at rest and at four points mid-throw at 1280×800 and 390×664: no see-through gaps at any angle. The 1 is now black like the other pips.
- Roll sound rendered offline in headless Chromium through the real game code: the recording loads and is used on the very first roll (no fallback to synthesized sound). Loudest moment of a five-dice roll about -17 LUFS with peaks around -2 dBFS (no clipping); the old synthesized roll was about -22 LUFS and the raw recording -29 LUFS.
- Rule tests still pass. No JavaScript errors.
- Score count-up: checked in headless Chromium at 1440×900, 1180×820, 820×1180 and 390×844. A 145-point Yahoo! ticks up over about 1.3 seconds with a "+150" chip beside the grand total; the Roll button stays enabled the whole time. Column totals, the upper-section running number and player chips count in step. Two-player handoff dialog runs its own count; the results dialog tallies each final score up from zero. Earning the upper bonus pops the "+35 bonus" label. Switching the setting off makes every total instant.
- Round progress bar: checked at 320, 360, 375, 390, 412, 820, 1180 and 1440 wide, dark and light themes. Label stays readable on both sides of the fill edge; no overlap with the wordmark down to 320 wide (the "/ 39" drops at 320). The bar paints instantly on page load and only animates when a score is taken.
- Phones: the scorecard header scrolls out of view, so a single player now also gets the name-and-total chip in the docked dice tray, where the count-up stays visible.
- Fixed: "+105 bonus" no longer clips on phones (the word "bonus" drops to a second line).

## Polish pass (2026-09-29)

- Favicon: `favicon.ico` holds 7 hand-tuned sizes (16 to 256 px, PNG frames), plus `favicon.svg` and a 180 px `apple-touch-icon.png`. Checked on dark and light tab colours at 16, 24, 32 and 48 px.
- How to Play rebuilt as `help.mjs`. Checked in headless Chromium at 1920×1080, 1440×900 (fits with no scrolling), 1366×768, 1180×820, 1024×768, 820×1180, 390×844, 360×640, 320×568 and 844×390: no sideways overflow on any phone tab. Example point values come from the real scoring function.
- Names: entered "Jim" and "Terry", reloaded, New game came back filled in with two players. Wiped the saved game and reloaded: a new game started with the remembered names.
- Volume slider: 50% sets master gain to 0.225 (squared curve, 0.9 at 100%); saved and restored; disabled while sound is off.
- Yahoo! reward: rolled a forced Yahoo with the full sound selected and saw the 9.7 s track start once; scoring the Yahoo box did not restart it; the next roll faded it out; Roll stayed enabled throughout. Simple mode never starts the track. The Settings preview stops when the dialog closes. Loudest moment measured about -15 LUFS momentary (dice: about -17), integrated about -21 LUFS.
- Yahoo! celebration edge case: the burst and reward sound now fire only while the rolling player still has an open Yahoo! box (`hasOpenYahoo` in `engine.mjs`, with a rule test). Checked in the browser with a forced five-of-a-kind: celebrates with all three boxes open or one left open; stays silent with all three filled (including a 0), in solo and two-player games.
- Rule tests still pass (5 of 5).

## Not yet covered

- Physical iOS and Android devices (layouts were checked in a desktop browser at phone sizes).
- Sound runs without errors and was measured for level in automated testing, but has not been judged by ear there. The reward level (0.6 of full scale) is a measured starting point; adjust `REWARD_GAIN` in `audio.mjs` if it feels too loud or quiet.
