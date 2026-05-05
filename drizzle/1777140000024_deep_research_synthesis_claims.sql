CREATE TABLE deep_research_synthesis_claims (
	id text PRIMARY KEY NOT NULL,
	job_id text NOT NULL,
	conversation_id text NOT NULL,
	user_id text NOT NULL,
	pass_checkpoint_id text,
	synthesis_pass text,
	plan_question text,
	report_section text,
	statement text NOT NULL,
	claim_type text,
	central integer DEFAULT 0 NOT NULL,
	status text DEFAULT 'needs-repair' NOT NULL,
	status_reason text,
	competing_claim_group_id text,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	updated_at integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (job_id) REFERENCES deep_research_jobs(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (pass_checkpoint_id) REFERENCES deep_research_pass_checkpoints(id) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX deep_research_synthesis_claims_job_status_idx
	ON deep_research_synthesis_claims (job_id, status, created_at);
--> statement-breakpoint
CREATE INDEX deep_research_synthesis_claims_user_question_idx
	ON deep_research_synthesis_claims (user_id, job_id, plan_question);
--> statement-breakpoint
CREATE INDEX deep_research_synthesis_claims_pass_idx
	ON deep_research_synthesis_claims (pass_checkpoint_id);
--> statement-breakpoint
CREATE INDEX deep_research_synthesis_claims_competing_group_idx
	ON deep_research_synthesis_claims (competing_claim_group_id);
--> statement-breakpoint
CREATE TABLE deep_research_claim_evidence_links (
	id text PRIMARY KEY NOT NULL,
	claim_id text NOT NULL,
	evidence_note_id text NOT NULL,
	job_id text NOT NULL,
	conversation_id text NOT NULL,
	user_id text NOT NULL,
	relation text NOT NULL,
	rationale text,
	material integer DEFAULT 0 NOT NULL,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (claim_id) REFERENCES deep_research_synthesis_claims(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (evidence_note_id) REFERENCES deep_research_evidence_notes(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (job_id) REFERENCES deep_research_jobs(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX deep_research_claim_evidence_links_claim_idx
	ON deep_research_claim_evidence_links (claim_id);
--> statement-breakpoint
CREATE INDEX deep_research_claim_evidence_links_evidence_idx
	ON deep_research_claim_evidence_links (evidence_note_id);
--> statement-breakpoint
CREATE INDEX deep_research_claim_evidence_links_job_relation_idx
	ON deep_research_claim_evidence_links (job_id, relation);
--> statement-breakpoint
CREATE UNIQUE INDEX deep_research_claim_evidence_links_claim_evidence_relation_idx
	ON deep_research_claim_evidence_links (claim_id, evidence_note_id, relation);
