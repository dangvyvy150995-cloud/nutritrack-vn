import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Copy, ChefHat, NotebookPen } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, ConfirmButton, EmptyState, fmt, Modal, NumberInput, PageHeader, Spinner, TextInput } from '@/components/ui';
import { FoodPicker, MacroLine } from '@/components/FoodPicker';
import type { Macros, MealType, Recipe } from '@/types';
import { recipeNutrition, roundMacros, scaleMacros } from '@/lib/calc/nutrition';
import type { RecipeInput } from '@/lib/data';

type Draft = RecipeInput;
const blank = (): Draft => ({ name: '', description: '', servings: 1, final_weight_g: null, ingredients: [] });

export default function Recipes() {
  const { t, backend, toast } = useApp();
  const [list, setList] = useState<Recipe[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [logging, setLogging] = useState<Recipe | null>(null);

  const load = useCallback(() => { backend.listRecipes().then(setList).catch((e) => toast(e.message, 'error')); }, [backend, toast]);
  useEffect(load, [load]);

  const toDraft = (r: Recipe, copy = false): Draft => ({
    id: copy ? undefined : r.id, name: copy ? `${r.name} (copy)` : r.name, description: r.description, servings: r.servings, final_weight_g: r.final_weight_g,
    ingredients: r.ingredients.map(({ food_id, name_snapshot, grams, per100 }) => ({ food_id, name_snapshot, grams, per100 })),
  });

  const duplicate = async (r: Recipe) => {
    await backend.saveRecipe(toDraft(r, true)); load(); toast(t('saved'));
  };

  return (
    <div>
      <PageHeader title={t('nav_recipes')} actions={<button className="btn-primary" onClick={() => setDraft(blank())}><Plus size={16} />{t('new_recipe')}</button>} />
      {list == null ? <Spinner /> : list.length === 0 ? (
        <div className="card"><EmptyState icon={<ChefHat />} title={t('no_recipes')} action={<button className="btn-primary" onClick={() => setDraft(blank())}><Plus size={16} />{t('new_recipe')}</button>} /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((r) => {
            const rn = recipeNutrition(r);
            return (
              <Card key={r.id} title={r.name} action={<div className="flex">
                <button className="btn-ghost btn-sm" aria-label={t('edit')} onClick={() => setDraft(toDraft(r))}><Pencil size={14} /></button>
                <button className="btn-ghost btn-sm" aria-label={t('duplicate')} title={t('duplicate')} onClick={() => duplicate(r)}><Copy size={14} /></button>
                <ConfirmButton label={t('delete')} onConfirm={async () => { await backend.deleteRecipe(r.id); load(); toast(t('deleted')); }}><Trash2 size={14} /></ConfirmButton>
              </div>}>
                {r.description && <p className="mb-2 text-xs text-ink-500">{r.description}</p>}
                <p className="text-[11px] text-ink-400">{r.ingredients.length} {t('ingredients').toLowerCase()} · {fmt(r.servings, 2)} {t('servings').toLowerCase()} · {fmt(rn.finalWeight)} g</p>
                <div className="mt-2 rounded-xl bg-ink-50 p-2"><div className="text-[10px] font-medium uppercase text-ink-400">{t('per_serving')} ({fmt(rn.servingWeight)} g)</div><MacroLine m={rn.perServing} /></div>
                <div className="mt-1 rounded-xl bg-ink-50 p-2"><div className="text-[10px] font-medium uppercase text-ink-400">{t('per_100g')}</div><MacroLine m={rn.per100} /></div>
                <button className="btn-secondary btn-sm mt-3 w-full" onClick={() => setLogging(r)}><NotebookPen size={14} />{t('add_to_diary')}</button>
              </Card>
            );
          })}
        </div>
      )}
      {draft && <RecipeEditor draft={draft} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); load(); }} />}
      {logging && <LogRecipeModal recipe={logging} onClose={() => setLogging(null)} />}
    </div>
  );
}

