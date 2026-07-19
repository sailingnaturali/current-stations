#!/usr/bin/env node
// CLI: extract a station bundle, or capture a validation fixture.
import { writeFileSync } from 'node:fs';
import { extractBundle } from '../src/extract.js';
import { captureGolden } from '../src/golden.js';

const USAGE = `current-stations — NOAA CO-OPS tidal-current station data

  current-stations extract <out.json> [--box S,W,N,E] [--stations ID,ID] [--pace ms]
  current-stations golden  <out.json> --station ID --bin N --start ISO --end ISO

Examples:
  current-stations extract currents.json                       # all US stations
  current-stations extract salish.json --box 47,-125,49.2,-122 # one region
  current-stations extract mine.json --stations PUG1717,PUG1701
  current-stations golden pug1741.json --station PUG1741 --bin 27 \\
    --start 2026-07-19 --end 2026-07-21

Run extractions from a residential connection — NOAA 404s the mdapi from datacenter IPs.
`;

const [cmd, out, ...rest] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < rest.length; i += 2) flags[rest[i].replace(/^--/, '')] = rest[i + 1];

if (!cmd || !out || flags.help !== undefined) { console.log(USAGE); process.exit(cmd ? 1 : 0); }

const log = (m) => console.error(m);
const paceMs = flags.pace !== undefined ? Number(flags.pace) : undefined;

if (cmd === 'extract') {
  const { bundle, skipped } = await extractBundle({
    box: flags.box?.split(',').map(Number),
    stations: flags.stations?.split(','),
    ...(paceMs !== undefined ? { paceMs } : {}),
    log,
  });
  writeFileSync(out, JSON.stringify(bundle) + '\n');
  log(`wrote ${out} — ${bundle.stations.length} stations`);
  if (skipped.failed.length) process.exitCode = 1;
} else if (cmd === 'golden') {
  const fixture = await captureGolden(
    flags.station, Number(flags.bin), new Date(flags.start), new Date(flags.end),
    { ...(paceMs !== undefined ? { paceMs } : {}) },
  );
  writeFileSync(out, JSON.stringify(fixture, null, 2) + '\n');
  log(`wrote ${out} — ${fixture.constituents.length} constituents, ${fixture.events.length} events`);
  if (fixture.predictionsError) {
    log(`WARNING: no predictions captured (${fixture.predictionsError}) — re-run later`);
    process.exitCode = 1;
  }
} else {
  console.log(USAGE);
  process.exit(1);
}
