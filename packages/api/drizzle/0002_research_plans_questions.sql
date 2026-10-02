CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`idea_id` text NOT NULL,
	`version` integer NOT NULL,
	`summary` text NOT NULL,
	`plan_md` text NOT NULL,
	`stack` text NOT NULL,
	`research_md` text NOT NULL,
	`sources` text NOT NULL,
	`suggestion` text NOT NULL,
	`shelve_reason` text,
	`job_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`idea_id`) REFERENCES `ideas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_idea_version` ON `plans` (`idea_id`,`version`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`idea_id` text NOT NULL,
	`number` integer NOT NULL,
	`topic` text NOT NULL,
	`text` text NOT NULL,
	`why` text NOT NULL,
	`default_answer` text NOT NULL,
	`answer` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`asked_in_plan_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`idea_id`) REFERENCES `ideas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questions_idea_number` ON `questions` (`idea_id`,`number`);--> statement-breakpoint
CREATE TABLE `research_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`idea_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`attempt` integer DEFAULT 1 NOT NULL,
	`run_id` text,
	`repair_used` integer DEFAULT false NOT NULL,
	`not_before` integer NOT NULL,
	`deadline_at` integer,
	`started_at` integer,
	`finished_at` integer,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`idea_id`) REFERENCES `ideas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `research_jobs_status` ON `research_jobs` (`status`,`not_before`);--> statement-breakpoint
CREATE INDEX `research_jobs_idea` ON `research_jobs` (`idea_id`,`created_at`);