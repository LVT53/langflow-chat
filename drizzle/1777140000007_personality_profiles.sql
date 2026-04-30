CREATE TABLE `personality_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`prompt_text` text DEFAULT '' NOT NULL,
	`is_built_in` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `personality_profiles_name_unique` ON `personality_profiles` (`name`);
