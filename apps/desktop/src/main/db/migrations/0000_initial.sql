CREATE TABLE IF NOT EXISTS `zeitmail_user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`default_connection_id` text,
	`custom_prompt` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `zeitmail_user_email_unique` ON `zeitmail_user` (`email`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `zeitmail_session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `zeitmail_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `zeitmail_session_token_unique` ON `zeitmail_session` (`token`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `session_user_id_idx` ON `zeitmail_session` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `session_expires_at_idx` ON `zeitmail_session` (`expires_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `zeitmail_account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `zeitmail_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `account_user_id_idx` ON `zeitmail_account` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `account_provider_user_id_idx` ON `zeitmail_account` (`provider_id`,`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `zeitmail_verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `verification_identifier_idx` ON `zeitmail_verification` (`identifier`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `verification_expires_at_idx` ON `zeitmail_verification` (`expires_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `zeitmail_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`picture` text,
	`access_token` text,
	`refresh_token` text,
	`scope` text NOT NULL,
	`provider_id` text NOT NULL,
	`imap_config` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `zeitmail_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `zeitmail_connection_user_id_email_unique` ON `zeitmail_connection` (`user_id`,`email`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `connection_user_id_idx` ON `zeitmail_connection` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `connection_provider_id_idx` ON `zeitmail_connection` (`provider_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `zeitmail_signature` (
	`id` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`connection_id`) REFERENCES `zeitmail_connection`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `zeitmail_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `signature_connection_id_idx` ON `zeitmail_signature` (`connection_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `signature_user_id_idx` ON `zeitmail_signature` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `zeitmail_user_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`settings` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `zeitmail_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `zeitmail_user_settings_user_id_unique` ON `zeitmail_user_settings` (`user_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `zeitmail_recipient` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`frequency` integer DEFAULT 1 NOT NULL,
	`last_used` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `zeitmail_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `zeitmail_recipient_user_id_email_unique` ON `zeitmail_recipient` (`user_id`,`email`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `recipient_user_id_idx` ON `zeitmail_recipient` (`user_id`);
