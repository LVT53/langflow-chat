ALTER TABLE `users` ADD COLUMN `role` text NOT NULL DEFAULT 'user';
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `preferred_model` text NOT NULL DEFAULT 'model1';
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `translation_enabled` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `theme` text NOT NULL DEFAULT 'system';
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `avatar_id` integer;
--> statement-breakpoint
CREATE TABLE `admin_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `message_analytics` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`model` text NOT NULL,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`reasoning_tokens` integer,
	`generation_time_ms` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
