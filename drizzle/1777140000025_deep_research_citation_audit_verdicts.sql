CREATE TABLE deep_research_citation_audit_verdicts (
	id text PRIMARY KEY NOT NULL,
	job_id text NOT NULL,
	conversation_id text NOT NULL,
	user_id text NOT NULL,
	claim_id text NOT NULL,
	verdict text NOT NULL,
	evidence_note_ids_json text DEFAULT '[]' NOT NULL,
	reason text NOT NULL,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (job_id) REFERENCES deep_research_jobs(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (claim_id) REFERENCES deep_research_synthesis_claims(id) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX deep_research_citation_audit_verdicts_job_verdict_idx
	ON deep_research_citation_audit_verdicts (job_id, verdict, created_at);
--> statement-breakpoint
CREATE INDEX deep_research_citation_audit_verdicts_user_job_idx
	ON deep_research_citation_audit_verdicts (user_id, job_id, created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX deep_research_citation_audit_verdicts_claim_idx
	ON deep_research_citation_audit_verdicts (claim_id);
