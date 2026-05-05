CREATE TABLE deep_research_timeline_events (
	id text PRIMARY KEY NOT NULL,
	job_id text NOT NULL,
	task_id text,
	conversation_id text NOT NULL,
	user_id text NOT NULL,
	stage text NOT NULL,
	kind text NOT NULL,
	occurred_at integer NOT NULL,
	message_key text NOT NULL,
	message_params_json text NOT NULL,
	source_counts_json text NOT NULL,
	assumptions_json text NOT NULL,
	warnings_json text NOT NULL,
	summary text NOT NULL,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (job_id) REFERENCES deep_research_jobs(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX deep_research_timeline_events_job_occurred_idx
	ON deep_research_timeline_events (job_id, occurred_at);
--> statement-breakpoint
CREATE INDEX deep_research_timeline_events_conversation_occurred_idx
	ON deep_research_timeline_events (conversation_id, occurred_at);
--> statement-breakpoint
CREATE INDEX deep_research_timeline_events_user_occurred_idx
	ON deep_research_timeline_events (user_id, occurred_at);
--> statement-breakpoint
CREATE TABLE deep_research_usage_records (
	id text PRIMARY KEY NOT NULL,
	job_id text NOT NULL,
	task_id text,
	conversation_id text NOT NULL,
	user_id text NOT NULL,
	stage text NOT NULL,
	operation text NOT NULL,
	model_id text NOT NULL,
	model_display_name text,
	provider_id text,
	provider_display_name text,
	billing_month text NOT NULL,
	occurred_at integer NOT NULL,
	prompt_tokens integer DEFAULT 0 NOT NULL,
	cached_input_tokens integer DEFAULT 0 NOT NULL,
	cache_hit_tokens integer DEFAULT 0 NOT NULL,
	cache_miss_tokens integer DEFAULT 0 NOT NULL,
	completion_tokens integer DEFAULT 0 NOT NULL,
	reasoning_tokens integer DEFAULT 0 NOT NULL,
	total_tokens integer DEFAULT 0 NOT NULL,
	usage_source text DEFAULT 'estimated' NOT NULL,
	runtime_ms integer,
	cost_usd_micros integer DEFAULT 0 NOT NULL,
	created_at integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (job_id) REFERENCES deep_research_jobs(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX deep_research_usage_records_job_occurred_idx
	ON deep_research_usage_records (job_id, occurred_at);
--> statement-breakpoint
CREATE INDEX deep_research_usage_records_user_month_idx
	ON deep_research_usage_records (user_id, billing_month);
--> statement-breakpoint
CREATE INDEX deep_research_usage_records_model_month_idx
	ON deep_research_usage_records (model_id, billing_month);
