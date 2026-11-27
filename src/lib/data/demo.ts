import type { BodyMeasurement, ClientBundle, CoachClientLink, CoachProfile, MyCoach, DiaryEntry, FitnessGoals, FoodCategory, FoodItem, Recipe, SavedMeal, UserProfile, UserSettings, WaterLog } from '@/types';
import type { AuthUser, Backend, CustomFoodInput, NewDiaryEntry, RecipeInput } from './backend';
import { BackendError } from './backend';
import { calcBmi } from '@/lib/calc/body';
import { addDays, todayIso } from '@/lib/calc/dates';

/**
 * DEMO MODE BACKEND – everything lives in this browser's localStorage.
 * Nothing is sent to a server and nothing is permanent: clearing site data
 * deletes it. The UI shows a persistent banner whenever this backend is used.
 */
const K = 'ntvn_demo_v1';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
const now = () => new Date().toISOString();

interface DemoUser { id: string; email: string; pwHash: string; admin: boolean; sample?: boolean }
interface UserData {
  profile: UserProfile; settings: UserSettings; goals: FitnessGoals | null; diary: DiaryEntry[]; meals: SavedMeal[];
  recipes: Recipe[]; body: BodyMeasurement[]; favorites: string[]; customFoods: FoodItem[];
  water?: WaterLog[]; // added later: absent in older demo data
}
interface CoachLink { coach_id: string; client_id: string; created_at: string }
interface DB {
  users: DemoUser[]; session: string | null; data: Record<string, UserData>; globalOverrides: Record<string, FoodItem | null>; categories: FoodCategory[] | null;
  coaches?: Record<string, CoachProfile>; coachLinks?: CoachLink[]; // PT mode: added later, absent in older demo data
}

export const DEMO_ACCOUNT = { email: 'demo@nutritrack.vn', password: 'demo1234' };

