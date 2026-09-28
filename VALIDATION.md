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

## Not yet covered

- Physical iOS and Android devices (layouts were checked in a desktop browser at phone sizes).
- Sound runs without errors in automated testing but has not been judged by ear there.
