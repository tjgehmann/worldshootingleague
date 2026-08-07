-- Target photo storage.
--
-- Path convention: <bout_id>/<shooter_id>/<filename>
-- The policies mirror the submission policies exactly — a photo must not be
-- readable one moment earlier than the score it belongs to.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'target-photos', 'target-photos', false, 10485760,
  array['image/jpeg', 'image/png', 'image/heic', 'application/pdf']
)
on conflict (id) do nothing;

create policy target_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'target-photos'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.can_submit_to_bout(((storage.foldername(name))[1])::uuid, auth.uid())
  );

create policy target_photos_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'target-photos'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy target_photos_read_opponent on storage.objects
  for select to authenticated
  using (
    bucket_id = 'target-photos'
    and public.bout_is_revealed(((storage.foldername(name))[1])::uuid)
    and exists (
      select 1 from public.bouts b
       where b.id = ((storage.foldername(name))[1])::uuid
         and public.is_match_participant(b.match_id, auth.uid())
    )
  );

create policy target_photos_read_referee on storage.objects
  for select to authenticated
  using (
    bucket_id = 'target-photos'
    and public.is_assigned_referee(((storage.foldername(name))[1])::uuid)
  );

-- Photos are evidence. No update, no delete.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_read on storage.objects
  for select using (bucket_id = 'avatars');

create policy avatars_write_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
