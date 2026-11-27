-- RLS checks for migration 0002 (water_logs, user_settings.alert_prefs). Runs after rls_test.sql.
create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'FAIL: %', msg; end if;
  raise notice 'PASS: %', msg;
end $$;

set role authenticated;
-- Alice
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into public.water_logs(user_id, entry_date, amount_ml) values ('11111111-1111-1111-1111-111111111111', '2026-11-27', 250);
update public.user_settings set alert_prefs = '{"water_goal_ml": 2500}' where user_id = '11111111-1111-1111-1111-111111111111';
select pg_temp.check((select count(*) from public.water_logs) = 1, 'Alice can log water');
select pg_temp.check((select alert_prefs->>'water_goal_ml' from public.user_settings) = '2500', 'Alice can save alert prefs');
do $$ begin
  begin
    insert into public.water_logs(user_id, entry_date, amount_ml) values ('11111111-1111-1111-1111-111111111111', '2026-11-27', 0);
    raise exception 'FAIL: zero ml accepted';
  exception when check_violation then raise notice 'PASS: water amount must be positive';
  end;
end $$;

-- Bob
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select pg_temp.check((select count(*) from public.water_logs) = 0, 'Bob cannot see Alice''s water log');
select pg_temp.check((select count(*) from public.user_settings) = 1, 'Bob sees only his own settings row');
delete from public.water_logs;
update public.water_logs set amount_ml = 1;
do $$ begin
  begin
    insert into public.water_logs(user_id, entry_date, amount_ml) values ('11111111-1111-1111-1111-111111111111', '2026-11-27', 250);
    raise exception 'FAIL: Bob wrote into Alice''s water log';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: Bob cannot insert water rows for Alice (%)', sqlerrm;
  end;
end $$;

-- anon
reset role;
set role anon;
do $$ begin
  begin
    perform count(*) from public.water_logs;
    raise exception 'FAIL: anon can read water_logs';
  exception when insufficient_privilege then raise notice 'PASS: anon has no access to water_logs';
  end;
end $$;

-- back to Alice
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select pg_temp.check((select sum(amount_ml) from public.water_logs) = 250, 'Alice''s water log survived Bob''s delete/update attempts');
reset role;
\echo 'ALL WATER RLS TESTS PASSED'
