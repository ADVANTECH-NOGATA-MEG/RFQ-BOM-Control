import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { LruCache } from '../LruCache.mjs';

test('get returns undefined for missing key', () => {
  const c = new LruCache(3);
  assert.equal(c.get('x'), undefined);
});

test('set and get roundtrip', () => {
  const c = new LruCache(3);
  c.set('rfqs', [1, 2, 3]);
  assert.deepStrictEqual(c.get('rfqs'), [1, 2, 3]);
});

test('evicts LRU entry when max exceeded', () => {
  const c = new LruCache(2);
  c.set('a', 1);
  c.set('b', 2);
  c.get('a');        // 'a' is now MRU; 'b' is LRU
  c.set('c', 3);     // evicts 'b'
  assert.equal(c.get('b'), undefined);
  assert.equal(c.get('a'), 1);
  assert.equal(c.get('c'), 3);
});

test('invalidate removes a key', () => {
  const c = new LruCache(3);
  c.set('rfqs', [1]);
  c.invalidate('rfqs');
  assert.equal(c.get('rfqs'), undefined);
});

test('clear removes all keys', () => {
  const c = new LruCache(3);
  c.set('a', 1);
  c.set('b', 2);
  c.clear();
  assert.equal(c.get('a'), undefined);
  assert.equal(c.get('b'), undefined);
});

test('get on hit refreshes LRU position', () => {
  const c = new LruCache(2);
  c.set('a', 1);
  c.set('b', 2);
  c.get('a');       // refreshes 'a'; 'b' becomes LRU
  c.set('c', 3);    // evicts 'b'
  assert.equal(c.get('b'), undefined);
  assert.equal(c.get('a'), 1);
});
