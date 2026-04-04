ALTER TABLE `chat_generated_files` ADD `assistant_message_id` text REFERENCES `messages`(`id`) ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX `chat_generated_files_assistant_message_idx` ON `chat_generated_files` (`assistant_message_id`,`created_at`);
