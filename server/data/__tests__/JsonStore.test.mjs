import { strict as assert } from 'node:assert';
import { test, before, after } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { JsonStore } from '../JsonStore.mjs';

let tmpDir;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rfq-test-'));
});

after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

test('readAll returns [] for missing file', async () => {
  const file = path.join(tmpDir, 'test1.json');
  const result = await JsonStore.readAll(file);
  assert.deepStrictEqual(result, []);
});

test('writeAll + readAll roundtrip', async () => {
  const file = path.join(tmpDir, 'test2.json');
  const rows = [{ id: '1', name: 'alpha' }, { id: '2', name: 'beta' }];
  await JsonStore.writeAll(file, rows);
  const result = await JsonStore.readAll(file);
  assert.deepStrictEqual(result, rows);
});

test('upsert inserts new record', async () => {
  const file = path.join(tmpDir, 'test3.json');
  await JsonStore.upsert(file, 'id', { id: 'x', value: 1 });
  const result = await JsonStore.readAll(file);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'x');
});

test('upsert replaces existing record by id', async () => {
  const file = path.join(tmpDir, 'test4.json');
  await JsonStore.upsert(file, 'id', { id: 'x', value: 1 });
  await JsonStore.upsert(file, 'id', { id: 'x', value: 2 });
  const result = await JsonStore.readAll(file);
  assert.equal(result.length, 1);
  assert.equal(result[0].value, 2);
});

test('remove deletes record by id', async () => {
  const file = path.join(tmpDir, 'test5.json');
  await JsonStore.upsert(file, 'id', { id: 'x', value: 1 });
  await JsonStore.upsert(file, 'id', { id: 'y', value: 2 });
  await JsonStore.remove(file, 'id', 'x');
  const result = await JsonStore.readAll(file);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'y');
});
