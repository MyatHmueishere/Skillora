-- Skillora Learning Sessions & Study Activity Tracking Schema
-- Run this migration in your Supabase SQL Editor to store authenticated
-- student study sessions, tracked time, and streak analytics with strict RLS.

CREATE TABLE IF NOT EXISTS public.learning_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_session_id text NOT NULL,
  roadmap_id uuid REFERENCES public.learning_roadmaps(id) ON DELETE SET NULL,
  stage_id text,
  lesson_id text,
  lesson_title text,
  activity_type text NOT NULL CHECK (activity_type IN ('lesson_study', 'knowledge_check', 'assessment')),
  duration_seconds integer NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0 AND duration_seconds <= 43200),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NOT NULL DEFAULT now(),
  completed boolean NOT NULL DEFAULT true,
  CONSTRAINT learning_sessions_user_client_unique UNIQUE (user_id, client_session_id)
);

CREATE INDEX IF NOT EXISTS idx_learning_sessions_user_started
  ON public.learning_sessions (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_learning_sessions_user_lesson
  ON public.learning_sessions (user_id, roadmap_id, lesson_id, started_at DESC);

ALTER TABLE public.learning_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own learning sessions" ON public.learning_sessions;
CREATE POLICY "Users can view own learning sessions"
  ON public.learning_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own learning sessions" ON public.learning_sessions;
CREATE POLICY "Users can insert own learning sessions"
  ON public.learning_sessions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own learning sessions" ON public.learning_sessions;
CREATE POLICY "Users can update own learning sessions"
  ON public.learning_sessions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own learning sessions" ON public.learning_sessions;
CREATE POLICY "Users can delete own learning sessions"
  ON public.learning_sessions
  FOR DELETE
  USING (auth.uid() = user_id);
