# Historical qualification estimate beta (v1.10.0)

The pairing page has an opt-in historical simulation panel for tournament 3000442. It does not call the watch or notification APIs. Existing pairing authorization controls remain in place. Fixtures contain public player IDs only.

## Model and limits

Each snapshot contains only players, points and opponent history available before the selected round, plus that round's announced pairings. Rounds 1 and 6 have a blank opponent that cannot safely be treated as a bye (the round-1 blank entrant has 0 points in round 2). They are disabled and rejected by the engine; round 5 is the default. The next round uses the other snapshots' fixed pairings; later rounds pair nearby scores, avoiding rematches where possible. A seeded 3,000-trial model assumes 3 points per win, 0 per loss, 3 for a bye, no future drops/late entries, no draws/double losses. Other matches use 50%; the selected player's assumption can be 40/50/60%.

We have NOT validated the exact tournament's OMW/WOScore/AVOMW calculations for withdrawals and byes. The beta therefore does not manufacture a single tiebreak-aware probability. In each trial, a player with B players on higher points and E players (including themselves) on equal points can occupy places B+1 through B+E. For cutoff K, B+E<=K contributes to the lower bound; B<K contributes to the upper bound. These are score-tie uncertainty bounds conditional on the model, not statistical confidence intervals or guarantees. Percentages are rounded to whole numbers. Cumulative top-N probabilities overlap.

The final standings fixture is fetched only when the user explicitly reveals the comparison and is never passed to the simulation. Changing total rounds from the historical 7 hides the actual-result comparison. Changing any setting clears stale results.

## Source capture

Captured 2026-10-01 from https://tcg.sfc-jpn.jp/tour.asp?tid=3000442 and all three pages of each round:
`https://tcg.sfc-jpn.jp/tourround.asp?tid=3000442&kno=ROUND&Page=PAGE&Sort=Number&Order=&znt=0`

Rounds 1–7 list 115, 116, 116, 116, 112, 111, 108 players. Thus the first-round count is not a verified attendance count and later entrants must not be retroactively inserted in earlier snapshots.

The final uses `kno=9999999&znt=1`, three pages, 108 unique player IDs. Player tw39371632 finishes 15th with 15 points. A single historical comparison does not calibrate probability accuracy.

## Verification

Run `node tests/pairing-odds.test.cjs` from the repository root. Covers score ties across a cutoff, deterministic known wins/losses, oversized cutoffs, input rejection, monotonic cumulative probabilities, fixture completeness, first-round exclusion of future entrants, no input mutation, and final score/rank bounds for every listed player.

DOM interaction tests (`tests/pairing-odds-dom.test.cjs`, jsdom 26.1.0) also pass for result rendering, separate final-result loading, stale-result clearing, presets, validation and the authorization gate.

Browser rendering validation was unavailable in the execution environment because Chromium's download was truncated. Formal live-event ingestion, exact tiebreak validation, additional tournaments and probability calibration remain outside this historical beta.
