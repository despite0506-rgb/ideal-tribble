create table if not exists public.timetable_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.timetable_state enable row level security;
alter table public.timetable_state replica identity full;

revoke all on public.timetable_state from anon;
grant select, insert, update on public.timetable_state to authenticated;

drop policy if exists "read own timetable" on public.timetable_state;
create policy "read own timetable"
on public.timetable_state
for select
to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "create own timetable" on public.timetable_state;
create policy "create own timetable"
on public.timetable_state
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "update own timetable" on public.timetable_state;
create policy "update own timetable"
on public.timetable_state
for update
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

do $$
begin
  alter publication supabase_realtime
  add table public.timetable_state;
exception
  when duplicate_object then null;
end $$;
