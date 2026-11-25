import fs from 'node:fs/promises';
import path from 'node:path';
import cron from 'node-cron';
import { DATA_DIR, BACKUP_DIR, BACKUP_RETAIN_DAYS, BACKUP_ENABLED, BACKUP_CRON } from '../config.mjs';

const DATA_FILES = ['boms.json', 'rfqs.json', 'materials.json', 'users.json', 'roles.json', 'audit.json'];

async function copySnapshot(label) {
  if (!_enabled) return null;
  const dateStr = new Date().toISOString().slice(0, 10);
  const dest = path.join(BACKUP_DIR, `${dateStr}-${label}`);
  await fs.mkdir(dest, { recursive: true });

  const copied = [];
  for (const file of DATA_FILES) {
    const src = path.join(DATA_DIR, file);
    try {
      await fs.copyFile(src, path.join(dest, file));
      copied.push(file);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }

  await pruneOldBackups();
  return { dest, copied, at: new Date().toISOString() };
}

async function pruneOldBackups() {
  let entries;
  try {
    entries = await fs.readdir(BACKUP_DIR, { withFileTypes: true });
  } catch {
    return;
  }

  const cutoff = Date.now() - BACKUP_RETAIN_DAYS * 24 * 60 * 60 * 1000;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dateMatch = entry.name.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) continue;
    if (new Date(dateMatch[1]).getTime() < cutoff) {
      await fs.rm(path.join(BACKUP_DIR, entry.name), { recursive: true, force: true });
    }
  }
}

let _lastBackup = null;
let _enabled = BACKUP_ENABLED;

// ---- named exports for testing ----

export async function listBackups({ backupDir = BACKUP_DIR } = {}) {
  let entries;
  try {
    entries = await fs.readdir(backupDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const pattern = /^(\d{4}-\d{2}-\d{2})-(.+)$/;
  const results = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const match = entry.name.match(pattern);
    if (!match) continue;

    const [, date, label] = match;
    const folderPath = path.join(backupDir, entry.name);
    let files = [];
    try {
      const folderEntries = await fs.readdir(folderPath);
      files = folderEntries.filter(f => DATA_FILES.includes(f));
    } catch { /* skip unreadable */ }

    results.push({ name: entry.name, date, label, files });
  }

  return results.sort((a, b) => b.name.localeCompare(a.name));
}

export async function restoreFromBackup(name, { backupDir = BACKUP_DIR, dataDir = DATA_DIR } = {}) {
  if (path.basename(name) !== name || !name.match(/^\d{4}-\d{2}-\d{2}-.+$/)) {
    throw new Error('Invalid backup name');
  }
  const resolvedSrc = path.resolve(backupDir, name);
  if (!resolvedSrc.startsWith(path.resolve(backupDir) + path.sep)) {
    throw new Error('Invalid backup name');
  }

  const srcDir = resolvedSrc;
  const restored = [];
  const skipped = [];

  for (const file of DATA_FILES) {
    const src = path.join(srcDir, file);
    const dest = path.join(dataDir, file);
    try {
      await fs.copyFile(src, dest);
      restored.push(file);
    } catch (e) {
      if (e.code === 'ENOENT') {
        skipped.push(file);
      } else {
        throw e;
      }
    }
  }

  return { restored, skipped };
}

export const BackupService = {
  async runStartupBackup() {
    _lastBackup = await copySnapshot('startup');
    if (_lastBackup) console.log(`[backup] startup snapshot: ${_lastBackup.dest}`);
    return _lastBackup;
  },

  scheduleDailyBackup() {
    cron.schedule(BACKUP_CRON, async () => {
      if (!_enabled) return;
      _lastBackup = await copySnapshot('scheduled');
      if (_lastBackup) console.log(`[backup] scheduled snapshot: ${_lastBackup.dest}`);
    });
  },

  async triggerManual() {
    _lastBackup = await copySnapshot('manual');
    return _lastBackup;
  },

  setEnabled(value) {
    _enabled = Boolean(value);
  },

  getStatus() {
    return {
      enabled: _enabled,
      cron: BACKUP_CRON,
      retainDays: BACKUP_RETAIN_DAYS,
      lastBackup: _lastBackup
    };
  },

  listBackups,
  restoreFromBackup,
};
