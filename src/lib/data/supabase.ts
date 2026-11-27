import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { BodyMeasurement, ClientBundle, CoachClientLink, CoachProfile, MyCoach, DiaryEntry, FitnessGoals, FoodCategory, FoodItem, FoodServing, Macros, NewBodyMeasurement, Recipe, SavedMeal, UserProfile, UserSettings, WaterLog } from '@/types';
import type { AuthUser, Backend, CustomFoodInput, NewDiaryEntry, RecipeInput } from './backend';
import { BackendError, COACH_ERRORS } from './backend';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const n = (v: unknown) => (v == null ? null : Number(v));
const per100From = (r: Row): Macros => ({ calories: Number(r.kcal_100), protein: Number(r.protein_100), carbs: Number(r.carbs_100), fat: Number(r.fat_100), fiber: Number(r.fiber_100 ?? 0) });
const per100To = (m: Macros) => ({ kcal_100: m.calories, protein_100: m.protein, carbs_100: m.carbs, fat_100: m.fat, fiber_100: m.fiber });

// PostgREST codes for "table/column not in schema cache" and Postgres "undefined table/column":
// these mean a newer migration (e.g. 0002_alerts_water.sql) hasn't been run in Supabase yet.
const MISSING_SCHEMA = new Set(['PGRST204', 'PGRST205', '42P01', '42703']);

// PostgREST "function not found" (PGRST202) also means migration 0003 isn't run yet.
MISSING_SCHEMA.add('PGRST202');
MISSING_SCHEMA.add('42883');

function check(res: { data: any; error: any }): any {
  if (res.error) {
    if (MISSING_SCHEMA.has(res.error.code)) throw new BackendError(res.error.message, 'migration_needed');
    const known = (COACH_ERRORS as readonly string[]).find((c) => res.error.message === c);
    if (known) throw new BackendError(known, known);
    throw new BackendError(res.error.message, res.error.code);
  }
  return res.data;
}

const FOOD_COLS = 'food_id,food_name_vi,food_name_en,alternative_names,search_keywords,category,subcategory,calories_kcal,protein_g,carbs_g,fat_g,fiber_g,serving_size,serving_unit,preparation_method,raw_or_cooked,edible_portion,data_source,verification_status,owner_id,created_at,updated_at,food_servings(id,food_id,label_vi,label_en,grams,is_default)';

function mapFood(r: Row): FoodItem {
  return {
    food_id: r.food_id, food_name_vi: r.food_name_vi, food_name_en: r.food_name_en ?? '',
    alternative_names: r.alternative_names ?? [], search_keywords: r.search_keywords ?? [],
    category: r.category, subcategory: r.subcategory,
    calories_kcal: Number(r.calories_kcal), protein_g: Number(r.protein_g), carbs_g: Number(r.carbs_g), fat_g: Number(r.fat_g), fiber_g: Number(r.fiber_g),
    serving_size: Number(r.serving_size), serving_unit: r.serving_unit, preparation_method: r.preparation_method, raw_or_cooked: r.raw_or_cooked,
    edible_portion: Number(r.edible_portion), data_source: r.data_source, verification_status: r.verification_status, owner_id: r.owner_id,
    created_at: r.created_at, updated_at: r.updated_at,
    servings: ((r.food_servings ?? []) as Row[]).map((s): FoodServing => ({ id: s.id, food_id: s.food_id, label_vi: s.label_vi, label_en: s.label_en, grams: Number(s.grams), is_default: s.is_default }))
      .sort((a, b) => Number(b.is_default) - Number(a.is_default)),
  };
}

