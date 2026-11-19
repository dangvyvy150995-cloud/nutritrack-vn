-- =====================================================================
-- NutriTrack VN – database schema, Row Level Security and triggers
-- Target: Supabase (PostgreSQL 15+). Run once in the SQL editor or via
-- `supabase db push`. Safe to re-run: objects are created if missing.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- ---------- helpers ----------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Administrators are listed here. There is NO policy that lets a user
-- insert/update/delete rows, so only the service role / SQL editor can
-- grant admin rights.
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------- user profile ----------
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  gender text check (gender in ('male','female')),
  date_of_birth date check (date_of_birth > '1900-01-01'),
  height_cm numeric(5,1) check (height_cm between 100 and 250),
  current_weight_kg numeric(5,1) check (current_weight_kg between 20 and 350),
  activity_level text not null default 'light' check (activity_level in ('sedentary','light','moderate','very','extreme')),
  experience text check (experience in ('beginner','intermediate','advanced')),
  fitness_goal text not null default 'maintenance' check (fitness_goal in ('weight_loss','fat_loss','recomp','muscle_gain','maintenance')),
  target_weight_kg numeric(5,1) check (target_weight_kg between 20 and 350),
  target_body_fat_pct numeric(4,1) check (target_body_fat_pct between 2 and 75),
  target_smm_kg numeric(5,1) check (target_smm_kg between 5 and 150),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every change of height/weight on the profile is preserved here.
create table if not exists public.profile_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  changed_at timestamptz not null default now(),
  height_cm numeric(5,1),
  current_weight_kg numeric(5,1)
);
create index if not exists profile_history_user_idx on public.profile_history(user_id, changed_at desc);

create or replace function public.log_profile_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' and (new.height_cm is not null or new.current_weight_kg is not null))
     or (tg_op = 'UPDATE' and (new.height_cm is distinct from old.height_cm or new.current_weight_kg is distinct from old.current_weight_kg)) then
    insert into public.profile_history(user_id, height_cm, current_weight_kg) values (new.id, new.height_cm, new.current_weight_kg);
  end if;
  return new;
end $$;

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'vi' check (language in ('vi','en')),
  bmi_standard text not null default 'who' check (bmi_standard in ('who','asian')),
  timezone text not null default 'Asia/Ho_Chi_Minh',
  updated_at timestamptz not null default now()
);

create table if not exists public.fitness_goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  calories_kcal integer not null check (calories_kcal between 800 and 6000),
  protein_g integer not null check (protein_g between 0 and 500),
  carbs_g integer not null check (carbs_g between 0 and 1000),
  fat_g integer not null check (fat_g between 0 and 400),
  fiber_g integer not null check (fiber_g between 0 and 150),
  target_weight_kg numeric(5,1),
  target_body_fat_pct numeric(4,1),
  target_smm_kg numeric(5,1),
  step_goal integer check (step_goal between 0 and 100000),
  is_custom boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------- food database ----------
create table if not exists public.food_categories (
  id text primary key,
  code text not null,
  name_vi text not null,
  name_en text not null,
  sort_order integer not null default 0
);

create table if not exists public.food_items (
  food_id text primary key default gen_random_uuid()::text,
  food_name_vi text not null check (length(food_name_vi) between 1 and 200),
  food_name_en text not null default '',
  alternative_names text[] not null default '{}',
  search_keywords text[] not null default '{}',
  category text not null references public.food_categories(id),
  subcategory text,
  calories_kcal numeric(7,2) not null check (calories_kcal between 0 and 950),
  protein_g numeric(6,2) not null check (protein_g between 0 and 100),
  carbs_g numeric(6,2) not null check (carbs_g between 0 and 100),
  fat_g numeric(6,2) not null check (fat_g between 0 and 100),
  fiber_g numeric(6,2) not null default 0 check (fiber_g between 0 and 100),
  serving_size numeric(7,2) not null default 100 check (serving_size > 0),
  serving_unit text not null default 'g' check (serving_unit in ('g','ml')),
  preparation_method text not null default 'none',
  raw_or_cooked text not null default 'n/a' check (raw_or_cooked in ('raw','cooked','dry','prepared','n/a')),
  edible_portion numeric(4,3) not null default 1 check (edible_portion > 0 and edible_portion <= 1),
  data_source text not null default '',
  verification_status text not null default 'ESTIMATED' check (verification_status in ('VERIFIED','ESTIMATED','USER-ENTERED')),
  owner_id uuid references auth.users(id) on delete cascade, -- null = global record
  search_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint macro_mass check (protein_g + carbs_g + fat_g <= 100.5),
  constraint verified_needs_source check (verification_status <> 'VERIFIED' or length(data_source) > 0)
);
create index if not exists food_items_category_idx on public.food_items(category);
create index if not exists food_items_owner_idx on public.food_items(owner_id);
create index if not exists food_items_search_trgm on public.food_items using gin (search_text gin_trgm_ops);

