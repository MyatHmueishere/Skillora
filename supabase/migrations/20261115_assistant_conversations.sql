-- Skillora AI Learning Assistant Conversations & Messages Schema
-- Run this migration in your Supabase SQL Editor to persist multi-turn AI Study Companion conversations
-- with strict Row Level Security (users can only access and manage their own conversations).

CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New Study Conversation',
  active_roadmap_id uuid NULL,
  active_stage_id text NULL,
  active_lesson_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.assistant_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('user', 'assistant')),
  content text NOT NULL,
  code_snippet text NULL,
  code_language text NULL,
  recommended_resources jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_follow_ups jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user_updated
  ON public.assistant_conversations (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation_created
  ON public.assistant_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_user_created
  ON public.assistant_messages (user_id, created_at DESC);

ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own assistant conversations" ON public.assistant_conversations;
CREATE POLICY "Users can view own assistant conversations"
  ON public.assistant_conversations
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own assistant conversations" ON public.assistant_conversations;
CREATE POLICY "Users can insert own assistant conversations"
  ON public.assistant_conversations
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own assistant conversations" ON public.assistant_conversations;
CREATE POLICY "Users can update own assistant conversations"
  ON public.assistant_conversations
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own assistant conversations" ON public.assistant_conversations;
CREATE POLICY "Users can delete own assistant conversations"
  ON public.assistant_conversations
  FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own assistant messages" ON public.assistant_messages;
CREATE POLICY "Users can view own assistant messages"
  ON public.assistant_messages
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own assistant messages" ON public.assistant_messages;
CREATE POLICY "Users can insert own assistant messages"
  ON public.assistant_messages
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own assistant messages" ON public.assistant_messages;
CREATE POLICY "Users can update own assistant messages"
  ON public.assistant_messages
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own assistant messages" ON public.assistant_messages;
CREATE POLICY "Users can delete own assistant messages"
  ON public.assistant_messages
  FOR DELETE
  USING (auth.uid() = user_id);
