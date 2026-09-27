CREATE TABLE `email_tokens` (
	`token` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`user_id` integer NOT NULL,
	`payload` text,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `users` ADD `verified_at` integer;