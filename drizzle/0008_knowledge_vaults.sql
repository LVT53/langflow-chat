CREATE TABLE `knowledge_vaults` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `knowledge_vaults_user_idx` ON `knowledge_vaults` (`user_id`,`sort_order`);
--> statement-breakpoint
ALTER TABLE `artifacts` ADD `vault_id` text REFERENCES `knowledge_vaults`(`id`) ON UPDATE no action ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `artifacts_vault_idx` ON `artifacts` (`vault_id`);