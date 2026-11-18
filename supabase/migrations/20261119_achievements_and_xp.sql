-- Skillora Phase 8: Achievement Badges & XP System Schema
-- Run this migration in your Supabase SQL Editor to store verified XP awards
-- and unlocked achievement badges with strict Row Level Security.
--
-- Security Model:
--   * Users have SELECT-only access to their own rows (auth.uid() = user_id).
--   * Users CANNOT directly INSERT, UPDATE, or DELETE XP or badges from the client.
--   * Verified rewards are written either by the server service-role client OR
--     through the SECURITY DEFINER RPC function sync_verified_user_achievements(),
--     which accepts NO XP/badge arguments and derives awards strictly from canonical
--     database progress records owned by auth.uid().

CREATE TABLE IF NOT EXISTS public.achievement_xp_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN (
      'lesson_completed',
      'knowledge_check_passed',
      'stage_completed',
      'path_completed'
    )
  ),
  xp_amount integer NOT NULL CHECK (xp_amount IN (25, 50, 150, 500)),
  title text NOT NULL,
  roadmap_id uuid REFERENCES public.learning_roadmaps(id) ON DELETE SET NULL,
  stage_id text,
  lesson_id text,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT achievement_xp_ledger_user_event_unique UNIQUE (user_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_achievement_xp_ledger_user_awarded
  ON public.achievement_xp_ledger (user_id, awarded_at DESC);

ALTER TABLE public.achievement_xp_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own XP ledger" ON public.achievement_xp_ledger;
CREATE POLICY "Users can view own XP ledger"
  ON public.achievement_xp_ledger
  FOR SELECT
  USING (auth.uid() = user_id);


CREATE TABLE IF NOT EXISTS public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id text NOT NULL CHECK (
    badge_id IN (
      'first_step',
      'knowledge_seeker',
      'consistent_learner',
      'stage_master',
      'path_finisher',
      'skill_assessor'
    )
  ),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_achievements_user_badge_unique UNIQUE (user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user_unlocked
  ON public.user_achievements (user_id, unlocked_at DESC);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own achievements" ON public.user_achievements;
CREATE POLICY "Users can view own achievements"
  ON public.user_achievements
  FOR SELECT
  USING (auth.uid() = user_id);


CREATE OR REPLACE FUNCTION public.sync_verified_user_achievements(
  p_timezone text DEFAULT 'UTC'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tz text := 'UTC';
  v_roadmap record;
  v_stage jsonb;
  v_lesson jsonb;
  v_kc record;
  v_kc_json jsonb;
  v_roadmap_fallback_ts timestamptz;
  v_lesson_ts timestamptz;
  v_stage_latest_ts timestamptz;
  v_path_latest_ts timestamptz;
  v_stage_total integer;
  v_stage_completed integer;
  v_path_total integer;
  v_path_completed integer;
  v_lesson_id text;
  v_stage_id text;
  v_lesson_title text;
  v_stage_title text;
  v_kc_score integer;
  v_kc_ts timestamptz;
  v_newly_awarded_events integer := 0;
  v_newly_unlocked_badges integer := 0;
  v_row_count integer := 0;
  v_first_lesson_at timestamptz;
  v_first_kc_pass_at timestamptz;
  v_first_stage_at timestamptz;
  v_first_path_at timestamptz;
  v_first_assessment_at timestamptz;
  v_seven_day_streak_at timestamptz;
  v_total_xp integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Validate requested IANA timezone safely
  IF p_timezone IS NOT NULL AND length(trim(p_timezone)) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM pg_timezone_names WHERE name = trim(p_timezone)
    ) THEN
      v_tz := trim(p_timezone);
    END IF;
  END IF;

  -- 1. Backfill & verify lesson, stage, path, and embedded KC rewards across all roadmaps
  FOR v_roadmap IN
    SELECT id, title, career_goal, roadmap_data, created_at, updated_at
    FROM public.learning_roadmaps
    WHERE user_id = v_user_id
  LOOP
    v_roadmap_fallback_ts := COALESCE(v_roadmap.updated_at, v_roadmap.created_at, now());
    v_path_total := 0;
    v_path_completed := 0;
    v_path_latest_ts := NULL;

    IF jsonb_typeof(v_roadmap.roadmap_data->'stages') = 'array' THEN
      FOR v_stage IN
        SELECT value FROM jsonb_array_elements(v_roadmap.roadmap_data->'stages')
      LOOP
        v_stage_id := COALESCE(NULLIF(trim(v_stage->>'id'), ''), '');
        v_stage_title := COALESCE(NULLIF(trim(v_stage->>'title'), ''), 'Learning Stage');
        IF v_stage_id = '' THEN
          CONTINUE;
        END IF;

        v_stage_total := 0;
        v_stage_completed := 0;
        v_stage_latest_ts := NULL;

        IF jsonb_typeof(v_stage->'lessons') = 'array' THEN
          FOR v_lesson IN
            SELECT value FROM jsonb_array_elements(v_stage->'lessons')
          LOOP
            v_lesson_id := COALESCE(NULLIF(trim(v_lesson->>'id'), ''), '');
            v_lesson_title := COALESCE(NULLIF(trim(v_lesson->>'title'), ''), 'Lesson');
            IF v_lesson_id = '' THEN
              CONTINUE;
            END IF;

            v_stage_total := v_stage_total + 1;
            v_path_total := v_path_total + 1;

            IF COALESCE((v_lesson->>'completed')::boolean, false) IS TRUE THEN
              v_stage_completed := v_stage_completed + 1;
              v_path_completed := v_path_completed + 1;

              BEGIN
                v_lesson_ts := COALESCE(NULLIF(v_lesson->>'completedAt', '')::timestamptz, v_roadmap_fallback_ts);
              EXCEPTION WHEN OTHERS THEN
                v_lesson_ts := v_roadmap_fallback_ts;
              END;

              IF v_stage_latest_ts IS NULL OR v_lesson_ts > v_stage_latest_ts THEN
                v_stage_latest_ts := v_lesson_ts;
              END IF;
              IF v_path_latest_ts IS NULL OR v_lesson_ts > v_path_latest_ts THEN
                v_path_latest_ts := v_lesson_ts;
              END IF;

              INSERT INTO public.achievement_xp_ledger (
                user_id, event_key, event_type, xp_amount, title, roadmap_id, stage_id, lesson_id, awarded_at
              ) VALUES (
                v_user_id,
                'lesson:' || v_roadmap.id::text || ':' || v_stage_id || ':' || v_lesson_id,
                'lesson_completed',
                50,
                'Completed lesson: ' || v_lesson_title,
                v_roadmap.id,
                v_stage_id,
                v_lesson_id,
                v_lesson_ts
              )
              ON CONFLICT (user_id, event_key) DO NOTHING;

              GET DIAGNOSTICS v_row_count = ROW_COUNT;
              v_newly_awarded_events := v_newly_awarded_events + v_row_count;
            END IF;
          END LOOP;
        END IF;

        IF v_stage_total > 0 AND v_stage_completed = v_stage_total THEN
          INSERT INTO public.achievement_xp_ledger (
            user_id, event_key, event_type, xp_amount, title, roadmap_id, stage_id, lesson_id, awarded_at
          ) VALUES (
            v_user_id,
            'stage:' || v_roadmap.id::text || ':' || v_stage_id,
            'stage_completed',
            150,
            'Completed stage: ' || v_stage_title,
            v_roadmap.id,
            v_stage_id,
            NULL,
            COALESCE(v_stage_latest_ts, v_roadmap_fallback_ts)
          )
          ON CONFLICT (user_id, event_key) DO NOTHING;

          GET DIAGNOSTICS v_row_count = ROW_COUNT;
          v_newly_awarded_events := v_newly_awarded_events + v_row_count;
        END IF;
      END LOOP;
    END IF;

    IF v_path_total > 0 AND v_path_completed = v_path_total THEN
      INSERT INTO public.achievement_xp_ledger (
        user_id, event_key, event_type, xp_amount, title, roadmap_id, stage_id, lesson_id, awarded_at
      ) VALUES (
        v_user_id,
        'path:' || v_roadmap.id::text,
        'path_completed',
        500,
        'Completed learning path: ' || COALESCE(NULLIF(trim(v_roadmap.title), ''), NULLIF(trim(v_roadmap.career_goal), ''), 'Learning Path'),
        v_roadmap.id,
        NULL,
        NULL,
        COALESCE(v_path_latest_ts, v_roadmap_fallback_ts)
      )
      ON CONFLICT (user_id, event_key) DO NOTHING;

      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_newly_awarded_events := v_newly_awarded_events + v_row_count;
    END IF;

    -- Also inspect embedded fallback knowledgeCheckAttempts in roadmap_data if present
    IF jsonb_typeof(v_roadmap.roadmap_data->'knowledgeCheckAttempts') = 'array' THEN
      FOR v_kc_json IN
        SELECT value FROM jsonb_array_elements(v_roadmap.roadmap_data->'knowledgeCheckAttempts')
      LOOP
        BEGIN
          v_kc_score := COALESCE((v_kc_json->>'score')::integer, 0);
        EXCEPTION WHEN OTHERS THEN
          v_kc_score := 0;
        END;
        IF v_kc_score >= 80 THEN
          v_stage_id := COALESCE(NULLIF(trim(v_kc_json->>'stageId'), ''), '');
          v_lesson_id := COALESCE(NULLIF(trim(v_kc_json->>'lessonId'), ''), '');
          v_lesson_title := COALESCE(NULLIF(trim(v_kc_json->>'lessonTitle'), ''), 'Lesson Quiz');
          IF v_stage_id <> '' AND v_lesson_id <> '' THEN
            BEGIN
              v_kc_ts := COALESCE(NULLIF(v_kc_json->>'completedAt', '')::timestamptz, v_roadmap_fallback_ts);
            EXCEPTION WHEN OTHERS THEN
              v_kc_ts := v_roadmap_fallback_ts;
            END;

            INSERT INTO public.achievement_xp_ledger (
              user_id, event_key, event_type, xp_amount, title, roadmap_id, stage_id, lesson_id, awarded_at
            ) VALUES (
              v_user_id,
              'kc_pass:' || v_roadmap.id::text || ':' || v_stage_id || ':' || v_lesson_id,
              'knowledge_check_passed',
              25,
              'Passed Knowledge Check: ' || v_lesson_title || ' (' || v_kc_score::text || '%)',
              v_roadmap.id,
              v_stage_id,
              v_lesson_id,
              v_kc_ts
            )
            ON CONFLICT (user_id, event_key) DO NOTHING;

            GET DIAGNOSTICS v_row_count = ROW_COUNT;
            v_newly_awarded_events := v_newly_awarded_events + v_row_count;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- 2. Verify passing Knowledge Checks from public.lesson_knowledge_checks (if table exists)
  IF to_regclass('public.lesson_knowledge_checks') IS NOT NULL THEN
    FOR v_kc IN
      SELECT roadmap_id, stage_id, lesson_id, lesson_title, score, completed_at
      FROM public.lesson_knowledge_checks
      WHERE user_id = v_user_id AND score >= 80
      ORDER BY completed_at ASC
    LOOP
      INSERT INTO public.achievement_xp_ledger (
        user_id, event_key, event_type, xp_amount, title, roadmap_id, stage_id, lesson_id, awarded_at
      ) VALUES (
        v_user_id,
        'kc_pass:' || v_kc.roadmap_id::text || ':' || v_kc.stage_id || ':' || v_kc.lesson_id,
        'knowledge_check_passed',
        25,
        'Passed Knowledge Check: ' || COALESCE(NULLIF(trim(v_kc.lesson_title), ''), 'Lesson Quiz') || ' (' || v_kc.score::text || '%)',
        v_kc.roadmap_id,
        v_kc.stage_id,
        v_kc.lesson_id,
        COALESCE(v_kc.completed_at, now())
      )
      ON CONFLICT (user_id, event_key) DO NOTHING;

      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_newly_awarded_events := v_newly_awarded_events + v_row_count;
    END LOOP;
  END IF;

  -- 3. Unlock verified Achievement Badges
  SELECT MIN(awarded_at) INTO v_first_lesson_at
  FROM public.achievement_xp_ledger
  WHERE user_id = v_user_id AND event_type = 'lesson_completed';

  IF v_first_lesson_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES (v_user_id, 'first_step', v_first_lesson_at, '{"unlockRequirement":"Complete 1 lesson"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  SELECT MIN(awarded_at) INTO v_first_kc_pass_at
  FROM public.achievement_xp_ledger
  WHERE user_id = v_user_id AND event_type = 'knowledge_check_passed';

  IF v_first_kc_pass_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES (v_user_id, 'knowledge_seeker', v_first_kc_pass_at, '{"unlockRequirement":"Pass 1 knowledge check (80%+)"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  SELECT MIN(awarded_at) INTO v_first_stage_at
  FROM public.achievement_xp_ledger
  WHERE user_id = v_user_id AND event_type = 'stage_completed';

  IF v_first_stage_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES (v_user_id, 'stage_master', v_first_stage_at, '{"unlockRequirement":"Complete 1 full learning stage"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  SELECT MIN(awarded_at) INTO v_first_path_at
  FROM public.achievement_xp_ledger
  WHERE user_id = v_user_id AND event_type = 'path_completed';

  IF v_first_path_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES (v_user_id, 'path_finisher', v_first_path_at, '{"unlockRequirement":"Complete 1 full learning path"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  IF to_regclass('public.assessment_attempts') IS NOT NULL THEN
    SELECT MIN(created_at) INTO v_first_assessment_at
    FROM public.assessment_attempts
    WHERE user_id = v_user_id;

    IF v_first_assessment_at IS NOT NULL THEN
      INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
      VALUES (v_user_id, 'skill_assessor', v_first_assessment_at, '{"unlockRequirement":"Complete 1 diagnostic assessment"}'::jsonb)
      ON CONFLICT (user_id, badge_id) DO NOTHING;
      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
    END IF;
  END IF;

  -- Compute 7-day meaningful study streak across lessons, quizzes, sessions, and diagnostics
  WITH meaningful_timestamps AS (
    SELECT awarded_at AS ts
    FROM public.achievement_xp_ledger
    WHERE user_id = v_user_id AND event_type IN ('lesson_completed', 'knowledge_check_passed')
    UNION ALL
    SELECT COALESCE(ended_at, started_at) AS ts
    FROM public.learning_sessions
    WHERE user_id = v_user_id AND (completed IS TRUE OR duration_seconds >= 10)
    UNION ALL
    SELECT created_at AS ts
    FROM public.assessment_attempts
    WHERE user_id = v_user_id
  ),
  active_days AS (
    SELECT
      (ts AT TIME ZONE v_tz)::date AS local_day,
      MAX(ts) AS day_ts
    FROM meaningful_timestamps
    WHERE ts IS NOT NULL
    GROUP BY 1
  ),
  streak_groups AS (
    SELECT
      local_day,
      day_ts,
      local_day - (ROW_NUMBER() OVER (ORDER BY local_day))::integer AS grp
    FROM active_days
  ),
  numbered_runs AS (
    SELECT
      day_ts,
      ROW_NUMBER() OVER (PARTITION BY grp ORDER BY local_day) AS run_len
    FROM streak_groups
  )
  SELECT MIN(day_ts) INTO v_seven_day_streak_at
  FROM numbered_runs
  WHERE run_len >= 7;

  IF v_seven_day_streak_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES (v_user_id, 'consistent_learner', v_seven_day_streak_at, '{"unlockRequirement":"Achieve a 7-day study streak"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  SELECT COALESCE(SUM(xp_amount), 0) INTO v_total_xp
  FROM public.achievement_xp_ledger
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'totalXp', v_total_xp,
    'newlyAwardedEvents', v_newly_awarded_events,
    'newlyUnlockedBadges', v_newly_unlocked_badges
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_verified_user_achievements(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_verified_user_achievements(text) TO authenticated;
