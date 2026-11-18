-- Skillora Lesson Knowledge Check & Adaptive Learning Schema
-- Run this migration in your Supabase SQL Editor to store lesson knowledge checks
-- in a dedicated table with strict Row Level Security.

CREATE TABLE IF NOT EXISTS public.lesson_knowledge_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  roadmap_id uuid NOT NULL REFERENCES public.learning_roadmaps(id) ON DELETE CASCADE,
  stage_id text NOT NULL,
  lesson_id text NOT NULL,
  lesson_title text NOT NULL,
  submission_id text NOT NULL,
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  total_questions integer NOT NULL CHECK (total_questions > 0),
  correct_answers integer NOT NULL CHECK (correct_answers >= 0 AND correct_answers <= total_questions),
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  topic_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  knowledge_gaps text[] NOT NULL DEFAULT '{}'::text[],
  recommendation jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_knowledge_checks_user_submission_unique UNIQUE (user_id, submission_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_knowledge_checks_user_completed
  ON public.lesson_knowledge_checks (user_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_lesson_knowledge_checks_user_lesson
  ON public.lesson_knowledge_checks (user_id, roadmap_id, lesson_id, completed_at DESC);

ALTER TABLE public.lesson_knowledge_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own lesson knowledge checks" ON public.lesson_knowledge_checks;
CREATE POLICY "Users can view own lesson knowledge checks"
  ON public.lesson_knowledge_checks
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own lesson knowledge checks" ON public.lesson_knowledge_checks;
CREATE POLICY "Users can insert own lesson knowledge checks"
  ON public.lesson_knowledge_checks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own lesson knowledge checks" ON public.lesson_knowledge_checks;
CREATE POLICY "Users can delete own lesson knowledge checks"
  ON public.lesson_knowledge_checks
  FOR DELETE
  USING (auth.uid() = user_id);
