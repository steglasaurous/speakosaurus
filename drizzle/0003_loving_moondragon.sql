PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`twitch_user_id` text PRIMARY KEY NOT NULL,
	`twitch_username` text NOT NULL,
	`tts_name` text,
	`tts_provider_name` text,
	`tts_voice_id` text
);
--> statement-breakpoint
INSERT INTO `__new_users`("twitch_user_id", "twitch_username", "tts_name", "tts_provider_name", "tts_voice_id") SELECT "twitch_user_id", "twitch_username", "tts_name", "tts_provider_name", "tts_voice_id" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;