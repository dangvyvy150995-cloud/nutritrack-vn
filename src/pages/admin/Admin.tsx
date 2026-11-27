import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Upload, Plus, Pencil, Trash2, CheckCircle2, Search, ArrowUpCircle } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, ConfirmButton, fmt, Modal, PageHeader, Segmented, Spinner, StatusBadge, TextInput, NumberInput } from '@/components/ui';
import { emptyFood, FoodForm, validateFoodDraft, type FoodDraft } from '@/components/FoodForm';
import type { FoodCategory, FoodItem, VerificationStatus } from '@/types';
import { normalizeVi } from '@/lib/calc/search';
import { downloadText, parseCsv, toCsv } from '@/lib/calc/csv';
import { FOOD_CSV_COLUMNS, foodToCsvRow, validateFoodRows, type ImportResult } from '@/lib/data/foodIO';

export default function Admin() {
  const { t, backend, toast, categories, lang, reloadFoods } = useApp();
  const [tab, setTab] = useState<'foods' | 'review' | 'import' | 'categories'>('foods');
  const [foods, setFoods] = useState<FoodItem[] | null>(null);
  const [userFoods, setUserFoods] = useState<FoodItem[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<VerificationStatus | ''>('');
  const [draft, setDraft] = useState<FoodDraft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [limit, setLimit] = useState(100);

  const load = useCallback(async () => {
    try {
      const [g, u] = await Promise.all([backend.adminListAllFoods(), backend.adminListUserFoods()]);
      setFoods(g); setUserFoods(u);
    } catch (e) { toast((e as Error).message, 'error'); }
  }, [backend, toast]);
  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c = { VERIFIED: 0, ESTIMATED: 0, 'USER-ENTERED': 0 } as Record<VerificationStatus, number>;
    (foods ?? []).forEach((f) => c[f.verification_status]++);
    return c;
  }, [foods]);
  const filtered = useMemo(() => {
    const nq = normalizeVi(q);
    return (foods ?? []).filter((f) => (!status || f.verification_status === status) && (!nq || normalizeVi(`${f.food_name_vi} ${f.food_name_en} ${f.food_id}`).includes(nq)));
  }, [foods, q, status]);

  const saveDraft = async () => {
    if (!draft) return;
    const err = validateFoodDraft(draft, true);
    if (err) { toast(t(err), 'error'); return; }
    const id = draft.food_id.trim() || `food-${normalizeVi(draft.food_name_vi).replace(/\s+/g, '-').slice(0, 40)}-${Date.now().toString(36)}`;
    if (isNew && foods?.some((f) => f.food_id === id)) { toast(`ID "${id}" exists`, 'error'); return; }
    const now = new Date().toISOString();
    try {
      await backend.adminUpsertFoods([{ ...draft, food_id: id, owner_id: null, created_at: now, updated_at: now, servings: (draft.servings ?? []).map((s) => ({ ...s, food_id: id })) }]);
      setDraft(null); await load(); await reloadFoods(); toast(t('saved'));
    } catch (e) { toast((e as Error).message, 'error'); }
  };

  const exportAll = (kind: 'csv' | 'json') => {
    const list = foods ?? [];
    if (kind === 'csv') downloadText('nutritrack-foods.csv', toCsv(list.map(foodToCsvRow), FOOD_CSV_COLUMNS));
    else downloadText('nutritrack-foods.json', JSON.stringify(list.map(({ servings, ...f }) => ({ ...f, servings: servings?.map(({ label_vi, label_en, grams, is_default }) => ({ label_vi, label_en, grams, is_default })) })), null, 2), 'application/json');
  };

  const catName = (id: string) => { const c = categories.find((x) => x.id === id); return c ? `${c.code}. ${lang === 'en' ? c.name_en : c.name_vi}` : id; };

  return (
    <div>
      <PageHeader title={t('admin_title')} actions={<>
        <button className="btn-secondary" onClick={() => exportAll('csv')}><Download size={16} />{t('export_csv')}</button>
        <button className="btn-secondary" onClick={() => exportAll('json')}><Download size={16} />{t('export_json')}</button>
        <button className="btn-primary" onClick={() => { setIsNew(true); setDraft({ ...emptyFood(categories[0]?.id ?? 'home_meals'), verification_status: 'ESTIMATED' }); }}><Plus size={16} />{t('new_food')}</button>
      </>} />

      <div className="mb-5 grid grid-cols-3 gap-3">
        {(['VERIFIED', 'ESTIMATED', 'USER-ENTERED'] as const).map((s) => (
          <button key={s} onClick={() => { setTab('foods'); setStatus(status === s ? '' : s); }} className={`card p-4 text-left ${status === s ? 'ring-2 ring-brand-300' : ''}`}>
            <StatusBadge status={s} /><div className="mt-2 tabular text-2xl font-semibold">{fmt(counts[s])}</div>
            <div className="text-[11px] text-ink-400">{foods ? Math.round((counts[s] / Math.max(1, foods.length)) * 100) : 0}% · {t('verification_overview')}</div>
          </button>
        ))}
      </div>

      <div className="mb-4"><Segmented value={tab} onChange={setTab} options={[
        { value: 'foods', label: t('nav_foods') }, { value: 'review', label: `${t('user_submissions')} (${userFoods.length})` },
        { value: 'import', label: t('import') }, { value: 'categories', label: t('categories') }]} /></div>

      {foods == null ? <Spinner /> : tab === 'foods' ? (
        <Card padded={false}>
          <div className="flex flex-wrap gap-2 p-4">
            <div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
              <input className="input pl-9" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('search')} /></div>
            <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as VerificationStatus | '')} aria-label={t('verification')}>
              <option value="">{t('verification')}: {t('all')}</option>
              {(['VERIFIED', 'ESTIMATED', 'USER-ENTERED'] as const).map((s) => <option key={s} value={s}>{t(`status_${s}` as 'status_VERIFIED')}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-ink-50 text-left text-[11px] uppercase text-ink-400"><tr><th className="px-4 py-2">Món / ID</th><th>{t('category')}</th><th className="text-right">kcal</th><th className="text-right">P</th><th className="text-right">C</th><th className="text-right">F</th><th className="text-right">Fib</th><th className="px-2">{t('verification')}</th><th className="max-w-[220px]">{t('data_source')}</th><th></th></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {filtered.slice(0, limit).map((f) => (
                  <tr key={f.food_id} className="hover:bg-ink-50">
                    <td className="px-4 py-2"><div className="font-medium">{f.food_name_vi}</div><code className="text-[10px] text-ink-400">{f.food_id}</code></td>
                    <td className="text-xs text-ink-500">{catName(f.category)}</td>
                    <td className="text-right tabular">{fmt(f.calories_kcal)}</td><td className="text-right tabular">{fmt(f.protein_g, 1)}</td><td className="text-right tabular">{fmt(f.carbs_g, 1)}</td>
                    <td className="text-right tabular">{fmt(f.fat_g, 1)}</td><td className="text-right tabular">{fmt(f.fiber_g, 1)}</td>
                    <td className="px-2"><StatusBadge status={f.verification_status} /></td>
                    <td className="max-w-[220px] truncate text-[11px] text-ink-400" title={f.data_source}>{f.data_source}</td>
                    <td className="whitespace-nowrap px-2 text-right">
                      <button className="btn-ghost btn-sm" aria-label={t('edit')} onClick={() => { setIsNew(false); setDraft({ ...f }); }}><Pencil size={14} /></button>
                      {f.verification_status !== 'VERIFIED' && <button className="btn-ghost btn-sm text-brand-600" title={t('mark_verified')} aria-label={t('mark_verified')}
                        onClick={() => { setIsNew(false); setDraft({ ...f, verification_status: 'VERIFIED' }); toast(t('need_source'), 'info'); }}><CheckCircle2 size={14} /></button>}
                      <ConfirmButton label={t('delete')} onConfirm={async () => { await backend.adminDeleteFood(f.food_id); await load(); await reloadFoods(); toast(t('deleted')); }}><Trash2 size={14} /></ConfirmButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > limit && <div className="p-3 text-center"><button className="btn-secondary btn-sm" onClick={() => setLimit((l) => l + 200)}>+200</button></div>}
        </Card>
      ) : tab === 'review' ? (
        <Card title={t('user_submissions')}>
          {userFoods.length === 0 ? <p className="text-sm text-ink-400">{t('none')}</p> : (
            <ul className="divide-y divide-ink-100">
              {userFoods.map((f) => (
                <li key={f.food_id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1"><div className="font-medium">{f.food_name_vi} <StatusBadge status={f.verification_status} /></div>
                    <div className="text-[11px] text-ink-400 tabular">{fmt(f.calories_kcal)} kcal · P {f.protein_g} · C {f.carbs_g} · F {f.fat_g} · {f.data_source || '—'}</div></div>
                  <button className="btn-secondary btn-sm" onClick={() => { setIsNew(true); setDraft({ ...f, food_id: '', verification_status: 'ESTIMATED' }); }}><ArrowUpCircle size={14} />{t('promote')}</button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : tab === 'import' ? (
        <ImportPanel existingIds={new Set(foods.map((f) => f.food_id))} onDone={async () => { await load(); await reloadFoods(); }} />
      ) : (
        <CategoriesPanel />
      )}

      <Modal open={!!draft} onClose={() => setDraft(null)} title={isNew ? t('new_food') : t('edit')} wide
        footer={<><button className="btn-secondary" onClick={() => setDraft(null)}>{t('cancel')}</button><button className="btn-primary" onClick={saveDraft}>{t('save')}</button></>}>
        {draft && <>
          {isNew && <div className="mb-3"><TextInput label="food_id (slug)" value={draft.food_id} onChange={(e) => setDraft({ ...draft, food_id: e.target.value.trim() })} placeholder="auto" /></div>}
          <FoodForm value={draft} onChange={setDraft} admin />
        </>}
      </Modal>
    </div>
  );
}

function ImportPanel({ existingIds, onDone }: { existingIds: Set<string>; onDone: () => Promise<void> }) {
  const { t, backend, categories, toast } = useApp();
  const [res, setRes] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const onFile = async (file: File) => {
    const text = await file.text();
    let rows: Record<string, unknown>[];
    try {
      rows = file.name.toLowerCase().endsWith('.json') ? JSON.parse(text) : parseCsv(text);
      if (!Array.isArray(rows)) throw new Error('JSON must be an array of food objects');
    } catch (e) { toast((e as Error).message, 'error'); return; }
    setRes(validateFoodRows(rows, categories.map((c) => c.id)));
  };
  const doImport = async () => {
    if (!res?.valid.length) return;
    setBusy(true);
    try { const n = await backend.adminUpsertFoods(res.valid); toast(t('imported_n', { n })); setRes(null); await onDone(); }
    catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Card title={t('import_file')}>
      <p className="mb-3 text-xs text-ink-500">Columns: <code className="text-[11px]">{FOOD_CSV_COLUMNS.join(', ')}</code>. Lists use “|”. Servings: <code>1 bát=150|1 đĩa=250</code>. Rows without a status are imported as ESTIMATED; VERIFIED rows must name a data_source. Existing food_id values are updated.</p>
      <input ref={input} type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <button className="btn-secondary" onClick={() => input.current?.click()}><Upload size={16} />{t('import_file')}</button>
      {res && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium">{t('import_preview', { ok: res.valid.length, err: res.errors.length })} · {res.valid.filter((f) => existingIds.has(f.food_id)).length} update</p>
          {res.errors.length > 0 && <ul className="max-h-40 overflow-y-auto rounded-xl bg-red-50 p-3 text-xs text-red-700">{res.errors.slice(0, 100).map((e) => <li key={e.row}>Row {e.row}: {e.message}</li>)}</ul>}
          <button className="btn-primary" disabled={!res.valid.length || busy} onClick={doImport}>{t('import_confirm', { n: res.valid.length })}</button>
        </div>
      )}
    </Card>
  );
}

function CategoriesPanel() {
  const { t, categories, backend, reloadFoods, toast } = useApp();
  const [edit, setEdit] = useState<FoodCategory | null>(null);
  return (
    <Card title={t('manage_categories')} action={<button className="btn-secondary btn-sm" onClick={() => setEdit({ id: '', code: '', name_vi: '', name_en: '', sort_order: categories.length + 1 })}><Plus size={14} />{t('add')}</button>}>
      <ul className="divide-y divide-ink-100">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2">
            <span className="w-6 font-semibold text-brand-600">{c.code}</span>
            <div className="flex-1"><div className="text-sm font-medium">{c.name_vi}</div><div className="text-[11px] text-ink-400">{c.name_en} · <code>{c.id}</code></div></div>
            <button className="btn-ghost btn-sm" aria-label={t('edit')} onClick={() => setEdit(c)}><Pencil size={14} /></button>
          </li>
        ))}
      </ul>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={t('categories')}
        footer={<><button className="btn-secondary" onClick={() => setEdit(null)}>{t('cancel')}</button>
          <button className="btn-primary" onClick={async () => {
            if (!edit?.id.trim() || !edit.name_vi.trim()) { toast(t('required'), 'error'); return; }
            try { await backend.adminUpsertCategory({ ...edit, id: edit.id.trim() }); await reloadFoods(); setEdit(null); toast(t('saved')); } catch (e) { toast((e as Error).message, 'error'); }
          }}>{t('save')}</button></>}>
        {edit && <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="ID (slug)" value={edit.id} onChange={(e) => setEdit({ ...edit, id: e.target.value })} disabled={categories.some((c) => c.id === edit.id && edit.name_vi !== '')} />
          <TextInput label={t('code')} value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value })} maxLength={3} />
          <TextInput label={t('name_vi')} value={edit.name_vi} onChange={(e) => setEdit({ ...edit, name_vi: e.target.value })} />
          <TextInput label={t('name_en')} value={edit.name_en} onChange={(e) => setEdit({ ...edit, name_en: e.target.value })} />
          <NumberInput label={t('sort')} value={edit.sort_order} onChange={(v) => setEdit({ ...edit, sort_order: v ?? 0 })} step="1" />
        </div>}
      </Modal>
    </Card>
  );
}
