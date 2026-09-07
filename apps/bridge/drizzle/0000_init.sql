CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`mod_twitch_id` text,
	`action` text NOT NULL,
	`endpoint` text NOT NULL,
	`timestamp` integer NOT NULL,
	`success` integer NOT NULL,
	`error_message` text
);
--> statement-breakpoint
CREATE TABLE `moderator_access` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`mod_twitch_id` text NOT NULL,
	`mod_twitch_username` text NOT NULL,
	`access_token` text NOT NULL,
	`granted_at` integer NOT NULL,
	`last_active_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`session_id` text PRIMARY KEY NOT NULL,
	`broadcaster_twitch_id` text NOT NULL,
	`broadcaster_twitch_username` text NOT NULL,
	`connection_token` text NOT NULL,
	`encrypted_access_token` text,
	`encrypted_refresh_token` text,
	`token_expires_at` integer,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
