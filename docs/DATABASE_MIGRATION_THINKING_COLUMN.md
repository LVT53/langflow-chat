# Database Migration - Add thinking column to messages table

## Problem
The production database is missing the `thinking` column in the `messages` table, causing 500 errors when loading conversations.

## Solution
Run this SQL command on the production database:

```sql
ALTER TABLE messages ADD COLUMN thinking text;
```

## How to apply on production

### Option 1: Using SQLite CLI (if available)
```bash
sqlite3 /path/to/chat.db "ALTER TABLE messages ADD COLUMN thinking text;"
```

### Option 2: Using the migration file
Copy the migration file to the server and run:
```bash
cd /path/to/app
cat drizzle/0002_persist_message_thinking.sql | sqlite3 data/chat.db
```

### Option 3: Manual Drizzle Kit migration (recommended)
On the production server:
```bash
cd /path/to/app
npx drizzle-kit migrate
```

Or push directly:
```bash
npx drizzle-kit push
```

## Verification
After running the migration, verify with:
```sql
.schema messages
```

You should see:
```sql
CREATE TABLE messages (
    id text PRIMARY KEY NOT NULL,
    conversation_id text NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    thinking text,  -- <-- This column should exist
    created_at integer DEFAULT (unixepoch()) NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
```
