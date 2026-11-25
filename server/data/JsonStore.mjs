import fs from 'node:fs/promises';
import path from 'node:path';

const ensureDir = (file) => fs.mkdir(path.dirname(file), { recursive: true });

// Per-file write queue — prevents concurrent writes corrupting JSON
const _queues = new Map();
function serialize(file, fn) {
  const prev = _queues.get(file) || Promise.resolve();
  const next = prev.then(fn).catch(fn); // always advance queue even on error
  _queues.set(file, next.then(() => {
    if (_queues.get(file) === next) _queues.delete(file);
  }));
  return next;
}

export const JsonStore = {
  async readAll(file) {
    await ensureDir(file);
    try {
      const raw = await fs.readFile(file, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      if (e.code === 'ENOENT') return [];
      throw e;
    }
  },

  writeAll(file, rows) {
    return serialize(file, async () => {
      await ensureDir(file);
      const tmp = `${file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(Array.isArray(rows) ? rows : [], null, 2) + '\n', 'utf8');
      await fs.rename(tmp, file);
    });
  },

  upsert(file, idField, record) {
    return serialize(file, async () => {
      const rows = await this.readAll(file);
      const idx = rows.findIndex((r) => r[idField] === record[idField]);
      if (idx >= 0) {
        rows[idx] = { ...rows[idx], ...record };
      } else {
        rows.push(record);
      }
      const tmp = `${file}.tmp`;
      await ensureDir(file);
      await fs.writeFile(tmp, JSON.stringify(rows, null, 2) + '\n', 'utf8');
      await fs.rename(tmp, file);
      return record;
    });
  },

  remove(file, idField, idValue) {
    return serialize(file, async () => {
      const rows = await this.readAll(file);
      const next = rows.filter((r) => r[idField] !== idValue);
      const tmp = `${file}.tmp`;
      await ensureDir(file);
      await fs.writeFile(tmp, JSON.stringify(next, null, 2) + '\n', 'utf8');
      await fs.rename(tmp, file);
      return rows.length - next.length;
    });
  }
};
