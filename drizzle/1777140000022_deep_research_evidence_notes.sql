CREATE TABLE deep_research_evidence_notes (
	id text PRIMARY KEY NOT NULL,
	job_id text NOT NULL,
	conversation_id text NOT NULL,
	user_id text NOT NULL,
	pass_checkpoint_id text NOT NULL,
	source_id text,
	task_id text,
	supported_key_question text,
	compared_entity text,
	comparison_axis text,
	finding_text text NOT NULL,
	source_support_json text DEFAULT '{}' NOT NULL,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (job_id) REFERENCES deep_research_jobs(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (pass_checkpoint_id) REFERENCES deep_research_pass_checkpoints(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (source_id) REFERENCES deep_research_sources(id) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (task_id) REFERENCES deep_research_tasks(id) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX deep_research_evidence_notes_job_pass_idx
	ON deep_research_evidence_notes (job_id, pass_checkpoint_id, created_at);
--> statement-breakpoint
CREATE INDEX deep_research_evidence_notes_source_idx
	ON deep_research_evidence_notes (source_id);
--> statement-breakpoint
CREATE INDEX deep_research_evidence_notes_task_idx
	ON deep_research_evidence_notes (task_id);
--> statement-breakpoint
CREATE INDEX deep_research_evidence_notes_user_question_idx
	ON deep_research_evidence_notes (user_id, job_id, supported_key_question);
