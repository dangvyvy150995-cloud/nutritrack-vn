-- RLS / data-isolation test suite. Run after the shim, migration and seed:
--   psql -v ON_ERROR_STOP=1 -f rls_test.sql
-- Each check raises an exception on failure.
\set QUIET on
insert into auth.users(id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com', '{"full_name":"Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com', '{"full_name":"Bob"}'),
  ('33333333-3333-3333-3333-333333333333', 'admin@example.com', '{"full_name":"Admin"}');
insert into public.app_admins(user_id) values ('33333333-3333-3333-3333-333333333333');

create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'FAIL: %', msg; end if;
  raise notice 'PASS: %', msg;
end $$;

select pg_temp.check((select count(*) from public.user_profiles) = 3, 'signup trigger created 3 profiles');
select pg_temp.check((select count(*) from public.user_settings where language = 'vi') = 3, 'signup trigger created settings with vi default');

-- ===== Alice =====
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select pg_temp.check((select count(*) from public.user_profiles) = 1, 'Alice sees only her own profile');
update public.user_profiles set height_cm = 165, current_weight_kg = 60 where id = auth.uid();
update public.user_profiles set current_weight_kg = 59 where id = auth.uid();
select pg_temp.check((select count(*) from public.profile_history where current_weight_kg is not null) = 2, 'profile weight changes preserved in history');
insert into public.body_measurements(user_id, measured_on, weight_kg, height_cm, smm_kg, body_fat_mass_kg, body_fat_pct)
  values (auth.uid(), '2026-11-01', 60, 165, 24.1, 16.2, 27.0), (auth.uid(), '2026-11-15', 59, 165, 24.3, 15.1, 25.6);
select pg_temp.check((select bmi from public.body_measurements where measured_on = '2026-11-01') = 22.0, 'BMI generated: 60 kg / 1.65 m^2 = 22.0');
insert into public.food_diary_entries(user_id, entry_date, meal_type, food_id, name_snapshot, grams, kcal_100, protein_100, carbs_100, fat_100, fiber_100)
  values (auth.uid(), '2026-11-19', 'breakfast', 'com-trang', 'Cơm trắng', 150, 130, 2.7, 28.2, 0.3, 0.4);
insert into public.food_items(food_name_vi, category, calories_kcal, protein_g, carbs_g, fat_g, owner_id, verification_status, data_source)
  values ('Món riêng của Alice', 'home_meals', 120, 10, 10, 4, auth.uid(), 'VERIFIED', 'me');
select pg_temp.check((select verification_status from public.food_items where food_name_vi = 'Món riêng của Alice') = 'USER-ENTERED', 'user cannot self-verify a custom food (forced USER-ENTERED)');
do $$ begin
  begin
    insert into public.food_items(food_name_vi, category, calories_kcal, protein_g, carbs_g, fat_g, owner_id)
      values ('Hack global', 'home_meals', 1, 1, 1, 1, null);
    raise exception 'FAIL: regular user created a global food';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: regular user cannot create global food (%)', sqlerrm;
  end;
end $$;
update public.food_items set calories_kcal = 1 where food_id = 'com-trang';
select pg_temp.check((select calories_kcal from public.food_items where food_id = 'com-trang') = 130, 'regular user cannot edit global food');
delete from public.food_items where food_id = 'com-trang';
select pg_temp.check((select count(*) from public.food_items where food_id = 'com-trang') = 1, 'regular user cannot delete global food');
do $$ begin
  begin
    insert into public.app_admins(user_id) values (auth.uid());
    raise exception 'FAIL: user made themselves admin';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: user cannot grant themselves admin (%)', sqlerrm;
  end;
end $$;
select pg_temp.check(not public.is_admin(), 'Alice is not admin');
select pg_temp.check((select count(*) from public.food_items where owner_id is null) >= 500, 'authenticated users can read global food database');

-- ===== Bob =====
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select pg_temp.check((select count(*) from public.food_diary_entries) = 0, 'Bob cannot see Alice''s diary');
select pg_temp.check((select count(*) from public.body_measurements) = 0, 'Bob cannot see Alice''s measurements');
select pg_temp.check((select count(*) from public.profile_history) = 0, 'Bob cannot see Alice''s profile history');
select pg_temp.check((select count(*) from public.food_items where food_name_vi = 'Món riêng của Alice') = 0, 'Bob cannot see Alice''s custom food');
update public.body_measurements set weight_kg = 200;
delete from public.food_diary_entries;
do $$ begin
  begin
    insert into public.food_diary_entries(user_id, entry_date, meal_type, name_snapshot, grams, kcal_100, protein_100, carbs_100, fat_100)
      values ('11111111-1111-1111-1111-111111111111', '2026-11-19', 'lunch', 'spoof', 100, 1, 1, 1, 1);
    raise exception 'FAIL: Bob wrote into Alice''s diary';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: Bob cannot insert rows for Alice (%)', sqlerrm;
  end;
end $$;

-- ===== anon =====
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  begin
    perform count(*) from public.food_items;
    raise exception 'FAIL: anon can read food_items';
  exception when insufficient_privilege then raise notice 'PASS: anon has no access to tables';
  end;
end $$;

-- ===== Admin =====
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
select pg_temp.check(public.is_admin(), 'admin recognised');
update public.food_items set verification_status = 'VERIFIED', data_source = 'Test source' where food_id = 'com-trang';
select pg_temp.check((select verification_status from public.food_items where food_id = 'com-trang') = 'VERIFIED', 'admin can verify a global food');
insert into public.food_items(food_id, food_name_vi, category, calories_kcal, protein_g, carbs_g, fat_g, owner_id) values ('admin-new', 'Món admin', 'home_meals', 100, 5, 10, 4, null);
select pg_temp.check((select count(*) from public.food_items where food_id = 'admin-new') = 1, 'admin can add global food');
delete from public.food_items where food_id = 'admin-new';
select pg_temp.check((select count(*) from public.food_diary_entries) = 0, 'admin cannot read users'' private diaries');

-- ===== back to Alice: her data intact =====
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select pg_temp.check((select count(*) from public.food_diary_entries) = 1, 'Alice''s diary survived Bob''s delete attempt');
select pg_temp.check((select max(weight_kg) from public.body_measurements) = 60, 'Alice''s measurements survived Bob''s update attempt');
select pg_temp.check((select count(*) from public.body_measurements) = 2, 'historical measurements preserved');
reset role;
\echo 'ALL RLS TESTS PASSED'
