ALTER TABLE deep_research_jobs ADD COLUMN report_artifact_id text;
--> statement-breakpoint
CREATE INDEX deep_research_jobs_report_artifact_idx ON deep_research_jobs (report_artifact_id);