async function hash(pw: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ntvn-demo:' + pw));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

let seedCache: { foods: FoodItem[]; categories: FoodCategory[] } | null = null;
async function seed() {
  if (!seedCache) {
    const m = await import('@/data/foods.seed');
    seedCache = { foods: m.SEED_FOODS, categories: m.CATEGORIES };
  }
  return seedCache;
}

export class DemoBackend implements Backend {
  readonly mode = 'demo' as const;
  private listeners = new Set<(u: AuthUser | null) => void>();
  private memory: DB | null = null;

  private load(): DB {
    if (this.memory) return this.memory;
    let db: DB | null = null;
    try { db = JSON.parse(localStorage.getItem(K) || 'null'); } catch { db = null; }
    this.memory = db ?? { users: [], session: null, data: {}, globalOverrides: {}, categories: null };
    return this.memory;
  }
  private save() {
    try { localStorage.setItem(K, JSON.stringify(this.memory)); } catch { /* storage full or blocked: keep in memory */ }
  }
  private me(): { user: DemoUser; data: UserData } {
    const db = this.load();
    const user = db.users.find((u) => u.id === db.session);
    if (!user) throw new BackendError('Not signed in', 'auth');
    return { user, data: db.data[user.id] };
  }
  private emit() { const u = this.currentAuth(); this.listeners.forEach((l) => l(u)); }
  private currentAuth(): AuthUser | null {
    const db = this.load();
    const u = db.users.find((x) => x.id === db.session);
    return u ? { id: u.id, email: u.email } : null;
  }

  async getUser() { return this.currentAuth(); }
  onAuthChange(cb: (u: AuthUser | null) => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }

  private newUserData(id: string, email: string, fullName: string, language: string): UserData {
    return {
      profile: { id, email, full_name: fullName, gender: null, date_of_birth: null, height_cm: null, current_weight_kg: null, activity_level: 'light', experience: null, fitness_goal: 'maintenance', target_weight_kg: null, target_body_fat_pct: null, target_smm_kg: null, created_at: now(), updated_at: now() },
      settings: { user_id: id, language: language === 'en' ? 'en' : 'vi', bmi_standard: 'who', timezone: 'Asia/Ho_Chi_Minh' },
      goals: null, diary: [], meals: [], recipes: [], body: [], favorites: [], customFoods: [],
    };
  }

  async signUp(email: string, password: string, fullName: string, language: string) {
    const db = this.load();
    email = email.trim().toLowerCase();
    if (db.users.some((u) => u.email === email)) throw new BackendError('An account with this email already exists', 'exists');
    const id = uid();
    db.users.push({ id, email, pwHash: await hash(password), admin: false });
    db.data[id] = this.newUserData(id, email, fullName, language);
    db.session = id;
    this.save(); this.emit();
    return { needsConfirmation: false };
  }

  async signIn(email: string, password: string) {
    const db = this.load();
    email = email.trim().toLowerCase();
    if (email === DEMO_ACCOUNT.email && !db.users.some((u) => u.email === email)) await this.createSampleAccount();
    const u = db.users.find((x) => x.email === email);
    if (!u || u.pwHash !== (await hash(password))) throw new BackendError('Invalid email or password', 'invalid_credentials');
    db.session = u.id; this.save(); this.emit();
  }

  async signOut() { const db = this.load(); db.session = null; this.save(); this.emit(); }
  async requestPasswordReset() {
    throw new BackendError('Password recovery emails need Supabase. In demo mode there is no email service.', 'demo');
  }
  async updatePassword(pw: string) { const { user } = this.me(); user.pwHash = await hash(pw); this.save(); }
  async isAdmin() { try { return this.me().user.admin; } catch { return false; } }

  async getProfile() { return { ...this.me().data.profile }; }
  async saveProfile(p: Partial<UserProfile>) {
    const { data } = this.me();
    data.profile = { ...data.profile, ...p, id: data.profile.id, email: data.profile.email, updated_at: now() };
    this.save();
    return { ...data.profile };
  }
  async getSettings() { return { ...this.me().data.settings }; }
  async saveSettings(s: Partial<UserSettings>) { const { data } = this.me(); data.settings = { ...data.settings, ...s }; this.save(); return { ...data.settings }; }
  async getGoals() { const g = this.me().data.goals; return g ? { ...g } : null; }
  async saveGoals(g: Omit<FitnessGoals, 'user_id' | 'updated_at'>) {
    const { user, data } = this.me();
    data.goals = { ...g, user_id: user.id, updated_at: now() };
    this.save();
    return { ...data.goals };
  }

  async listCategories() { const db = this.load(); return db.categories ?? (await seed()).categories; }
  private async globalFoods(): Promise<FoodItem[]> {
    const db = this.load();
    const base = (await seed()).foods;
    const out: FoodItem[] = [];
    const seen = new Set<string>();
    for (const f of base) {
      seen.add(f.food_id);
      const o = db.globalOverrides[f.food_id];
      if (o === null) continue;
      out.push(o ?? f);
    }
    for (const [id, o] of Object.entries(db.globalOverrides)) if (o && !seen.has(id)) out.push(o);
    return out;
  }
  async listFoods() { return [...(await this.globalFoods()), ...this.me().data.customFoods]; }
  async saveCustomFood(f: CustomFoodInput) {
    const { user, data } = this.me();
    const id = f.food_id ?? `custom-${uid()}`;
    const existing = data.customFoods.find((x) => x.food_id === id);
    const item: FoodItem = { ...f, food_id: id, owner_id: user.id, verification_status: 'USER-ENTERED', created_at: existing?.created_at ?? now(), updated_at: now(),
      servings: (f.servings ?? []).map((s, i) => ({ ...s, id: `${id}--${i}`, food_id: id })) };
    data.customFoods = existing ? data.customFoods.map((x) => (x.food_id === id ? item : x)) : [...data.customFoods, item];
    this.save();
    return item;
  }
  async deleteCustomFood(id: string) { const { data } = this.me(); data.customFoods = data.customFoods.filter((f) => f.food_id !== id); this.save(); }
  async listFavorites() { return [...this.me().data.favorites]; }
  async setFavorite(id: string, fav: boolean) {
    const { data } = this.me();
    data.favorites = fav ? Array.from(new Set([...data.favorites, id])) : data.favorites.filter((x) => x !== id);
    this.save();
  }

  async listDiary(start: string | null, end: string) {
    return this.me().data.diary.filter((e) => (start == null || e.entry_date >= start) && e.entry_date <= end).map((e) => ({ ...e }));
  }
  async addDiaryEntries(entries: NewDiaryEntry[]) {
    const { user, data } = this.me();
    const created = entries.map((e) => ({ ...e, id: uid(), user_id: user.id, created_at: now(), updated_at: now() }));
    data.diary.push(...created); this.save();
    return created;
  }
  async updateDiaryEntry(id: string, patch: Partial<DiaryEntry>) {
    const { data } = this.me();
    const e = data.diary.find((x) => x.id === id);
    if (!e) throw new BackendError('Entry not found', 'not_found');
    Object.assign(e, patch, { updated_at: now() }); this.save();
    return { ...e };
  }
  async deleteDiaryEntry(id: string) { const { data } = this.me(); data.diary = data.diary.filter((e) => e.id !== id); this.save(); }
  async listSavedMeals() { return [...this.me().data.meals]; }
  async saveMeal(name: string, items: SavedMeal['items']) {
    const { user, data } = this.me();
    const m: SavedMeal = { id: uid(), user_id: user.id, name, items, created_at: now() };
    data.meals.push(m); this.save(); return m;
  }
  async deleteSavedMeal(id: string) { const { data } = this.me(); data.meals = data.meals.filter((m) => m.id !== id); this.save(); }

  async listRecipes() { return this.me().data.recipes.map((r) => ({ ...r, ingredients: [...r.ingredients] })); }
  async saveRecipe(r: RecipeInput) {
    const { user, data } = this.me();
    const id = r.id ?? uid();
    const existing = data.recipes.find((x) => x.id === id);
    const recipe: Recipe = { ...r, id, user_id: user.id, created_at: existing?.created_at ?? now(), updated_at: now(),
      ingredients: r.ingredients.map((i) => ({ ...i, id: uid(), recipe_id: id })) };
    data.recipes = existing ? data.recipes.map((x) => (x.id === id ? recipe : x)) : [...data.recipes, recipe];
    this.save(); return recipe;
  }
  async deleteRecipe(id: string) { const { data } = this.me(); data.recipes = data.recipes.filter((r) => r.id !== id); this.save(); }

  async listMeasurements() { return [...this.me().data.body].sort((a, b) => a.measured_on.localeCompare(b.measured_on)); }
  async addMeasurement(m: Omit<BodyMeasurement, 'id' | 'user_id' | 'bmi' | 'created_at' | 'updated_at'>) {
    const { user, data } = this.me();
    const row: BodyMeasurement = { ...m, id: uid(), user_id: user.id, bmi: calcBmi(m.weight_kg, m.height_cm), created_at: now(), updated_at: now() };
    data.body.push(row); this.save(); return row;
  }
  async updateMeasurement(id: string, m: Omit<BodyMeasurement, 'id' | 'user_id' | 'bmi' | 'created_at' | 'updated_at'>) {
    const { data } = this.me();
    const i = data.body.findIndex((x) => x.id === id);
    if (i < 0) throw new BackendError('Measurement not found', 'not_found');
    data.body[i] = { ...data.body[i], ...m, bmi: calcBmi(m.weight_kg, m.height_cm), updated_at: now() };
    this.save(); return data.body[i];
  }
  async deleteMeasurement(id: string) { const { data } = this.me(); data.body = data.body.filter((b) => b.id !== id); this.save(); }

  async listWater(start: string, end: string) {
    return (this.me().data.water ?? []).filter((w) => w.entry_date >= start && w.entry_date <= end).map((w) => ({ ...w }));
  }
  async addWater(date: string, ml: number) {
    const { user, data } = this.me();
    if (!(ml > 0 && ml <= 5000)) throw new BackendError('Invalid amount', 'range');
    const w: WaterLog = { id: uid(), user_id: user.id, entry_date: date, amount_ml: Math.round(ml), created_at: now() };
    (data.water ??= []).push(w);
    this.save();
    return { ...w };
  }
  async deleteWater(id: string) { const { data } = this.me(); data.water = (data.water ?? []).filter((w) => w.id !== id); this.save(); }

  // ---------- PT (coach) mode: same rules as the SQL functions in migration 0003 ----------
  private coachState() {
    const db = this.load();
    db.coaches ??= {};
    db.coachLinks ??= [];
    return { db, coaches: db.coaches, links: db.coachLinks };
  }
  private newInviteCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const { coaches } = this.coachState();
    for (;;) {
      const buf = crypto.getRandomValues(new Uint8Array(6));
      const code = Array.from(buf, (b) => alphabet[b % alphabet.length]).join('');
      if (!Object.values(coaches).some((c) => c.invite_code === code)) return code;
    }
  }
  async getCoachProfile() { const { user } = this.me(); const c = this.coachState().coaches[user.id]; return c ? { ...c } : null; }
  async becomeCoach(displayName: string) {
    const { user } = this.me();
    const name = displayName.trim();
    if (!name || name.length > 80) throw new BackendError('Invalid name', 'range');
    const { coaches } = this.coachState();
    coaches[user.id] = coaches[user.id] ? { ...coaches[user.id], display_name: name } : { user_id: user.id, display_name: name, invite_code: this.newInviteCode(), created_at: now() };
    this.save(); return { ...coaches[user.id] };
  }
  async regenerateInviteCode() {
    const { user } = this.me();
    const { coaches } = this.coachState();
    if (!coaches[user.id]) throw new BackendError('not_a_coach', 'not_a_coach');
    coaches[user.id] = { ...coaches[user.id], invite_code: this.newInviteCode() };
    this.save(); return { ...coaches[user.id] };
  }
  async stopCoaching() {
    const { user } = this.me();
    const st = this.coachState();
    delete st.coaches[user.id];
    st.db.coachLinks = st.links.filter((l) => l.coach_id !== user.id);
    this.save();
  }
  private coachByCode(code: string) {
    const c = code.trim().toUpperCase();
    return Object.values(this.coachState().coaches).find((x) => x.invite_code === c) ?? null;
  }
  async lookupCoach(code: string) {
    const { user } = this.me();
    const c = this.coachByCode(code);
    return c && c.user_id !== user.id ? c.display_name : null;
  }
  async joinCoach(code: string) {
    const { user } = this.me();
    const c = this.coachByCode(code);
    if (!c) throw new BackendError('invalid_code', 'invalid_code');
    if (c.user_id === user.id) throw new BackendError('own_code', 'own_code');
    const { links } = this.coachState();
    const mine = links.find((l) => l.client_id === user.id);
    if (mine?.coach_id === c.user_id) return;
    if (mine) throw new BackendError('already_linked', 'already_linked');
    links.push({ coach_id: c.user_id, client_id: user.id, created_at: now() });
    this.save();
  }
  async getMyCoach(): Promise<MyCoach | null> {
    const { user } = this.me();
    const { coaches, links } = this.coachState();
    const l = links.find((x) => x.client_id === user.id);
    const c = l && coaches[l.coach_id];
    return l && c ? { coach_id: l.coach_id, display_name: c.display_name, linked_at: l.created_at } : null;
  }
  async leaveCoach() {
    const { user } = this.me();
    const st = this.coachState();
    st.db.coachLinks = st.links.filter((l) => l.client_id !== user.id);
    this.save();
  }
  async coachListClients(): Promise<CoachClientLink[]> {
    const { user } = this.me();
    const { db, links } = this.coachState();
    return links.filter((l) => l.coach_id === user.id).map((l) => {
      const p = db.data[l.client_id]?.profile;
      return { client_id: l.client_id, linked_at: l.created_at, full_name: p?.full_name ?? '', email: p?.email ?? '' };
    });
  }
  async coachRemoveClient(clientId: string) {
    const { user } = this.me();
    const st = this.coachState();
    st.db.coachLinks = st.links.filter((l) => !(l.coach_id === user.id && l.client_id === clientId));
    this.save();
  }
  async coachGetClients(ids: string[], start: string, end: string): Promise<ClientBundle[]> {
    const { user } = this.me();
    const { db, links } = this.coachState();
    const mine = new Set(links.filter((l) => l.coach_id === user.id).map((l) => l.client_id));
    return ids.filter((id) => mine.has(id) && db.data[id]).map((id) => {
      const d = structuredClone(db.data[id]);
      return {
        profile: d.profile, settings: d.settings, goals: d.goals,
        diary: d.diary.filter((e) => e.entry_date >= start && e.entry_date <= end),
        measurements: [...d.body].sort((a, b) => a.measured_on.localeCompare(b.measured_on)),
        water: (d.water ?? []).filter((w) => w.entry_date >= start && w.entry_date <= end),
      };
    });
  }

  private requireAdmin() { if (!this.me().user.admin) throw new BackendError('Administrator access required', 'forbidden'); }
  async adminListAllFoods() { this.requireAdmin(); return this.globalFoods(); }
  async adminUpsertFoods(foods: FoodItem[]) {
    this.requireAdmin();
    const db = this.load();
    for (const f of foods) db.globalOverrides[f.food_id] = { ...f, owner_id: null, updated_at: now() };
    this.save(); return foods.length;
  }
  async adminListUserFoods() { this.requireAdmin(); return Object.values(this.load().data).flatMap((d) => d.customFoods); }
  async adminDeleteFood(id: string) { this.requireAdmin(); const db = this.load(); db.globalOverrides[id] = null; this.save(); }
  async adminUpsertCategory(c: FoodCategory) {
    this.requireAdmin();
    const db = this.load();
    const cats = db.categories ?? [...(await seed()).categories];
    const i = cats.findIndex((x) => x.id === c.id);
    if (i >= 0) cats[i] = c; else cats.push(c);
    db.categories = cats; this.save();
  }

  /** Clearly labelled sample account so the demo has data to explore. */
  private async createSampleAccount() {
    const db = this.load();
    const id = uid();
    db.users.push({ id, email: DEMO_ACCOUNT.email, pwHash: await hash(DEMO_ACCOUNT.password), admin: true, sample: true });
    const d = this.newUserData(id, DEMO_ACCOUNT.email, 'Tài khoản mẫu (Demo)', 'vi');
    d.profile = { ...d.profile, gender: 'female', date_of_birth: '1994-05-12', height_cm: 160, current_weight_kg: 58.2, activity_level: 'moderate', fitness_goal: 'fat_loss', target_weight_kg: 54, target_body_fat_pct: 24, target_smm_kg: 23 };
    d.goals = { user_id: id, calories_kcal: 1690, protein_g: 116, carbs_g: 175, fat_g: 51, fiber_g: 24, target_weight_kg: 54, target_body_fat_pct: 24, target_smm_kg: 23, step_goal: 8000, is_custom: false, updated_at: now() };
    const foods = (await seed()).foods;
    const f = (fid: string) => foods.find((x) => x.food_id === fid)!;
    const today = todayIso();
    // SAMPLE DATA – fictional measurements for demonstration only.
    const samples: [number, number, number, number, number, number, number][] = [
      // days ago, weight, smm, bfm, bf%, waist, hip
      [84, 61.0, 22.1, 19.6, 32.1, 80, 98], [70, 60.4, 22.2, 19.0, 31.5, 79, 97.5], [56, 59.9, 22.3, 18.4, 30.7, 78, 97],
      [42, 59.5, 22.4, 17.9, 30.1, 77.5, 96.5], [28, 59.0, 22.5, 17.3, 29.3, 76.5, 96], [14, 58.6, 22.6, 16.8, 28.7, 76, 95.5], [1, 58.2, 22.7, 16.3, 28.0, 75, 95],
    ];
    d.body = samples.map(([ago, w, smm, bfm, pct, waist, hip]) => ({
      id: uid(), user_id: id, measured_on: addDays(today, -ago), weight_kg: w, height_cm: 160, bmi: calcBmi(w, 160), smm_kg: smm, body_fat_mass_kg: bfm,
      body_fat_pct: pct, waist_cm: waist, hip_cm: hip, visceral_fat_level: 6, total_body_water_l: 30.1, device_bmr_kcal: 1270, segmental_lean: null, segmental_fat: null,
      device: 'InBody (sample)', notes: 'Dữ liệu mẫu / sample data', created_at: now(), updated_at: now(),
    }));
    const plan: [string, MealTypeT, number][] = [
      ['banh-mi-trung', 'breakfast', 170], ['ca-phe-sua-da', 'breakfast', 200], ['com-trang', 'lunch', 150], ['ca-kho-to', 'lunch', 120],
      ['rau-muong-xao-toi', 'lunch', 150], ['canh-chua-ca', 'lunch', 300], ['uc-ga-ap-chao', 'dinner', 150], ['khoai-lang-luoc', 'dinner', 150],
      ['bong-cai-xanh-luoc', 'dinner', 150], ['sua-chua-khong-duong', 'snack', 100], ['chuoi', 'snack', 100],
    ];
    for (let ago = 13; ago >= 0; ago--) {
      const date = addDays(today, -ago);
      plan.forEach(([fid, meal, g], i) => {
        if (ago === 0 && meal !== 'breakfast') return; // today: only breakfast logged so far
        if ((ago + i) % 7 === 3) return; // some variation
        const food = f(fid);
        d.diary.push({ id: uid(), user_id: id, entry_date: date, meal_type: meal, food_id: fid, recipe_id: null, name_snapshot: food.food_name_vi, grams: g,
          serving_label: null, serving_qty: null, per100: { calories: food.calories_kcal, protein: food.protein_g, carbs: food.carbs_g, fat: food.fat_g, fiber: food.fiber_g }, created_at: now(), updated_at: now() });
      });
    }
    const ing = (fid: string, grams: number) => { const x = f(fid); return { id: uid(), recipe_id: '', food_id: fid, name_snapshot: x.food_name_vi, grams, per100: { calories: x.calories_kcal, protein: x.protein_g, carbs: x.carbs_g, fat: x.fat_g, fiber: x.fiber_g } }; };
    const rid = uid();
    d.recipes.push({ id: rid, user_id: id, name: 'Bún hải sản nhà làm (mẫu)', description: 'Công thức mẫu', servings: 2, final_weight_g: 900, created_at: now(), updated_at: now(),
      ingredients: [ing('bun-tuoi', 200), ing('muc-ong-song', 150), ing('tom-the-song', 100), ing('cai-ngot', 100), ing('dau-an', 5)].map((x) => ({ ...x, recipe_id: rid })) });
    d.favorites = ['com-trang', 'uc-ga-chin', 'trung-luoc', 'pho-bo'];
    db.data[id] = d;
    this.save();
  }
}
type MealTypeT = 'breakfast' | 'lunch' | 'dinner' | 'snack';
