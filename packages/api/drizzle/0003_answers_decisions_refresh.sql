CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`idea_id` text NOT NULL,
	`text` text NOT NULL,
	`source` text NOT NULL,
	`applied_in_plan_id` text,
	`applied_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`idea_id`) REFERENCES `ideas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `decisions_idea` ON `decisions` (`idea_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `questions` ADD `asked_in_job_id` text;--> statement-breakpoint
ALTER TABLE `questions` ADD `answered_at` integer;--> statement-breakpoint
ALTER TABLE `questions` ADD `resolved_at` integer;--> statement-breakpoint
ALTER TABLE `questions` ADD `resolved_in_plan_id` text;--> statement-breakpoint
ALTER TABLE `questions` ADD `applied_note` text;--> statement-breakpoint
ALTER TABLE `research_jobs` ADD `prompt` text;--> statement-breakpoint
ALTER TABLE `research_jobs` ADD `input_as_of` integer;--> statement-breakpoint
ALTER TABLE `research_jobs` ADD `outcome` text;