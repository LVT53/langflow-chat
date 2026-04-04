CREATE TABLE `memory_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_key` text NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text,
	`message_id` text,
	`domain` text NOT NULL,
	`event_type` text NOT NULL,
	`subject_id` text,
	`related_id` text,
	`observed_at` integer NOT NULL,
	`payload_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_events_event_key_idx` ON `memory_events` (`event_key`);
--> statement-breakpoint
CREATE INDEX `memory_events_user_observed_idx` ON `memory_events` (`user_id`,`domain`,`observed_at`);
--> statement-breakpoint
CREATE INDEX `memory_events_user_type_idx` ON `memory_events` (`user_id`,`event_type`,`observed_at`);
