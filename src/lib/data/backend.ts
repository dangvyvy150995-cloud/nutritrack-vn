import type {
  BodyMeasurement, DiaryEntry, FitnessGoals, FoodCategory, FoodItem, NewBodyMeasurement, Recipe, SavedMeal,
  UserProfile, UserSettings,
} from '@/types';

export interface AuthUser { id: string; email: string }

export type NewDiaryEntry = Omit<DiaryEntry, 'id' | 'user_id' | 'created_at' | 'updated_at'>;
export type RecipeInput = Omit<Recipe, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'ingredients'> & {
  id?: string;
  ingredients: Omit<Recipe['ingredients'][number], 'id' | 'recipe_id'>[];
};
export type CustomFoodInput = Omit<FoodItem, 'food_id' | 'owner_id' | 'created_at' | 'updated_at' | 'verification_status'> & { food_id?: string };

/**
 * Everything the UI needs from persistence. Two implementations exist:
 * SupabaseBackend (real, persistent, RLS-protected) and DemoBackend
 * (browser localStorage only, clearly labelled in the UI).
 */
export interface Backend {
  readonly mode: 'supabase' | 'demo';

  // auth
  getUser(): Promise<AuthUser | null>;
  onAuthChange(cb: (u: AuthUser | null) => void): () => void;
  signUp(email: string, password: string, fullName: string, language: string): Promise<{ needsConfirmation: boolean }>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(newPassword: string): Promise<void>;
  isAdmin(): Promise<boolean>;

  // profile & settings
  getProfile(): Promise<UserProfile>;
  saveProfile(p: Partial<UserProfile>): Promise<UserProfile>;
  getSettings(): Promise<UserSettings>;
  saveSettings(s: Partial<UserSettings>): Promise<UserSettings>;
  getGoals(): Promise<FitnessGoals | null>;
  saveGoals(g: Omit<FitnessGoals, 'user_id' | 'updated_at'>): Promise<FitnessGoals>;

  // foods
  listCategories(): Promise<FoodCategory[]>;
  listFoods(): Promise<FoodItem[]>; // global + the user's own custom foods
  saveCustomFood(f: CustomFoodInput): Promise<FoodItem>;
  deleteCustomFood(foodId: string): Promise<void>;
  listFavorites(): Promise<string[]>;
  setFavorite(foodId: string, fav: boolean): Promise<void>;

  // diary
  listDiary(start: string | null, end: string): Promise<DiaryEntry[]>;
  addDiaryEntries(entries: NewDiaryEntry[]): Promise<DiaryEntry[]>;
  updateDiaryEntry(id: string, patch: Partial<Pick<DiaryEntry, 'grams' | 'serving_label' | 'serving_qty' | 'meal_type' | 'entry_date'>>): Promise<DiaryEntry>;
  deleteDiaryEntry(id: string): Promise<void>;
  listSavedMeals(): Promise<SavedMeal[]>;
  saveMeal(name: string, items: SavedMeal['items']): Promise<SavedMeal>;
  deleteSavedMeal(id: string): Promise<void>;

  // recipes
  listRecipes(): Promise<Recipe[]>;
  saveRecipe(r: RecipeInput): Promise<Recipe>;
  deleteRecipe(id: string): Promise<void>;

  // body
  listMeasurements(): Promise<BodyMeasurement[]>;
  addMeasurement(m: NewBodyMeasurement): Promise<BodyMeasurement>;
  updateMeasurement(id: string, m: NewBodyMeasurement): Promise<BodyMeasurement>;
  deleteMeasurement(id: string): Promise<void>;

  // admin (enforced server-side by RLS in Supabase mode)
  adminListAllFoods(): Promise<FoodItem[]>;
  adminUpsertFoods(foods: FoodItem[]): Promise<number>;
  adminListUserFoods(): Promise<FoodItem[]>; // user-submitted custom foods, for review
  adminDeleteFood(foodId: string): Promise<void>;
  adminUpsertCategory(c: FoodCategory): Promise<void>;
}

export class BackendError extends Error {
  constructor(message: string, public code?: string) { super(message); }
}
