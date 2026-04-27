CREATE TABLE `analytics_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_email` text,
	`user_name` text,
	`title` text,
	`source` text DEFAULT 'live' NOT NULL,
	`billing_month` text NOT NULL,
	`conversation_created_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analytics_conversations_conversation_unique_idx` ON `analytics_conversations` (`conversation_id`);
--> statement-breakpoint
CREATE INDEX `analytics_conversations_user_month_idx` ON `analytics_conversations` (`user_id`,`billing_month`);
--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`user_email` text,
	`user_name` text,
	`conversation_id` text NOT NULL,
	`conversation_title` text,
	`message_id` text NOT NULL,
	`model_id` text NOT NULL,
	`model_display_name` text,
	`provider_id` text,
	`provider_display_name` text,
	`provider_base_url` text,
	`provider_model_name` text,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`cached_input_tokens` integer DEFAULT 0 NOT NULL,
	`cache_hit_tokens` integer DEFAULT 0 NOT NULL,
	`cache_miss_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`reasoning_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`usage_source` text DEFAULT 'estimated' NOT NULL,
	`generation_time_ms` integer,
	`billing_month` text NOT NULL,
	`cost_usd_micros` integer DEFAULT 0 NOT NULL,
	`price_rule_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usage_events_message_unique_idx` ON `usage_events` (`message_id`);
--> statement-breakpoint
CREATE INDEX `usage_events_user_month_idx` ON `usage_events` (`user_id`,`billing_month`);
--> statement-breakpoint
CREATE INDEX `usage_events_model_month_idx` ON `usage_events` (`model_id`,`billing_month`);
--> statement-breakpoint
CREATE TABLE `model_price_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text,
	`provider_name` text,
	`model_id` text,
	`model_name` text NOT NULL,
	`input_usd_micros_per_1m` integer DEFAULT 0 NOT NULL,
	`cached_input_usd_micros_per_1m` integer DEFAULT 0 NOT NULL,
	`cache_hit_usd_micros_per_1m` integer DEFAULT 0 NOT NULL,
	`cache_miss_usd_micros_per_1m` integer DEFAULT 0 NOT NULL,
	`output_usd_micros_per_1m` integer DEFAULT 0 NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `model_price_rules_model_idx` ON `model_price_rules` (`model_id`,`model_name`,`enabled`);
--> statement-breakpoint
INSERT OR IGNORE INTO `analytics_conversations` (
	`id`,
	`conversation_id`,
	`user_id`,
	`user_email`,
	`user_name`,
	`title`,
	`source`,
	`billing_month`,
	`conversation_created_at`,
	`created_at`
)
SELECT
	lower(hex(randomblob(16))),
	c.`id`,
	c.`user_id`,
	u.`email`,
	u.`name`,
	c.`title`,
	'legacy_estimate',
	strftime('%Y-%m', datetime(c.`created_at`, 'unixepoch')),
	c.`created_at`,
	c.`created_at`
FROM `conversations` c
LEFT JOIN `users` u ON u.`id` = c.`user_id`;
--> statement-breakpoint
INSERT OR IGNORE INTO `usage_events` (
	`id`,
	`user_id`,
	`user_email`,
	`user_name`,
	`conversation_id`,
	`conversation_title`,
	`message_id`,
	`model_id`,
	`model_display_name`,
	`prompt_tokens`,
	`completion_tokens`,
	`reasoning_tokens`,
	`total_tokens`,
	`usage_source`,
	`generation_time_ms`,
	`billing_month`,
	`cost_usd_micros`,
	`created_at`
)
SELECT
	lower(hex(randomblob(16))),
	ma.`user_id`,
	u.`email`,
	u.`name`,
	m.`conversation_id`,
	c.`title`,
	ma.`message_id`,
	ma.`model`,
	ma.`model`,
	coalesce(ma.`prompt_tokens`, 0),
	coalesce(ma.`completion_tokens`, 0),
	coalesce(ma.`reasoning_tokens`, 0),
	coalesce(ma.`prompt_tokens`, 0) + coalesce(ma.`completion_tokens`, 0) + coalesce(ma.`reasoning_tokens`, 0),
	'legacy_estimate',
	ma.`generation_time_ms`,
	strftime('%Y-%m', datetime(ma.`created_at`, 'unixepoch')),
	0,
	ma.`created_at`
FROM `message_analytics` ma
LEFT JOIN `users` u ON u.`id` = ma.`user_id`
LEFT JOIN `messages` m ON m.`id` = ma.`message_id`
LEFT JOIN `conversations` c ON c.`id` = m.`conversation_id`
WHERE m.`conversation_id` IS NOT NULL;
--> statement-breakpoint
INSERT OR IGNORE INTO `model_price_rules` (
	`id`,
	`provider_name`,
	`model_name`,
	`input_usd_micros_per_1m`,
	`cached_input_usd_micros_per_1m`,
	`cache_hit_usd_micros_per_1m`,
	`cache_miss_usd_micros_per_1m`,
	`output_usd_micros_per_1m`
) VALUES
	('deepseek-v4-flash-default', 'deepseek', 'deepseek-v4-flash', 140000, 28000, 28000, 140000, 280000),
	('deepseek-v4-pro-default', 'deepseek', 'deepseek-v4-pro', 1740000, 145000, 145000, 1740000, 3480000),
	('deepseek-v32-chat-default', 'deepseek', 'deepseek-chat', 280000, 28000, 28000, 280000, 420000),
	('deepseek-v32-reasoner-default', 'deepseek', 'deepseek-reasoner', 280000, 28000, 28000, 280000, 420000);
