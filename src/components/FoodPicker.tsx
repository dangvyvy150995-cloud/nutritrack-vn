import { useEffect, useMemo, useState } from 'react';
import { Search, Star, ChefHat, ArrowLeft, Plus } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cx, fmt, Modal, StatusBadge, Segmented } from './ui';
import type { FoodItem, Macros, MealType, PreparationMethod, Recipe } from '@/types';
import { edibleWeight, foodPer100, recipeNutrition, roundMacros, scaleMacros, servingToGrams } from '@/lib/calc/nutrition';

export interface PickedItem {
  food_id: string | null;
  recipe_id: string | null;
  name: string;
  grams: number;
  serving_label: string | null;
  serving_qty: number | null;
  per100: Macros;
  meal: MealType;
}

const PREPS: PreparationMethod[] = ['raw', 'cooked', 'boiled', 'steamed', 'grilled', 'fried', 'roasted', 'stir_fried', 'braised', 'pan_seared', 'dried', 'processed', 'prepared', 'beverage'];

export function MacroLine({ m, className }: { m: Macros; className?: string }) {
  const { t } = useApp();
  return (
    <div className={cx('flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-500 tabular', className)}>
      <span><b className="text-ink-800">{fmt(m.calories)}</b> kcal</span>
      <span>{t('protein')} <b className="text-ink-700">{fmt(m.protein, 1)}</b>g</span>
      <span>{t('carbs')} <b className="text-ink-700">{fmt(m.carbs, 1)}</b>g</span>
      <span>{t('fat')} <b className="text-ink-700">{fmt(m.fat, 1)}</b>g</span>
      <span>{t('fiber')} <b className="text-ink-700">{fmt(m.fiber, 1)}</b>g</span>
    </div>
  );
}

