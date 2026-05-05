ALTER TABLE `file_production_jobs` ADD `idempotency_key` text;
--> statement-breakpoint
ALTER TABLE `file_production_jobs` ADD `request_json` text;
--> statement-breakpoint
ALTER TABLE `file_production_jobs` ADD `source_mode` text;
--> statement-breakpoint
ALTER TABLE `file_production_jobs` ADD `document_intent` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `file_production_jobs_idempotency_unique_idx` ON `file_production_jobs` (`user_id`,`conversation_id`,`idempotency_key`) WHERE `idempotency_key` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX `file_production_jobs_source_mode_idx` ON `file_production_jobs` (`source_mode`,`created_at`);