create or replace function public.food_items_search_text() returns trigger
language plpgsql as $$
begin
  new.search_text := lower(public.unaccent(
    coalesce(new.food_name_vi,'') || ' ' || coalesce(new.food_name_en,'') || ' ' ||
    array_to_string(new.alternative_names, ' ') || ' ' || array_to_string(new.search_keywords, ' ')));
  new.search_text := replace(new.search_text, 'đ', 'd');
  return new;
end $$;

create table if not exists public.food_servings (
  id uuid primary key default gen_random_uuid(),
  food_id text not null references public.food_items(food_id) on delete cascade,
  label_vi text not null,
  label_en text not null default '',
  grams numeric(7,2) not null check (grams > 0 and grams <= 5000),
  is_default boolean not null default false,
  owner_id uuid references auth.users(id) on delete cascade -- null = global serving
);
create index if not exists food_servings_food_idx on public.food_servings(food_id);

create table if not exists public.user_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id text not null references public.food_items(food_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, food_id)
);

-- ---------- recipes ----------
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  description text,
  servings numeric(6,2) not null default 1 check (servings > 0),
  final_weight_g numeric(8,1) check (final_weight_g > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recipes_user_idx on public.recipes(user_id);

create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  food_id text references public.food_items(food_id) on delete set null,
  name_snapshot text not null,
  grams numeric(8,1) not null check (grams > 0),
  kcal_100 numeric(7,2) not null, protein_100 numeric(6,2) not null, carbs_100 numeric(6,2) not null,
  fat_100 numeric(6,2) not null, fiber_100 numeric(6,2) not null default 0,
  sort_order integer not null default 0
);
create index if not exists recipe_ingredients_recipe_idx on public.recipe_ingredients(recipe_id);

-- ---------- diary ----------
create table if not exists public.food_diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  food_id text references public.food_items(food_id) on delete set null,
  recipe_id uuid references public.recipes(id) on delete set null,
  name_snapshot text not null,
  grams numeric(8,1) not null check (grams > 0 and grams <= 10000),
  serving_label text,
  serving_qty numeric(7,2),
  -- nutrient values per 100 g captured when logged (history is never rewritten)
  kcal_100 numeric(7,2) not null, protein_100 numeric(6,2) not null, carbs_100 numeric(6,2) not null,
  fat_100 numeric(6,2) not null, fiber_100 numeric(6,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists diary_user_date_idx on public.food_diary_entries(user_id, entry_date);

-- Saved meals (templates the user can re-log quickly)
create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists meals_user_idx on public.meals(user_id);

-- ---------- body measurements ----------
create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5,1) not null check (weight_kg between 20 and 350),
  height_cm numeric(5,1) not null check (height_cm between 100 and 250),
  -- BMI is always derived from weight and height; it can never be typed in.
  bmi numeric(4,1) generated always as (round(weight_kg / ((height_cm / 100.0) * (height_cm / 100.0)), 1)) stored,
  smm_kg numeric(5,1) check (smm_kg > 0 and smm_kg < weight_kg),
  body_fat_mass_kg numeric(5,1) check (body_fat_mass_kg >= 0 and body_fat_mass_kg < weight_kg),
  body_fat_pct numeric(4,1) check (body_fat_pct between 2 and 75),
  waist_cm numeric(5,1) check (waist_cm between 30 and 250),
  hip_cm numeric(5,1) check (hip_cm between 40 and 250),
  visceral_fat_level numeric(4,1) check (visceral_fat_level between 0 and 60),
  total_body_water_l numeric(5,1) check (total_body_water_l between 5 and 150),
  device_bmr_kcal integer check (device_bmr_kcal between 500 and 5000),
  segmental_lean jsonb,
  segmental_fat jsonb,
  device text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists body_user_date_idx on public.body_measurements(user_id, measured_on);

