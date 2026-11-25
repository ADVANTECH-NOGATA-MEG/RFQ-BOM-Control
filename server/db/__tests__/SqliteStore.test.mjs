import { strict as assert } from 'node:assert';
import { test, before, after } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createStore } from '../SqliteStore.mjs';

let tmpDir;
let store;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rfq-sqlite-test-'));
  store = createStore(path.join(tmpDir, 'test.db'));
});

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('readAll returns [] for empty table', () => {
  const rows = store.readAll('rfqs');
  assert.deepStrictEqual(rows, []);
});

test('upsert inserts a record and readAll returns it', () => {
  store.upsert('rfqs', { id: 'r1', version: 'V1', name: 'Test' }, { id: 'r1', version: 'V1', status: null, created_at: null });
  const rows = store.readAll('rfqs');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'r1');
  assert.equal(rows[0].name, 'Test');
});

test('upsert replaces existing record with same primary key', () => {
  store.upsert('rfqs', { id: 'r1', version: 'V1', name: 'Updated' }, { id: 'r1', version: 'V1', status: null, created_at: null });
  const rows = store.readAll('rfqs');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Updated');
});

test('remove deletes a record by id column', () => {
  store.upsert('boms', { id: 'b1', name: 'BOM1' }, { id: 'b1', rfq_id: null });
  store.upsert('boms', { id: 'b2', name: 'BOM2' }, { id: 'b2', rfq_id: null });
  const deleted = store.remove('boms', 'id', 'b1');
  assert.equal(deleted, 1);
  const rows = store.readAll('boms');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'b2');
});

test('remove returns 0 when record not found', () => {
  const deleted = store.remove('boms', 'id', 'nonexistent');
  assert.equal(deleted, 0);
});

test('writeAll replaces entire table in a transaction', () => {
  store.upsert('boms', { id: 'b3', name: 'old' }, { id: 'b3', rfq_id: null });
  const newRows = [
    { id: 'b10', name: 'fresh' },
    { id: 'b11', name: 'also fresh' },
  ];
  store.writeAll('boms', newRows, (r) => ({ id: r.id, rfq_id: null }));
  const rows = store.readAll('boms');
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.name.includes('fresh')));
});

test('materials table uses partNo as primary key', () => {
  store.upsert('materials', { partNo: 'PN-001', description: 'Cap' }, { partNo: 'PN-001', code: 'PN-001' });
  store.upsert('materials', { partNo: 'PN-001', description: 'Updated Cap' }, { partNo: 'PN-001', code: 'PN-001' });
  const rows = store.readAll('materials');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].description, 'Updated Cap');
});
