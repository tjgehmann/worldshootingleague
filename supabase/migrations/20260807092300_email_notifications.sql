-- The second channel.
--
-- Push is the right notification for a turn-based game and the wrong one for
-- this beta: it ships as a web app, and on iOS a web app can only be pushed to
-- once it has been added to the home screen. Whoever never does that is
-- unreachable, and "your opponent has reported" is exactly the message that
-- brings somebody back.
--
-- Email reaches everybody, needs nothing installed, and uses the outbox that is
-- already there. The database still decides what is worth saying; this only
-- adds a way of saying it.
--
-- The two channels are tracked separately on purpose. A shooter with no device
-- token would otherwise leave a row that is never marked sent, and a push that
-- failed should not stop the email that would have worked.

alter table public.profiles
  add column notify_email boolean not null default true;

alter table public.notifications
  add column emailed_at timestamptz;

comment on column public.notifications.sent_at is 'When this went out as a push.';
comment on column public.notifications.emailed_at is 'When this went out as an email.';

create index notifications_unemailed_idx on public.notifications (created_at)
  where emailed_at is null and error is null;

-- Column grants are rebuilt whenever a new one becomes writable by its owner.
revoke update on public.profiles from authenticated;
grant update (display_name, country_code, avatar_path, bio, equipment, is_public,
              handle, primary_club_id, notify_push, notify_email)
  on public.profiles to authenticated;

/**
 * What still has to go out by email, with the address to send it to.
 *
 * auth.users is not readable by any client role, so this is the one place the
 * address is joined on — a security-definer function granted to the service
 * role and to nobody else. The delivery function has the service key anyway;
 * the point of the function is that the join lives here, next to the schema,
 * rather than inside a TypeScript file where a mistake is a data leak.
 */
create or replace function public.pending_email_notifications(p_limit integer default 200)
returns table (
  id           uuid,
  email        text,
  display_name text,
  kind         public.notification_kind,
  title        text,
  body         text,
  data         jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select n.id, u.email::text, p.display_name, n.kind, n.title, n.body, n.data
    from public.notifications n
    join public.profiles p on p.id = n.shooter_id
    join auth.users u on u.id = n.shooter_id
   where n.emailed_at is null
     and n.error is null
     and p.notify_email
     and p.deleted_at is null
     and u.email is not null
   order by n.created_at
   limit greatest(p_limit, 1);
$$;

revoke execute on function public.pending_email_notifications(integer) from public;
revoke execute on function public.pending_email_notifications(integer) from anon, authenticated;
grant execute on function public.pending_email_notifications(integer) to service_role;

-- A notification is only outstanding while neither channel has taken it. Before
-- email existed this counted every row belonging to a shooter without a device
-- token, which was a number that could only grow.
create or replace function public.beta_backlog()
returns table (
  metric text,
  value  bigint,
  detail text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;

  return query
  select 'open_cases', count(*),
         coalesce(round(max(extract(epoch from (now() - created_at)) / 3600))::text, '0')
           || ' hrs is the oldest'
    from public.disputes where state in ('open', 'assigned');

  return query
  select 'overdue_bouts', count(*), 'past their window and not yet swept'
    from public.bouts
   where state in ('open', 'awaiting_opponent') and closes_at < now();

  return query
  select 'matches_awaiting_rating', count(*), 'settled, dispute window closed, not finalized'
    from public.matches
   where state = 'settled' and dispute_closes_at < now();

  return query
  select 'undelivered_notifications', count(*), 'neither pushed nor emailed'
    from public.notifications
   where sent_at is null and emailed_at is null and error is null;
end;
$$;
