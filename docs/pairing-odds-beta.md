# Live qualification projections (v1.11.0)

The pairing page now uses its shared activity URL and tracked player ID to read a live tournament. The user supplies total Swiss rounds and cutoff. Ultra Ball exposes top 8/16/32; Premier Day 1 defaults to 256; Master Ball requires a custom cutoff. Results stay at the end of the page and use a three-column record table with cutoff tabs, expected field counts and conditional qualification estimates. Historical round replay remains available separately.

## Live ingestion and access

`ptcg-pairing-forecast` is a new, read-only Edge Function. Platform JWT verification is enabled. Every non-preflight request additionally validates the user with `auth.getUser(token)` and requires the existing `is_pairing_authorized` RPC to return true. No schemas, RLS policies, watches, notification functions or private identity data are changed. It only returns public tournament IDs, points and final ranks.

Source URLs are restricted to the official TCG Meister host and activity/round paths; requests are rebuilt as canonical HTTPS URLs. Redirects stay on that host. It reads all advertised pages (up to 100 / 4,096 players), rejecting duplicate pages, reciprocal pairing mismatches and missing scores. Requests time out after 12 seconds per source page and public page results are cached in memory for 20 seconds. It reads only the selected round's published cumulative points. A manual-round replay never reads final standings. In automatic latest mode, a published official final rank takes precedence over all projections.

Unlike the old fixture-only UI, rounds 1 and 6 are no longer disabled. An explicit BYE is handled as three points; a blank opponent is left unresolved. The user must mark each unresolved player as a bye (three points) or absent/dropped (excluded from later rounds and ranks). No points are inferred from a blank. Incorrectly confirming these states changes the estimate; confirmation must reflect the venue.

## Probability model

A seeded, adaptive 200–3,000 trial model uses the published current-round pairings and approximate future Swiss pairing within nearby point groups. User win-rate assumptions are 40/50/60%; other matches are 50%. The model assumes three points for a win or bye, zero for a loss, no future late entries/withdrawals, and no future draws/double losses. Historical fixtures include past opponents; live snapshots currently use only the current round and do not reconstruct all prior match history. This is not the official matching algorithm.

In each trial, B players have higher points than the player and E players (including the player) have equal points. For cutoff K, the estimate assigns `clamp(K-B,0,E)/E` of the tie group to qualification. It is explicitly an equal-share estimate without the exact OMW/WOScore/AVOMW ranking. The retained lower/upper bounds are B+E<=K and B<K. The bounds are shown in a collapsed explanation instead of the main result cells. They are not confidence intervals.

Expected field counts are simulation averages. A row's qualification percentage is conditional on the tracked player finishing on that row's points. Unattainable rows are gray and have no percentage. Fewer than 20 occurrences are shown as insufficient samples. Records are inferred from three points per win with no draws; late entrants/absences should be interpreted against the organizer's actual record. A 100% simulation result or suggested stable record is not a qualification guarantee.

Simulation runs in a Web Worker to keep phone controls responsive. Settings survive refresh in the current tab per authorized user and tournament; results and pending confirmations are not automatically restored. Changes to the source, player or settings cancel work and clear stale results.

## Verification

- `node tests/pairing-odds.test.cjs`: probability bounds, conditional averaging, field population and slot conservation, seeded reproducibility, known results, equal ties, pending bye/absence handling, and historical final rank checks.
- `NODE_PATH=<jsdom 26.1.0 location> node tests/pairing-odds-dom.test.cjs`: live/historical mode, shared source/player, cutoff-tab rendering, stale clearing, per-player blank confirmation, historical replay without future leakage, official final transition, custom cutoffs, and auth gate. APIs are mocked; no production records or notifications are written.
- The source parser/reader was checked against all three pages of historical rounds 1–7: 115,116,116,116,112,111,108 listed players, and 108 final standings with tw39371632 ranked 15 on 15 points.
- Handler tests validate missing/invalid user authentication, unauthorized RPC response, no source reads before authorization, selected-round isolation, and official final transition.

A single historical tournament does not calibrate probability accuracy. Exact official tiebreak simulation and additional tournament validation remain future work.
