-- Mobile device registration for push notifications
CREATE TABLE IF NOT EXISTS "user_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "user_sub" text NOT NULL,
  "platform" text NOT NULL,
  "push_token" text NOT NULL,
  "device_name" text,
  "app_version" text,
  "enabled" boolean DEFAULT true,
  "last_active_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "user_devices_org_user_idx" ON "user_devices" ("org_id", "user_sub");
CREATE UNIQUE INDEX IF NOT EXISTS "user_devices_push_token_unique" ON "user_devices" ("push_token");
