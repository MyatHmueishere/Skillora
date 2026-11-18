-- Phase 4: Store one active primary learning direction per student
-- Preserves all existing learning_interests, career_goal, learning_roadmaps,
-- assessment_attempts, lesson_knowledge_checks, and learning_sessions records.

alter table if exists public.student_profiles
  add column if not exists primary_direction text;
