/**
 *   node --experimental-strip-types mobile/lib/outbox-errors.test.ts
 */

import assert from 'node:assert/strict';

import { isDuplicateSubmission, isTransportFailure } from './outbox-errors.ts';

let passed = 0;
const check = (what: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`  ok  ${what}`);
};

console.log('outbox error classification');

check('a dropped connection waits rather than failing', () => {
  assert.equal(isTransportFailure(new TypeError('Network request failed')), true);
  assert.equal(isTransportFailure({ name: 'AbortError', message: 'Aborted' }), true);
  assert.equal(isTransportFailure(new Error('Failed to fetch')), true);
  assert.equal(isTransportFailure(new Error('Load failed')), true);
  assert.equal(isTransportFailure(new Error('The request timed out.')), true);
});

check('the database refusing a report is permanent', () => {
  assert.equal(isTransportFailure({ code: 'P0001', message: 'bout 123 closed at 2026-08-07' }), false);
  assert.equal(isTransportFailure({ code: '23514', message: 'total 120.0 outside 0..109.0' }), false);
  assert.equal(isTransportFailure({ message: 'new row violates row-level security policy' }), false);
  assert.equal(
    isTransportFailure({ code: 'P0001', message: 'discipline AP10ET needs the inner ten count' }),
    false,
  );
});

check('nothing at all is not a transport failure', () => {
  assert.equal(isTransportFailure(null), false);
  assert.equal(isTransportFailure(undefined), false);
});

check('a duplicate means an earlier attempt got through', () => {
  assert.equal(isDuplicateSubmission({ code: '23505', message: 'duplicate key value' }), true);
  assert.equal(isDuplicateSubmission({ code: '23514' }), false);
  assert.equal(isDuplicateSubmission(new Error('boom')), false);
  assert.equal(isDuplicateSubmission(null), false);
});

console.log(`\n${passed} checks passed`);
