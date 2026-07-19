# Validation

A tidal-current engine always produces plausible-looking output. Sinusoids sum to
something that rises and falls twice a day no matter how wrong the constituents,
conventions, or offsets are. The only way to know an implementation is right is to
diff it against NOAA's own published predictions.

## Method

Both halves come from NOAA, so the comparison is self-contained:

1. Pull a station's constituents from `harcon.json` at its `currbin`.
2. Pull NOAA's `currents_predictions` (`interval=max_slack`) for a window of days.
3. Predict that window from the constituents; pair each NOAA event with the nearest
   predicted event of the same kind; report mean and worst timing error and mean
   speed error.

```bash
current-stations golden pug1741.json --station PUG1741 --bin 27 \
  --start 2026-07-19 --end 2026-07-21
```

The fixture holds constituents *and* NOAA's events, so the check replays offline
forever. Wire it into your test suite; it is the regression gate for every convention
decision below.

## What this method settled

Each of these was an open question that the diff answered unambiguously — the wrong
choice produces structural, obvious error, not noise:

| Question | Answer | Wrong-choice cost |
|---|---|---|
| Which phase field? | `majorPhaseGMT` | structural offset across all events |
| Sign convention for labeling? | classify by **velocity sign**, not extremum high/low | a relaxation peak during a long ebb mislabels as flood |
| Are `mfcAmpAdj`/`mecAmpAdj` ratios or deltas? | ratios | immediate, large speed error |
| Include `majorMeanSpeed` (Z₀)? | yes | 15.6 → 7.4 min mean timing (see below) |
| Reference keyed by id, or (id, bin)? | (id, bin) | ~50 min at any station whose reference isn't primary-bin |
| Predict type-S via offsets or own harcon? | own harcon when non-empty | 89 min vs 6.8 min at PUG1716 |

## Measured results

From the reference implementation ([slackwater-engine](https://github.com/sailingnaturali/slackwater-engine),
Swift), against NOAA's own predictions:

| Check | Station(s) | Result |
|---|---|---|
| Harmonic oracle | PUG1741 Bellingham Channel (2.8 kn reversing) | **9.7 min / 0.055 kn** (11 events) |
| Subordinate reduction | PCT0236 (ref SFB1201) | **6.1 min / 0.05 kn** (11 events) |
| Subordinate batch | 9 pure subordinates — mixed regions, offset signs, ratios 0.2–1.5 | worst **7.7 min / 0.101 kn** |
| Salish Sea passes | Deception, Rosario, San Juan Ch., Turn Point, Admiralty, Race Rocks | worst **15.3 min / 0.28 kn** |

Per-pass: Deception 14.2 min · Rosario 2.2 · San Juan Channel 8.4 · Turn Point 15.3 ·
Admiralty Inlet 3.5 · Race Rocks 6.0.

And independently, from a second implementation
([signalk-currents](https://github.com/sailingnaturali/signalk-currents), TypeScript
over [Neaps](https://github.com/neaps/neaps)) — the Z₀ measurement at Turn Point,
three days, 24 events:

| | mean timing | worst | mean speed |
|---|---|---|---|
| without Z₀ | 15.6 min | 55 min | 0.147 kn |
| with Z₀ | **7.4 min** | **21 min** | **0.066 kn** |

## Realistic tolerances

Harmonic **±20 min / ±0.35 kn**; subordinate **±30 min / ±0.4 kn**. Tighter than that
and you are fitting noise: the subordinate reduction is a published *table*
approximation, and constricted passes are genuinely harder than open water — Deception
Pass and Turn Point are the worst performers above for real physical reasons, not
implementation ones.

**These are planning-grade numbers.** A 15-minute slack error matters at a pass where
the gate is 20 minutes wide. Derived predictions are unofficial; don't time a transit
of a fast narrows on them alone.

## Extractor fidelity

`extract` is diffed against a known-good bundle whenever it changes. Most recent run —
Salish Sea box (47,-125 → 49.2,-122), 183 stations selected, 135 harmonic + 30
subordinate + 20 type-W skipped, 0 unresolvable references:

**164 of 164 overlapping stations byte-identical** to the reference bundle, plus
`PUG1519` (Point Richmond, Colvos Passage) which NOAA has added since. Station-count
drift like that is expected — NOAA's list grows.

Unit tests (`npm test`) cover the traps with a fake NOAA: per-bin reference keying,
type-S own-harcon precedence, two-slack offsets, ratio handling, list de-duplication,
and both response shapes NOAA has shipped for `currents_predictions`.
