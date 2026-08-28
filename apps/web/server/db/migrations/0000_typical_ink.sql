CREATE SEQUENCE "public"."zeitmail_sync_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "zeitmail_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zeitmail_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"picture" text,
	"access_token" text,
	"refresh_token" text,
	"scope" text NOT NULL,
	"provider_id" text NOT NULL,
	"imap_config" jsonb,
	"expires_at" timestamp NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "zeitmail_connection_user_id_email_unique" UNIQUE("user_id","email")
);
--> statement-breakpoint
CREATE TABLE "zeitmail_email_message" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"thread_id" text,
	"provider_message_id" text NOT NULL,
	"provider_thread_id" text NOT NULL,
	"folder" text,
	"from_name" text,
	"from_email" text,
	"to_recipients" jsonb,
	"cc_recipients" jsonb,
	"subject" text,
	"snippet" text,
	"body_ref" text,
	"labels" jsonb,
	"flags" jsonb,
	"received_at" timestamp,
	"headers" jsonb,
	"synced_at" timestamp NOT NULL,
	CONSTRAINT "zeitmail_email_message_connection_id_provider_message_id_unique" UNIQUE("connection_id","provider_message_id")
);
--> statement-breakpoint
CREATE TABLE "zeitmail_email_thread" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"provider_thread_id" text NOT NULL,
	"subject" text,
	"snippet" text,
	"participants" jsonb,
	"labels" jsonb,
	"message_count" integer DEFAULT 0 NOT NULL,
	"has_unread" boolean DEFAULT false NOT NULL,
	"has_starred" boolean DEFAULT false NOT NULL,
	"last_message_at" timestamp,
	"history_id" text,
	"synced_at" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "zeitmail_email_thread_connection_id_provider_thread_id_unique" UNIQUE("connection_id","provider_thread_id")
);
--> statement-breakpoint
CREATE TABLE "zeitmail_rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text,
	"count" integer,
	"last_request" bigint
);
--> statement-breakpoint
CREATE TABLE "zeitmail_recipient" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"frequency" integer DEFAULT 1 NOT NULL,
	"last_used" timestamp NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "zeitmail_recipient_user_id_email_unique" UNIQUE("user_id","email")
);
--> statement-breakpoint
CREATE TABLE "zeitmail_security_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"type" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zeitmail_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "zeitmail_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "zeitmail_signature" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zeitmail_sync_action" (
	"sync_id" bigint PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action" jsonb NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zeitmail_sync_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zeitmail_sync_record" (
	"model" text NOT NULL,
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "zeitmail_sync_record_model_id_pk" PRIMARY KEY("model","id")
);
--> statement-breakpoint
CREATE TABLE "zeitmail_sync_state" (
	"connection_id" text PRIMARY KEY NOT NULL,
	"history_id" text,
	"delta_link" text,
	"uid_next" integer,
	"last_full_sync_at" timestamp,
	"last_delta_at" timestamp,
	"sync_locked_at" timestamp,
	"last_run_id" text,
	"backfill_page_token" text,
	"scheduler_run_id" text,
	"scheduler_heartbeat_at" timestamp,
	"last_error" text,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zeitmail_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"default_connection_id" text,
	"custom_prompt" text,
	"phone_number" text,
	"phone_number_verified" boolean,
	CONSTRAINT "zeitmail_user_email_unique" UNIQUE("email"),
	CONSTRAINT "zeitmail_user_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
CREATE TABLE "zeitmail_user_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"settings" jsonb DEFAULT '{"language":"en","timezone":"UTC","dynamicContent":false,"externalImages":true,"customPrompt":"","trustedSenders":[],"isOnboarded":false,"colorTheme":"system","autoRead":true,"defaultEmailAlias":"","categories":[{"id":"Important","name":"Important","searchValue":"IMPORTANT","order":0,"icon":"Lightning","isDefault":false},{"id":"All Mail","name":"All Mail","searchValue":"","order":1,"icon":"Mail","isDefault":true},{"id":"Unread","name":"Unread","searchValue":"UNREAD","order":5,"icon":"ScanEye","isDefault":false}],"undoSendEnabled":false,"imageCompression":"medium","animations":false,"mailListLayout":"split","notifications":{"level":"all","inApp":true,"desktop":false,"push":false,"sound":false,"marketing":false}}'::jsonb NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "zeitmail_user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "zeitmail_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "zeitmail_account" ADD CONSTRAINT "zeitmail_account_user_id_zeitmail_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."zeitmail_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zeitmail_connection" ADD CONSTRAINT "zeitmail_connection_user_id_zeitmail_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."zeitmail_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zeitmail_email_message" ADD CONSTRAINT "zeitmail_email_message_connection_id_zeitmail_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."zeitmail_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zeitmail_email_message" ADD CONSTRAINT "zeitmail_email_message_thread_id_zeitmail_email_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."zeitmail_email_thread"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zeitmail_email_thread" ADD CONSTRAINT "zeitmail_email_thread_connection_id_zeitmail_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."zeitmail_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zeitmail_recipient" ADD CONSTRAINT "zeitmail_recipient_user_id_zeitmail_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."zeitmail_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zeitmail_session" ADD CONSTRAINT "zeitmail_session_user_id_zeitmail_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."zeitmail_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zeitmail_signature" ADD CONSTRAINT "zeitmail_signature_connection_id_zeitmail_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."zeitmail_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zeitmail_signature" ADD CONSTRAINT "zeitmail_signature_user_id_zeitmail_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."zeitmail_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zeitmail_sync_state" ADD CONSTRAINT "zeitmail_sync_state_connection_id_zeitmail_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."zeitmail_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zeitmail_user_settings" ADD CONSTRAINT "zeitmail_user_settings_user_id_zeitmail_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."zeitmail_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "zeitmail_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_provider_user_id_idx" ON "zeitmail_account" USING btree ("provider_id","user_id");--> statement-breakpoint
CREATE INDEX "connection_user_id_idx" ON "zeitmail_connection" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "connection_provider_id_idx" ON "zeitmail_connection" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "email_message_connection_folder_received_idx" ON "zeitmail_email_message" USING btree ("connection_id","folder","received_at");--> statement-breakpoint
CREATE INDEX "email_message_thread_idx" ON "zeitmail_email_message" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "email_thread_connection_id_idx" ON "zeitmail_email_thread" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "email_thread_last_message_at_idx" ON "zeitmail_email_thread" USING btree ("connection_id","last_message_at");--> statement-breakpoint
CREATE INDEX "rate_limit_key_idx" ON "zeitmail_rate_limit" USING btree ("key");--> statement-breakpoint
CREATE INDEX "recipient_user_id_idx" ON "zeitmail_recipient" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "security_event_user_id_idx" ON "zeitmail_security_event" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "security_event_type_created_idx" ON "zeitmail_security_event" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "zeitmail_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_expires_at_idx" ON "zeitmail_session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "signature_connection_id_idx" ON "zeitmail_signature" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "signature_user_id_idx" ON "zeitmail_signature" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sync_action_user_sync_idx" ON "zeitmail_sync_action" USING btree ("user_id","sync_id");--> statement-breakpoint
CREATE INDEX "sync_record_user_model_idx" ON "zeitmail_sync_record" USING btree ("user_id","model");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "zeitmail_verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "verification_expires_at_idx" ON "zeitmail_verification" USING btree ("expires_at");