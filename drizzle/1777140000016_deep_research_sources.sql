CREATE TABLE deep_research_sources (
	id text PRIMARY KEY NOT NULL,
	job_id text NOT NULL,
	conversation_id text NOT NULL,
	user_id text NOT NULL,
	status text DEFAULT 'discovered' NOT NULL,
	url text NOT NULL,
	title text,
	provider text NOT NULL,
	snippet text,
	reviewed_note text,
	citation_note text,
	discovered_at integer NOT NULL,
	reviewed_at integer,
	cited_at integer,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (job_id) REFERENCES deep_research_jobs(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX deep_research_sources_job_status_idx
	ON deep_research_sources (job_id, status, discovered_at);
--> statement-breakpoint
CREATE INDEX deep_research_sources_conversation_status_idx
	ON deep_research_sources (conversation_id, status, discovered_at);
--> statement-breakpoint
CREATE INDEX deep_research_sources_user_job_url_idx
	ON deep_research_sources (user_id, job_id, url);
