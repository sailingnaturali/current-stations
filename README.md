# current-stations

**NOAA CO-OPS tidal-current station data — the extractor, the schema, and the API's
undocumented behaviour, in one place.**

NOAA publishes harmonic constituents for **855 tidal-current stations** in US waters,
plus offset tables for **1,700+ subordinate** stations. That is enough to predict slack
water and max flood/ebb offline, anywhere in US waters, with no network at runtime.

Almost nobody uses it, because the API has a handful of undocumented behaviours that
make the data look like it doesn't exist. The worst one:

```
GET /stations/PUG1701/harcon.json?bin=0   → { "HarmonicConstituents": [] }
GET /stations/PUG1701/harcon.json?bin=18  → 26 constituents
```

`bin=0` is the natural thing to try. The empty array reads as "NOAA doesn't publish
current constituents." It does — at each station's `currbin`, and nowhere else. That one
cost us a day and a wrong architecture decision (we nearly took a dependency on XTide).

**[→ docs/noaa-api.md](docs/noaa-api.md) is the full write-up.** If you're fighting this
API, start there — including the two widely-repeated claims that turn out **not** to be
true (User-Agent blocking and `interval` casing), because chasing those wastes days too.

## Install

```bash
npm install @sailingnaturali/current-constituents
```

## Use it as a CLI

```bash
# every US current station → currents.json  (~2,800 stations, several minutes, paced)
npx current-stations extract currents.json

# one region
npx current-stations extract salish.json --box 47,-125,49.2,-122

# just the stations you care about
npx current-stations extract mine.json --stations PUG1717,PUG1701

# capture a validation fixture: constituents + NOAA's own predictions, one file
npx current-stations golden pug1741.json --station PUG1741 --bin 27 \
  --start 2026-07-19 --end 2026-07-21
```

> Run extractions from a residential connection — NOAA 404s the metadata API from
> datacenter IPs, so this will not work on a CI runner.

## Use it as a library

```js
import { extractBundle, fetchCurrentPredictions, fetchHarcon } from '@sailingnaturali/current-constituents';

// A bundle you can ship and predict from offline.
const { bundle, skipped } = await extractBundle({ stations: ['PUG1717'] });

// Or NOAA's own published predictions, live.
const events = await fetchCurrentPredictions(
  'PUG1717', 35, new Date('2026-07-19'), new Date('2026-07-21'),
);
// → [{ time: '2026-07-19T01:44:00.000Z', kind: 'flood', velocityMajor: 2.85, … }]
```

Ships TypeScript types. No dependencies.

## What a bundle looks like

```json
{
  "note": "Generated from NOAA CO-OPS mdapi …",
  "stations": [
    {
      "id": "PUG1717", "name": "Turn Point, Boundary Pass", "type": "harmonic",
      "floodDirection": 23.2, "ebbDirection": 203.2,
      "offset": 0.297,
      "constituents": [{ "name": "M2", "amplitude": 1.63, "phase": 295.3 }]
    },
    {
      "id": "PCT0236", "name": "…", "type": "subordinate",
      "reference": "SFB1201@10",
      "slackBeforeFloodOffset": -720, "slackBeforeEbbOffset": 480,
      "floodSpeedRatio": 0.7, "ebbSpeedRatio": 1.2
    }
  ]
}
```

Speeds in knots, directions degrees true, time offsets in seconds. Full schema:
[schema/currents.schema.json](schema/currents.schema.json) ·
[docs/schema.md](docs/schema.md).

Three details that are easy to get wrong and expensive to debug:

- **`offset` is Z₀**, the station's net mean flow (NOAA `majorMeanSpeed`). Slack is
  where the velocity curve crosses zero, so dropping this moves every slack time. The
  Salish passes carry −0.74 to +0.30 kn of it. Measured cost of omitting it: **15.6 →
  7.4 min** mean timing error.
- **A reference is `(station, bin)`**, hence `SFB1201@10`. Constituents vary by depth
  bin and a station may publish several; keying by station id alone silently predicts
  from the wrong depth.
- **A `type: S` station is not necessarily subordinate.** Many carry their own harcon
  and NOAA predicts them harmonically; the offset reduction overshoots them badly
  (89 min vs 6.8 min at PUG1716).

## Don't trust it until you've diffed it

Both halves of a validation come from NOAA, so the check is self-contained: predict from
`harcon` constituents, compare against NOAA's own `currents_predictions` for the same
days. `current-stations golden` captures both into one fixture that replays offline.

Expect ~10 min / 0.05 kn at a clean reversing station. Measured results, realistic
tolerances, and the list of convention questions this method settled:
[docs/validation.md](docs/validation.md).

## Who uses this

- [slackwater-engine](https://github.com/sailingnaturali/slackwater-engine) — Swift tide
  and current engine; vendors the released bundle for offline prediction.
- [signalk-currents](https://github.com/sailingnaturali/signalk-currents) — SignalK
  plugin serving live and offline currents to a boat's instruments.

## Scope

US waters only — this is a NOAA client, and NOAA publishes US stations. Other national
hydrographic offices publish current data under their own terms; that is out of scope
here.

## Licence and disclaimer

Code MIT. NOAA CO-OPS data is **public domain**.

**Predictions derived from this data are UNOFFICIAL.** They are not NOAA products, they
are not certified for navigation, and they should not be presented as either. Slack
timing at constricted passes can be off by 15 minutes or more. Use official published
tables to time anything that matters.
