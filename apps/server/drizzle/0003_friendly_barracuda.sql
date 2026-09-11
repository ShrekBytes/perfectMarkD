PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reference_code` text NOT NULL,
	`user_id` integer,
	`plan` text NOT NULL,
	`duration` integer NOT NULL,
	`coin` text NOT NULL,
	`network` text NOT NULL,
	`txid` text,
	`amount_expected` text NOT NULL,
	`ltc_rate_usdt` text,
	`amount_claimed` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`reject_reason` text,
	`note` text,
	`created_at` integer NOT NULL,
	`decided_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_orders`("id", "reference_code", "user_id", "plan", "duration", "coin", "network", "txid", "amount_expected", "ltc_rate_usdt", "amount_claimed", "status", "reject_reason", "note", "created_at", "decided_at") SELECT "id", "reference_code", "user_id", "plan", "duration", "coin", "network", "txid", "amount_expected", "ltc_rate_usdt", "amount_claimed", "status", "reject_reason", "note", "created_at", "decided_at" FROM `orders`;--> statement-breakpoint
DROP TABLE `orders`;--> statement-breakpoint
ALTER TABLE `__new_orders` RENAME TO `orders`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_reference_code_unique` ON `orders` (`reference_code`);--> statement-breakpoint
ALTER TABLE `export_usage` ADD `comps` integer DEFAULT 0 NOT NULL;