CREATE TABLE `export_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`plan` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error_code` text,
	`error_message` text,
	`pages` integer,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
