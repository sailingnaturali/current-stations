#!/usr/bin/env node
// CLI: extract a station bundle, or capture a validation fixture.
import { writeFileSync, readFileSync } from 'node:fs';
import { extractBundle } from '../src/extract.js';
import { captureGolden } from '../src/golden.js';
import { checkDrift, buildLock } from '../src/drift.js';
import { validateBundle } from '../src/validate.js';
import { fetchStationList } from '../src/noaa.js';

const USAGE = `current-stations — NOAA CO-OPS tidal-current station data

  current-stations extract <out.json> [--box S,W,N,E] [--stations ID,ID] [--pace ms]
  current-stations golden  <out.json> --station ID --bin N --start ISO --end ISO
  current-stations check   [lock.json]   exit 1 if NOAA's list has drifted from the lock
  current-stations lock    <out.json>    re-pin the lock to NOAA's current list
  current-stations validate <bundle.json> structural check on a bundle

Examples:
  current-stations extract currents.json                       # all US stations
  current-stations extract salish.json --box 47,-125,49.2,-122 # one region
  current-stations extract mine.json --stations PUG1717,PUG1701
  current-stations golden pug1741.json --station PUG1741 --bin 27 \\
    --start 2026-07-19 --end 2026-07-21

A full extraction is thousands of paced requests. NOAA throttles bulk callers.
`;

const [cmd, out, ...rest] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < rest.length; i += 2) flags[rest[i].replace(/^--/, '')] = rest[i + 1];

// `check` is the one command with a sensible default output path.
if (!cmd || (!out && cmd !== 'check') || flags.help !== undefined) {
  console.log(USAGE);
  process.exit(cmd ? 1 : 0);
}

const log = (m) => console.error(m);
const paceMs = flags.pace !== undefined ? Number(flags.pace) : undefined;

if (cmd === 'extract') {
  const { bundle, skipped } = await extractBundle({
    box: flags.box?.split(',').map(Number),
    stations: flags.stations?.split(','),
    ...(paceMs !== undefined ? { paceMs } : {}),
    log,
  });
  // Pretty-printed on purpose: this file is committed and its diff is how a NOAA
  // revision gets reviewed. Release artifacts are minified from it.
  writeFileSync(out, JSON.stringify(bundle, null, 2) + '\n');
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
} else if (cmd === 'check') {
  const lockPath = out ?? new URL('../stations.lock.json', import.meta.url).pathname;
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const d = await checkDrift(lock);
  const c = d.counts;
  log(`NOAA now: ${c.total} stations (H ${c.H}, S ${c.S}, W ${c.W})`);
  if (!d.drifted) {
    log('No drift — matches the lock.');
  } else {
    log(`Pinned:   ${d.expected.total} stations (H ${d.expected.H}, S ${d.expected.S}, W ${d.expected.W})`);
    for (const [label, ids] of [['ADDED', d.added], ['REMOVED', d.removed], ['RETYPED', d.retyped]]) {
      if (ids.length) log(`\n${label} (${ids.length}):\n  ${ids.join('\n  ')}`);
    }
    log('\nNOAA\'s station list has changed. Re-extract the bundle, re-run `lock`, and '
      + 'release — consumers are pinned to a bundle that no longer matches NOAA.');
    process.exitCode = 1;
  }
} else if (cmd === 'validate') {
  const v = validateBundle(JSON.parse(readFileSync(out, 'utf8')));
  log(`${out}: ${v.counts.harmonic} harmonic, ${v.counts.subordinate} subordinate`);
  for (const e of v.errors) log(`  ERROR: ${e}`);
  if (!v.ok) process.exitCode = 1;
} else if (cmd === 'lock') {
  const lock = buildLock(await fetchStationList({ paceMs: 0 }));
  writeFileSync(out, JSON.stringify(lock, null, 2) + '\n');
  log(`wrote ${out} — ${lock.counts.total} stations`);
} else {
  console.log(USAGE);
  process.exit(1);
}
