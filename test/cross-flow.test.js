import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crossFlowCensus, CROSS_FLOW_RATIO_MAX } from '../src/cross-flow.js';

const s = (id, crossFlow, alongAxisPeak) => ({ id, crossFlow, alongAxisPeak });

test('counts the knot thresholds and finds both worsts', () => {
  const c = crossFlowCensus([
    s('A', 0.10, 5.0),   // under both thresholds
    s('B', 0.30, 4.0),   // >= 0.25
    s('C', 0.60, 2.0),   // >= 0.25 and >= 0.50; worst absolute
    s('D', 0.20, 0.5),   // ratio 0.4 — worst ratio, but small in knots
  ]);
  assert.equal(c.records, 4);
  assert.equal(c.gte0_25kn, 2);
  assert.equal(c.gte0_50kn, 1);
  assert.equal(c.worstRatio.id, 'D');
  assert.equal(c.worstRatio.ratio, 0.4);
  assert.equal(c.worstAbsolute.id, 'C');
  assert.equal(c.worstAbsolute.crossFlow, 0.6);
});

test('the two worsts are independent — a big ratio is not a big current', () => {
  // D above has 4x C's ratio and a third of its cross-flow. Reporting only one
  // would hide either "the axis is wrong here" or "there is real water moving".
  const c = crossFlowCensus([s('C', 0.60, 2.0), s('D', 0.20, 0.5)]);
  assert.notEqual(c.worstRatio.id, c.worstAbsolute.id);
});

test('a zero along-axis peak yields ratio 0, not Infinity or NaN', () => {
  const c = crossFlowCensus([s('A', 0.3, 0)]);
  assert.equal(c.worstRatio.ratio, 0);
});

test('an empty sample set is null, not a census of nothing', () => {
  assert.equal(crossFlowCensus([]), null);
});

test('rounds to 3 decimals so a re-extract diff is reviewable', () => {
  const c = crossFlowCensus([s('A', 0.1234567, 1.9876543)]);
  assert.equal(c.worstRatio.crossFlow, 0.123);
  assert.equal(c.worstRatio.alongAxisPeak, 1.988);
  assert.equal(c.worstRatio.ratio, 0.062);
});

test('the bound rejects nothing that exists in the real data', () => {
  // Worst measured ratio across all 2,800 harmonic bin-records is 0.241 (BOS1130).
  assert.ok(CROSS_FLOW_RATIO_MAX > 0.241, 'bound must not reject current NOAA data');
});
