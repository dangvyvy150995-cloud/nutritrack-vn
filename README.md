# NutriTrack VN

Vietnamese nutrition and body composition tracker (Vietnamese by default, English optional).
React + TypeScript + Tailwind CSS + Recharts + Lucide on the frontend; Supabase (PostgreSQL, Auth, Row Level Security) on the backend; deploys to Vercel.

> **Data honesty:** all 503 foods in the initial database are marked **ESTIMATED**. None has been checked line by line yet against the Vietnamese Food Composition Table (NIN) or a specific USDA FoodData Central record. Each record states its estimation basis in `data_source`. An admin should verify a record against an identifiable source before setting it to **VERIFIED**. The database enforces this: a record cannot be VERIFIED without a `data_source`, and regular users can never self-verify.

---

## 1. Features

| Area | What works |
|---|---|
| Auth | Email registration, email/password login, password recovery (Supabase email), logout, change password. Each user's data is fully isolated by RLS. |
| Profile | Name, gender, date of birth, height, weight, activity level, experience, goal, target weight / body fat % / SMM. Weight and height changes are kept in `profile_history`, and each one adds a dated weight record. |
| Food database | 503 Vietnamese-focused foods in 15 categories (A–O). Raw, cooked, boiled, steamed, grilled, fried and other preparations are separate records. Each has an edible-portion factor and configurable servings (bowl, plate, egg, tbsp…). |
| Search | Instant client-side search. Works without diacritics (`tom hap` → *Tôm hấp*), in English, and by alternative names (`dứa`/`thơm`, `ngô`/`bắp`). Filter by category and preparation. Favorites and custom foods. |
| Food diary | Breakfast, lunch, dinner and snacks. Enter grams or serving × quantity, with an optional "weight includes bones/peel" edible-portion conversion. Edit and delete entries, copy from yesterday or any date, and save or re-log meals. Shows daily totals and remaining targets. Each entry stores a per-100 g snapshot, so later edits to a food never rewrite history. |
| Recipes | Ingredients with grams, final cooked weight (yield) and servings. Shows totals, per serving and per 100 g. Edit, duplicate, and add to the diary by servings or grams. Each ingredient is counted once. |
| Body / InBody | Weight, height, auto BMI (a generated DB column, so it can't be typed in), SMM, body fat mass and %, waist, hip, visceral fat, TBW, device BMR, and segmental lean/fat. Validation catches fat mass vs % mismatches. Edit and delete records, and compare any two records. **SMM and body fat are never estimated from BMI.** |
| Dashboard | 8 summary cards, consumed-vs-target progress bars, per-meal totals, quick-add food and measurement, and a date selector (defaults to today in Asia/Ho_Chi_Minh). |
| Charts | Weight, BMI (with WHO or Asian bands and the standard labelled), SMM, body fat (% or kg), daily calories vs target (surplus/deficit in the tooltip), macros, waist/hip, and waist-to-hip ratio. Ranges: 7d / 30d / 3m / 6m / 1y / all. All charts use real records, and empty states link to data entry. |
| Goals | Mifflin-St Jeor BMR, TDEE, and goal-based recommendations with capped deficits and a safe minimum (1200 kcal F / 1500 kcal M, never below BMR). Macros always add up (P×4 + C×4 + F×9 = kcal), with a one-click rebalance. Manual override, step goal, and a medical disclaimer. |
| Reports | This week, this month or a custom range. Shows daily averages, days logged, goal completion % (calories within ±10 % and protein ≥ 90 %), and body changes. CSV export for the diary, daily summary and measurements. |
| Admin | Protected by `app_admins` and RLS. Verification overview; add, edit and delete global foods; "mark verified" only with a source; review user-submitted foods and promote them; manage categories; CSV/JSON import with validation preview; CSV/JSON export. |
| Alerts & reminders | Dashboard card with in-app alerts. **Nutrition:** calories >110 % of target, fat >115 %, carbs >120 %, and once the day is over (after 21:00 or a past day) calories <70 %, protein <80 % and fiber <70 %. **Body:** BMI outside the healthy band of the chosen standard (WHO or Asian), weight change faster than 1 % of body weight per week (compared over 7–35 days), visceral fat ≥10 or rising, body fat % up ≥1 point, SMM down ≥0.5 kg vs the previous measurement. **Reminders:** breakfast/lunch/dinner not logged by a set time, water behind schedule, InBody check-in due (default 30 days). Each group can be switched off and thresholds/times are set in Settings. Logic: `src/lib/calc/alerts.ts`. Sugar and sodium aren't in the food data, so there are no alerts for them. |
| Water | Water card on the dashboard (+150/+250/+500 ml or any amount, undo), daily goal in Settings. Stored in `water_logs` (migration 0002). |
| Installable app (PWA) | Web app manifest, icons (incl. maskable + Apple touch icon), full-screen standalone mode, app shortcuts, a service worker that caches the app shell so it opens offline (Supabase data is never cached), an install button (Chrome/Edge/Android) or iOS instructions, and an "update available" banner. |
| Device notifications | Optional: due reminders are shown as system notifications through the service worker (each at most once a day; water at most once per interval). They're sent while the app is open or recently in the background. There's no push server, so a fully closed app gets its reminders the next time it opens. |
| Demo mode | When Supabase env vars are missing, the app runs entirely in browser `localStorage`. A permanent banner says data is **not** saved on a server. The sample account `demo@nutritrack.vn` / `demo1234` has labelled sample data and demo admin rights. |

### Project layout
```
src/lib/calc/        pure calculation modules (nutrition, body/BMI, energy, dates, search, reports, csv) – no UI
src/lib/data/        Backend interface + SupabaseBackend + DemoBackend + food import/export validation
src/data/foods.seed.ts   the food dataset (single source of truth)
src/pages/, src/components/   UI
supabase/migrations/0001_schema.sql   tables, indexes, triggers, RLS
supabase/seed.sql    generated from foods.seed.ts (npm run seed:generate)
data/foods.csv, data/foods.json      same dataset for import/export
supabase/tests/      local RLS test suite (plain PostgreSQL)
tests/               unit tests (vitest) + e2e workflow script (Playwright)
```

---

## 2. Database setup

1. Create a project at <https://supabase.com> (pick a region near Vietnam, e.g. Singapore).
2. Open **SQL Editor** and run the whole of `supabase/migrations/0001_schema.sql`. It enables `pgcrypto`, `unaccent` and `pg_trgm`, then creates the 12 required tables plus `app_admins` and `profile_history`, along with the triggers and all RLS policies. You can safely run it again.
3. Run `supabase/migrations/0002_alerts_water.sql` too (adds `user_settings.alert_prefs` and the `water_logs` table with RLS). Safe to run again. Without it, the app still works, but water tracking and saving alert settings show a "run migration 0002" message.
4. In the same editor, run `supabase/seed.sql` to load the 15 categories, 503 foods and 519 serving sizes. This is also safe to run again.
5. Make yourself an administrator after you've signed up in the app:
   ```sql
   insert into public.app_admins (user_id)
   select id from auth.users where email = 'you@example.com';
   ```
   Admin rights can only be granted this way. No API policy lets a user grant them to themselves.

With the Supabase CLI instead: `supabase link --project-ref <ref>`, `supabase db push`, then run `seed.sql`.

**Verify RLS locally (optional):** `supabase/tests/run_local.sh` runs the migration twice, the seed twice, and 25 isolation and permission checks against a throwaway local PostgreSQL. It uses a small shim for `auth.uid()` and roles that must **never** be run on Supabase.

## 3. Supabase configuration

- **Authentication → Providers → Email:** enable it. Keep "Confirm email" on for a public app; the app shows a "check your email" screen after sign-up.
- **Authentication → URL Configuration:**
  - Site URL: your production URL, e.g. `https://nutritrack-vn.vercel.app`
  - Redirect URLs: add `https://<your-domain>/reset-password`, `https://<your-domain>/**` and `http://localhost:5173/**` for local development.
- **SMTP (recommended for production):** Supabase's built-in email sender is heavily rate-limited. Under Authentication → SMTP, set up a provider (Resend, SES, Mailgun…). You can translate the email templates into Vietnamese there.
- **API keys:** copy **Project URL** and the **anon public** key from Project Settings → API. **Never** put the `service_role` key in the frontend, `.env`, or Vercel env vars for this app; it isn't needed anywhere.

Local development:
```bash
cp .env.example .env.local      # fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev                     # http://localhost:5173
```
Without `.env.local` the app starts in demo mode.

## 4. Deploying to Vercel

1. Push this folder to a GitHub repository.
2. In Vercel: **Add New → Project**, import the repo, and pick the **Vite** framework preset (build `npm run build`, output `dist`).
3. **Environment Variables** (Production and Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
4. Deploy. `vercel.json` already rewrites all routes to `index.html` (needed for `/reset-password` and deep links) and adds basic security headers.
5. Put the final Vercel domain into Supabase's Site URL and Redirect URLs (step 3 above).

## 5. Testing

```bash
npm test                          # 65 unit tests: nutrient math, totals, serving conversions, recipes/yield,
                                  # BMI + WHO/Asian classes, Mifflin-St Jeor, macro consistency, search, dates, reports, CSV,
                                  # health alerts & reminders (tests/alerts.test.ts)
npm run typecheck
npm run build && npx vite preview --port 4173 &
node tests/e2e/workflows.mjs      # 42 browser checks (demo mode): registration, login/logout, profile, 4 meals,
                                  # exact kcal/macro totals, edit/delete, copy day, recipes, BMI, history, InBody compare,
                                  # chart range filtering, CSV export, user isolation, admin permissions, mobile layout
node tests/e2e/alerts-pwa.mjs     # 22 checks: manifest/icons, service worker, offline shell, alerts card, water,
                                  # settings toggles, test + reminder notifications, mobile layout
supabase/tests/run_local.sh       # RLS tests on local PostgreSQL (incl. water_logs)
node scripts/generate-icons.mjs   # re-render the PWA icons in public/
```

## 6. Still needs external configuration

- **A Supabase project.** URL and anon key go in Vercel env vars. Until then the app honestly runs in demo mode.
- **Running the migration and seed SQL** in that project, and **adding the first admin** row.
- **Supabase Auth URLs and email.** Site URL, redirect URLs, and ideally a custom SMTP provider. Password recovery emails do not work in demo mode.
- **Vercel project and domain.**
- **Food data verification.** Every seed record is ESTIMATED. Verifying them against the NIN Vietnamese Food Composition Table, USDA FoodData Central or product labels is manual work for an admin. Use Admin › Food database, or edit `data/foods.csv` and re-import.
- **Not included:** importing InBody files directly (values are entered by hand), automatic step tracking (the step goal is stored, but there's no device sync), and push or email reminders.
