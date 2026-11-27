import { useMemo, useState } from 'react';
import { Search, Star, Plus, Pencil, Trash2, Info, Loader2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { ConfirmButton, cx, fmt, Modal, PageHeader, Segmented, Spinner, StatusBadge } from '@/components/ui';
import { MacroLine } from '@/components/FoodPicker';
import { emptyFood, FoodForm, foodSaveErrorKey, validateFoodDraft, type FoodDraft } from '@/components/FoodForm';
import type { FoodItem, PreparationMethod } from '@/types';
import { foodPer100 } from '@/lib/calc/nutrition';

const PREPS: PreparationMethod[] = ['raw', 'cooked', 'boiled', 'steamed', 'grilled', 'fried', 'roasted', 'stir_fried', 'braised', 'pan_seared', 'dried', 'processed', 'prepared', 'beverage'];

export default function Foods() {
  const { t, lang, foodIndex, categories, favorites, toggleFavorite, foodsLoading, foods, backend, reloadFoods, toast } = useApp();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [prep, setPrep] = useState('');
  const [veg, setVeg] = useState(false);
  const [tab, setTab] = useState<'all' | 'fav' | 'mine'>('all');
  const [detail, setDetail] = useState<FoodItem | null>(null);
  const [draft, setDraftState] = useState<FoodDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const setDraft = (d: FoodDraft | null) => { setDraftState(d); setFormError(null); };
  const [limit, setLimit] = useState(60);

  const results = useMemo(() => {
    let list = foodIndex.search(q, { category: cat || undefined, prep: prep || undefined, vegOnly: veg, limit: 1000 });
    if (tab === 'fav') list = list.filter((f) => favorites.has(f.food_id));
    if (tab === 'mine') list = list.filter((f) => f.owner_id);
    return list;
  }, [foodIndex, q, cat, prep, veg, tab, favorites]);
  const globalCount = foods.filter((f) => !f.owner_id).length;
  const verifiedCount = foods.filter((f) => !f.owner_id && f.verification_status === 'VERIFIED').length;
  const catName = (id: string) => { const c = categories.find((x) => x.id === id); return c ? (lang === 'en' ? c.name_en : c.name_vi) : id; };

  const saveDraft = async () => {
    if (!draft || saving) return;
    const err = validateFoodDraft(draft, false);
    if (err) { setFormError(t(err)); return; }
    setSaving(true); setFormError(null);
    try {
      const { food_id, verification_status: _v, ...rest } = draft;
      await backend.saveCustomFood({ ...rest, food_id: food_id || undefined });
      setDraft(null); toast(t('saved'));
      await reloadFoods();
    } catch (e) {
      const msg = (e as Error).message;
      const key = foodSaveErrorKey(msg);
      const text = key ? t(key) : `${t('error_generic')} (${msg})`;
      setFormError(text);
    } finally { setSaving(false); }
  };

  return (
    <div>
      <PageHeader title={t('nav_foods')} subtitle={`${fmt(globalCount)} món · ${categories.length} nhóm`}
        actions={<button className="btn-primary" onClick={() => setDraft(emptyFood(categories[0]?.id ?? 'home_meals'))}><Plus size={16} />{t('create_custom_food')}</button>} />

      <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800"><Info size={14} className="mt-0.5 shrink-0" />{t('db_honesty', { n: globalCount, v: verifiedCount })}</div>

      <div className="card mb-4 space-y-3 p-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <input className="input pl-9" placeholder={t('search_foods')} value={q} onChange={(e) => { setQ(e.target.value); setLimit(60); }} aria-label={t('search')} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={tab} onChange={setTab} options={[{ value: 'all', label: t('all') }, { value: 'fav', label: t('favorites') }, { value: 'mine', label: t('custom_foods') }]} />
          <select className="input w-auto py-1.5 text-xs" value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t('category')}>
            <option value="">{t('category')}: {t('all')}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.code}. {lang === 'en' ? c.name_en : c.name_vi}</option>)}
          </select>
          <select className="input w-auto py-1.5 text-xs" value={prep} onChange={(e) => setPrep(e.target.value)} aria-label={t('preparation')}>
            <option value="">{t('preparation')}: {t('all')}</option>
            {PREPS.map((p) => <option key={p} value={p}>{t(`prep_${p}` as 'prep_raw')}</option>)}
          </select>
          <button type="button" aria-pressed={veg} onClick={() => setVeg((v) => !v)} className={cx('chip cursor-pointer border', veg ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-100 text-ink-500')}>🌱 {t('veg_only')}</button>
          <span className="ml-auto text-xs text-ink-400">{results.length} kết quả</span>
        </div>
      </div>

      {foodsLoading && !foods.length ? <Spinner /> : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="hidden bg-ink-50 text-left text-[11px] uppercase tracking-wide text-ink-400 md:table-header-group">
              <tr><th className="px-4 py-2">Món</th><th className="px-2 py-2 text-right">kcal</th><th className="px-2 py-2 text-right">{t('protein')}</th><th className="px-2 py-2 text-right">{t('carbs')}</th><th className="px-2 py-2 text-right">{t('fat')}</th><th className="px-2 py-2 text-right">{t('fiber')}</th><th className="px-2 py-2"></th></tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {results.slice(0, limit).map((f) => (
                <tr key={f.food_id} className="hover:bg-ink-50">
                  <td className="px-4 py-2.5">
                    <button className="text-left" onClick={() => setDetail(f)}>
                      <div className="flex flex-wrap items-center gap-1.5"><span className="font-medium">{lang === 'en' && f.food_name_en ? f.food_name_en : f.food_name_vi}</span><StatusBadge status={f.verification_status} /></div>
                      <div className="text-[11px] text-ink-400">{catName(f.category)} · {t(`prep_${f.preparation_method}` as 'prep_raw')} · {f.serving_unit === 'ml' ? t('per_100ml') : t('per_100g')}</div>
                      <MacroLine m={foodPer100(f)} className="md:hidden" />
                    </button>
                  </td>
                  <td className="hidden px-2 text-right tabular font-semibold md:table-cell">{fmt(f.calories_kcal)}</td>
                  <td className="hidden px-2 text-right tabular md:table-cell">{fmt(f.protein_g, 1)}</td>
                  <td className="hidden px-2 text-right tabular md:table-cell">{fmt(f.carbs_g, 1)}</td>
                  <td className="hidden px-2 text-right tabular md:table-cell">{fmt(f.fat_g, 1)}</td>
                  <td className="hidden px-2 text-right tabular md:table-cell">{fmt(f.fiber_g, 1)}</td>
                  <td className="px-2 text-right whitespace-nowrap">
                    <button onClick={() => toggleFavorite(f.food_id)} className="btn-ghost btn-sm" aria-label={t('favorites')} aria-pressed={favorites.has(f.food_id)}>
                      <Star size={16} className={favorites.has(f.food_id) ? 'fill-accent-400 text-accent-400' : 'text-ink-300'} />
                    </button>
                    {f.owner_id && <>
                      <button className="btn-ghost btn-sm" aria-label={t('edit')} onClick={() => setDraft({ ...f })}><Pencil size={14} /></button>
                      <ConfirmButton label={t('delete')} onConfirm={async () => { await backend.deleteCustomFood(f.food_id); await reloadFoods(); toast(t('deleted')); }}><Trash2 size={14} /></ConfirmButton>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!results.length && <p className="py-10 text-center text-sm text-ink-400">{t('no_results')}</p>}
          {results.length > limit && <div className="p-3 text-center"><button className="btn-secondary btn-sm" onClick={() => setLimit((l) => l + 100)}>+100</button></div>}
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? (lang === 'en' && detail.food_name_en ? detail.food_name_en : detail.food_name_vi) : ''}>
        {detail && <FoodDetail f={detail} catName={catName(detail.category)} />}
      </Modal>
      <Modal open={!!draft} onClose={() => setDraft(null)} title={draft?.food_id ? t('edit') : t('create_custom_food')} wide
        footer={
          <div className="flex w-full flex-col gap-2">
            {formError && <div role="alert" data-testid="food-form-error" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setDraft(null)} disabled={saving}>{t('cancel')}</button>
              <button className="btn-primary" onClick={saveDraft} disabled={saving} aria-busy={saving}>{saving ? <><Loader2 className="animate-spin" size={16} />{t('saving')}</> : t('save')}</button>
            </div>
          </div>}>
        {draft && <FoodForm value={draft} onChange={(d) => { setDraftState(d); if (formError) setFormError(null); }} />}
      </Modal>
    </div>
  );
}

export function FoodDetail({ f, catName }: { f: FoodItem; catName: string }) {
  const { t, lang } = useApp();
  const rows: [string, React.ReactNode][] = [
    ['ID', <code key="id" className="text-xs">{f.food_id}</code>],
    [t('name_vi'), f.food_name_vi], [t('name_en'), f.food_name_en || '—'], [t('alt_names'), f.alternative_names.join(', ') || '—'],
    [t('category'), catName], [t('subcategory'), f.subcategory ?? '—'], [t('preparation'), t(`prep_${f.preparation_method}` as 'prep_raw')],
    [t('raw_or_cooked'), t(`roc_${f.raw_or_cooked}` as 'roc_raw')], [t('edible_portion'), `${Math.round(f.edible_portion * 100)}%`],
    [t('serving'), (f.servings ?? []).map((s) => `${lang === 'en' ? s.label_en : s.label_vi} = ${s.grams} ${f.serving_unit}`).join(' · ') || `${f.serving_size} ${f.serving_unit}`],
    [t('verification'), <StatusBadge key="s" status={f.verification_status} />], [t('data_source'), <span key="d" className="text-xs">{f.data_source || '—'}</span>],
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-2 rounded-xl bg-ink-50 p-3 text-center">
        {([['calories', f.calories_kcal, 'kcal'], ['protein', f.protein_g, 'g'], ['carbs', f.carbs_g, 'g'], ['fat', f.fat_g, 'g'], ['fiber', f.fiber_g, 'g']] as const).map(([k, v, u]) => (
          <div key={k}><div className="tabular text-base font-semibold">{fmt(v, 1)}</div><div className="text-[10px] text-ink-400">{t(k)} ({u})</div></div>
        ))}
        <div className="col-span-5 text-[10px] text-ink-400">{f.serving_unit === 'ml' ? t('per_100ml') : t('per_100g')} ({t('edible_weight').toLowerCase()})</div>
      </div>
      <dl className="divide-y divide-ink-100 text-sm">
        {rows.map(([k, v]) => <div key={k} className={cx('grid grid-cols-3 gap-2 py-1.5')}><dt className="text-ink-500">{k}</dt><dd className="col-span-2">{v}</dd></div>)}
      </dl>
    </div>
  );
}
