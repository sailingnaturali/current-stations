import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBundle } from '../src/validate.js';

const harmonic = (id, extra = {}) => ({
  id, name: id, type: 'harmonic', latitude: 48, longitude: -123, floodDirection: 90, ebbDirection: 270,
  offset: -0.5, constituents: [{ name: 'M2', amplitude: 2, phase: 100 }], ...extra,
});
const sub = (id, reference, extra = {}) => ({
  id, name: id, type: 'subordinate', latitude: 48, longitude: -123, reference, ...extra,
});

test('a healthy bundle passes and reports counts', () => {
  const v = validateBundle({ stations: [harmonic('A'), sub('B', 'A')] });
  assert.equal(v.ok, true);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.counts, { harmonic: 1, subordinate: 1, total: 2 });
});

test('catches a subordinate pointing at a missing reference', () => {
  // The silent failure: that station simply yields no prediction.
  const v = validateBundle({ stations: [harmonic('A'), sub('B', 'GONE@4')] });
  assert.equal(v.ok, false);
  assert.match(v.errors[0], /B→GONE@4/);
});

test('catches duplicate ids', () => {
  const v = validateBundle({ stations: [harmonic('A'), harmonic('A')] });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(), /duplicate/);
});

test('catches a harmonic station with no constituents', () => {
  const v = validateBundle({ stations: [harmonic('A', { constituents: [] })] });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(), /no constituents/);
});

test('catches a bundle that lost Z0 entirely', () => {
  // The regression this whole project started from — systematic slack-timing error.
  const v = validateBundle({ stations: [harmonic('A', { offset: undefined })] });
  assert.equal(v.ok, false);
  assert.match(v.errors.join(), /Z0/);
});

test('a Z0 of exactly 0 is legitimate, not missing', () => {
  const v = validateBundle({ stations: [harmonic('A', { offset: 0 })] });
  assert.equal(v.ok, true);
});

test('catches a station missing a finite latitude/longitude', () => {
  const v1 = validateBundle({ stations: [harmonic('A', { latitude: undefined })] });
  assert.equal(v1.ok, false);
  assert.match(v1.errors.join(), /latitude\/longitude/);

  const v2 = validateBundle({ stations: [harmonic('A'), sub('B', 'A', { longitude: undefined })] });
  assert.equal(v2.ok, false);
  assert.match(v2.errors.join(), /latitude\/longitude/);
});

test('rejects a malformed bundle rather than throwing', () => {
  assert.equal(validateBundle({}).ok, false);
  assert.equal(validateBundle(null).ok, false);
});
