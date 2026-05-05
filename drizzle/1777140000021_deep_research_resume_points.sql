CREATE TABLE deep_research_resume_points (
	id text PRIMARY KEY NOT NULL,
	job_id text NOT NULL,
	conversation_id text NOT NULL,
	user_id text NOT NULL,
	boundary text NOT NULL,
	resume_key text NOT NULL,
	status text DEFAULT 'running' NOT NULL,
	stage text NOT NULL,
	pass_number integer,
	task_id text,
	payload_json text,
	result_json text,
	started_at integer NOT NULL,
	completed_at integer,
	expires_at integer,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (job_id) REFERENCES deep_research_jobs(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX deep_research_resume_points_user_job_key_idx
	ON deep_research_resume_points (user_id, job_id, resume_key);
--> statement-breakpoint
CREATE INDEX deep_research_resume_points_job_status_idx
	ON deep_research_resume_points (job_id, status, updated_at);
--> statement-breakpoint
CREATE INDEX deep_research_resume_points_job_boundary_idx
	ON deep_research_resume_points (job_id, boundary, pass_number);
--> statement-breakpoint
CREATE INDEX deep_research_resume_points_task_idx
	ON deep_research_resume_points (task_id);
