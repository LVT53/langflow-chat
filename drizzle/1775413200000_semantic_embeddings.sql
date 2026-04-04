CREATE TABLE `semantic_embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`model_name` text NOT NULL,
	`source_text_hash` text NOT NULL,
	`dimensions` integer DEFAULT 0 NOT NULL,
	`embedding_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `semantic_embeddings_subject_unique_idx` ON `semantic_embeddings` (`user_id`,`subject_type`,`subject_id`,`model_name`);
--> statement-breakpoint
CREATE INDEX `semantic_embeddings_user_subject_idx` ON `semantic_embeddings` (`user_id`,`subject_type`,`updated_at`);
