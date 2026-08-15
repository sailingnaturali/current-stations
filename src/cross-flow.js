// What this package emits is a MAJOR-AXIS model: one signed speed along a fixed
// flood axis. NOAA also publishes `minorMeanSpeed` — the DC component of flow
// perpendicular to that axis, running at all times INCLUDING slack — and a
// major-axis model drops it.
//
// The per-station minor axis is deliberately not carried (docs/schema.md). But a
// bundle should be able to state the bound on its own approximation rather than
// leave it unmeasured, so the extractor records this census instead.
//
// Measured 2026-08-15. Across the 856 records a full US bundle holds: worst
// ratio 0.241 (BOS1130), worst absolute 0.80 kn (PUG1619 Marrowstone Point).
// The 0.241 also holds across all 2,800 bin-records NOAA publishes, so the
// bound below is safe for bins we don't currently take. Full investigation:
// openwatersio/slackwater-ios#102.

/** Provenance, carried in the census so the number explains itself in the file. */
const MEASURED =
  'NOAA minorMeanSpeed — flow perpendicular to the flood axis, present at all times including slack';

/**
 * Ratio of cross-flow to along-axis peak above which the flood axis is a poor
 * description of the station, and so the major-axis model there is suspect.
 * ~2x the worst real value: a regression guard, not a quality gate.
 */
export const CROSS_FLOW_RATIO_MAX = 0.5;

const r3 = (n) => Math.round(n * 1000) / 1000;

/**
 * @param {{id: string, crossFlow: number, alongAxisPeak: number}[]} samples
 * @returns {object|null} the census, or null when there is nothing to measure
 */
export function crossFlowCensus(samples) {
  if (!samples?.length) return null;

  let gte0_25kn = 0;
  let gte0_50kn = 0;
  let worstRatio = null;
  let worstAbsolute = null;

  for (const s of samples) {
    // A station with no along-axis flow has no axis to be wrong about.
    const ratio = s.alongAxisPeak > 0 ? s.crossFlow / s.alongAxisPeak : 0;
    if (s.crossFlow >= 0.25) gte0_25kn += 1;
    if (s.crossFlow >= 0.5) gte0_50kn += 1;

    // Tracked separately on purpose: the largest ratio and the largest current
    // are usually different stations, and they answer different questions.
    if (!worstRatio || ratio > worstRatio.ratio) {
      worstRatio = {
        id: s.id,
        crossFlow: r3(s.crossFlow),
        alongAxisPeak: r3(s.alongAxisPeak),
        ratio: r3(ratio),
      };
    }
    if (!worstAbsolute || s.crossFlow > worstAbsolute.crossFlow) {
      worstAbsolute = { id: s.id, crossFlow: r3(s.crossFlow) };
    }
  }

  return { measured: MEASURED, records: samples.length, gte0_25kn, gte0_50kn, worstRatio, worstAbsolute };
}
