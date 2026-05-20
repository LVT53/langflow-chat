ALTER TABLE `user_skill_definitions` ADD `skill_kind` text DEFAULT 'user_skill' NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_skill_definitions` ADD `base_skill_id` text;
--> statement-breakpoint
ALTER TABLE `user_skill_definitions` ADD `base_skill_version` integer;
--> statement-breakpoint
ALTER TABLE `user_skill_definitions` ADD `resource_metadata_json` text;
--> statement-breakpoint
UPDATE `user_skill_definitions`
SET `skill_kind` = CASE
	WHEN `ownership` = 'system' THEN 'skill_pack'
	ELSE 'user_skill'
END;
--> statement-breakpoint
CREATE INDEX `user_skill_definitions_skill_kind_idx` ON `user_skill_definitions` (`skill_kind`);
--> statement-breakpoint
CREATE INDEX `user_skill_definitions_base_skill_idx` ON `user_skill_definitions` (`base_skill_id`);
--> statement-breakpoint
ALTER TABLE `skill_sessions` ADD `skill_kind` text DEFAULT 'user_skill' NOT NULL;
--> statement-breakpoint
ALTER TABLE `skill_sessions` ADD `pack_skill_id` text;
--> statement-breakpoint
ALTER TABLE `skill_sessions` ADD `pack_skill_version` integer;
--> statement-breakpoint
ALTER TABLE `skill_sessions` ADD `variant_skill_id` text;
--> statement-breakpoint
ALTER TABLE `skill_sessions` ADD `variant_skill_version` integer;
--> statement-breakpoint
ALTER TABLE `skill_sessions` ADD `effective_instructions_hash` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `skill_sessions`
SET
	`skill_kind` = CASE
		WHEN `skill_ownership` = 'system' THEN 'skill_pack'
		ELSE 'user_skill'
	END,
	`pack_skill_id` = CASE
		WHEN `skill_ownership` = 'system' THEN `skill_id`
		ELSE NULL
	END,
	`pack_skill_version` = CASE
		WHEN `skill_ownership` = 'system' THEN `skill_version`
		ELSE NULL
	END;
