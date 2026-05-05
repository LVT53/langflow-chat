ALTER TABLE deep_research_sources ADD COLUMN source_text text;
--> statement-breakpoint
ALTER TABLE deep_research_sources ADD COLUMN relevance_score integer;
--> statement-breakpoint
ALTER TABLE deep_research_sources ADD COLUMN rejected_reason text;
--> statement-breakpoint
ALTER TABLE deep_research_sources ADD COLUMN supported_key_questions_json text;
--> statement-breakpoint
ALTER TABLE deep_research_sources ADD COLUMN extracted_claims_json text;
--> statement-breakpoint
ALTER TABLE deep_research_sources ADD COLUMN opened_content_length integer DEFAULT 0 NOT NULL;
