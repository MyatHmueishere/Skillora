-- Ensure student_profiles supports avatar_url persistence
alter table if exists public.student_profiles
  add column if not exists avatar_url text;

-- Create public avatars bucket for student profile photos (idempotent)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- Allow authenticated students to upload/update/delete only inside their own <auth.uid()>/ folder
drop policy if exists "Students can upload their own avatar" on storage.objects;
create policy "Students can upload their own avatar"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Students can update their own avatar" on storage.objects;
create policy "Students can update their own avatar"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Students can delete their own avatar" on storage.objects;
create policy "Students can delete their own avatar"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Anyone can view avatar images" on storage.objects;
create policy "Anyone can view avatar images"
  on storage.objects
  for select
  to public
  using (bucket_id = 'avatars');
