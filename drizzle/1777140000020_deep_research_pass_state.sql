CREATE TABLE deep_research_pass_checkpoints (
	id text PRIMARY KEY NOT NULL,
	job_id text NOT NULL,
	conversation_id text NOT NULL,
	user_id text NOT NULL,
	pass_number integer NOT NULL,
	lifecycle_state text DEFAULT 'running' NOT NULL,
	search_intent text NOT NULL,
	reviewed_source_ids_json text DEFAULT '[]' NOT NULL,
	coverage_result_json text,
	coverage_gap_ids_json text DEFAULT '[]' NOT NULL,
	usage_summary_json text,
	next_decision text,
	decision_summary text,
	terminal_decision integer DEFAULT 0 NOT NULL,
	started_at integer NOT NULL,
	completed_at integer,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (job_id) REFERENCES deep_research_jobs(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX deep_research_pass_checkpoints_user_job_pass_idx
	ON deep_research_pass_checkpoints (user_id, job_id, pass_number);
--> statement-breakpoint
CREATE INDEX deep_research_pass_checkpoints_job_pass_idx
	ON deep_research_pass_checkpoints (job_id, pass_number);
--> statement-breakpoint
CREATE INDEX deep_research_pass_checkpoints_user_job_decision_idx
	ON deep_research_pass_checkpoints (user_id, job_id, next_decision);
--> statement-breakpoint
CREATE TABLE deep_research_coverage_gaps (
	id text PRIMARY KEY NOT NULL,
	job_id text NOT NULL,
	conversation_id text NOT NULL,
	user_id text NOT NULL,
	pass_checkpoint_id text NOT NULL,
	lifecycle_state text DEFAULT 'open' NOT NULL,
	severity text NOT NULL,
	reason text NOT NULL,
	key_question text,
	comparison_axis text,
	recommended_next_action text NOT NULL,
	detail text,
	reviewed_source_count integer DEFAULT 0 NOT NULL,
	resolved_by_evidence_json text,
	resolved_by_claims_json text,
	resolved_by_limitations_json text,
	resolution_summary text,
	inherited_from_gap_id text,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL,
	resolved_at integer,
	FOREIGN KEY (job_id) REFERENCES deep_research_jobs(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (pass_checkpoint_id) REFERENCES deep_research_pass_checkpoints(id) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX deep_research_coverage_gaps_job_state_idx
	ON deep_research_coverage_gaps (job_id, lifecycle_state, created_at);
--> statement-breakpoint
CREATE INDEX deep_research_coverage_gaps_checkpoint_idx
	ON deep_research_coverage_gaps (pass_checkpoint_id, created_at);
--> statement-breakpoint
CREATE INDEX deep_research_coverage_gaps_user_question_idx
	ON deep_research_coverage_gaps (user_id, job_id, key_question);
