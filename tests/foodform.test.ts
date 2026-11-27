import { describe, expect, it } from 'vitest';
import { emptyFood, foodSaveErrorKey, validateFoodDraft } from '../src/components/FoodForm';

const base = () => ({ ...emptyFood('home_meals'), food_name_vi: 'Cơm gà', calories_kcal: 180, protein_g: 10, carbs_g: 25, fat_g: 5 });

describe('validateFoodDraft', () => {
  it('accepts a normal per-100 g food', () => expect(validateFoodDraft(base(), false)).toBeNull());
  it('asks for a name', () => expect(validateFoodDraft({ ...base(), food_name_vi: '  ' }, false)).toBe('food_err_name'));
  it('explains per-serving numbers entered as per-100 g', () => {
    expect(validateFoodDraft({ ...base(), protein_g: 30, carbs_g: 70, fat_g: 20 }, false)).toBe('food_err_macros');
    expect(validateFoodDraft({ ...base(), calories_kcal: 1200 }, false)).toBe('food_err_kcal');
  });
  it('needs a serving weight', () => expect(validateFoodDraft({ ...base(), serving_size: 0 }, false)).toBe('food_err_portion'));
  it('needs a source for verified admin records', () => expect(validateFoodDraft({ ...base(), verification_status: 'VERIFIED' }, true)).toBe('need_source'));
});

describe('foodSaveErrorKey', () => {
  it('maps database constraint errors', () => {
    expect(foodSaveErrorKey('new row for relation "food_items" violates check constraint "macro_mass"')).toBe('food_err_macros');
    expect(foodSaveErrorKey('violates check constraint "food_items_calories_kcal_check"')).toBe('food_err_kcal');
  });
  it('maps network failures', () => expect(foodSaveErrorKey('TypeError: Failed to fetch')).toBe('food_err_network'));
  it('leaves unknown errors alone', () => expect(foodSaveErrorKey('something odd')).toBeNull());
});
