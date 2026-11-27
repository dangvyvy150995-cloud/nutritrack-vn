-- NutriTrack VN – migration 0003: PT (coach) mode.
-- A user turns PT mode on for themselves and gets an invite code. A client who
-- enters that code is linked to the PT; the PT can then READ (never write) the
-- client's profile, goals, diary, body measurements and water log. Either side
-- can end the link at any time, and access stops immediately.
-- Safe to run more than once. Run AFTER 0001_schema.sql and 0002_alerts_water.sql.
-- NOTE: 0001_schema.sql drops every policy in `public` when re-run, so if you
-- ever re-run 0001, run 0002 and 0003 again afterwards.

-- ---------- tables ----------
create table if not exists public.coaches (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  invite_code text not null unique check (invite_code ~ '^[A-Z2-9]{6}$'),
  created_at timestamptz not null default now()
);

-- One PT per client at a time (unique client_id).
create table if not exists public.coach_clients (
  coach_id uuid not null references public.coaches(user_id) on delete cascade,
  client_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coach_id, client_id),
  constraint coach_not_self check (coach_id <> client_id)
);
create index if not exists coach_clients_coach_idx on public.coach_clients(coach_id);

alter table public.coaches enable row level security;
alter table public.coach_clients enable row level security;

-- Every change goes through the security-definer functions below, never direct writes.
revoke all on public.coaches, public.coach_clients from anon, authenticated;
grant select on public.coaches, public.coach_clients to authenticated;

drop policy if exists coaches_select_self on public.coaches;
create policy coaches_select_self on public.coaches for select to authenticated using (user_id = auth.uid());

drop policy if exists coach_clients_select on public.coach_clients;
create policy coach_clients_select on public.coach_clients for select to authenticated
  using (coach_id = auth.uid() or client_id = auth.uid());

-- ---------- helper used by the read-only policies ----------
create or replace function public.is_coach_of(client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.coach_clients where coach_id = auth.uid() and client_id = client);
$$;
revoke all on function public.is_coach_of(uuid) from public, anon;
grant execute on function public.is_coach_of(uuid) to authenticated;

-- ---------- read-only access for the linked PT ----------
-- These are SELECT policies only. Existing "own row" policies still control all
-- writes, so a PT can never insert, change or delete a client's data.
drop policy if exists profiles_coach_read on public.user_profiles;
create policy profiles_coach_read on public.user_profiles for select to authenticated using (public.is_coach_of(id));
drop policy if exists settings_coach_read on public.user_settings;
create policy settings_coach_read on public.user_settings for select to authenticated using (public.is_coach_of(user_id));
drop policy if exists goals_coach_read on public.fitness_goals;
create policy goals_coach_read on public.fitness_goals for select to authenticated using (public.is_coach_of(user_id));
drop policy if exists diary_coach_read on public.food_diary_entries;
create policy diary_coach_read on public.food_diary_entries for select to authenticated using (public.is_coach_of(user_id));
drop policy if exists body_coach_read on public.body_measurements;
create policy body_coach_read on public.body_measurements for select to authenticated using (public.is_coach_of(user_id));
drop policy if exists water_coach_read on public.water_logs;
create policy water_coach_read on public.water_logs for select to authenticated using (public.is_coach_of(user_id));

-- ---------- functions (the only way to change coaching data) ----------
create or replace function public.gen_invite_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.coaches where invite_code = code);
  end loop;
  return code;
end $$;
revoke all on function public.gen_invite_code() from public, anon, authenticated;

-- Turn PT mode on (or rename). Returns the PT row.
create or replace function public.become_coach(p_display_name text) returns public.coaches
language plpgsql security definer set search_path = public as $$
declare r public.coaches;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  insert into public.coaches(user_id, display_name, invite_code)
  values (auth.uid(), btrim(p_display_name), public.gen_invite_code())
  on conflict (user_id) do update set display_name = excluded.display_name
  returning * into r;
  return r;
end $$;

-- New invite code; the old one stops working. Existing clients stay linked.
create or replace function public.regenerate_invite_code() returns public.coaches
language plpgsql security definer set search_path = public as $$
declare r public.coaches;
begin
  update public.coaches set invite_code = public.gen_invite_code() where user_id = auth.uid() returning * into r;
  if r.user_id is null then raise exception 'not_a_coach'; end if;
  return r;
end $$;

-- Turn PT mode off: every client link is removed (cascade).
create or replace function public.stop_coaching() returns void
language sql security definer set search_path = public as $$
  delete from public.coaches where user_id = auth.uid();
$$;

-- What a client sees before accepting an invite: only the PT's display name.
create or replace function public.lookup_coach(p_code text) returns table(display_name text)
language sql stable security definer set search_path = public as $$
  select c.display_name from public.coaches c
  where c.invite_code = upper(btrim(p_code)) and c.user_id <> auth.uid();
$$;

create or replace function public.join_coach(p_code text) returns void
language plpgsql security definer set search_path = public as $$
declare v_coach uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select user_id into v_coach from public.coaches where invite_code = upper(btrim(p_code));
  if v_coach is null then raise exception 'invalid_code'; end if;
  if v_coach = auth.uid() then raise exception 'own_code'; end if;
  if exists (select 1 from public.coach_clients where client_id = auth.uid() and coach_id = v_coach) then return; end if;
  if exists (select 1 from public.coach_clients where client_id = auth.uid()) then raise exception 'already_linked'; end if;
  insert into public.coach_clients(coach_id, client_id) values (v_coach, auth.uid());
end $$;

-- The client's own view of their PT.
create or replace function public.my_coach() returns table(coach_id uuid, display_name text, linked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.coach_id, c.display_name, l.created_at from public.coach_clients l
  join public.coaches c on c.user_id = l.coach_id where l.client_id = auth.uid();
$$;

-- Client ends the link.
create or replace function public.leave_coach() returns void
language sql security definer set search_path = public as $$
  delete from public.coach_clients where client_id = auth.uid();
$$;

-- PT removes a client.
create or replace function public.remove_client(p_client uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.coach_clients where coach_id = auth.uid() and client_id = p_client;
$$;

do $$
declare f text;
begin
  foreach f in array array['become_coach(text)','regenerate_invite_code()','stop_coaching()','lookup_coach(text)','join_coach(text)','my_coach()','leave_coach()','remove_client(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
