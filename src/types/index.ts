// Core domain types shared by the UI, calculations and both data backends.

export type Gender = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'very' | 'extreme';
export type FitnessGoal = 'weight_loss' | 'fat_loss' | 'recomp' | 'muscle_gain' | 'maintenance';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type VerificationStatus = 'VERIFIED' | 'ESTIMATED' | 'USER-ENTERED';
export type RawOrCooked = 'raw' | 'cooked' | 'dry' | 'prepared' | 'n/a';
export type PreparationMethod =
  | 'raw' | 'cooked' | 'boiled' | 'steamed' | 'grilled' | 'fried' | 'roasted'
  | 'stir_fried' | 'braised' | 'pan_seared' | 'dried' | 'processed' | 'prepared' | 'beverage' | 'none';
export type BmiStandard = 'who' | 'asian';
export type Language = 'vi' | 'en';

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  gender: Gender | null;
  date_of_birth: string | null; // YYYY-MM-DD
  height_cm: number | null;
  current_weight_kg: number | null;
  activity_level: ActivityLevel;
  experience: Experience | null;
  fitness_goal: FitnessGoal;
  target_weight_kg: number | null;
  target_body_fat_pct: number | null;
  target_smm_kg: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface UserSettings {
  user_id: string;
  language: Language;
  bmi_standard: BmiStandard;
  timezone: string;
  /** Alert & reminder preferences (migration 0002). Partial/absent on older rows: use normalizeAlertPrefs(). */
  alert_prefs?: object | null;
}

export interface FitnessGoals {
  user_id: string;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  target_weight_kg: number | null;
  target_body_fat_pct: number | null;
  target_smm_kg: number | null;
  step_goal: number | null;
  is_custom: boolean;
  updated_at?: string;
}

export interface FoodCategory {
  id: string; // slug e.g. 'rice_noodles'
  code: string; // A..O
  name_vi: string;
  name_en: string;
  sort_order: number;
}

export interface FoodServing {
  id: string;
  food_id: string;
  label_vi: string;
  label_en: string;
  grams: number; // grams (or ml for beverages) in ONE unit
  is_default: boolean;
}

export interface FoodItem {
  food_id: string;
  food_name_vi: string;
  food_name_en: string;
  alternative_names: string[];
  search_keywords: string[];
  category: string; // FoodCategory.id
  subcategory: string | null;
  calories_kcal: number; // per 100 g (or 100 ml when serving_unit = ml)
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  serving_size: number; // default serving amount in serving_unit
  serving_unit: 'g' | 'ml';
  preparation_method: PreparationMethod;
  raw_or_cooked: RawOrCooked;
  edible_portion: number; // 0..1 fraction of purchased weight that is edible
  data_source: string;
  verification_status: VerificationStatus;
  owner_id: string | null; // null = global database record
  created_at: string;
  updated_at: string;
  servings?: FoodServing[];
}

export interface DiaryEntry {
  id: string;
  user_id: string;
  entry_date: string; // YYYY-MM-DD in user's timezone
  meal_type: MealType;
  food_id: string | null;
  recipe_id: string | null;
  name_snapshot: string;
  grams: number; // consumed edible weight in g (or ml)
  serving_label: string | null;
  serving_qty: number | null;
  // Nutrient values per 100 g captured at logging time, so later edits to the
  // food record never rewrite history.
  per100: Macros;
  created_at: string;
  updated_at: string;
}

export interface SavedMealItem {
  food_id: string | null;
  recipe_id: string | null;
  name_snapshot: string;
  grams: number;
  serving_label: string | null;
  serving_qty: number | null;
  per100: Macros;
}

export interface SavedMeal {
  id: string;
  user_id: string;
  name: string;
  items: SavedMealItem[];
  created_at: string;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  food_id: string;
  name_snapshot: string;
  grams: number;
  per100: Macros;
}

export interface Recipe {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  servings: number;
  final_weight_g: number | null; // cooked yield; null = sum of ingredients
  ingredients: RecipeIngredient[];
  created_at: string;
  updated_at: string;
}

export interface BodyMeasurement {
  id: string;
  user_id: string;
  measured_on: string; // YYYY-MM-DD
  weight_kg: number;
  height_cm: number;
  bmi: number; // always computed from weight & height
  smm_kg: number | null;
  body_fat_mass_kg: number | null;
  body_fat_pct: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  visceral_fat_level: number | null;
  total_body_water_l: number | null;
  device_bmr_kcal: number | null;
  segmental_lean: Record<string, number> | null;
  segmental_fat: Record<string, number> | null;
  device: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type NewBodyMeasurement = Omit<BodyMeasurement, 'id' | 'user_id' | 'bmi' | 'created_at' | 'updated_at'>;

export interface WaterLog {
  id: string;
  user_id: string;
  entry_date: string; // YYYY-MM-DD
  amount_ml: number;
  created_at: string;
}

// ---------- PT (coach) mode – migration 0003 ----------
export interface CoachProfile {
  user_id: string;
  display_name: string;
  invite_code: string;
  created_at: string;
}

/** The client's view of their PT. */
export interface MyCoach {
  coach_id: string;
  display_name: string;
  linked_at: string;
}

/** The PT's view of one linked client. */
export interface CoachClientLink {
  client_id: string;
  linked_at: string;
  full_name: string;
  email: string;
}

/** Read-only data a PT can load for a linked client. */
export interface ClientBundle {
  profile: UserProfile;
  settings: UserSettings | null;
  goals: FitnessGoals | null;
  diary: DiaryEntry[]; // only within the requested date range
  measurements: BodyMeasurement[]; // all, oldest first
  water: WaterLog[] | null; // null = water log unavailable (migration 0002 not run)
}
