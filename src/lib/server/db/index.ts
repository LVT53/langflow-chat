import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { getDatabasePath } from '../env';
import * as schema from './schema';

const sqlite = new Database(getDatabasePath());
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { sqlite };
export type DatabaseInstance = typeof db;
