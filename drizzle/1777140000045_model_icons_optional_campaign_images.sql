ALTER TABLE `inference_providers` ADD `icon_asset_id` text REFERENCES `campaign_assets`(`id`) ON DELETE set null;
--> statement-breakpoint
PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_announcement_campaign_snapshot_slides` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`draft_slide_id` text,
	`layout_type` text NOT NULL,
	`semantic_role` text NOT NULL DEFAULT 'feature',
	`sort_order` integer NOT NULL,
	`title_en` text NOT NULL,
	`title_hu` text NOT NULL,
	`body_en` text NOT NULL,
	`body_hu` text NOT NULL,
	`action_label_en` text,
	`action_label_hu` text,
	`alt_text_en` text NOT NULL,
	`alt_text_hu` text NOT NULL,
	`desktop_crop_asset_id` text,
	`mobile_crop_asset_id` text,
	`action_destination` text,
	`setup_controls_json` text,
	`created_at` integer NOT NULL DEFAULT (unixepoch()),
	FOREIGN KEY (`snapshot_id`) REFERENCES `announcement_campaign_snapshots`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `announcement_campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`desktop_crop_asset_id`) REFERENCES `campaign_assets`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`mobile_crop_asset_id`) REFERENCES `campaign_assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_announcement_campaign_snapshot_slides` (
	`id`,
	`snapshot_id`,
	`campaign_id`,
	`draft_slide_id`,
	`layout_type`,
	`semantic_role`,
	`sort_order`,
	`title_en`,
	`title_hu`,
	`body_en`,
	`body_hu`,
	`action_label_en`,
	`action_label_hu`,
	`alt_text_en`,
	`alt_text_hu`,
	`desktop_crop_asset_id`,
	`mobile_crop_asset_id`,
	`action_destination`,
	`setup_controls_json`,
	`created_at`
)
SELECT
	`id`,
	`snapshot_id`,
	`campaign_id`,
	`draft_slide_id`,
	`layout_type`,
	`semantic_role`,
	`sort_order`,
	`title_en`,
	`title_hu`,
	`body_en`,
	`body_hu`,
	`action_label_en`,
	`action_label_hu`,
	`alt_text_en`,
	`alt_text_hu`,
	`desktop_crop_asset_id`,
	`mobile_crop_asset_id`,
	`action_destination`,
	`setup_controls_json`,
	`created_at`
FROM `announcement_campaign_snapshot_slides`;
--> statement-breakpoint
DROP TABLE `announcement_campaign_snapshot_slides`;
--> statement-breakpoint
ALTER TABLE `__new_announcement_campaign_snapshot_slides` RENAME TO `announcement_campaign_snapshot_slides`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
--> statement-breakpoint
CREATE INDEX `announcement_campaign_snapshot_slides_order_idx` ON `announcement_campaign_snapshot_slides` (`snapshot_id`,`sort_order`);
--> statement-breakpoint
CREATE INDEX `announcement_campaign_snapshot_slides_campaign_idx` ON `announcement_campaign_snapshot_slides` (`campaign_id`,`sort_order`);
