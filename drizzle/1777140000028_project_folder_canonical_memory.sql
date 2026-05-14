ALTER TABLE `projects` ADD `canonical_memory_project_id` text REFERENCES `memory_projects`(`project_id`) ON UPDATE no action ON DELETE set null;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_canonical_memory_project_id_unique_idx` ON `projects` (`canonical_memory_project_id`);