function RecipeEditor({ draft: initial, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: () => void }) {
  const { t, backend, toast } = useApp();
  const [d, setD] = useState<Draft>(initial);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const rn = useMemo(() => recipeNutrition(d), [d]);
  const save = async () => {
    if (!d.name.trim()) { toast(`${t('recipe_name')}: ${t('required')}`, 'error'); return; }
    if (!d.ingredients.length) { toast(t('recipe_need_ingredient'), 'error'); return; }
    if (!(d.servings > 0)) { toast(`${t('servings')}: > 0`, 'error'); return; }
    setBusy(true);
    try { await backend.saveRecipe({ ...d, name: d.name.trim() }); toast(t('saved')); onSaved(); } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  const Row = ({ label, m }: { label: string; m: Macros }) => (
    <tr className="border-t border-ink-100"><td className="py-1.5 pr-2 text-xs text-ink-500">{label}</td>
      {(['calories', 'protein', 'carbs', 'fat', 'fiber'] as const).map((k) => <td key={k} className="py-1.5 text-right tabular text-xs">{fmt(m[k], k === 'calories' ? 0 : 1)}</td>)}</tr>
  );
  return (
    <Modal open onClose={onClose} title={d.id ? t('edit') : t('new_recipe')} wide
      footer={<><button className="btn-secondary" onClick={onClose}>{t('cancel')}</button><button className="btn-primary" disabled={busy} onClick={save}>{t('save')}</button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label={`${t('recipe_name')} *`} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={200} placeholder="Bún hải sản nhà làm" />
          <TextInput label={t('description')} value={d.description ?? ''} onChange={(e) => setD({ ...d, description: e.target.value })} />
          <NumberInput label={`${t('servings')} *`} value={d.servings} onChange={(v) => setD({ ...d, servings: v ?? 0 })} min={0.25} step="0.25" />
          <NumberInput label={t('final_weight')} value={d.final_weight_g} onChange={(v) => setD({ ...d, final_weight_g: v && v > 0 ? v : null })} min={1} hint={t('final_weight_hint')} placeholder={String(Math.round(rn.ingredientWeight))} />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">{t('ingredients')}</h3><button className="btn-secondary btn-sm" onClick={() => setPicker(true)}><Plus size={14} />{t('add_ingredient')}</button></div>
          {d.ingredients.length === 0 ? <p className="rounded-xl border border-dashed border-ink-200 py-6 text-center text-xs text-ink-400">{t('recipe_need_ingredient')}</p> : (
            <ul className="divide-y divide-ink-100 rounded-xl border border-ink-100">
              {d.ingredients.map((ing, i) => (
                <li key={i} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1"><div className="truncate text-sm">{ing.name_snapshot}</div><MacroLine m={scaleMacros(ing.per100, ing.grams)} /></div>
                  <input type="number" min={0} step="any" aria-label={`${ing.name_snapshot} (g)`} className="input w-24 tabular" value={ing.grams || ''}
                    onChange={(e) => setD({ ...d, ingredients: d.ingredients.map((x, k) => (k === i ? { ...x, grams: Number(e.target.value) } : x)) })} />
                  <span className="text-xs text-ink-400">g</span>
                  <button className="btn-ghost btn-sm text-red-600" aria-label={t('delete')} onClick={() => setD({ ...d, ingredients: d.ingredients.filter((_, k) => k !== i) })}><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="overflow-x-auto rounded-xl bg-ink-50 p-3">
          <table className="w-full min-w-[420px]">
            <thead><tr className="text-[10px] uppercase text-ink-400"><th></th><th className="text-right">kcal</th><th className="text-right">{t('protein')}</th><th className="text-right">{t('carbs')}</th><th className="text-right">{t('fat')}</th><th className="text-right">{t('fiber')}</th></tr></thead>
            <tbody>
              <Row label={`${t('total')} (${fmt(rn.finalWeight)} g)`} m={rn.total} />
              <Row label={`${t('per_serving')} (${fmt(rn.servingWeight)} g)`} m={rn.perServing} />
              <Row label={t('per_100g')} m={rn.per100} />
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-ink-500">{t('ingredient_weight')}: {fmt(rn.ingredientWeight)} g · {t('yield')}: {fmt(rn.yieldFactor, 2)}</p>
        </div>
      </div>
      <FoodPicker open={picker} onClose={() => setPicker(false)} showMeal={false} allowRecipes={false} title={t('add_ingredient')}
        onPick={(it) => { setD((x) => ({ ...x, ingredients: [...x.ingredients, { food_id: it.food_id!, name_snapshot: it.name, grams: it.grams, per100: it.per100 }] })); setPicker(false); }} />
    </Modal>
  );
}

function LogRecipeModal({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const { t, backend, today, toast } = useApp();
  const rn = recipeNutrition(recipe);
  const [date, setDate] = useState(today);
  const [meal, setMeal] = useState<MealType>('lunch');
  const [servings, setServings] = useState(1);
  const grams = rn.servingWeight * servings;
  const save = async () => {
    await backend.addDiaryEntries([{ entry_date: date, meal_type: meal, food_id: null, recipe_id: recipe.id, name_snapshot: recipe.name, grams: Math.round(grams * 10) / 10, serving_label: 'khẩu phần công thức', serving_qty: servings, per100: rn.per100 }]);
    toast(t('saved')); onClose();
  };
  return (
    <Modal open onClose={onClose} title={`${t('add_to_diary')}: ${recipe.name}`} footer={<><button className="btn-secondary" onClick={onClose}>{t('cancel')}</button><button className="btn-primary" disabled={!(grams > 0)} onClick={save}>{t('add')}</button></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className="label" htmlFor="ld">{t('date')}</label><input id="ld" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label className="label" htmlFor="lm">{t('add_to')}</label><select id="lm" className="input" value={meal} onChange={(e) => setMeal(e.target.value as MealType)}>{(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((m) => <option key={m} value={m}>{t(m)}</option>)}</select></div>
        <NumberInput label={t('servings_to_log')} value={servings} onChange={(v) => setServings(v ?? 0)} min={0.25} step="0.25" />
      </div>
      <div className="mt-3 rounded-xl bg-ink-50 p-3"><div className="text-xs text-ink-500">{fmt(grams)} g</div><MacroLine m={roundMacros(scaleMacros(rn.per100, grams))} /></div>
    </Modal>
  );
}
