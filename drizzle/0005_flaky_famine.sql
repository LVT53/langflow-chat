CREATE TABLE `artifact_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`artifact_id` text NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text,
	`chunk_index` integer NOT NULL,
	`content_text` text NOT NULL,
	`token_estimate` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `artifact_chunks_artifact_idx` ON `artifact_chunks` (`artifact_id`,`chunk_index`);--> statement-breakpoint
CREATE INDEX `artifact_chunks_user_conversation_idx` ON `artifact_chunks` (`user_id`,`conversation_id`);--> statement-breakpoint
CREATE TABLE `artifact_links` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`artifact_id` text NOT NULL,
	`related_artifact_id` text,
	`conversation_id` text,
	`message_id` text,
	`link_type` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text,
	`type` text NOT NULL,
	`retrieval_class` text DEFAULT 'durable' NOT NULL,
	`name` text NOT NULL,
	`mime_type` text,
	`extension` text,
	`size_bytes` integer,
	`binary_hash` text,
	`storage_path` text,
	`content_text` text,
	`summary` text,
	`metadata_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `artifacts_user_binary_hash_idx` ON `artifacts` (`user_id`,`binary_hash`);--> statement-breakpoint
CREATE INDEX `artifacts_user_size_idx` ON `artifacts` (`user_id`,`size_bytes`);--> statement-breakpoint
CREATE TABLE `conversation_context_status` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`estimated_tokens` integer DEFAULT 0 NOT NULL,
	`max_context_tokens` integer DEFAULT 262144 NOT NULL,
	`threshold_tokens` integer DEFAULT 209715 NOT NULL,
	`target_tokens` integer DEFAULT 157286 NOT NULL,
	`compaction_applied` integer DEFAULT 0 NOT NULL,
	`compaction_mode` text DEFAULT 'none' NOT NULL,
	`routing_stage` text DEFAULT 'deterministic' NOT NULL,
	`routing_confidence` integer DEFAULT 0 NOT NULL,
	`verification_status` text DEFAULT 'skipped' NOT NULL,
	`layers_used_json` text,
	`working_set_count` integer DEFAULT 0 NOT NULL,
	`working_set_artifact_ids_json` text,
	`working_set_applied` integer DEFAULT 0 NOT NULL,
	`task_state_applied` integer DEFAULT 0 NOT NULL,
	`prompt_artifact_count` integer DEFAULT 0 NOT NULL,
	`recent_turn_count` integer DEFAULT 0 NOT NULL,
	`summary` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `conversation_drafts` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`draft_text` text DEFAULT '' NOT NULL,
	`selected_attachment_ids_json` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversation_drafts_user_updated_idx` ON `conversation_drafts` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `conversation_task_states` (
	`task_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`objective` text NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`locked` integer DEFAULT 0 NOT NULL,
	`last_confirmed_turn_message_id` text,
	`constraints_json` text,
	`facts_to_preserve_json` text,
	`decisions_json` text,
	`open_questions_json` text,
	`active_artifact_ids_json` text,
	`next_steps_json` text,
	`last_checkpoint_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversation_task_states_conversation_idx` ON `conversation_task_states` (`conversation_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `conversation_working_set_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`artifact_id` text NOT NULL,
	`artifact_type` text NOT NULL,
	`score` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'cooling' NOT NULL,
	`reason_codes_json` text,
	`last_activated_at` integer,
	`last_used_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `memory_project_task_links` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `memory_projects`(`project_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `conversation_task_states`(`task_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memory_project_task_links_task_idx` ON `memory_project_task_links` (`task_id`);--> statement-breakpoint
CREATE INDEX `memory_project_task_links_project_idx` ON `memory_project_task_links` (`project_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `memory_projects` (
	`project_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`summary` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_active_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `memory_projects_user_status_idx` ON `memory_projects` (`user_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `persona_memory_attributions` (
	`id` text PRIMARY KEY NOT NULL,
	`conclusion_id` text NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`scope` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `persona_memory_attributions_conclusion_conversation_idx` ON `persona_memory_attributions` (`conclusion_id`,`conversation_id`);--> statement-breakpoint
CREATE INDEX `persona_memory_attributions_conversation_idx` ON `persona_memory_attributions` (`conversation_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `persona_memory_cluster_members` (
	`id` text PRIMARY KEY NOT NULL,
	`cluster_id` text NOT NULL,
	`user_id` text NOT NULL,
	`conclusion_id` text NOT NULL,
	`content` text NOT NULL,
	`scope` text NOT NULL,
	`session_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`cluster_id`) REFERENCES `persona_memory_clusters`(`cluster_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `persona_memory_cluster_members_conclusion_idx` ON `persona_memory_cluster_members` (`user_id`,`conclusion_id`);--> statement-breakpoint
CREATE INDEX `persona_memory_cluster_members_cluster_idx` ON `persona_memory_cluster_members` (`cluster_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `persona_memory_clusters` (
	`cluster_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`canonical_text` text NOT NULL,
	`memory_class` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`salience_score` integer DEFAULT 0 NOT NULL,
	`source_count` integer DEFAULT 0 NOT NULL,
	`first_seen_at` integer,
	`last_seen_at` integer,
	`last_dreamed_at` integer,
	`decay_at` integer,
	`archive_at` integer,
	`pinned` integer DEFAULT 0 NOT NULL,
	`metadata_json` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `persona_memory_clusters_user_state_idx` ON `persona_memory_clusters` (`user_id`,`state`,`updated_at`);--> statement-breakpoint
CREATE TABLE `projects` (
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
CREATE TABLE `task_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`checkpoint_type` text NOT NULL,
	`content` text NOT NULL,
	`source_turn_range` text,
	`source_evidence_ids_json` text,
	`verification_status` text DEFAULT 'skipped' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `conversation_task_states`(`task_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_checkpoints_task_idx` ON `task_checkpoints` (`task_id`,`checkpoint_type`,`updated_at`);--> statement-breakpoint
CREATE TABLE `task_state_evidence_links` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`user_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`artifact_id` text NOT NULL,
	`chunk_index` integer,
	`role` text NOT NULL,
	`origin` text DEFAULT 'system' NOT NULL,
	`confidence` integer DEFAULT 0 NOT NULL,
	`reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `conversation_task_states`(`task_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_state_evidence_links_task_idx` ON `task_state_evidence_links` (`task_id`,`role`,`updated_at`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `project_id` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `tool_calls` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `metadata_json` text;
