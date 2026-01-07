CREATE TABLE `custom_intros` (
	`id` text PRIMARY KEY NOT NULL,
	`twitch_user_id` text NOT NULL,
	`intro_text` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `twitch_auth` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`expires_at` text,
	`scope` text
);
--> statement-breakpoint
ALTER TABLE `users` ADD `disable_welcome` integer;