function foodRow(f: Omit<FoodItem, 'servings' | 'created_at' | 'updated_at'>) {
  return {
    food_id: f.food_id, food_name_vi: f.food_name_vi, food_name_en: f.food_name_en, alternative_names: f.alternative_names, search_keywords: f.search_keywords,
    category: f.category, subcategory: f.subcategory, calories_kcal: f.calories_kcal, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g, fiber_g: f.fiber_g,
    serving_size: f.serving_size, serving_unit: f.serving_unit, preparation_method: f.preparation_method, raw_or_cooked: f.raw_or_cooked,
    edible_portion: f.edible_portion, data_source: f.data_source, verification_status: f.verification_status, owner_id: f.owner_id,
  };
}

function mapDiary(r: Row): DiaryEntry {
  return { id: r.id, user_id: r.user_id, entry_date: r.entry_date, meal_type: r.meal_type, food_id: r.food_id, recipe_id: r.recipe_id, name_snapshot: r.name_snapshot,
    grams: Number(r.grams), serving_label: r.serving_label, serving_qty: n(r.serving_qty), per100: per100From(r), created_at: r.created_at, updated_at: r.updated_at };
}

function mapBody(r: Row): BodyMeasurement {
  return { id: r.id, user_id: r.user_id, measured_on: r.measured_on, weight_kg: Number(r.weight_kg), height_cm: Number(r.height_cm), bmi: Number(r.bmi),
    smm_kg: n(r.smm_kg), body_fat_mass_kg: n(r.body_fat_mass_kg), body_fat_pct: n(r.body_fat_pct), waist_cm: n(r.waist_cm), hip_cm: n(r.hip_cm),
    visceral_fat_level: n(r.visceral_fat_level), total_body_water_l: n(r.total_body_water_l), device_bmr_kcal: n(r.device_bmr_kcal),
    segmental_lean: r.segmental_lean, segmental_fat: r.segmental_fat, device: r.device, notes: r.notes, created_at: r.created_at, updated_at: r.updated_at };
}

function mapRecipe(r: Row): Recipe {
  return { id: r.id, user_id: r.user_id, name: r.name, description: r.description, servings: Number(r.servings), final_weight_g: n(r.final_weight_g),
    created_at: r.created_at, updated_at: r.updated_at,
    ingredients: ((r.recipe_ingredients ?? []) as Row[]).sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({ id: i.id, recipe_id: i.recipe_id, food_id: i.food_id, name_snapshot: i.name_snapshot, grams: Number(i.grams), per100: per100From(i) })) };
}

const numOrNull = (p: Row, keys: string[]) => { for (const k of keys) if (k in p) p[k] = p[k] === '' ? null : p[k]; return p; };

