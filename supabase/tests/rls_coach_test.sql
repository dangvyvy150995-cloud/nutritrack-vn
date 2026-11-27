-- RLS checks for migration 0003 (PT / coach mode). Runs after rls_test.sql and rls_water_test.sql.
-- Bob = PT, Alice = client (has diary, body and water rows), user 3 = unrelated user.
create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', msg; end if;
  raise notice 'PASS: %', msg;
end $$;
create or replace function pg_temp.as_user(id text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', id, false);
$$;
create temp table codes(code text);
grant all on codes to authenticated;

set role authenticated;

-- Before any link, Bob sees nothing of Alice.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.check((select count(*) from public.food_diary_entries where user_id = '11111111-1111-1111-1111-111111111111') = 0, 'unlinked PT cannot read client diary');

-- Direct writes to coaching tables are refused.
do $$ begin
  begin
    insert into public.coaches(user_id, display_name, invite_code) values (auth.uid(), 'Bob', 'ABCDEF');
    raise exception 'FAIL: direct insert into coaches allowed';
  exception when insufficient_privilege then raise notice 'PASS: no direct insert into coaches';
  end;
end $$;

-- Bob turns PT mode on.
insert into codes select invite_code from public.become_coach('Coach Bob');
select pg_temp.check((select code from codes) ~ '^[A-Z2-9]{6}$', 'invite code is 6 unambiguous characters');
select pg_temp.check((select count(*) from public.coaches) = 1, 'PT sees own coach row');
do $$ begin
  begin
    perform public.join_coach((select code from codes));
    raise exception 'FAIL: PT joined own code';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: PT cannot join own code (%)', sqlerrm;
  end;
end $$;

-- Alice looks the code up and joins.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.check((select count(*) from public.coaches) = 0, 'client cannot list coaches table');
select pg_temp.check((select display_name from public.lookup_coach(lower((select code from codes)))) = 'Coach Bob', 'lookup by code (case-insensitive) returns only the name');
select pg_temp.check((select count(*) from public.lookup_coach('ZZZZZZ')) = 0, 'unknown code returns nothing');
do $$ begin
  begin
    perform public.join_coach('ZZZZZZ');
    raise exception 'FAIL: joined with invalid code';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: invalid code rejected (%)', sqlerrm;
  end;
end $$;
select public.join_coach((select code from codes));
select public.join_coach((select code from codes)); -- idempotent
select pg_temp.check((select display_name from public.my_coach()) = 'Coach Bob', 'client sees their PT');
select pg_temp.check((select count(*) from public.user_profiles) = 1, 'client still sees only own profile (not the PT''s)');

-- Bob reads Alice's data, read-only.
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.check((select count(*) from public.coach_clients) = 1, 'PT sees the link');
select pg_temp.check((select count(*) from public.user_profiles where id = '11111111-1111-1111-1111-111111111111') = 1, 'PT reads client profile');
select pg_temp.check((select count(*) from public.food_diary_entries where user_id = '11111111-1111-1111-1111-111111111111') >= 1, 'PT reads client diary');
select pg_temp.check((select count(*) from public.body_measurements where user_id = '11111111-1111-1111-1111-111111111111') = 2, 'PT reads client body measurements');
select pg_temp.check((select count(*) from public.water_logs where user_id = '11111111-1111-1111-1111-111111111111') = 1, 'PT reads client water log');
select pg_temp.check((select count(*) from public.user_settings where user_id = '11111111-1111-1111-1111-111111111111') = 1, 'PT reads client settings');
select pg_temp.check((select count(*) from public.recipes where user_id = '11111111-1111-1111-1111-111111111111') = 0, 'PT cannot read client recipes');
select pg_temp.check((select count(*) from public.profile_history where user_id = '11111111-1111-1111-1111-111111111111') = 0, 'PT cannot read client profile history');

update public.food_diary_entries set grams = 1 where user_id = '11111111-1111-1111-1111-111111111111';
delete from public.food_diary_entries where user_id = '11111111-1111-1111-1111-111111111111';
update public.body_measurements set weight_kg = 99 where user_id = '11111111-1111-1111-1111-111111111111';
delete from public.body_measurements where user_id = '11111111-1111-1111-1111-111111111111';
update public.user_profiles set full_name = 'hacked' where id = '11111111-1111-1111-1111-111111111111';
update public.fitness_goals set calories_kcal = 999 where user_id = '11111111-1111-1111-1111-111111111111';
delete from public.water_logs where user_id = '11111111-1111-1111-1111-111111111111';
do $$ begin
  begin
    insert into public.food_diary_entries(user_id, entry_date, meal_type, name_snapshot, grams, kcal_100, protein_100, carbs_100, fat_100)
      values ('11111111-1111-1111-1111-111111111111', '2026-11-20', 'lunch', 'x', 100, 1, 1, 1, 1);
    raise exception 'FAIL: PT inserted into client diary';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: PT cannot insert client diary rows (%)', sqlerrm;
  end;
end $$;
do $$ begin
  begin
    insert into public.coach_clients(coach_id, client_id) values (auth.uid(), '33333333-3333-3333-3333-333333333333');
    raise exception 'FAIL: PT linked a client without their code';
  exception when insufficient_privilege then raise notice 'PASS: PT cannot add clients directly';
  end;
end $$;

-- Unrelated user sees none of it.
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select pg_temp.check((select count(*) from public.food_diary_entries where user_id = '11111111-1111-1111-1111-111111111111') = 0, 'other users still cannot read client diary');
select pg_temp.check((select count(*) from public.coach_clients) = 0, 'other users cannot see links');

-- Alice: data untouched by the PT's write attempts.
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.check((select count(*) from public.body_measurements where weight_kg = 99) = 0 and (select count(*) from public.body_measurements) = 2, 'client measurements unchanged after PT write attempts');
select pg_temp.check((select count(*) from public.food_diary_entries where grams = 1) = 0 and (select count(*) from public.food_diary_entries) >= 1, 'client diary unchanged after PT write attempts');
select pg_temp.check((select full_name from public.user_profiles) <> 'hacked', 'client profile unchanged');
select pg_temp.check((select count(*) from public.water_logs) = 1, 'client water log unchanged');

-- Second PT cannot take over while linked.
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
insert into codes select invite_code from public.become_coach('Coach Three');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
do $$ begin
  begin
    perform public.join_coach((select code from codes where code not in (select code from codes limit 1)));
    raise exception 'FAIL: joined a second PT';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: one PT at a time (%)', sqlerrm;
  end;
end $$;

-- Alice leaves: access ends immediately.
select public.leave_coach();
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.check((select count(*) from public.food_diary_entries where user_id = '11111111-1111-1111-1111-111111111111') = 0, 'after client unlinks, PT loses access');
select pg_temp.check((select count(*) from public.user_profiles where id = '11111111-1111-1111-1111-111111111111') = 0, 'after unlink, PT cannot read profile');

-- Old code stops working after regeneration; PT removal works; stop_coaching cascades.
create temp table old_code as select invite_code as code from public.coaches;
select public.regenerate_invite_code();
select pg_temp.check((select invite_code from public.coaches) <> (select code from old_code), 'regenerate gives a new code');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
select pg_temp.check((select count(*) from public.lookup_coach((select code from old_code))) = 0, 'old code no longer works');
reset role;
insert into public.coach_clients(coach_id, client_id) values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');
set role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select public.remove_client('11111111-1111-1111-1111-111111111111');
select pg_temp.check((select count(*) from public.coach_clients) = 0, 'PT can remove a client');
reset role;
insert into public.coach_clients(coach_id, client_id) values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');
set role authenticated;
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select public.stop_coaching();
select pg_temp.check((select count(*) from public.coaches) = 0 and (select count(*) from public.coach_clients) = 0, 'turning PT mode off removes all links');

-- anon gets nothing.
reset role;
set role anon;
do $$ begin
  begin
    perform count(*) from public.coach_clients;
    raise exception 'FAIL: anon can read coach_clients';
  exception when insufficient_privilege then raise notice 'PASS: anon has no access to coach_clients';
  end;
end $$;
reset role;
\echo 'ALL COACH RLS TESTS PASSED'
