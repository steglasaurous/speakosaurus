CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`twitch_username` text NOT NULL,
	`twitch_user_id` text NOT NULL,
	`tts_name` text,
	`tts_provider_name` text,
	`tts_voice_id` text
);