export class SupabaseBackend implements Backend {
  readonly mode = 'supabase' as const;
  private sb: SupabaseClient;
  private userId: string | null = null;

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }

  private async uid(): Promise<string> {
    if (this.userId) return this.userId;
    const { data } = await this.sb.auth.getUser();
    if (!data.user) throw new BackendError('Not signed in', 'auth');
    this.userId = data.user.id;
    return data.user.id;
  }

  async getUser(): Promise<AuthUser | null> {
    const { data } = await this.sb.auth.getSession();
    const u = data.session?.user;
    this.userId = u?.id ?? null;
    return u ? { id: u.id, email: u.email ?? '' } : null;
  }
  onAuthChange(cb: (u: AuthUser | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((event, session) => {
      this.userId = session?.user?.id ?? null;
      cb(session?.user ? { id: session.user.id, email: session.user.email ?? '' } : null);
      if (event === 'PASSWORD_RECOVERY') { window.history.replaceState(null, '', '/reset-password'); window.dispatchEvent(new PopStateEvent('popstate')); }
    });
    return () => data.subscription.unsubscribe();
  }
  async signUp(email: string, password: string, fullName: string, language: string) {
    const res = await this.sb.auth.signUp({ email, password, options: { data: { full_name: fullName, language }, emailRedirectTo: window.location.origin } });
    if (res.error) throw new BackendError(res.error.message, res.error.code);
    return { needsConfirmation: !res.data.session };
  }
  async signIn(email: string, password: string) {
    const res = await this.sb.auth.signInWithPassword({ email, password });
    if (res.error) throw new BackendError(res.error.message, res.error.code);
  }
  async signOut() { await this.sb.auth.signOut(); this.userId = null; }
  async requestPasswordReset(email: string) {
    const res = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    if (res.error) throw new BackendError(res.error.message, res.error.code);
  }
  async updatePassword(pw: string) {
    const res = await this.sb.auth.updateUser({ password: pw });
    if (res.error) throw new BackendError(res.error.message, res.error.code);
  }
  async isAdmin() {
    const res = await this.sb.rpc('is_admin');
    return !res.error && res.data === true;
  }

  async getProfile(): Promise<UserProfile> {
    const id = await this.uid();
    const row = check(await this.sb.from('user_profiles').select('*').eq('id', id).maybeSingle());
    if (row) return this.mapProfile(row);
    // Profile row is created by a trigger on sign-up; create it if missing (e.g. users created before the migration).
    const { data } = await this.sb.auth.getUser();
    const created = check(await this.sb.from('user_profiles').insert({ id, email: data.user?.email ?? '' }).select('*').single());
    return this.mapProfile(created);
  }
  private mapProfile(r: Row): UserProfile {
    return { ...r, height_cm: n(r.height_cm), current_weight_kg: n(r.current_weight_kg), target_weight_kg: n(r.target_weight_kg), target_body_fat_pct: n(r.target_body_fat_pct), target_smm_kg: n(r.target_smm_kg) } as UserProfile;
  }
  async saveProfile(p: Partial<UserProfile>) {
    const id = await this.uid();
    const { id: _i, email: _e, created_at: _c, updated_at: _u, ...rest } = p;
    const row = check(await this.sb.from('user_profiles').update(numOrNull(rest, ['date_of_birth'])).eq('id', id).select('*').single());
    return this.mapProfile(row);
  }
  async getSettings(): Promise<UserSettings> {
    const id = await this.uid();
    const row = check(await this.sb.from('user_settings').select('*').eq('user_id', id).maybeSingle());
    if (row) return row as UserSettings;
    return check(await this.sb.from('user_settings').insert({ user_id: id }).select('*').single()) as UserSettings;
  }
  async saveSettings(s: Partial<UserSettings>) {
    const id = await this.uid();
    return check(await this.sb.from('user_settings').upsert({ ...s, user_id: id }).select('*').single()) as UserSettings;
  }
  async getGoals() {
    const id = await this.uid();
    const r = check(await this.sb.from('fitness_goals').select('*').eq('user_id', id).maybeSingle());
    return r ? ({ ...r, target_weight_kg: n(r.target_weight_kg), target_body_fat_pct: n(r.target_body_fat_pct), target_smm_kg: n(r.target_smm_kg) } as FitnessGoals) : null;
  }
  async saveGoals(g: Omit<FitnessGoals, 'user_id' | 'updated_at'>) {
    const id = await this.uid();
    return check(await this.sb.from('fitness_goals').upsert({ ...g, user_id: id }).select('*').single()) as FitnessGoals;
  }

  async listCategories() {
    return check(await this.sb.from('food_categories').select('*').order('sort_order')) as FoodCategory[];
  }
  async listFoods() {
    // ~500 global foods + custom foods; loaded once and searched client-side for instant results.
    const id = await this.uid();
    const out: FoodItem[] = [];
    for (let from = 0; ; from += 1000) {
      // Admins may read user-submitted foods for review, but those never appear in their own search.
      const rows = check(await this.sb.from('food_items').select(FOOD_COLS).or(`owner_id.is.null,owner_id.eq.${id}`).order('food_name_vi').range(from, from + 999)) as Row[];
      out.push(...rows.map(mapFood));
      if (rows.length < 1000) break;
    }
    return out;
  }
  async saveCustomFood(f: CustomFoodInput) {
    const id = await this.uid();
    const food_id = f.food_id ?? `custom-${crypto.randomUUID()}`;
    const row = foodRow({ ...f, food_id, owner_id: id, verification_status: 'USER-ENTERED' });
    check(await this.sb.from('food_items').upsert(row));
    check(await this.sb.from('food_servings').delete().eq('food_id', food_id).eq('owner_id', id));
    if (f.servings?.length) {
      check(await this.sb.from('food_servings').insert(f.servings.map((s) => ({ food_id, label_vi: s.label_vi, label_en: s.label_en, grams: s.grams, is_default: s.is_default, owner_id: id }))));
    }
    return mapFood(check(await this.sb.from('food_items').select(FOOD_COLS).eq('food_id', food_id).single()));
  }
  async deleteCustomFood(foodId: string) {
    const id = await this.uid();
    check(await this.sb.from('food_items').delete().eq('food_id', foodId).eq('owner_id', id));
  }
  async listFavorites() {
    return (check(await this.sb.from('user_favorites').select('food_id')) as Row[]).map((r) => r.food_id);
  }
  async setFavorite(foodId: string, fav: boolean) {
    const id = await this.uid();
    if (fav) check(await this.sb.from('user_favorites').upsert({ user_id: id, food_id: foodId }));
    else check(await this.sb.from('user_favorites').delete().eq('user_id', id).eq('food_id', foodId));
  }

  async listDiary(start: string | null, end: string) {
    // Always filter by user: a PT can also read linked clients' rows through RLS.
    let q = this.sb.from('food_diary_entries').select('*').eq('user_id', await this.uid()).lte('entry_date', end).order('created_at');
    if (start) q = q.gte('entry_date', start);
    const rows: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const page = check(await q.range(from, from + 999)) as Row[];
      rows.push(...page);
      if (page.length < 1000) break;
    }
    return rows.map(mapDiary);
  }
  async addDiaryEntries(entries: NewDiaryEntry[]) {
    const id = await this.uid();
    const rows = entries.map(({ per100, ...e }) => ({ ...e, ...per100To(per100), user_id: id }));
    return (check(await this.sb.from('food_diary_entries').insert(rows).select('*')) as Row[]).map(mapDiary);
  }
  async updateDiaryEntry(id: string, patch: Partial<DiaryEntry>) {
    return mapDiary(check(await this.sb.from('food_diary_entries').update(patch).eq('id', id).select('*').single()));
  }
  async deleteDiaryEntry(id: string) { check(await this.sb.from('food_diary_entries').delete().eq('id', id)); }
  async listSavedMeals() { return check(await this.sb.from('meals').select('*').order('created_at', { ascending: false })) as SavedMeal[]; }
  async saveMeal(name: string, items: SavedMeal['items']) {
    const id = await this.uid();
    return check(await this.sb.from('meals').insert({ user_id: id, name, items }).select('*').single()) as SavedMeal;
  }
  async deleteSavedMeal(id: string) { check(await this.sb.from('meals').delete().eq('id', id)); }

  async listRecipes() {
    return (check(await this.sb.from('recipes').select('*, recipe_ingredients(*)').order('updated_at', { ascending: false })) as Row[]).map(mapRecipe);
  }
  async saveRecipe(r: RecipeInput) {
    const uid = await this.uid();
    const base = { name: r.name, description: r.description, servings: r.servings, final_weight_g: r.final_weight_g, user_id: uid };
    const saved = r.id
      ? check(await this.sb.from('recipes').update(base).eq('id', r.id).select('*').single())
      : check(await this.sb.from('recipes').insert(base).select('*').single());
    check(await this.sb.from('recipe_ingredients').delete().eq('recipe_id', saved.id));
    if (r.ingredients.length) {
      check(await this.sb.from('recipe_ingredients').insert(r.ingredients.map((i, k) => ({ recipe_id: saved.id, food_id: i.food_id, name_snapshot: i.name_snapshot, grams: i.grams, sort_order: k, ...per100To(i.per100) }))));
    }
    return mapRecipe(check(await this.sb.from('recipes').select('*, recipe_ingredients(*)').eq('id', saved.id).single()));
  }
  async deleteRecipe(id: string) { check(await this.sb.from('recipes').delete().eq('id', id)); }

  async listMeasurements() {
    return (check(await this.sb.from('body_measurements').select('*').eq('user_id', await this.uid()).order('measured_on').order('created_at')) as Row[]).map(mapBody);
  }
  async addMeasurement(m: NewBodyMeasurement) {
    const id = await this.uid();
    return mapBody(check(await this.sb.from('body_measurements').insert({ ...m, user_id: id }).select('*').single()));
  }
  async updateMeasurement(id: string, m: NewBodyMeasurement) {
    return mapBody(check(await this.sb.from('body_measurements').update(m).eq('id', id).select('*').single()));
  }
  async deleteMeasurement(id: string) { check(await this.sb.from('body_measurements').delete().eq('id', id)); }

  async listWater(start: string, end: string) {
    return (check(await this.sb.from('water_logs').select('*').eq('user_id', await this.uid()).gte('entry_date', start).lte('entry_date', end).order('created_at')) as Row[])
      .map((r): WaterLog => ({ id: r.id, user_id: r.user_id, entry_date: r.entry_date, amount_ml: Number(r.amount_ml), created_at: r.created_at }));
  }
  async addWater(date: string, ml: number) {
    const id = await this.uid();
    const r = check(await this.sb.from('water_logs').insert({ user_id: id, entry_date: date, amount_ml: Math.round(ml) }).select('*').single()) as Row;
    return { id: r.id, user_id: r.user_id, entry_date: r.entry_date, amount_ml: Number(r.amount_ml), created_at: r.created_at };
  }
  async deleteWater(id: string) { check(await this.sb.from('water_logs').delete().eq('id', id)); }

  // ---------- PT (coach) mode ----------
  async getCoachProfile() {
    const id = await this.uid();
    return (check(await this.sb.from('coaches').select('*').eq('user_id', id).maybeSingle()) as CoachProfile | null) ?? null;
  }
  async becomeCoach(displayName: string) { return check(await this.sb.rpc('become_coach', { p_display_name: displayName })) as CoachProfile; }
  async regenerateInviteCode() { return check(await this.sb.rpc('regenerate_invite_code')) as CoachProfile; }
  async stopCoaching() { check(await this.sb.rpc('stop_coaching')); }
  async lookupCoach(code: string) {
    const rows = check(await this.sb.rpc('lookup_coach', { p_code: code })) as Row[];
    return rows?.[0]?.display_name ?? null;
  }
  async joinCoach(code: string) { check(await this.sb.rpc('join_coach', { p_code: code })); }
  async getMyCoach() {
    const rows = check(await this.sb.rpc('my_coach')) as Row[];
    const r = rows?.[0];
    return r ? ({ coach_id: r.coach_id, display_name: r.display_name, linked_at: r.linked_at } as MyCoach) : null;
  }
  async leaveCoach() { check(await this.sb.rpc('leave_coach')); }
  async coachListClients(): Promise<CoachClientLink[]> {
    const id = await this.uid();
    const links = check(await this.sb.from('coach_clients').select('client_id, created_at').eq('coach_id', id).order('created_at')) as Row[];
    if (!links.length) return [];
    const profiles = check(await this.sb.from('user_profiles').select('id, full_name, email').in('id', links.map((l) => l.client_id))) as Row[];
    const byId = new Map(profiles.map((p) => [p.id, p]));
    return links.map((l) => ({ client_id: l.client_id, linked_at: l.created_at, full_name: byId.get(l.client_id)?.full_name ?? '', email: byId.get(l.client_id)?.email ?? '' }));
  }
  async coachRemoveClient(clientId: string) { check(await this.sb.rpc('remove_client', { p_client: clientId })); }
  async coachGetClients(ids: string[], start: string, end: string): Promise<ClientBundle[]> {
    if (!ids.length) return [];
    const all = async (q: () => any) => {
      const out: Row[] = [];
      for (let from = 0; ; from += 1000) {
        const page = check(await q().range(from, from + 999)) as Row[];
        out.push(...page);
        if (page.length < 1000) break;
      }
      return out;
    };
    const [profiles, settings, goals, diary, body] = await Promise.all([
      this.sb.from('user_profiles').select('*').in('id', ids).then(check) as Promise<Row[]>,
      this.sb.from('user_settings').select('*').in('user_id', ids).then(check) as Promise<Row[]>,
      this.sb.from('fitness_goals').select('*').in('user_id', ids).then(check) as Promise<Row[]>,
      all(() => this.sb.from('food_diary_entries').select('*').in('user_id', ids).gte('entry_date', start).lte('entry_date', end).order('created_at')),
      all(() => this.sb.from('body_measurements').select('*').in('user_id', ids).order('measured_on').order('created_at')),
    ]);
    let water: Row[] | null = null;
    try {
      water = await all(() => this.sb.from('water_logs').select('*').in('user_id', ids).gte('entry_date', start).lte('entry_date', end).order('created_at'));
    } catch (e) { if (!(e instanceof BackendError && e.code === 'migration_needed')) throw e; }
    return profiles.map((p): ClientBundle => {
      const g = goals.find((x) => x.user_id === p.id);
      return {
        profile: this.mapProfile(p),
        settings: (settings.find((x) => x.user_id === p.id) as UserSettings) ?? null,
        goals: g ? ({ ...g, target_weight_kg: n(g.target_weight_kg), target_body_fat_pct: n(g.target_body_fat_pct), target_smm_kg: n(g.target_smm_kg) } as FitnessGoals) : null,
        diary: diary.filter((d) => d.user_id === p.id).map(mapDiary),
        measurements: body.filter((b) => b.user_id === p.id).map(mapBody),
        water: water ? water.filter((w) => w.user_id === p.id).map((r): WaterLog => ({ id: r.id, user_id: r.user_id, entry_date: r.entry_date, amount_ml: Number(r.amount_ml), created_at: r.created_at })) : null,
      };
    });
  }

  async adminListAllFoods() {
    const out: FoodItem[] = [];
    for (let from = 0; ; from += 1000) {
      const rows = check(await this.sb.from('food_items').select(FOOD_COLS).is('owner_id', null).order('food_name_vi').range(from, from + 999)) as Row[];
      out.push(...rows.map(mapFood));
      if (rows.length < 1000) break;
    }
    return out;
  }
  async adminUpsertFoods(foods: FoodItem[]) {
    for (let i = 0; i < foods.length; i += 200) {
      const part = foods.slice(i, i + 200);
      check(await this.sb.from('food_items').upsert(part.map((f) => foodRow({ ...f, owner_id: null }))));
      const withServings = part.filter((f) => f.servings && f.servings.length);
      if (withServings.length) {
        check(await this.sb.from('food_servings').delete().is('owner_id', null).in('food_id', withServings.map((f) => f.food_id)));
        check(await this.sb.from('food_servings').insert(withServings.flatMap((f) => f.servings!.map((s) => ({ food_id: f.food_id, label_vi: s.label_vi, label_en: s.label_en, grams: s.grams, is_default: s.is_default, owner_id: null })))));
      }
    }
    return foods.length;
  }
  async adminListUserFoods() {
    return (check(await this.sb.from('food_items').select(FOOD_COLS).not('owner_id', 'is', null).order('created_at', { ascending: false }).limit(500)) as Row[]).map(mapFood);
  }
  async adminDeleteFood(foodId: string) { check(await this.sb.from('food_items').delete().eq('food_id', foodId).is('owner_id', null)); }
  async adminUpsertCategory(c: FoodCategory) { check(await this.sb.from('food_categories').upsert(c)); }
}
