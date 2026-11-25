import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { listBackups, restoreFromBackup } from '../backup/BackupService.mjs';

let tmpDir;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rfq-backup-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('listBackups', () => {
  it('returns empty array when backup dir is empty', async () => {
    const result = await listBackups({ backupDir: tmpDir });
    expect(result).toEqual([]);
  });

  it('returns entries sorted newest first', async () => {
    const backupDir = path.join(tmpDir, 'backups');
    await fs.mkdir(path.join(backupDir, '2026-05-29-startup'), { recursive: true });
    await fs.mkdir(path.join(backupDir, '2026-05-31-manual'), { recursive: true });
    await fs.mkdir(path.join(backupDir, '2026-05-30-scheduled'), { recursive: true });

    const result = await listBackups({ backupDir });
    expect(result.map(e => e.name)).toEqual([
      '2026-05-31-manual',
      '2026-05-30-scheduled',
      '2026-05-29-startup',
    ]);
  });

  it('ignores non-matching directory names and files', async () => {
    const backupDir = path.join(tmpDir, 'backups');
    await fs.mkdir(path.join(backupDir, '2026-05-31-startup'), { recursive: true });
    await fs.mkdir(path.join(backupDir, 'not-a-backup'), { recursive: true });
    await fs.writeFile(path.join(backupDir, '2026-05-31-startup', 'boms.json'), '[]');

    const result = await listBackups({ backupDir });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('2026-05-31-startup');
    expect(result[0].date).toBe('2026-05-31');
    expect(result[0].label).toBe('startup');
    expect(result[0].files).toContain('boms.json');
  });
});

describe('restoreFromBackup', () => {
  it('copies backup files to dataDir and returns restored list', async () => {
    const backupDir = path.join(tmpDir, 'backups');
    const dataDir = path.join(tmpDir, 'data');
    const backupName = '2026-05-31-manual';
    const backupPath = path.join(backupDir, backupName);

    await fs.mkdir(backupPath, { recursive: true });
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(backupPath, 'boms.json'), '[{"id":"B1"}]');
    await fs.writeFile(path.join(backupPath, 'rfqs.json'), '[{"id":"R1"}]');

    const result = await restoreFromBackup(backupName, { backupDir, dataDir });

    expect(result.restored).toContain('boms.json');
    expect(result.restored).toContain('rfqs.json');
    const bomsContent = await fs.readFile(path.join(dataDir, 'boms.json'), 'utf8');
    expect(JSON.parse(bomsContent)).toEqual([{ id: 'B1' }]);
  });

  it('skips files missing from backup, does not delete live file', async () => {
    const backupDir = path.join(tmpDir, 'backups');
    const dataDir = path.join(tmpDir, 'data');
    const backupName = '2026-05-31-manual';

    await fs.mkdir(path.join(backupDir, backupName), { recursive: true });
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, 'rfqs.json'), '[{"id":"live"}]');
    // rfqs.json NOT in backup

    const result = await restoreFromBackup(backupName, { backupDir, dataDir });

    expect(result.skipped).toContain('rfqs.json');
    const liveContent = await fs.readFile(path.join(dataDir, 'rfqs.json'), 'utf8');
    expect(JSON.parse(liveContent)).toEqual([{ id: 'live' }]);
  });

  it('rejects path traversal attempts', async () => {
    await expect(
      restoreFromBackup('../../../etc/passwd', { backupDir: tmpDir, dataDir: tmpDir })
    ).rejects.toThrow('Invalid backup name');
  });
});
