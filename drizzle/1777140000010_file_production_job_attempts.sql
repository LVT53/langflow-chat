ALTER TABLE `file_production_jobs` ADD `current_attempt_id` text;
--> statement-breakpoint
ALTER TABLE `file_production_jobs` ADD `retryable` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `file_production_jobs` ADD `error_code` text;
--> statement-breakpoint
ALTER TABLE `file_production_jobs` ADD `error_message` text;
--> statement-breakpoint
ALTER TABLE `file_production_jobs` ADD `completed_at` integer;
--> statement-breakpoint
ALTER TABLE `file_production_jobs` ADD `cancel_requested_at` integer;
--> statement-breakpoint
CREATE TABLE `file_production_job_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`stage` text,
	`mode` text,
	`renderer` text,
	`runtime` text,
	`worker_id` text,
	`claimed_at` integer,
	`heartbeat_at` integer,
	`started_at` integer,
	`finished_at` integer,
	`error_code` text,
	`error_message` text,
	`retryable` integer DEFAULT 0 NOT NULL,
	`diagnostics_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `file_production_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_production_job_attempts_job_number_unique_idx` ON `file_production_job_attempts` (`job_id`,`attempt_number`);
--> statement-breakpoint
CREATE INDEX `file_production_job_attempts_job_idx` ON `file_production_job_attempts` (`job_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `file_production_job_attempts_worker_idx` ON `file_production_job_attempts` (`worker_id`,`status`,`heartbeat_at`);
