CREATE TABLE deep_research_tasks (
	id text PRIMARY KEY NOT NULL,
	job_id text NOT NULL,
	conversation_id text NOT NULL,
	user_id text NOT NULL,
	pass_number integer NOT NULL,
	pass_order integer DEFAULT 0 NOT NULL,
	status text DEFAULT 'pending' NOT NULL,
	assignment_type text NOT NULL,
	coverage_gap_id text,
	key_question text,
	assignment text NOT NULL,
	required integer DEFAULT 1 NOT NULL,
	critical integer DEFAULT 0 NOT NULL,
	claim_token text,
	output_json text,
	failure_kind text,
	failure_reason text,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL,
	claimed_at integer,
	completed_at integer,
	failed_at integer,
	skipped_at integer,
	FOREIGN KEY (job_id) REFERENCES deep_research_jobs(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX deep_research_tasks_job_pass_status_idx
	ON deep_research_tasks (job_id, pass_number, status, pass_order);
--> statement-breakpoint
CREATE INDEX deep_research_tasks_user_job_pass_idx
	ON deep_research_tasks (user_id, job_id, pass_number);
