# Database Layer

SQLite persistence with Drizzle ORM. Schema definitions and connection bootstrap only.

## Structure

| File | Purpose |
|------|---------|
| `schema.ts` | Table definitions: users, sessions, conversations, messages, artifacts, chunks, projects, task states, memory events, semantic embeddings |
| `index.ts` | Connection bootstrap - exports `db` instance |

## Schema Overview

**Core Tables:**
- `users` - Accounts with Honcho peer versioning
- `sessions` - Cookie session storage
- `conversations` - Chat threads with optional project linking
- `messages` - Chat turns with thinking/tool call metadata

**Knowledge Tables:**
- `artifacts` - Files, generated outputs, work capsules with retrieval class
- `artifact_chunks` - Text chunks for semantic search
- `semantic_embeddings` - TEI embeddings for artifacts/personas/tasks

**Memory Tables:**
- `task_states` - Project continuity, checkpoints, evidence links
- `memory_events` - State change log (deadlines, preferences, supersession)
- `persona_clusters` - Grouped persona memories with salience scores

**Config Tables:**
- `runtime_config` - Admin UI overrides for env vars
- `user_preferences` - Account-level settings

## Conventions

- **Primary keys**: `text('id')` with UUIDs
- **Timestamps**: `integer('...', { mode: 'timestamp' })` with unixepoch defaults
- **Foreign keys**: Always use `onDelete: 'cascade'` for user-owned data
- **JSON columns**: `text('metadata_json')` for flexible metadata
- **Indexes**: Define in table callback for query patterns
- **Soft deletes**: Use `retrieval_class` ('durable' | 'superseded' | 'historical') not boolean flags

## Anti-Patterns

- Do NOT add runtime schema mutation here - use `scripts/prepare-db.ts`
- Do NOT create mini repository wrappers - use services + schema directly
- Do NOT read `DATABASE_PATH` directly - use `getDatabasePath()` from `env.ts`
- Do NOT bypass foreign keys - pragma is enabled

## Legacy Files (Do Not Extend)

These compatibility wrappers exist but are not authoritative:
- `conversations.ts`, `projects.ts`, `sessions.ts`, `users.ts`

New persistence belongs in relevant services using `db` + `schema.ts`.
