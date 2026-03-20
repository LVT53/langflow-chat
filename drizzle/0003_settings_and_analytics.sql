ALTER TABLE `users` ADD COLUMN `role` text NOT NULL DEFAULT 'user';
ALTER TABLE `users` ADD COLUMN `preferred_model` text NOT NULL DEFAULT 'model1';
ALTER TABLE `users` ADD COLUMN `translation_enabled` integer NOT NULL DEFAULT 0;
ALTER TABLE `users` ADD COLUMN `theme` text NOT NULL DEFAULT 'system';
ALTER TABLE `users` ADD COLUMN `avatar_id` integer;

CREATE TABLE `admin_config` (
  `key` text PRIMARY KEY NOT NULL,
  `value` text NOT NULL,
  `updated_at` integer DEFAULT (unixepoch()) NOT NULL,
  `updated_by` text NOT NULL
);

CREATE TABLE `message_analytics` (
  `id` text PRIMARY KEY NOT NULL,
  `message_id` text NOT NULL REFERENCES `messages`(`id`) ON DELETE CASCADE,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `model` text NOT NULL,
  `prompt_tokens` integer,
  `completion_tokens` integer,
  `reasoning_tokens` integer,
  `generation_time_ms` integer,
  `created_at` integer DEFAULT (unixepoch()) NOT NULL
);
