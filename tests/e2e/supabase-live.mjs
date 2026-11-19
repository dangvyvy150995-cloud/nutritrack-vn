// Live checks against a real Supabase project (after migration + seed are applied).
// Usage: SUPABASE_URL=... SUPABASE_KEY=<publishable/anon key> EMAIL_A=... EMAIL_B=... PASSWORD=... node tests/e2e/supabase-live.mjs
// Accounts must be able to sign in (either "Confirm email" off, or already confirmed).
import { createClient } from '@supabase/supabase-js';
const { SUPABASE_URL: url, SUPABASE_KEY: key, EMAIL_A, EMAIL_B, PASSWORD } = process.env;
const results = [];
const ok = (n, c, d = '') => { results.push(!!c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };
const client = () => createClient(url, key, { auth: { persistSession: false } });

const anon = client();
const { data: anonFoods, error: anonErr } = await anon.from('food_items').select('food_id').limit(1);
ok('anonymous visitors cannot read the food database', (anonFoods ?? []).length === 0, anonErr?.message ?? '');

async function session(email) {
  const c = client();
  let r = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (r.error) {
    const s = await c.auth.signUp({ email, password: PASSWORD, options: { data: { full_name: email.split('@')[0] } } });
    if (s.error) throw new Error(`sign-up ${email}: ${s.error.message}`);
    if (!s.data.session) throw new Error(`sign-up ${email}: confirmation email required – confirm it, then re-run`);
    r = { data: s.data };
    ok(`sign-up works (${email})`, true);
  }
  ok(`login works (${email})`, !!r.data.session);
  return { c, id: r.data.session.user.id };
}
const A = await session(EMAIL_A);
const B = await session(EMAIL_B);

const prof = await A.c.from('user_profiles').select('*').eq('id', A.id).single();
ok('profile row auto-created on sign-up', !!prof.data, prof.error?.message);
const upd = await A.c.from('user_profiles').update({ height_cm: 170, current_weight_kg: 70 }).eq('id', A.id).select().single();
ok('profile editing', upd.data?.height_cm == 170, upd.error?.message);

const foods = await A.c.from('food_items').select('food_id', { count: 'exact', head: true }).is('owner_id', null);
ok('signed-in user reads global food database', (foods.count ?? 0) >= 500, `count=${foods.count}`);

const today = new Date().toISOString().slice(0, 10);
const ins = await A.c.from('food_diary_entries').insert({ user_id: A.id, entry_date: today, meal_type: 'lunch', food_id: 'com-trang', name_snapshot: 'Cơm trắng', grams: 150, kcal_100: 130, protein_100: 2.7, carbs_100: 28.2, fat_100: 0.3, fiber_100: 0.4 }).select().single();
ok('A can write diary entry', !!ins.data, ins.error?.message);
const bm = await A.c.from('body_measurements').insert({ user_id: A.id, measured_on: today, weight_kg: 70, height_cm: 170 }).select().single();
ok('BMI generated server-side (70/1.7² = 24.2)', bm.data && Number(bm.data.bmi) === 24.2, String(bm.data?.bmi ?? bm.error?.message));

const seeB = await B.c.from('food_diary_entries').select('id').eq('user_id', A.id);
ok("B cannot read A's diary", (seeB.data ?? []).length === 0);
const seeBm = await B.c.from('body_measurements').select('id').eq('user_id', A.id);
ok("B cannot read A's measurements", (seeBm.data ?? []).length === 0);
const spoof = await B.c.from('food_diary_entries').insert({ user_id: A.id, entry_date: today, meal_type: 'lunch', name_snapshot: 'x', grams: 1, kcal_100: 1, protein_100: 0, carbs_100: 0, fat_100: 0 });
ok("B cannot insert into A's diary", !!spoof.error, spoof.error?.message);
await B.c.from('food_diary_entries').delete().eq('id', ins.data?.id);
const still = await A.c.from('food_diary_entries').select('id').eq('id', ins.data?.id);
ok("B's delete attempt does not remove A's entry", (still.data ?? []).length === 1);
const glob = await B.c.from('food_items').update({ calories_kcal: 1 }).eq('food_id', 'com-trang').select();
ok('regular user cannot edit global foods', (glob.data ?? []).length === 0);
const selfAdmin = await B.c.from('app_admins').insert({ user_id: B.id });
ok('regular user cannot make themselves admin', !!selfAdmin.error, selfAdmin.error?.message);

// clean up A's test rows
await A.c.from('food_diary_entries').delete().eq('id', ins.data?.id);
if (bm.data) await A.c.from('body_measurements').delete().eq('id', bm.data.id);
console.log(`\n${results.filter(Boolean).length}/${results.length} live checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
