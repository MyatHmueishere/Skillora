-- Skillora Phase 9: Advanced Achievements, Badges & Professional Certification System
-- Non-destructive, self-healing migration compatible with Phase 8 (20261119_achievements_and_xp.sql)
-- and the actual Skillora Supabase schema (student_profiles.id = auth.uid(), learning_roadmaps,
-- lesson_knowledge_checks, learning_sessions, assessment_attempts).
-- Preserves all existing student accounts, roadmaps, assessments, XP, badges, and certificates.
--
-- Security Model:
--   * achievement_xp_ledger, user_achievements, and certificates have SELECT-only user RLS.
--   * Students CANNOT insert/update/delete XP, badges, or certificates from the client.
--   * Certificates are immutable except display template & privacy visibility via scoped RPC.
--   * Public verification uses SECURITY DEFINER RPC verify_certificate_public(), never exposing user_id/email.

-- 0. Ensure Phase 8 base tables exist (safe no-op if Phase 8 migration already ran; preserves all rows)
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
  badge_id text NOT NULL,
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

-- 1. Option A Direction tracking on achievement_xp_ledger
ALTER TABLE public.achievement_xp_ledger
  ADD COLUMN IF NOT EXISTS direction text;

CREATE INDEX IF NOT EXISTS idx_achievement_xp_ledger_user_direction
  ON public.achievement_xp_ledger (user_id, direction);

-- Safely backfill direction for existing Phase 8 ledger entries from learning_roadmaps
DO $$
BEGIN
  IF to_regclass('public.learning_roadmaps') IS NOT NULL THEN
    UPDATE public.achievement_xp_ledger AS l
    SET direction = COALESCE(
      NULLIF(trim(r.roadmap_data->>'primaryDirection'), ''),
      NULLIF(trim(r.career_goal), ''),
      NULLIF(trim(r.title), ''),
      'General Learning'
    )
    FROM public.learning_roadmaps AS r
    WHERE l.roadmap_id = r.id
      AND (l.direction IS NULL OR length(trim(l.direction)) = 0);
  END IF;
END
$$;

UPDATE public.achievement_xp_ledger
SET direction = 'General Learning'
WHERE direction IS NULL OR length(trim(direction)) = 0;

-- 2. Expand user_achievements CHECK constraint to include all Phase 8 & Phase 9 badge IDs (23 badges)
ALTER TABLE public.user_achievements
  DROP CONSTRAINT IF EXISTS user_achievements_badge_id_check;

ALTER TABLE public.user_achievements
  ADD CONSTRAINT user_achievements_badge_id_check CHECK (
    badge_id IN (
      'first_step',
      'knowledge_seeker',
      'consistent_learner',
      'stage_master',
      'path_finisher',
      'skill_assessor',
      'first_lesson_completed',
      'first_course_completed',
      'first_learning_path_completed',
      'roadmap_explorer',
      'streak_3_days',
      'streak_7_days',
      'streak_14_days',
      'streak_30_days',
      'streak_100_days',
      'knowledge_master',
      'quiz_champion',
      'perfect_score',
      'practice_champion',
      'skill_builder',
      'fast_learner',
      'learning_excellence',
      'subject_expert'
    )
  );

-- 3. Verified, immutable Certificates table
CREATE TABLE IF NOT EXISTS public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  certificate_number text NOT NULL UNIQUE,
  certificate_key text NOT NULL,
  certificate_type text NOT NULL CHECK (
    certificate_type IN ('course_completion', 'path_completion', 'excellence')
  ),
  title text NOT NULL,
  direction text NOT NULL,
  student_name text NOT NULL,
  roadmap_id uuid REFERENCES public.learning_roadmaps(id) ON DELETE SET NULL,
  stage_id text,
  template_id text NOT NULL DEFAULT 'classic_academic' CHECK (
    template_id IN ('classic_academic', 'modern_professional', 'excellence_award')
  ),
  public_name_visibility text NOT NULL DEFAULT 'full_name' CHECK (
    public_name_visibility IN ('full_name', 'initials')
  ),
  issuer_name text NOT NULL DEFAULT 'Skillora',
  issuer_designation text NOT NULL DEFAULT 'Academic & Curriculum Verification Board',
  status text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'revoked')),
  completion_date timestamptz NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  verification_digest text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT certificates_user_key_unique UNIQUE (user_id, certificate_key)
);

