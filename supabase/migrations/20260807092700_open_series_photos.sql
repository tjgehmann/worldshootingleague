-- Where the proof of an open series lives.
--
-- The storage policies key on the first folder of the path being a bout id:
-- <bout_id>/<shooter_id>/<file>. An open series has no bout — that is the whole
-- point of it — so the upload would have been refused, and once it was matched
-- the opponent could not have read it either.
--
-- Rather than moving the object at match time (SQL cannot move storage objects)
-- the first folder is allowed to be either: a bout, as before, or an open
-- series. Both resolve to the same question — may this person see this
-- photograph — so both live in one function instead of being spread across five
-- policies.

/** May the signed-in shooter read a photo filed under this folder? */
create or replace function public.target_photo_readable(p_folder uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    -- Your own, always.
    p_owner = auth.uid()
    -- A bout you are in, once it is revealed.
    or (public.bout_is_revealed(p_folder)
        and exists (
          select 1 from public.bouts b
           where b.id = p_folder and public.is_match_participant(b.match_id, auth.uid())
        ))
    -- A bout with a case open on it, to the referee working it.
    or public.is_assigned_referee(p_folder)
    -- An open series that has since been matched: the same two people, the same
    -- rule, reached through the match it turned into.
    or exists (
      select 1
        from public.open_series o
        join public.bouts b on b.match_id = o.match_id
       where o.id = p_folder
         and o.match_id is not null
         and (public.is_assigned_referee(b.id)
              or (public.bout_is_revealed(b.id)
                  and public.is_match_participant(b.match_id, auth.uid())))
    );
$$;

/** May they put one there? */
create or replace function public.target_photo_writable(p_folder uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p_owner = auth.uid()
    and (
      public.can_submit_to_bout(p_folder, auth.uid())
      -- Or a series they have declared and not yet reported: the window is
      -- open, so the photograph belongs to a series being shot right now.
      or exists (
        select 1 from public.open_series o
         where o.id = p_folder
           and o.shooter_id = auth.uid()
           and o.state = 'open'
           and o.report_by > now()
      )
    );
$$;

drop policy target_photos_insert on storage.objects;
drop policy target_photos_read_own on storage.objects;
drop policy target_photos_read_opponent on storage.objects;
drop policy target_photos_read_referee on storage.objects;

create policy target_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'target-photos'
    and public.target_photo_writable(
      ((storage.foldername(name))[1])::uuid,
      ((storage.foldername(name))[2])::uuid
    )
  );

create policy target_photos_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'target-photos'
    and public.target_photo_readable(
      ((storage.foldername(name))[1])::uuid,
      ((storage.foldername(name))[2])::uuid
    )
  );

-- Still no update and no delete. Photographs are evidence.
