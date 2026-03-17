import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

// Use process.env directly for database path
const sqlite = new Database(process.env.DATABASE_PATH ?? './data/chat.db');
export const db = drizzle(sqlite, { schema });
export type DatabaseInstance = typeof db;