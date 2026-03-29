CREATE TABLE `persona_memory_overviews` (
	`user_id` text PRIMARY KEY NOT NULL,
	`overview_text` text NOT NULL,
	`source_fingerprint` text NOT NULL,
	`generated_at` integer NOT NULL,
	`last_attempt_at` integer,
	`last_failure_at` integer,
	`last_error` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
