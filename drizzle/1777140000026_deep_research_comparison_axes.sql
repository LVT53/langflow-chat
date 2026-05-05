ALTER TABLE deep_research_sources ADD COLUMN intended_compared_entity text;
--> statement-breakpoint
ALTER TABLE deep_research_sources ADD COLUMN intended_comparison_axis text;
--> statement-breakpoint
ALTER TABLE deep_research_sources ADD COLUMN compared_entity text;
--> statement-breakpoint
ALTER TABLE deep_research_sources ADD COLUMN comparison_axis text;
--> statement-breakpoint
ALTER TABLE deep_research_coverage_gaps ADD COLUMN compared_entity text;
