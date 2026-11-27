-- NutriTrack VN – migration 0002: health alerts & water tracking.
-- Safe to run more than once. Run AFTER 0001_schema.sql.

-- 1) Per-user alert / reminder preferences (thresholds, reminder times, notification switch).
alter table public.user_settings
  add column if not exists alert_prefs jsonb not null default '{}'::jsonb;

-- 2) Water intake log (one row per glass/bottle the user taps).
create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  amount_ml integer not null check (amount_ml between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists water_logs_user_date_idx on public.water_logs(user_id, entry_date);

alter table public.water_logs enable row level security;
drop policy if exists water_own on public.water_logs;
create policy water_own on public.water_logs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.water_logs to authenticated;
revoke all on public.water_logs from anon;
