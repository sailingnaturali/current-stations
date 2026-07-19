// Structural checks on a bundle. Cheap, and they catch the failures that actually
// happen: a truncated/partial extraction, or a subordinate pointing at a reference
// that isn't there (which silently yields no prediction at that station).

/** @returns {{ok: boolean, counts: object, errors: string[]}} */
export function validateBundle(bundle) {
  const errors = [];
  const stations = bundle?.stations;
  if (!Array.isArray(stations)) return { ok: false, counts: {}, errors: ['no stations array'] };

  const harmonic = stations.filter((s) => s.type === 'harmonic');
  const subordinate = stations.filter((s) => s.type === 'subordinate');
  const ids = new Set(harmonic.map((s) => s.id));

  const orphans = subordinate.filter((s) => !ids.has(s.reference));
  if (orphans.length) {
    errors.push(`${orphans.length} subordinate(s) reference a missing station: `
      + orphans.slice(0, 5).map((s) => `${s.id}→${s.reference}`).join(', '));
  }

  const dupes = stations.length - new Set(stations.map((s) => s.id)).size;
  if (dupes) errors.push(`${dupes} duplicate station id(s)`);

  const noCons = harmonic.filter((s) => !s.constituents?.length);
  if (noCons.length) errors.push(`${noCons.length} harmonic station(s) with no constituents`);

  // Z0 absent is a silent, systematic slack-timing error — the exact bug this project
  // was started to fix. A bundle without it anywhere is a broken extraction.
  const withZ0 = harmonic.filter((s) => typeof s.offset === 'number').length;
  if (harmonic.length && withZ0 === 0) errors.push('no harmonic station carries a Z0 offset');

  const unknownType = stations.filter((s) => s.type !== 'harmonic' && s.type !== 'subordinate');
  if (unknownType.length) errors.push(`${unknownType.length} station(s) of unknown type`);

  return {
    ok: errors.length === 0,
    counts: { harmonic: harmonic.length, subordinate: subordinate.length, total: stations.length },
    errors,
  };
}