-- ---------- triggers ----------
do $$
declare t text;
begin
  foreach t in array array['user_profiles','user_settings','fitness_goals','food_items','recipes','food_diary_entries','body_measurements'] loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

drop trigger if exists trg_food_search on public.food_items;
create trigger trg_food_search before insert or update on public.food_items
  for each row execute function public.food_items_search_text();

drop trigger if exists trg_profile_history on public.user_profiles;
create trigger trg_profile_history after insert or update on public.user_profiles
  for each row execute function public.log_profile_history();

-- Regular users cannot self-verify foods or turn a custom food into a global one.
create or replace function public.guard_food_items() returns trigger
language plpgsql as $$
begin
  if not public.is_admin() then
    if new.owner_id is distinct from auth.uid() then
      raise exception 'Only administrators can manage global food records';
    end if;
    new.verification_status := 'USER-ENTERED';
  end if;
  return new;
end $$;
drop trigger if exists trg_food_guard on public.food_items;
create trigger trg_food_guard before insert or update on public.food_items
  for each row when (auth.uid() is not null) execute function public.guard_food_items();

-- Create profile + settings rows when someone signs up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles(id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  insert into public.user_settings(user_id, language)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'language', ''), 'vi'))
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row Level Security ----------
alter table public.app_admins enable row level security;
alter table public.user_profiles enable row level security;
alter table public.profile_history enable row level security;
alter table public.user_settings enable row level security;
alter table public.fitness_goals enable row level security;
alter table public.food_categories enable row level security;
alter table public.food_items enable row level security;
alter table public.food_servings enable row level security;
alter table public.user_favorites enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.food_diary_entries enable row level security;
alter table public.meals enable row level security;
alter table public.body_measurements enable row level security;

-- Drop existing policies so this script can be re-run.
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- admins: a user may only see whether they themselves are an admin
create policy admins_select_self on public.app_admins for select to authenticated using (user_id = auth.uid());

-- profile & settings: own row only
create policy profiles_own on public.user_profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profile_history_read_own on public.profile_history for select to authenticated using (user_id = auth.uid());
create policy settings_own on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goals_own on public.fitness_goals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- categories: everyone signed in reads, admins write
create policy categories_read on public.food_categories for select to authenticated using (true);
create policy categories_admin_write on public.food_categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- food items: global records readable by all signed-in users; custom foods by their owner;
-- admins can manage global records (and review all records).
create policy foods_read on public.food_items for select to authenticated
  using (owner_id is null or owner_id = auth.uid() or public.is_admin());
create policy foods_insert on public.food_items for insert to authenticated
  with check (owner_id = auth.uid() or (public.is_admin() and owner_id is null));
create policy foods_update on public.food_items for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
create policy foods_delete on public.food_items for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());

create policy servings_read on public.food_servings for select to authenticated
  using (owner_id is null or owner_id = auth.uid() or public.is_admin());
create policy servings_write on public.food_servings for all to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (
    (owner_id = auth.uid() and exists (select 1 from public.food_items f where f.food_id = food_servings.food_id and (f.owner_id is null or f.owner_id = auth.uid())))
    or public.is_admin());

create policy favorites_own on public.user_favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy recipes_own on public.recipes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy recipe_ingredients_own on public.recipe_ingredients for all to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.user_id = auth.uid()));

create policy diary_own on public.food_diary_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy meals_own on public.meals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy body_own on public.body_measurements for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The anon role gets nothing: every policy above is scoped `to authenticated`.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.app_admins from authenticated;
revoke insert, update, delete on public.profile_history from authenticated;
