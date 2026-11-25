import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DATA_DIR } from '../config.mjs';

const DB_PATH = path.join(DATA_DIR, 'rfq.db');

const quote = (value) => `'${String(value ?? '').replaceAll("'", "''")}'`;
const identifier = (value) => {
  const safe = String(value || '').replace(/[^a-zA-Z0-9_]/g, '');
  if (!safe) throw new Error('Invalid SQLite identifier');
  return `"${safe}"`;
};

const runSql = (sql) => {
  const raw = execFileSync('/usr/bin/sqlite3', ['-json', '-cmd', '.timeout 5000', DB_PATH, sql], {
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 32 * 1024 * 1024
  }).trim();
  return raw ? JSON.parse(raw) : [];
};

export function createStore(dbPath) {
  return {
    readAll(table) {
      const out = [];
      for (const r of runSql(`SELECT data FROM ${identifier(table)}`)) {
        try {
          out.push(JSON.parse(r.data));
        } catch {
          console.error(`SqliteStore: skipping corrupt row in "${table}"`);
        }
      }
      return out;
    },

    upsert(table, record, extraCols = {}) {
      const allCols = { ...extraCols, data: JSON.stringify(record) };
      const cols = Object.keys(allCols).map(identifier).join(', ');
      const values = Object.values(allCols).map(quote).join(', ');
      runSql(`INSERT OR REPLACE INTO ${identifier(table)} (${cols}) VALUES (${values});`);
    },

    remove(table, idCol, idValue) {
      runSql(`DELETE FROM ${identifier(table)} WHERE ${identifier(idCol)} = ${quote(idValue)};`);
      return runSql(`SELECT changes() AS changes;`)[0]?.changes || 0;
    },

    writeAll(table, rows, toExtraCols = () => ({})) {
      const statements = [`DELETE FROM ${identifier(table)};`];
      for (const row of rows) {
        const extraCols = toExtraCols(row);
        const allCols = { ...extraCols, data: JSON.stringify(row) };
        const cols = Object.keys(allCols).map(identifier).join(', ');
        const values = Object.values(allCols).map(quote).join(', ');
        statements.push(`INSERT INTO ${identifier(table)} (${cols}) VALUES (${values});`);
      }
      runSql(`BEGIN;${statements.join('')}COMMIT;`);
    },
  };
}

let _store;
function getStore() {
  if (!_store) _store = createStore(DB_PATH);
  return _store;
}

export const SqliteStore = {
  readAll: (table) => getStore().readAll(table),
  upsert: (table, record, extraCols) => getStore().upsert(table, record, extraCols),
  remove: (table, idCol, idValue) => getStore().remove(table, idCol, idValue),
  writeAll: (table, rows, toExtraCols) => getStore().writeAll(table, rows, toExtraCols),
};