CREATE INDEX IF NOT EXISTS idx_certificates_user_issued
  ON public.certificates (user_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_certificates_number_upper
  ON public.certificates (upper(certificate_number));

ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own certificates" ON public.certificates;
CREATE POLICY "Users can view own certificates"
  ON public.certificates
  FOR SELECT
  USING (auth.uid() = user_id);

-- Enforce SELECT-only privileges for authenticated users (never allow direct client writes)
REVOKE ALL ON TABLE public.achievement_xp_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.achievement_xp_ledger TO authenticated;

REVOKE ALL ON TABLE public.user_achievements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.user_achievements TO authenticated;

REVOKE ALL ON TABLE public.certificates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.certificates TO authenticated;

-- 4. Scoped RPC allowing certificate owner to update ONLY display template & privacy mode
CREATE OR REPLACE FUNCTION public.update_certificate_display_preferences(
  p_certificate_id uuid,
  p_template_id text DEFAULT NULL,
  p_public_name_visibility text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_updated public.certificates%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_template_id IS NOT NULL AND p_template_id NOT IN ('classic_academic', 'modern_professional', 'excellence_award') THEN
    RAISE EXCEPTION 'Invalid certificate template';
  END IF;

  IF p_public_name_visibility IS NOT NULL AND p_public_name_visibility NOT IN ('full_name', 'initials') THEN
    RAISE EXCEPTION 'Invalid privacy visibility mode';
  END IF;

  UPDATE public.certificates
  SET
    template_id = COALESCE(p_template_id, template_id),
    public_name_visibility = COALESCE(p_public_name_visibility, public_name_visibility)
  WHERE id = p_certificate_id AND user_id = v_user_id
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Certificate not found or access denied';
  END IF;

  RETURN to_jsonb(v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.update_certificate_display_preferences(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_certificate_display_preferences(uuid, text, text) TO authenticated;

-- 5. Helper to format masked/unmasked public display name
CREATE OR REPLACE FUNCTION public._skillora_mask_public_name(
  p_full_name text,
  p_visibility text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_clean text := COALESCE(NULLIF(trim(p_full_name), ''), 'Skillora Learner');
  v_parts text[];
  v_part text;
  v_out text := '';
BEGIN
  IF p_visibility = 'full_name' THEN
    RETURN v_clean;
  END IF;

  v_parts := regexp_split_to_array(v_clean, '\s+');
  FOREACH v_part IN ARRAY v_parts LOOP
    IF length(trim(v_part)) > 0 THEN
      IF length(v_out) > 0 THEN
        v_out := v_out || ' ';
      END IF;
      v_out := v_out || upper(substr(trim(v_part), 1, 1)) || '.';
    END IF;
  END LOOP;

  RETURN COALESCE(NULLIF(v_out, ''), 'S.');
END;
$$;

-- 6. Public verification RPC (anon + authenticated, exposes zero private PII/user_id)
CREATE OR REPLACE FUNCTION public.verify_certificate_public(
  p_certificate_number text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_number text := upper(trim(COALESCE(p_certificate_number, '')));
  v_cert public.certificates%ROWTYPE;
  v_type_label text;
BEGIN
  IF v_clean_number = '' THEN
    RETURN jsonb_build_object(
      'found', false,
      'authentic', false,
      'certificateNumber', ''
    );
  END IF;

  SELECT *
  INTO v_cert
  FROM public.certificates
  WHERE upper(certificate_number) = v_clean_number
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'authentic', false,
      'certificateNumber', v_clean_number
    );
  END IF;

  v_type_label := CASE v_cert.certificate_type
    WHEN 'course_completion' THEN 'Course Completion Certificate'
    WHEN 'path_completion' THEN 'Learning Path Completion Certificate'
    WHEN 'excellence' THEN 'Excellence Award Certificate'
    ELSE 'Certificate'
  END;

  RETURN jsonb_build_object(
    'found', true,
    'authentic', (v_cert.status = 'valid'),
    'certificateNumber', v_cert.certificate_number,
    'certificateType', v_cert.certificate_type,
    'certificateTypeLabel', v_type_label,
    'title', v_cert.title,
    'direction', v_cert.direction,
    'studentDisplayName', public._skillora_mask_public_name(v_cert.student_name, v_cert.public_name_visibility),
    'privacyMode', v_cert.public_name_visibility,
    'issuedAt', v_cert.issued_at,
    'completionDate', v_cert.completion_date,
    'status', v_cert.status,
    'issuerName', v_cert.issuer_name,
    'issuerDesignation', v_cert.issuer_designation,
    'verificationDigest', v_cert.verification_digest
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_certificate_public(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certificate_public(text) TO anon, authenticated;

-- 7. Deterministic certificate number generator (SKL-YYYY-XXXX-XXXX)
CREATE OR REPLACE FUNCTION public._skillora_cert_number(
  p_seed_key text,
  p_issued_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_year text := to_char(COALESCE(p_issued_at, now()) AT TIME ZONE 'UTC', 'YYYY');
  v_hash1 text := upper(substr(md5(p_seed_key), 1, 4));
  v_hash2 text := upper(substr(md5(p_seed_key || ':' || to_char(COALESCE(p_issued_at, now()) AT TIME ZONE 'UTC', 'YYYY-MM-DD')), 1, 4));
BEGIN
  RETURN 'SKL-' || v_year || '-' || v_hash1 || '-' || v_hash2;
END;
$$;

-- 8. Upgrade sync_verified_user_achievements RPC to reconcile direction XP, all Phase 9 badges & verified certificates
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
  v_profile_json jsonb;
  v_student_name text := '';
  v_active_direction text := '';
  v_roadmap record;
  v_roadmap_direction text;
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
  v_stages_total integer;
  v_stages_with_kc integer;
  v_stage_kc_count integer;
  v_stage_kc_latest timestamptz;
  v_lesson_id text;
  v_stage_id text;
  v_lesson_title text;
  v_stage_title text;
  v_kc_score integer;
  v_kc_ts timestamptz;
  v_newly_awarded_events integer := 0;
  v_newly_unlocked_badges integer := 0;
  v_newly_issued_certs integer := 0;
  v_row_count integer := 0;
  v_first_lesson_at timestamptz;
  v_first_kc_pass_at timestamptz;
  v_fifth_kc_pass_at timestamptz;
  v_tenth_kc_pass_at timestamptz;
  v_fifth_lesson_at timestamptz;
  v_tenth_lesson_at timestamptz;
  v_first_stage_at timestamptz;
  v_first_path_at timestamptz;
  v_first_assessment_at timestamptz;
  v_perfect_kc_at timestamptz;
  v_perfect_assess_at timestamptz;
  v_perfect_score_at timestamptz;
  v_fast_learner_at timestamptz;
  v_streak_3_at timestamptz;
  v_streak_7_at timestamptz;
  v_streak_14_at timestamptz;
  v_streak_30_at timestamptz;
  v_streak_100_at timestamptz;
  v_roadmap_count integer := 0;
  v_distinct_stage_count integer := 0;
  v_practice_count integer := 0;
  v_kc_score_sum numeric := 0;
  v_kc_graded_count integer := 0;
  v_assess_score_sum numeric := 0;
  v_assess_graded_count integer := 0;
  v_avg_graded numeric := 0;
  v_graded_count integer := 0;
  v_max_dir_xp integer := 0;
  v_dir_xp integer := 0;
  v_dir_courses integer := 0;
  v_dir_kc_sum numeric := 0;
  v_dir_kc_cnt integer := 0;
  v_dir_kc_latest timestamptz;
  v_dir_assess_sum numeric := 0;
  v_dir_assess_cnt integer := 0;
  v_dir_assess_latest timestamptz;
  v_dir_avg numeric := 0;
  v_dir_graded_count integer := 0;
  v_dir_latest_ts timestamptz;
  v_activity_ts timestamptz[] := ARRAY[]::timestamptz[];
  v_ts_part timestamptz[];
  v_cert_number text;
  v_cert_key text;
  v_cert_digest text;
  v_cert_title text;
  v_cert_ts timestamptz;
  v_total_xp integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_timezone IS NOT NULL AND length(trim(p_timezone)) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM pg_timezone_names WHERE name = trim(p_timezone)
    ) THEN
      v_tz := trim(p_timezone);
    END IF;
  END IF;

  -- Safely resolve student display name & primary direction without assuming column variants
  IF to_regclass('public.student_profiles') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'student_profiles' AND column_name = 'id'
    ) THEN
      EXECUTE 'SELECT to_jsonb(sp) FROM public.student_profiles sp WHERE sp.id = $1 LIMIT 1'
      INTO v_profile_json
      USING v_user_id;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'student_profiles' AND column_name = 'user_id'
    ) THEN
      EXECUTE 'SELECT to_jsonb(sp) FROM public.student_profiles sp WHERE sp.user_id = $1 LIMIT 1'
      INTO v_profile_json
      USING v_user_id;
    END IF;

    IF v_profile_json IS NOT NULL THEN
      v_student_name := COALESCE(
        NULLIF(trim(v_profile_json->>'full_name'), ''),
        NULLIF(trim(v_profile_json->>'name'), ''),
        ''
      );
      v_active_direction := COALESCE(
        NULLIF(trim(v_profile_json->>'primary_direction'), ''),
        NULLIF(trim(v_profile_json->>'career_goal'), ''),
        ''
      );
    END IF;
  END IF;

  IF v_student_name = '' THEN
    SELECT COALESCE(
      NULLIF(trim(raw_user_meta_data->>'full_name'), ''),
      NULLIF(trim(raw_user_meta_data->>'name'), ''),
      'Skillora Learner'
    )
    INTO v_student_name
    FROM auth.users
    WHERE id = v_user_id;
  END IF;
  v_student_name := COALESCE(NULLIF(trim(v_student_name), ''), 'Skillora Learner');

  IF v_active_direction = '' AND to_regclass('public.learning_roadmaps') IS NOT NULL THEN
    SELECT COALESCE(
      NULLIF(trim(roadmap_data->>'primaryDirection'), ''),
      NULLIF(trim(career_goal), ''),
      NULLIF(trim(title), ''),
      ''
    )
    INTO v_active_direction
    FROM public.learning_roadmaps
    WHERE user_id = v_user_id
    ORDER BY (status = 'active') DESC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    LIMIT 1;
    v_active_direction := COALESCE(v_active_direction, '');
  END IF;

  -- 1. Backfill & verify lesson, stage, path, and embedded KC rewards across all roadmaps
  IF to_regclass('public.learning_roadmaps') IS NOT NULL THEN
    FOR v_roadmap IN
      SELECT id, title, career_goal, roadmap_data, created_at, updated_at
      FROM public.learning_roadmaps
      WHERE user_id = v_user_id
    LOOP
      v_roadmap_count := v_roadmap_count + 1;
      v_roadmap_fallback_ts := COALESCE(v_roadmap.updated_at, v_roadmap.created_at, now());
      v_roadmap_direction := COALESCE(
        NULLIF(trim(v_roadmap.roadmap_data->>'primaryDirection'), ''),
        NULLIF(trim(v_roadmap.career_goal), ''),
        NULLIF(trim(v_roadmap.title), ''),
        'General Learning'
      );
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
                  user_id, event_key, event_type, xp_amount, title, direction, roadmap_id, stage_id, lesson_id, awarded_at
                ) VALUES (
                  v_user_id,
                  'lesson:' || v_roadmap.id::text || ':' || v_stage_id || ':' || v_lesson_id,
                  'lesson_completed',
                  50,
                  'Completed lesson: ' || v_lesson_title,
                  v_roadmap_direction,
                  v_roadmap.id,
                  v_stage_id,
                  v_lesson_id,
                  v_lesson_ts
                )
                ON CONFLICT (user_id, event_key) DO UPDATE
                  SET direction = COALESCE(NULLIF(trim(public.achievement_xp_ledger.direction), ''), EXCLUDED.direction);

                GET DIAGNOSTICS v_row_count = ROW_COUNT;
                IF v_row_count > 0 THEN
                  v_newly_awarded_events := v_newly_awarded_events + v_row_count;
                END IF;
              END IF;
            END LOOP;
          END IF;

          IF v_stage_total > 0 AND v_stage_completed = v_stage_total THEN
            INSERT INTO public.achievement_xp_ledger (
              user_id, event_key, event_type, xp_amount, title, direction, roadmap_id, stage_id, lesson_id, awarded_at
            ) VALUES (
              v_user_id,
              'stage:' || v_roadmap.id::text || ':' || v_stage_id,
              'stage_completed',
              150,
              'Completed stage: ' || v_stage_title,
              v_roadmap_direction,
              v_roadmap.id,
              v_stage_id,
              NULL,
              COALESCE(v_stage_latest_ts, v_roadmap_fallback_ts)
            )
            ON CONFLICT (user_id, event_key) DO UPDATE
              SET direction = COALESCE(NULLIF(trim(public.achievement_xp_ledger.direction), ''), EXCLUDED.direction);

            GET DIAGNOSTICS v_row_count = ROW_COUNT;
            v_newly_awarded_events := v_newly_awarded_events + v_row_count;
          END IF;
        END LOOP;
      END IF;

      IF v_path_total > 0 AND v_path_completed = v_path_total THEN
        INSERT INTO public.achievement_xp_ledger (
          user_id, event_key, event_type, xp_amount, title, direction, roadmap_id, stage_id, lesson_id, awarded_at
        ) VALUES (
          v_user_id,
          'path:' || v_roadmap.id::text,
          'path_completed',
          500,
          'Completed learning path: ' || COALESCE(NULLIF(trim(v_roadmap.title), ''), NULLIF(trim(v_roadmap.career_goal), ''), 'Learning Path'),
          v_roadmap_direction,
          v_roadmap.id,
          NULL,
          NULL,
          COALESCE(v_path_latest_ts, v_roadmap_fallback_ts)
        )
        ON CONFLICT (user_id, event_key) DO UPDATE
          SET direction = COALESCE(NULLIF(trim(public.achievement_xp_ledger.direction), ''), EXCLUDED.direction);

        GET DIAGNOSTICS v_row_count = ROW_COUNT;
        v_newly_awarded_events := v_newly_awarded_events + v_row_count;
      END IF;

      -- Embedded KC attempts
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
                user_id, event_key, event_type, xp_amount, title, direction, roadmap_id, stage_id, lesson_id, awarded_at
              ) VALUES (
                v_user_id,
                'kc_pass:' || v_roadmap.id::text || ':' || v_stage_id || ':' || v_lesson_id,
                'knowledge_check_passed',
                25,
                'Passed Knowledge Check: ' || v_lesson_title || ' (' || v_kc_score::text || '%)',
                v_roadmap_direction,
                v_roadmap.id,
                v_stage_id,
                v_lesson_id,
                v_kc_ts
              )
              ON CONFLICT (user_id, event_key) DO UPDATE
                SET direction = COALESCE(NULLIF(trim(public.achievement_xp_ledger.direction), ''), EXCLUDED.direction);

              GET DIAGNOSTICS v_row_count = ROW_COUNT;
              v_newly_awarded_events := v_newly_awarded_events + v_row_count;
            END IF;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- 2. Verify passing Knowledge Checks from public.lesson_knowledge_checks
  IF to_regclass('public.lesson_knowledge_checks') IS NOT NULL THEN
    IF to_regclass('public.learning_roadmaps') IS NOT NULL THEN
      FOR v_kc IN
        SELECT kc.roadmap_id, kc.stage_id, kc.lesson_id, kc.lesson_title, kc.score, kc.completed_at,
               COALESCE(
                 NULLIF(trim(r.roadmap_data->>'primaryDirection'), ''),
                 NULLIF(trim(r.career_goal), ''),
                 NULLIF(trim(r.title), ''),
                 'General Learning'
               ) AS dir_label
        FROM public.lesson_knowledge_checks kc
        LEFT JOIN public.learning_roadmaps r ON r.id = kc.roadmap_id
        WHERE kc.user_id = v_user_id AND kc.score >= 80
        ORDER BY kc.completed_at ASC
      LOOP
        INSERT INTO public.achievement_xp_ledger (
          user_id, event_key, event_type, xp_amount, title, direction, roadmap_id, stage_id, lesson_id, awarded_at
        ) VALUES (
          v_user_id,
          'kc_pass:' || v_kc.roadmap_id::text || ':' || v_kc.stage_id || ':' || v_kc.lesson_id,
          'knowledge_check_passed',
          25,
          'Passed Knowledge Check: ' || COALESCE(NULLIF(trim(v_kc.lesson_title), ''), 'Lesson Quiz') || ' (' || v_kc.score::text || '%)',
          v_kc.dir_label,
          v_kc.roadmap_id,
          v_kc.stage_id,
          v_kc.lesson_id,
          COALESCE(v_kc.completed_at, now())
        )
        ON CONFLICT (user_id, event_key) DO UPDATE
          SET direction = COALESCE(NULLIF(trim(public.achievement_xp_ledger.direction), ''), EXCLUDED.direction);

        GET DIAGNOSTICS v_row_count = ROW_COUNT;
        v_newly_awarded_events := v_newly_awarded_events + v_row_count;
      END LOOP;
    ELSE
      FOR v_kc IN
        SELECT kc.roadmap_id, kc.stage_id, kc.lesson_id, kc.lesson_title, kc.score, kc.completed_at
        FROM public.lesson_knowledge_checks kc
        WHERE kc.user_id = v_user_id AND kc.score >= 80
        ORDER BY kc.completed_at ASC
      LOOP
        INSERT INTO public.achievement_xp_ledger (
          user_id, event_key, event_type, xp_amount, title, direction, roadmap_id, stage_id, lesson_id, awarded_at
        ) VALUES (
          v_user_id,
          'kc_pass:' || v_kc.roadmap_id::text || ':' || v_kc.stage_id || ':' || v_kc.lesson_id,
          'knowledge_check_passed',
          25,
          'Passed Knowledge Check: ' || COALESCE(NULLIF(trim(v_kc.lesson_title), ''), 'Lesson Quiz') || ' (' || v_kc.score::text || '%)',
          'General Learning',
          v_kc.roadmap_id,
          v_kc.stage_id,
          v_kc.lesson_id,
          COALESCE(v_kc.completed_at, now())
        )
        ON CONFLICT (user_id, event_key) DO UPDATE
          SET direction = COALESCE(NULLIF(trim(public.achievement_xp_ledger.direction), ''), EXCLUDED.direction);

        GET DIAGNOSTICS v_row_count = ROW_COUNT;
        v_newly_awarded_events := v_newly_awarded_events + v_row_count;
      END LOOP;
    END IF;
  END IF;

  -- 3. Unlock verified Achievement Badges (Phase 8 + Phase 9)
  SELECT MIN(awarded_at) INTO v_first_lesson_at
  FROM public.achievement_xp_ledger WHERE user_id = v_user_id AND event_type = 'lesson_completed';

  IF v_first_lesson_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES
      (v_user_id, 'first_step', v_first_lesson_at, '{"unlockRequirement":"Complete 1 lesson"}'::jsonb),
      (v_user_id, 'first_lesson_completed', v_first_lesson_at, '{"unlockRequirement":"Complete 1 lesson"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  SELECT MIN(awarded_at) INTO v_first_stage_at
  FROM public.achievement_xp_ledger WHERE user_id = v_user_id AND event_type = 'stage_completed';

  IF v_first_stage_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES
      (v_user_id, 'stage_master', v_first_stage_at, '{"unlockRequirement":"Complete 1 full learning stage"}'::jsonb),
      (v_user_id, 'first_course_completed', v_first_stage_at, '{"unlockRequirement":"Complete 1 full course stage"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  SELECT MIN(awarded_at) INTO v_first_path_at
  FROM public.achievement_xp_ledger WHERE user_id = v_user_id AND event_type = 'path_completed';

  IF v_first_path_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES
      (v_user_id, 'path_finisher', v_first_path_at, '{"unlockRequirement":"Complete 1 full learning path"}'::jsonb),
      (v_user_id, 'first_learning_path_completed', v_first_path_at, '{"unlockRequirement":"Complete 1 full learning path"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  SELECT COUNT(DISTINCT (roadmap_id::text || ':' || stage_id)) INTO v_distinct_stage_count
  FROM public.achievement_xp_ledger
  WHERE user_id = v_user_id AND event_type = 'lesson_completed' AND stage_id IS NOT NULL;

  IF v_roadmap_count >= 2 OR v_distinct_stage_count >= 3 THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES (v_user_id, 'roadmap_explorer', COALESCE(v_first_lesson_at, now()), '{"unlockRequirement":"2 roadmaps or 3 distinct stages"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  SELECT MIN(awarded_at) INTO v_first_kc_pass_at
  FROM public.achievement_xp_ledger WHERE user_id = v_user_id AND event_type = 'knowledge_check_passed';
  IF v_first_kc_pass_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES (v_user_id, 'knowledge_seeker', v_first_kc_pass_at, '{"unlockRequirement":"Pass 1 knowledge check (80%+)"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  SELECT awarded_at INTO v_fifth_kc_pass_at
  FROM public.achievement_xp_ledger
  WHERE user_id = v_user_id AND event_type = 'knowledge_check_passed'
  ORDER BY awarded_at ASC OFFSET 4 LIMIT 1;
  IF v_fifth_kc_pass_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES (v_user_id, 'knowledge_master', v_fifth_kc_pass_at, '{"unlockRequirement":"Pass 5 distinct knowledge checks"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  SELECT awarded_at INTO v_tenth_kc_pass_at
  FROM public.achievement_xp_ledger
  WHERE user_id = v_user_id AND event_type = 'knowledge_check_passed'
  ORDER BY awarded_at ASC OFFSET 9 LIMIT 1;
  IF v_tenth_kc_pass_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES (v_user_id, 'quiz_champion', v_tenth_kc_pass_at, '{"unlockRequirement":"Pass 10 distinct knowledge checks"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  IF to_regclass('public.assessment_attempts') IS NOT NULL THEN
    SELECT MIN(created_at) INTO v_first_assessment_at
    FROM public.assessment_attempts WHERE user_id = v_user_id;
    IF v_first_assessment_at IS NOT NULL THEN
      INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
      VALUES (v_user_id, 'skill_assessor', v_first_assessment_at, '{"unlockRequirement":"Complete 1 diagnostic assessment"}'::jsonb)
      ON CONFLICT (user_id, badge_id) DO NOTHING;
      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
    END IF;
  END IF;

  -- Perfect score across KC or diagnostic assessments (guarded with to_regclass)
  IF to_regclass('public.lesson_knowledge_checks') IS NOT NULL THEN
    SELECT MIN(completed_at) INTO v_perfect_kc_at
    FROM public.lesson_knowledge_checks
    WHERE user_id = v_user_id AND score >= 100;
  END IF;
  IF to_regclass('public.assessment_attempts') IS NOT NULL THEN
    SELECT MIN(created_at) INTO v_perfect_assess_at
    FROM public.assessment_attempts
    WHERE user_id = v_user_id AND score_percent >= 100;
  END IF;
  v_perfect_score_at := LEAST(v_perfect_kc_at, v_perfect_assess_at);

  IF v_perfect_score_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES (v_user_id, 'perfect_score', v_perfect_score_at, '{"unlockRequirement":"Score 100% on a quiz or assessment"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  -- Practice Champion (10+ completed sessions or lessons) & Skill Builder (5 lessons + 1 assessment)
  SELECT awarded_at INTO v_fifth_lesson_at
  FROM public.achievement_xp_ledger WHERE user_id = v_user_id AND event_type = 'lesson_completed'
  ORDER BY awarded_at ASC OFFSET 4 LIMIT 1;

  SELECT awarded_at INTO v_tenth_lesson_at
  FROM public.achievement_xp_ledger WHERE user_id = v_user_id AND event_type = 'lesson_completed'
  ORDER BY awarded_at ASC OFFSET 9 LIMIT 1;

  IF to_regclass('public.learning_sessions') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_practice_count
    FROM public.learning_sessions
    WHERE user_id = v_user_id AND (completed IS TRUE OR duration_seconds >= 60);
  END IF;

  IF v_tenth_lesson_at IS NOT NULL OR v_practice_count >= 10 THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES (v_user_id, 'practice_champion', COALESCE(v_tenth_lesson_at, now()), '{"unlockRequirement":"Complete 10 meaningful study activities"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  IF v_fifth_lesson_at IS NOT NULL AND v_first_assessment_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES (v_user_id, 'skill_builder', GREATEST(v_fifth_lesson_at, v_first_assessment_at), '{"unlockRequirement":"Complete 5 lessons & 1 diagnostic"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  -- Fast learner (3+ lessons completed in one calendar day)
  SELECT MIN(day_latest) INTO v_fast_learner_at
  FROM (
    SELECT (awarded_at AT TIME ZONE v_tz)::date AS d, MAX(awarded_at) AS day_latest
    FROM public.achievement_xp_ledger
    WHERE user_id = v_user_id AND event_type = 'lesson_completed'
    GROUP BY 1
    HAVING COUNT(*) >= 3
  ) fast_days;
  IF v_fast_learner_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES (v_user_id, 'fast_learner', v_fast_learner_at, '{"unlockRequirement":"Complete 3 lessons in 1 day"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  -- Learning Excellence (1+ stage completed & 90%+ average across 3+ graded evaluations)
  IF to_regclass('public.lesson_knowledge_checks') IS NOT NULL THEN
    SELECT COALESCE(SUM(score::numeric), 0), COUNT(*)
    INTO v_kc_score_sum, v_kc_graded_count
    FROM public.lesson_knowledge_checks
    WHERE user_id = v_user_id;
  END IF;
  IF to_regclass('public.assessment_attempts') IS NOT NULL THEN
    SELECT COALESCE(SUM(score_percent::numeric), 0), COUNT(*)
    INTO v_assess_score_sum, v_assess_graded_count
    FROM public.assessment_attempts
    WHERE user_id = v_user_id;
  END IF;
  v_graded_count := v_kc_graded_count + v_assess_graded_count;
  v_avg_graded := CASE
    WHEN v_graded_count > 0 THEN (v_kc_score_sum + v_assess_score_sum) / v_graded_count
    ELSE 0
  END;

  IF v_first_stage_at IS NOT NULL AND v_graded_count >= 3 AND round(v_avg_graded) >= 90 THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES (v_user_id, 'learning_excellence', GREATEST(v_first_stage_at, now()), '{"unlockRequirement":"1 course done & 90%+ avg (3+ graded)"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  -- Subject Expert (1,000+ XP in any direction OR 1+ completed path)
  SELECT COALESCE(MAX(dir_sum), 0) INTO v_max_dir_xp
  FROM (
    SELECT lower(COALESCE(NULLIF(trim(direction), ''), 'General Learning')) AS dkey, SUM(xp_amount) AS dir_sum
    FROM public.achievement_xp_ledger
    WHERE user_id = v_user_id
    GROUP BY 1
  ) dir_totals;
  IF v_max_dir_xp >= 1000 OR v_first_path_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES (v_user_id, 'subject_expert', COALESCE(v_first_path_at, now()), '{"unlockRequirement":"1,000+ XP in 1 direction or 1 path done"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  -- Streak badges (3, 7, 14, 30, 100 days) using table-existence-guarded timestamps
  SELECT COALESCE(array_agg(awarded_at), ARRAY[]::timestamptz[])
  INTO v_ts_part
  FROM public.achievement_xp_ledger
  WHERE user_id = v_user_id
    AND event_type IN ('lesson_completed', 'knowledge_check_passed')
    AND awarded_at IS NOT NULL;
  v_activity_ts := v_activity_ts || v_ts_part;

  IF to_regclass('public.lesson_knowledge_checks') IS NOT NULL THEN
    SELECT COALESCE(array_agg(completed_at), ARRAY[]::timestamptz[])
    INTO v_ts_part
    FROM public.lesson_knowledge_checks
    WHERE user_id = v_user_id AND completed_at IS NOT NULL;
    v_activity_ts := v_activity_ts || v_ts_part;
  END IF;

  IF to_regclass('public.learning_sessions') IS NOT NULL THEN
    SELECT COALESCE(array_agg(COALESCE(ended_at, started_at)), ARRAY[]::timestamptz[])
    INTO v_ts_part
    FROM public.learning_sessions
    WHERE user_id = v_user_id
      AND (completed IS TRUE OR duration_seconds >= 10)
      AND COALESCE(ended_at, started_at) IS NOT NULL;
    v_activity_ts := v_activity_ts || v_ts_part;
  END IF;

  IF to_regclass('public.assessment_attempts') IS NOT NULL THEN
    SELECT COALESCE(array_agg(created_at), ARRAY[]::timestamptz[])
    INTO v_ts_part
    FROM public.assessment_attempts
    WHERE user_id = v_user_id AND created_at IS NOT NULL;
    v_activity_ts := v_activity_ts || v_ts_part;
  END IF;

  WITH active_days AS (
    SELECT (t.ts AT TIME ZONE v_tz)::date AS local_day, MAX(t.ts) AS day_ts
    FROM unnest(v_activity_ts) AS t(ts)
    WHERE t.ts IS NOT NULL
    GROUP BY 1
  ),
  streak_groups AS (
    SELECT local_day, day_ts, local_day - (ROW_NUMBER() OVER (ORDER BY local_day))::integer AS grp
    FROM active_days
  ),
  numbered_runs AS (
    SELECT day_ts, ROW_NUMBER() OVER (PARTITION BY grp ORDER BY local_day) AS run_len
    FROM streak_groups
  )
  SELECT
    MIN(day_ts) FILTER (WHERE run_len >= 3),
    MIN(day_ts) FILTER (WHERE run_len >= 7),
    MIN(day_ts) FILTER (WHERE run_len >= 14),
    MIN(day_ts) FILTER (WHERE run_len >= 30),
    MIN(day_ts) FILTER (WHERE run_len >= 100)
  INTO v_streak_3_at, v_streak_7_at, v_streak_14_at, v_streak_30_at, v_streak_100_at
  FROM numbered_runs;

  IF v_streak_3_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES (v_user_id, 'streak_3_days', v_streak_3_at, '{"unlockRequirement":"Achieve a 3-day study streak"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  IF v_streak_7_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES
      (v_user_id, 'consistent_learner', v_streak_7_at, '{"unlockRequirement":"Achieve a 7-day study streak"}'::jsonb),
      (v_user_id, 'streak_7_days', v_streak_7_at, '{"unlockRequirement":"Achieve a 7-day study streak"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  IF v_streak_14_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES (v_user_id, 'streak_14_days', v_streak_14_at, '{"unlockRequirement":"Achieve a 14-day study streak"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  IF v_streak_30_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES (v_user_id, 'streak_30_days', v_streak_30_at, '{"unlockRequirement":"Achieve a 30-day study streak"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  IF v_streak_100_at IS NOT NULL THEN
    INSERT INTO public.user_achievements (user_id, badge_id, unlocked_at, metadata)
    VALUES (v_user_id, 'streak_100_days', v_streak_100_at, '{"unlockRequirement":"Achieve a 100-day study streak"}'::jsonb)
    ON CONFLICT (user_id, badge_id) DO NOTHING;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_newly_unlocked_badges := v_newly_unlocked_badges + v_row_count;
  END IF;

  -- 4. Verify & issue Course, Learning Path, and Excellence Certificates strictly from actual completion
  IF to_regclass('public.learning_roadmaps') IS NOT NULL THEN
    FOR v_roadmap IN
      SELECT id, title, career_goal, roadmap_data, created_at, updated_at
      FROM public.learning_roadmaps
      WHERE user_id = v_user_id
    LOOP
      v_roadmap_fallback_ts := COALESCE(v_roadmap.updated_at, v_roadmap.created_at, now());
      v_roadmap_direction := COALESCE(
        NULLIF(trim(v_roadmap.roadmap_data->>'primaryDirection'), ''),
        NULLIF(trim(v_roadmap.career_goal), ''),
        NULLIF(trim(v_roadmap.title), ''),
        'General Learning'
      );
      v_path_total := 0;
      v_path_completed := 0;
      v_path_latest_ts := NULL;
      v_stages_total := 0;
      v_stages_with_kc := 0;

      IF jsonb_typeof(v_roadmap.roadmap_data->'stages') = 'array' THEN
        FOR v_stage IN
          SELECT value FROM jsonb_array_elements(v_roadmap.roadmap_data->'stages')
        LOOP
          v_stage_id := COALESCE(NULLIF(trim(v_stage->>'id'), ''), '');
          v_stage_title := COALESCE(NULLIF(trim(v_stage->>'title'), ''), 'Course Stage');
          IF v_stage_id = '' THEN
            CONTINUE;
          END IF;
          v_stages_total := v_stages_total + 1;
          v_stage_total := 0;
          v_stage_completed := 0;
          v_stage_latest_ts := NULL;

          IF jsonb_typeof(v_stage->'lessons') = 'array' THEN
            FOR v_lesson IN
              SELECT value FROM jsonb_array_elements(v_stage->'lessons')
            LOOP
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
              END IF;
            END LOOP;
          END IF;

          SELECT COUNT(*), MAX(awarded_at)
          INTO v_stage_kc_count, v_stage_kc_latest
          FROM public.achievement_xp_ledger
          WHERE user_id = v_user_id
            AND roadmap_id = v_roadmap.id
            AND stage_id = v_stage_id
            AND event_type = 'knowledge_check_passed';

          IF v_stage_kc_count >= 1 THEN
            v_stages_with_kc := v_stages_with_kc + 1;
            IF v_path_latest_ts IS NULL OR v_stage_kc_latest > v_path_latest_ts THEN
              v_path_latest_ts := v_stage_kc_latest;
            END IF;
          END IF;

          -- Issue Course Completion Certificate only if ALL lessons completed AND >= 1 KC passed
          IF v_stage_total > 0 AND v_stage_completed = v_stage_total AND v_stage_kc_count >= 1 THEN
            v_cert_key := 'course:' || v_roadmap.id::text || ':' || v_stage_id;
            v_cert_ts := GREATEST(COALESCE(v_stage_latest_ts, v_roadmap_fallback_ts), COALESCE(v_stage_kc_latest, v_roadmap_fallback_ts));
            v_cert_number := public._skillora_cert_number(v_user_id::text || ':' || v_cert_key, v_cert_ts);
            v_cert_digest := upper(substr(md5(v_cert_number || '|course_completion|' || v_stage_title || '|' || v_roadmap_direction), 1, 16));

            INSERT INTO public.certificates (
              user_id, certificate_number, certificate_key, certificate_type,
              title, direction, student_name, roadmap_id, stage_id,
              template_id, public_name_visibility, issuer_name, issuer_designation,
              status, completion_date, issued_at, verification_digest
            ) VALUES (
              v_user_id, v_cert_number, v_cert_key, 'course_completion',
              v_stage_title, v_roadmap_direction, v_student_name, v_roadmap.id, v_stage_id,
              'classic_academic', 'full_name', 'Skillora', 'Academic & Curriculum Verification Board',
              'valid', v_cert_ts, v_cert_ts, v_cert_digest
            )
            ON CONFLICT (user_id, certificate_key) DO NOTHING;

            GET DIAGNOSTICS v_row_count = ROW_COUNT;
            v_newly_issued_certs := v_newly_issued_certs + v_row_count;
          END IF;
        END LOOP;
      END IF;

      -- Issue Learning Path Completion Certificate only if ALL lessons done AND every stage has a passed KC
      IF v_stages_total > 0 AND v_path_total > 0 AND v_path_completed = v_path_total AND v_stages_with_kc = v_stages_total THEN
        v_cert_key := 'path:' || v_roadmap.id::text;
        v_cert_title := COALESCE(NULLIF(trim(v_roadmap.title), ''), v_roadmap_direction || ' Learning Path');
        v_cert_ts := COALESCE(v_path_latest_ts, v_roadmap_fallback_ts);
        v_cert_number := public._skillora_cert_number(v_user_id::text || ':' || v_cert_key, v_cert_ts);
        v_cert_digest := upper(substr(md5(v_cert_number || '|path_completion|' || v_cert_title || '|' || v_roadmap_direction), 1, 16));

        INSERT INTO public.certificates (
          user_id, certificate_number, certificate_key, certificate_type,
          title, direction, student_name, roadmap_id, stage_id,
          template_id, public_name_visibility, issuer_name, issuer_designation,
          status, completion_date, issued_at, verification_digest
        ) VALUES (
          v_user_id, v_cert_number, v_cert_key, 'path_completion',
          v_cert_title, v_roadmap_direction, v_student_name, v_roadmap.id, NULL,
          'modern_professional', 'full_name', 'Skillora', 'Academic & Curriculum Verification Board',
          'valid', v_cert_ts, v_cert_ts, v_cert_digest
        )
        ON CONFLICT (user_id, certificate_key) DO NOTHING;

        GET DIAGNOSTICS v_row_count = ROW_COUNT;
        v_newly_issued_certs := v_newly_issued_certs + v_row_count;
      END IF;
    END LOOP;
  END IF;

  -- Excellence Certificate for active direction (1+ course stage done, >= 500 direction XP, >= 90% avg across >= 3 graded)
  IF length(trim(COALESCE(v_active_direction, ''))) > 0 THEN
    SELECT
      COALESCE(SUM(xp_amount), 0),
      COUNT(*) FILTER (WHERE event_type = 'stage_completed')
    INTO v_dir_xp, v_dir_courses
    FROM public.achievement_xp_ledger
    WHERE user_id = v_user_id
      AND lower(COALESCE(NULLIF(trim(direction), ''), 'General Learning')) = lower(trim(v_active_direction));

    IF to_regclass('public.lesson_knowledge_checks') IS NOT NULL AND to_regclass('public.learning_roadmaps') IS NOT NULL THEN
      SELECT COALESCE(SUM(kc.score::numeric), 0), COUNT(*), MAX(kc.completed_at)
      INTO v_dir_kc_sum, v_dir_kc_cnt, v_dir_kc_latest
      FROM public.lesson_knowledge_checks kc
      JOIN public.learning_roadmaps r ON r.id = kc.roadmap_id
      WHERE kc.user_id = v_user_id
        AND lower(COALESCE(NULLIF(trim(r.roadmap_data->>'primaryDirection'), ''), NULLIF(trim(r.career_goal), ''), NULLIF(trim(r.title), ''), 'General Learning')) = lower(trim(v_active_direction));
    END IF;

    IF to_regclass('public.assessment_attempts') IS NOT NULL THEN
      SELECT COALESCE(SUM(a.score_percent::numeric), 0), COUNT(*), MAX(a.created_at)
      INTO v_dir_assess_sum, v_dir_assess_cnt, v_dir_assess_latest
      FROM public.assessment_attempts a
      WHERE a.user_id = v_user_id;
    END IF;

    v_dir_graded_count := v_dir_kc_cnt + v_dir_assess_cnt;
    v_dir_avg := CASE
      WHEN v_dir_graded_count > 0 THEN (v_dir_kc_sum + v_dir_assess_sum) / v_dir_graded_count
      ELSE 0
    END;
    v_dir_latest_ts := GREATEST(v_dir_kc_latest, v_dir_assess_latest);

    IF v_dir_courses >= 1 AND v_dir_xp >= 500 AND v_dir_graded_count >= 3 AND round(v_dir_avg) >= 90 THEN
      v_cert_key := 'excellence:' || trim(both '_' from regexp_replace(lower(trim(v_active_direction)), '[^a-z0-9]+', '_', 'g'));
      v_cert_title := 'Excellence in ' || trim(v_active_direction);
      v_cert_ts := COALESCE(v_dir_latest_ts, now());
      v_cert_number := public._skillora_cert_number(v_user_id::text || ':' || v_cert_key, v_cert_ts);
      v_cert_digest := upper(substr(md5(v_cert_number || '|excellence|' || v_cert_title || '|' || trim(v_active_direction)), 1, 16));

      INSERT INTO public.certificates (
        user_id, certificate_number, certificate_key, certificate_type,
        title, direction, student_name, roadmap_id, stage_id,
        template_id, public_name_visibility, issuer_name, issuer_designation,
        status, completion_date, issued_at, verification_digest
      ) VALUES (
        v_user_id, v_cert_number, v_cert_key, 'excellence',
        v_cert_title, trim(v_active_direction), v_student_name, NULL, NULL,
        'excellence_award', 'full_name', 'Skillora', 'Academic & Curriculum Verification Board',
        'valid', v_cert_ts, v_cert_ts, v_cert_digest
      )
      ON CONFLICT (user_id, certificate_key) DO NOTHING;

      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_newly_issued_certs := v_newly_issued_certs + v_row_count;
    END IF;
  END IF;

  SELECT COALESCE(SUM(xp_amount), 0) INTO v_total_xp
  FROM public.achievement_xp_ledger
  WHERE user_id = v_user_id;

  RETURN jsonb_build_object(
    'totalXp', v_total_xp,
    'newlyAwardedEvents', v_newly_awarded_events,
    'newlyUnlockedBadges', v_newly_unlocked_badges,
    'newlyIssuedCertificates', v_newly_issued_certs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_verified_user_achievements(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_verified_user_achievements(text) TO authenticated;
