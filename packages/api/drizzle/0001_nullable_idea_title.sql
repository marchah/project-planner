PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`status` text DEFAULT 'CAPTURED' NOT NULL,
	`source` text DEFAULT 'WEB' NOT NULL,
	`source_url` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_ideas`("id", "title", "body", "status", "source", "source_url", "created_at", "updated_at") SELECT "id", "title", "body", "status", "source", "source_url", "created_at", "updated_at" FROM `ideas`;--> statement-breakpoint
DROP TABLE `ideas`;--> statement-breakpoint
ALTER TABLE `__new_ideas` RENAME TO `ideas`;--> statement-breakpoint
PRAGMA foreign_keys=ON;