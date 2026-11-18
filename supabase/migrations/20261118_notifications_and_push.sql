-- Skillora Smart Inactivity Reminders & External Web Push Schema
-- Run this migration in your Supabase SQL Editor to persist notification preferences,
-- browser Web Push subscriptions, and deduplicated notification deliveries with strict RLS.

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  in_app_enabled boolean NOT NULL DEFAULT true,
  push_enabled boolean NOT NULL DEFAULT false,
  preferred_time text NOT NULL DEFAULT '18:00' CHECK (preferred_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  timezone text NOT NULL DEFAULT 'UTC',
  paused boolean NOT NULL DEFAULT false,
  paused_until timestamptz,
  streak_reminders boolean NOT NULL DEFAULT true,
  inactivity_reminders boolean NOT NULL DEFAULT true,
  weekly_digest boolean NOT NULL DEFAULT true,
  ai_insight_alerts boolean NOT NULL DEFAULT true,
  last_meaningful_activity_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can view own notification preferences"
  ON public.notification_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can insert own notification preferences"
  ON public.notification_preferences
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can update own notification preferences"
  ON public.notification_preferences
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notification preferences" ON public.notification_preferences;
CREATE POLICY "Users can delete own notification preferences"
  ON public.notification_preferences
  FOR DELETE
  USING (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_user_endpoint_unique UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_active
  ON public.push_subscriptions (user_id, is_active);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can view own push subscriptions"
  ON public.push_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can insert own push subscriptions"
  ON public.push_subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can update own push subscriptions"
  ON public.push_subscriptions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can delete own push subscriptions"
  ON public.push_subscriptions
  FOR DELETE
  USING (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dedupe_key text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('gentle_1d', 'followup_2_3d', 'restart_7d', 'test_push', 'in_app')),
  channel text NOT NULL CHECK (channel IN ('push', 'in_app')),
  title text NOT NULL,
  body text NOT NULL,
  target_url text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'read', 'dismissed')),
  error_message text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT notification_deliveries_user_dedupe_channel_unique UNIQUE (user_id, dedupe_key, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user_sent
  ON public.notification_deliveries (user_id, sent_at DESC);

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notification deliveries" ON public.notification_deliveries;
CREATE POLICY "Users can view own notification deliveries"
  ON public.notification_deliveries
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own notification deliveries" ON public.notification_deliveries;
CREATE POLICY "Users can insert own notification deliveries"
  ON public.notification_deliveries
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notification deliveries" ON public.notification_deliveries;
CREATE POLICY "Users can update own notification deliveries"
  ON public.notification_deliveries
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own notification deliveries" ON public.notification_deliveries;
CREATE POLICY "Users can delete own notification deliveries"
  ON public.notification_deliveries
  FOR DELETE
  USING (auth.uid() = user_id);

