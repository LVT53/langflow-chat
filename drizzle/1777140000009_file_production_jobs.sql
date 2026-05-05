CREATE TABLE `file_production_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`assistant_message_id` text,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'succeeded' NOT NULL,
	`stage` text,
	`origin` text DEFAULT 'legacy_generated_file' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assistant_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `file_production_jobs_conversation_idx` ON `file_production_jobs` (`conversation_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `file_production_jobs_assistant_message_idx` ON `file_production_jobs` (`assistant_message_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `file_production_jobs_user_idx` ON `file_production_jobs` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `file_production_job_files` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`chat_generated_file_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `file_production_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_generated_file_id`) REFERENCES `chat_generated_files`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_production_job_files_chat_file_unique_idx` ON `file_production_job_files` (`chat_generated_file_id`);
--> statement-breakpoint
CREATE INDEX `file_production_job_files_job_order_idx` ON `file_production_job_files` (`job_id`,`sort_order`);
