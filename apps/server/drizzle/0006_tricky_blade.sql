CREATE TABLE `ai_usage` (
	`user_id` integer NOT NULL,
	`period` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `period`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `users` ADD `ai_access` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `ai_disclosure_seen` integer DEFAULT false NOT NULL;