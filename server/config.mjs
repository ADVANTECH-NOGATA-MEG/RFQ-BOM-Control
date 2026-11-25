import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const BACKUP_DIR = path.join(ROOT_DIR, 'data', 'backups');
export const BACKUP_RETAIN_DAYS = 30;
export const PORT = Number(process.env.PORT || 3001);
export const HOST = process.env.HOST || '0.0.0.0';
export const BACKUP_ENABLED = process.env.BACKUP_ENABLED !== 'false';
export const BACKUP_CRON = process.env.BACKUP_CRON || '0 2 * * *';
