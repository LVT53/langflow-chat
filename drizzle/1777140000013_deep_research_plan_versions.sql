CREATE TABLE deep_research_plan_versions (
	id text PRIMARY KEY NOT NULL,
	job_id text NOT NULL,
	version integer NOT NULL,
	status text DEFAULT 'awaiting_approval' NOT NULL,
	raw_plan_json text NOT NULL,
	rendered_plan text NOT NULL,
	context_disclosure text,
	effort_estimate_json text NOT NULL,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (job_id) REFERENCES deep_research_jobs(id) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX deep_research_plan_versions_job_version_unique_idx
	ON deep_research_plan_versions (job_id, version);
--> statement-breakpoint
CREATE INDEX deep_research_plan_versions_job_version_idx
	ON deep_research_plan_versions (job_id, version);
