ALTER TABLE conversations ADD COLUMN status text DEFAULT 'open' NOT NULL;
--> statement-breakpoint
ALTER TABLE conversations ADD COLUMN sealed_at integer;
--> statement-breakpoint
CREATE INDEX conversations_user_status_idx ON conversations (user_id, status, updated_at);
--> statement-breakpoint
CREATE TABLE deep_research_jobs (
	id text PRIMARY KEY NOT NULL,
	user_id text NOT NULL,
	conversation_id text NOT NULL,
	trigger_message_id text,
	depth text NOT NULL,
	status text DEFAULT 'awaiting_plan' NOT NULL,
	stage text,
	title text NOT NULL,
	user_request text NOT NULL,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL,
	completed_at integer,
	cancelled_at integer,
	FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (trigger_message_id) REFERENCES messages(id) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX deep_research_jobs_conversation_idx ON deep_research_jobs (conversation_id, created_at);
--> statement-breakpoint
CREATE INDEX deep_research_jobs_user_status_idx ON deep_research_jobs (user_id, status, updated_at);
--> statement-breakpoint
CREATE UNIQUE INDEX deep_research_jobs_active_conversation_unique_idx
	ON deep_research_jobs (conversation_id)
	WHERE status NOT IN ('completed', 'failed', 'cancelled');