export function FoodPicker({ open, onClose, onPick, defaultMeal = 'breakfast', showMeal = true, allowRecipes = true, title }: {
  open: boolean; onClose: () => void; onPick: (item: PickedItem) => Promise<void> | void; defaultMeal?: MealType; showMeal?: boolean; allowRecipes?: boolean; title?: string;
}) {
  const { t, lang, foodIndex, categories, favorites, toggleFavorite, foodsLoading, backend, foods } = useApp();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [prep, setPrep] = useState('');
  const [tab, setTab] = useState<'all' | 'fav' | 'mine' | 'recipes'>('all');
  const [sel, setSel] = useState<FoodItem | null>(null);
  const [selRecipe, setSelRecipe] = useState<Recipe | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);

  useEffect(() => {
    if (open) { setQ(''); setSel(null); setSelRecipe(null); }
    if (open && allowRecipes) backend.listRecipes().then(setRecipes).catch(() => setRecipes([]));
  }, [open, allowRecipes, backend]);

  const results = useMemo(() => {
    if (tab === 'recipes') return [];
    let list = foodIndex.search(q, { category: cat || undefined, prep: prep || undefined, limit: 80 });
    if (tab === 'fav') list = list.filter((f) => favorites.has(f.food_id));
    if (tab === 'mine') list = list.filter((f) => f.owner_id);
    if (!q && tab === 'all' && !cat && !prep) {
      const favs = foods.filter((f) => favorites.has(f.food_id));
      list = [...favs, ...list.filter((f) => !favorites.has(f.food_id))].slice(0, 80);
    }
    return list;
  }, [foodIndex, q, cat, prep, tab, favorites, foods]);

  const name = (f: FoodItem) => (lang === 'en' && f.food_name_en ? f.food_name_en : f.food_name_vi);
  const sub = (f: FoodItem) => (lang === 'en' ? f.food_name_vi : f.food_name_en);

  return (
    <Modal open={open} onClose={onClose} title={title ?? t('add_food')} wide>
      {sel ? (
        <AmountPanel food={sel} onBack={() => setSel(null)} defaultMeal={defaultMeal} showMeal={showMeal}
          onAdd={async (it) => { await onPick(it); setSel(null); }} />
      ) : selRecipe ? (
        <RecipeAmountPanel recipe={selRecipe} onBack={() => setSelRecipe(null)} defaultMeal={defaultMeal} showMeal={showMeal}
          onAdd={async (it) => { await onPick(it); setSelRecipe(null); }} />
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
            <input className="input pl-9" placeholder={t('search_foods')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('search')} autoFocus />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={tab} onChange={setTab} options={[
              { value: 'all', label: t('all') }, { value: 'fav', label: t('favorites') }, { value: 'mine', label: t('custom_foods') },
              ...(allowRecipes ? [{ value: 'recipes' as const, label: t('nav_recipes') }] : []),
            ]} />
            {tab !== 'recipes' && (
              <>
                <select className="input w-auto py-1.5 text-xs" value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t('category')}>
                  <option value="">{t('category')}: {t('all')}</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{lang === 'en' ? c.name_en : c.name_vi}</option>)}
                </select>
                <select className="input w-auto py-1.5 text-xs" value={prep} onChange={(e) => setPrep(e.target.value)} aria-label={t('preparation')}>
                  <option value="">{t('preparation')}: {t('all')}</option>
                  {PREPS.map((p) => <option key={p} value={p}>{t(`prep_${p}` as 'prep_raw')}</option>)}
                </select>
              </>
            )}
          </div>
          {tab === 'recipes' ? (
            <ul className="divide-y divide-ink-100">
              {recipes.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase())).map((r) => {
                const rn = recipeNutrition(r);
                return (
                  <li key={r.id}>
                    <button className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-ink-50" onClick={() => setSelRecipe(r)}>
                      <ChefHat size={18} className="text-brand-500" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{r.name}</div>
                        <MacroLine m={roundMacros(rn.perServing)} />
                      </div>
                      <span className="text-[11px] text-ink-400">{t('per_serving')}</span>
                    </button>
                  </li>
                );
              })}
              {!recipes.length && <li className="py-8 text-center text-sm text-ink-400">{t('no_recipes')}</li>}
            </ul>
          ) : foodsLoading && !results.length ? (
            <p className="py-8 text-center text-sm text-ink-400">{t('loading')}</p>
          ) : (
            <ul className="divide-y divide-ink-100" aria-label="results">
              {results.map((f) => (
                <li key={f.food_id} className="flex items-center gap-2">
                  <button className="flex min-w-0 flex-1 items-center gap-3 px-1 py-2.5 text-left hover:bg-ink-50" onClick={() => setSel(f)}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{name(f)}</span>
                        {f.verification_status !== 'ESTIMATED' && <StatusBadge status={f.verification_status} />}
                      </div>
                      <div className="truncate text-[11px] text-ink-400">{sub(f)} · {t(`prep_${f.preparation_method}` as 'prep_raw')}</div>
                      <MacroLine m={foodPer100(f)} />
                    </div>
                    <span className="shrink-0 text-[10px] text-ink-400">{f.serving_unit === 'ml' ? t('per_100ml') : t('per_100g')}</span>
                  </button>
                  <button onClick={() => toggleFavorite(f.food_id)} className="btn-ghost btn-sm" aria-label={t('favorites')} aria-pressed={favorites.has(f.food_id)}>
                    <Star size={16} className={favorites.has(f.food_id) ? 'fill-accent-400 text-accent-400' : 'text-ink-300'} />
                  </button>
                </li>
              ))}
              {!results.length && <li className="py-8 text-center text-sm text-ink-400">{t('no_results')}</li>}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

function MealSelect({ value, onChange }: { value: MealType; onChange: (m: MealType) => void }) {
  const { t } = useApp();
  return (
    <div>
      <span className="label">{t('add_to')}</span>
      <div className="grid grid-cols-4 gap-1">
        {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((m) => (
          <button key={m} type="button" onClick={() => onChange(m)}
            className={cx('rounded-lg border px-2 py-1.5 text-xs font-medium', value === m ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-ink-200 text-ink-600')}>{t(m)}</button>
        ))}
      </div>
    </div>
  );
}

export function AmountPanel({ food, onBack, onAdd, defaultMeal, showMeal, initialGrams, submitLabel }: {
  food: FoodItem; onBack?: () => void; onAdd: (i: PickedItem) => Promise<void> | void; defaultMeal: MealType; showMeal: boolean; initialGrams?: number; submitLabel?: string;
}) {
  const { t, lang } = useApp();
  const servings = food.servings?.length ? food.servings : [{ id: 'd', food_id: food.food_id, label_vi: `1 phần`, label_en: '1 serving', grams: food.serving_size, is_default: true }];
  const [mode, setMode] = useState<'g' | 'serving'>(initialGrams ? 'g' : 'serving');
  const [grams, setGrams] = useState<number>(initialGrams ?? food.serving_size);
  const [servingId, setServingId] = useState(servings[0].id);
  const [qty, setQty] = useState(1);
  const [includesWaste, setIncludesWaste] = useState(false);
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const [busy, setBusy] = useState(false);
  const serving = servings.find((s) => s.id === servingId) ?? servings[0];
  const rawGrams = mode === 'g' ? grams || 0 : servingToGrams(serving.grams, qty);
  const edible = includesWaste ? edibleWeight(rawGrams, food.edible_portion) : rawGrams;
  const per100 = foodPer100(food);
  const m = scaleMacros(per100, edible);
  const u = food.serving_unit;
  const valid = edible > 0 && edible <= 10000;
  const label = (s: typeof serving) => `${lang === 'en' ? s.label_en : s.label_vi} (${fmt(s.grams, 1)} ${u})`;

  return (
    <div className="space-y-4">
      {onBack && <button className="btn-ghost btn-sm -ml-2" onClick={onBack}><ArrowLeft size={14} />{t('back')}</button>}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold">{lang === 'en' && food.food_name_en ? food.food_name_en : food.food_name_vi}</h3>
          <StatusBadge status={food.verification_status} />
        </div>
        <p className="text-xs text-ink-400">{lang === 'en' ? food.food_name_vi : food.food_name_en} · {t(`prep_${food.preparation_method}` as 'prep_raw')} · {t(`roc_${food.raw_or_cooked}` as 'roc_raw')}</p>
        <MacroLine m={per100} className="mt-1" />
        <p className="text-[10px] text-ink-400">{u === 'ml' ? t('per_100ml') : t('per_100g')}</p>
      </div>
      <Segmented value={mode} onChange={setMode} options={[{ value: 'serving', label: t('serving') }, { value: 'g', label: u === 'ml' ? t('amount_ml') : t('amount_g') }]} />
      {mode === 'g' ? (
        <div>
          <label className="label" htmlFor="amt">{u === 'ml' ? t('amount_ml') : t('amount_g')}</label>
          <input id="amt" type="number" inputMode="decimal" min={0} step="any" className="input tabular" value={grams || ''} onChange={(e) => setGrams(Number(e.target.value))} />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="label" htmlFor="srv">{t('serving')}</label>
            <select id="srv" className="input" value={servingId} onChange={(e) => setServingId(e.target.value)}>
              {servings.map((s) => <option key={s.id} value={s.id}>{label(s)}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="qty">{t('quantity')}</label>
            <input id="qty" type="number" inputMode="decimal" min={0} step="0.25" className="input tabular" value={qty || ''} onChange={(e) => setQty(Number(e.target.value))} />
          </div>
          <p className="col-span-3 text-[11px] text-ink-400">{t('serving_note')}</p>
        </div>
      )}
      {food.edible_portion < 1 && (
        <label className="flex items-center gap-2 text-xs text-ink-600">
          <input type="checkbox" checked={includesWaste} onChange={(e) => setIncludesWaste(e.target.checked)} />
          {t('weight_includes_waste')} – {t('edible_portion')} {Math.round(food.edible_portion * 100)}%
        </label>
      )}
      <div className="rounded-xl bg-ink-50 p-3">
        <div className="text-xs text-ink-500">{t('nutrients_for')} <b className="tabular text-ink-800">{fmt(edible, 1)} {u}</b>{includesWaste && ` (${t('edible_weight')})`}</div>
        <div className="mt-2 grid grid-cols-5 gap-2 text-center">
          {([['calories', 'kcal'], ['protein', 'g'], ['carbs', 'g'], ['fat', 'g'], ['fiber', 'g']] as const).map(([k, unit]) => (
            <div key={k}><div className="tabular text-base font-semibold">{fmt(m[k], k === 'calories' ? 0 : 1)}</div><div className="text-[10px] text-ink-400">{t(k)} ({unit})</div></div>
          ))}
        </div>
      </div>
      {showMeal && <MealSelect value={meal} onChange={setMeal} />}
      <details className="text-[11px] text-ink-400"><summary className="cursor-pointer">{t('data_source')}</summary><p className="mt-1">{food.data_source || '—'}</p></details>
      <button className="btn-primary w-full" disabled={!valid || busy} onClick={async () => {
        setBusy(true);
        try {
          await onAdd({ food_id: food.food_id, recipe_id: null, name: food.food_name_vi, grams: Math.round(edible * 10) / 10,
            serving_label: mode === 'serving' ? serving.label_vi : null, serving_qty: mode === 'serving' ? qty : null, per100, meal });
        } finally { setBusy(false); }
      }}><Plus size={16} />{submitLabel ?? t('add')}</button>
    </div>
  );
}

function RecipeAmountPanel({ recipe, onBack, onAdd, defaultMeal, showMeal }: { recipe: Recipe; onBack: () => void; onAdd: (i: PickedItem) => Promise<void> | void; defaultMeal: MealType; showMeal: boolean }) {
  const { t } = useApp();
  const rn = recipeNutrition(recipe);
  const [servings, setServings] = useState(1);
  const [meal, setMeal] = useState<MealType>(defaultMeal);
  const grams = rn.servingWeight * (servings || 0);
  const m = scaleMacros(rn.per100, grams);
  return (
    <div className="space-y-4">
      <button className="btn-ghost btn-sm -ml-2" onClick={onBack}><ArrowLeft size={14} />{t('back')}</button>
      <h3 className="text-base font-semibold">{recipe.name}</h3>
      <MacroLine m={roundMacros(rn.per100)} /><p className="text-[10px] text-ink-400">{t('per_100g')}</p>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="rs">{t('servings_to_log')}</label>
          <input id="rs" type="number" min={0} step="0.25" className="input tabular" value={servings || ''} onChange={(e) => setServings(Number(e.target.value))} /></div>
        <div><label className="label" htmlFor="rg">{t('or_grams')}</label>
          <input id="rg" type="number" min={0} step="any" className="input tabular" value={Math.round(grams) || ''} onChange={(e) => setServings(Number(e.target.value) / rn.servingWeight)} /></div>
      </div>
      <MacroLine m={m} className="rounded-xl bg-ink-50 p-3 text-xs" />
      {showMeal && <MealSelect value={meal} onChange={setMeal} />}
      <button className="btn-primary w-full" disabled={!(grams > 0)} onClick={() => onAdd({ food_id: null, recipe_id: recipe.id, name: recipe.name, grams: Math.round(grams * 10) / 10,
        serving_label: 'khẩu phần công thức', serving_qty: servings, per100: rn.per100, meal })}><Plus size={16} />{t('add')}</button>
    </div>
  );
}
