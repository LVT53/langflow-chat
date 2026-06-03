ALTER TABLE `provider_models` ADD `icon_asset_id` text REFERENCES `campaign_assets`(`id`) ON UPDATE no action ON DELETE set null;
