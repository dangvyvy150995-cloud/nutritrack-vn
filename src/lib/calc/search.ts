import type { FoodItem } from '@/types';

/** Lowercase, strip Vietnamese diacritics (incl. đ), collapse spaces. */
export function normalizeVi(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Plant-only food: tagged "chay" or in the vegetarian category. */
export function isVegetarian(f: FoodItem): boolean {
  return f.category === 'vegetarian' || f.search_keywords.includes('chay');
}

interface Indexed { food: FoodItem; vi: string; en: string; alt: string }

export class FoodSearchIndex {
  private items: Indexed[];
  constructor(foods: FoodItem[]) {
    this.items = foods.map((food) => ({
      food,
      vi: normalizeVi(food.food_name_vi),
      en: normalizeVi(food.food_name_en),
      alt: normalizeVi([...food.alternative_names, ...food.search_keywords].join(' | ')),
    }));
  }

  search(query: string, opts: { category?: string; prep?: string; vegOnly?: boolean; limit?: number } = {}): FoodItem[] {
    const q = normalizeVi(query);
    const tokens = q.split(' ').filter(Boolean);
    const scored: { f: FoodItem; s: number }[] = [];
    for (const it of this.items) {
      if (opts.category && it.food.category !== opts.category) continue;
      if (opts.prep && it.food.preparation_method !== opts.prep) continue;
      if (opts.vegOnly && !isVegetarian(it.food)) continue;
      if (!tokens.length) { scored.push({ f: it.food, s: 0 }); continue; }
      const s = score(it, q, tokens);
      if (s > 0) scored.push({ f: it.food, s });
    }
    scored.sort((a, b) => b.s - a.s || a.f.food_name_vi.localeCompare(b.f.food_name_vi, 'vi'));
    return scored.slice(0, opts.limit ?? 50).map((x) => x.f);
  }
}

function score(it: Indexed, q: string, tokens: string[]): number {
  if (it.vi === q || it.en === q) return 1000;
  let s = 0;
  if (it.vi.startsWith(q)) s = Math.max(s, 800);
  if (it.en.startsWith(q)) s = Math.max(s, 700);
  const viWords = it.vi.split(' ');
  if (tokens.length > 1 && viWords[0] === tokens[0] && tokens.every((t) => viWords.includes(t))) s = Math.max(s, 650);
  if (it.vi.includes(q)) s = Math.max(s, 600);
  if (it.en.includes(q)) s = Math.max(s, 500);
  if (it.alt.includes(q)) s = Math.max(s, 450);
  if (s) return s - it.vi.length * 0.5;
  const hay = `${it.vi} ${it.en} ${it.alt}`;
  const words = new Set(hay.split(/[\s|]+/));
  const allWords = tokens.every((t) => words.has(t));
  if (allWords) return 300 - it.vi.length * 0.5;
  const allPrefix = tokens.every((t) => hay.includes(t));
  if (allPrefix) return 150 - it.vi.length * 0.5;
  return 0;
}
