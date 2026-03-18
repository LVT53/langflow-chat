import Database from 'better-sqlite3';
import { hashSync } from 'bcrypt';
import { randomUUID } from 'crypto';

const db = new Database('./data/chat.db');

// Enable WAL mode
db.pragma('journal_mode = WAL');

// Ensure tables exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`);

const passwordHash = hashSync('password', 10);
const stmt = db.prepare('INSERT OR IGNORE INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
stmt.run(randomUUID(), 'test@example.com', 'Test User', passwordHash, Date.now(), Date.now());

console.log('User created');
