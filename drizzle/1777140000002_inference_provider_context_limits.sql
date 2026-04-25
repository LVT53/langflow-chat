ALTER TABLE `inference_providers` ADD COLUMN `max_model_context` integer;
--> statement-breakpoint
ALTER TABLE `inference_providers` ADD COLUMN `compaction_ui_threshold` integer;
--> statement-breakpoint
ALTER TABLE `inference_providers` ADD COLUMN `target_constructed_context` integer;
--> statement-breakpoint
ALTER TABLE `inference_providers` ADD COLUMN `max_message_length` integer;
