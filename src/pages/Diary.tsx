import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Copy, Save, BookmarkPlus } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, ConfirmButton, DateNav, fmt, Modal, PageHeader, Spinner } from '@/components/ui';
import { AmountPanel, FoodPicker, MacroLine, type PickedItem } from '@/components/FoodPicker';
import type { DiaryEntry, MealType, SavedMeal } from '@/types';
import { dailyTotals, entryMacros, remaining, sumMacros } from '@/lib/calc/nutrition';
import { addDays, formatDate } from '@/lib/calc/dates';

const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export default function Diary() {
  const { t, backend, today, goalMacros, toast, foodById, lang } = useApp();
  const [date, setDate] = useState(today);
  const [entries, setEntries] = useState<DiaryEntry[] | null>(null);
  const [pickMeal, setPickMeal] = useState<MealType | null>(null);
  const [editing, setEditing] = useState<DiaryEntry | null>(null);
  const [copyOpen, setCopyOpen] = useState<MealType | 'all' | null>(null);
  const [saveMealOf, setSaveMealOf] = useState<MealType | null>(null);
  const [savedOpen, setSavedOpen] = useState<MealType | null>(null);

  const load = useCallback(() => {
    setEntries(null);
    backend.listDiary(date, date).then(setEntries).catch((e) => toast(e.message, 'error'));
  }, [backend, date, toast]);
  useEffect(load, [load]);

  const totals = useMemo(() => dailyTotals(entries ?? []), [entries]);
  const rem = goalMacros ? remaining(goalMacros, totals) : null;

  const add = async (it: PickedItem) => {
    const created = await backend.addDiaryEntries([{ entry_date: date, meal_type: it.meal, food_id: it.food_id, recipe_id: it.recipe_id, name_snapshot: it.name, grams: it.grams, serving_label: it.serving_label, serving_qty: it.serving_qty, per100: it.per100 }]);
    setEntries((e) => [...(e ?? []), ...created]);
    toast(t('saved'));
  };

  const del = async (id: string) => {
    await backend.deleteDiaryEntry(id);
    setEntries((e) => (e ?? []).filter((x) => x.id !== id));
    toast(t('deleted'));
  };

  const copyFrom = async (fromDate: string, meal: MealType | 'all') => {
    const src = (await backend.listDiary(fromDate, fromDate)).filter((e) => meal === 'all' || e.meal_type === meal);
    if (!src.length) { toast(t('nothing_to_copy'), 'info'); return; }
    const created = await backend.addDiaryEntries(src.map((e) => ({ entry_date: date, meal_type: e.meal_type, food_id: e.food_id, recipe_id: e.recipe_id, name_snapshot: e.name_snapshot, grams: e.grams, serving_label: e.serving_label, serving_qty: e.serving_qty, per100: e.per100 })));
    setEntries((e) => [...(e ?? []), ...created]);
    toast(t('copied_n', { n: created.length }));
  };

  const displayName = (e: DiaryEntry) => {
    const f = e.food_id ? foodById.get(e.food_id) : null;
    return lang === 'en' && f?.food_name_en ? f.food_name_en : e.name_snapshot;
  };

  return (
    <div>
      <PageHeader title={t('nav_diary')} subtitle={formatDate(date, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={<>
          <DateNav value={date} onChange={setDate} />
          <button className="btn-secondary" onClick={() => copyFrom(addDays(date, -1), 'all')}><Copy size={16} />{t('copy_prev_day')}</button>
          <button className="btn-secondary" onClick={() => setCopyOpen('all')}><Copy size={16} />{t('copy_from')}</button>
        </>} />

      <div className="card mb-5 grid grid-cols-2 gap-3 p-4 sm:grid-cols-5">
        {([['calories', 'kcal', 0], ['protein', 'g', 1], ['carbs', 'g', 1], ['fat', 'g', 1], ['fiber', 'g', 1]] as const).map(([k, u, d]) => (
          <div key={k} className="text-center">
            <div className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{t(k)}</div>
            <div className="tabular text-lg font-semibold">{fmt(totals[k], d)} <span className="text-xs font-normal text-ink-400">{u}</span></div>
            {goalMacros && rem && (
              <div className={`tabular text-[11px] ${rem[k] < 0 ? 'text-accent-600' : 'text-ink-500'}`}>
                {rem[k] < 0 ? t('over') : t('remaining')} {fmt(Math.abs(rem[k]), d)} / {fmt(goalMacros[k])}
              </div>
            )}
          </div>
        ))}
      </div>

      {entries == null ? <Spinner /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {MEALS.map((m) => {
            const list = entries.filter((e) => e.meal_type === m);
            const mt = sumMacros(list.map(entryMacros));
            return (
              <Card key={m} title={<span>{t(m)} <span className="ml-1 tabular text-xs font-normal text-ink-400">{fmt(mt.calories)} kcal</span></span>}
                action={<div className="flex gap-1">
                  <button className="btn-ghost btn-sm" title={t('copy_from')} aria-label={t('copy_from')} onClick={() => setCopyOpen(m)}><Copy size={14} /></button>
                  <button className="btn-ghost btn-sm" title={t('log_saved_meal')} aria-label={t('log_saved_meal')} onClick={() => setSavedOpen(m)}><BookmarkPlus size={14} /></button>
                  {list.length > 0 && <button className="btn-ghost btn-sm" title={t('save_meal')} aria-label={t('save_meal')} onClick={() => setSaveMealOf(m)}><Save size={14} /></button>}
                  <button className="btn-primary btn-sm whitespace-nowrap" onClick={() => setPickMeal(m)}><Plus size={14} />{t('add_food')}</button>
                </div>}>
                {list.length === 0 ? <p className="py-4 text-center text-xs text-ink-400">{t('empty_meal')}</p> : (
                  <ul className="divide-y divide-ink-100">
                    {list.map((e) => {
                      const mm = entryMacros(e);
                      return (
                        <li key={e.id} className="flex items-start gap-2 py-2">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{displayName(e)}</div>
                            <div className="text-[11px] text-ink-400 tabular">
                              {e.serving_label && e.serving_qty ? `${fmt(e.serving_qty, 2)} × ${e.serving_label} · ` : ''}{fmt(e.grams, 1)} g
                            </div>
                            <MacroLine m={mm} />
                          </div>
                          <button className="btn-ghost btn-sm" aria-label={t('edit')} onClick={() => setEditing(e)}><Pencil size={14} /></button>
                          <ConfirmButton onConfirm={() => del(e.id)} label={t('delete')}><Trash2 size={14} /></ConfirmButton>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <FoodPicker open={!!pickMeal} onClose={() => setPickMeal(null)} defaultMeal={pickMeal ?? 'breakfast'} onPick={async (it) => { await add(it); setPickMeal(null); }} />
      <EditEntryModal entry={editing} onClose={() => setEditing(null)} onSaved={(u) => { setEntries((es) => (es ?? []).map((x) => (x.id === u.id ? u : x))); setEditing(null); toast(t('saved')); }} />
      <CopyModal open={!!copyOpen} onClose={() => setCopyOpen(null)} defaultDate={addDays(date, -1)} onCopy={async (d) => { await copyFrom(d, copyOpen!); setCopyOpen(null); }} />
      <SaveMealModal open={!!saveMealOf} onClose={() => setSaveMealOf(null)} defaultName={saveMealOf ? `${t(saveMealOf)} ${formatDate(date, lang)}` : ''}
        onSave={async (name) => {
          const items = entries!.filter((e) => e.meal_type === saveMealOf).map((e) => ({ food_id: e.food_id, recipe_id: e.recipe_id, name_snapshot: e.name_snapshot, grams: e.grams, serving_label: e.serving_label, serving_qty: e.serving_qty, per100: e.per100 }));
          await backend.saveMeal(name, items); setSaveMealOf(null); toast(t('saved'));
        }} />
      <SavedMealsModal meal={savedOpen} onClose={() => setSavedOpen(null)} onLog={async (sm) => {
        const created = await backend.addDiaryEntries(sm.items.map((i) => ({ ...i, entry_date: date, meal_type: savedOpen! })));
        setEntries((e) => [...(e ?? []), ...created]); setSavedOpen(null); toast(t('copied_n', { n: created.length }));
      }} />
    </div>
  );
}

function EditEntryModal({ entry, onClose, onSaved }: { entry: DiaryEntry | null; onClose: () => void; onSaved: (e: DiaryEntry) => void }) {
  const { t, backend, foodById, toast } = useApp();
  const [grams, setGrams] = useState(0);
  const [meal, setMeal] = useState<MealType>('breakfast');
  useEffect(() => { if (entry) { setGrams(entry.grams); setMeal(entry.meal_type); } }, [entry]);
  if (!entry) return null;
  const food = entry.food_id ? foodById.get(entry.food_id) : undefined;
  const save = async (g: number, label: string | null, qty: number | null, m: MealType) => {
    try { onSaved(await backend.updateDiaryEntry(entry.id, { grams: g, serving_label: label, serving_qty: qty, meal_type: m })); }
    catch (e) { toast((e as Error).message, 'error'); }
  };
  return (
    <Modal open onClose={onClose} title={t('entry_edit')}>
      {food ? (
        <AmountPanel food={{ ...food, calories_kcal: entry.per100.calories, protein_g: entry.per100.protein, carbs_g: entry.per100.carbs, fat_g: entry.per100.fat, fiber_g: entry.per100.fiber }}
          initialGrams={entry.grams} defaultMeal={entry.meal_type} showMeal submitLabel={t('save')}
          onAdd={(it) => save(it.grams, it.serving_label, it.serving_qty, it.meal)} />
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-medium">{entry.name_snapshot}</p>
          <label className="label" htmlFor="eg">{t('amount_g')}</label>
          <input id="eg" type="number" min={0} step="any" className="input tabular" value={grams || ''} onChange={(e) => setGrams(Number(e.target.value))} />
          <select className="input" value={meal} onChange={(e) => setMeal(e.target.value as MealType)} aria-label={t('add_to')}>
            {MEALS.map((m) => <option key={m} value={m}>{t(m)}</option>)}
          </select>
          <button className="btn-primary w-full" disabled={!(grams > 0)} onClick={() => save(grams, null, null, meal)}>{t('save')}</button>
        </div>
      )}
    </Modal>
  );
}

function CopyModal({ open, onClose, defaultDate, onCopy }: { open: boolean; onClose: () => void; defaultDate: string; onCopy: (d: string) => Promise<void> }) {
  const { t } = useApp();
  const [d, setD] = useState(defaultDate);
  useEffect(() => { if (open) setD(defaultDate); }, [open, defaultDate]);
  return (
    <Modal open={open} onClose={onClose} title={t('copy_from')} footer={<><button className="btn-secondary" onClick={onClose}>{t('cancel')}</button><button className="btn-primary" onClick={() => onCopy(d)}>{t('copy_from')}</button></>}>
      <label className="label" htmlFor="cd">{t('date')}</label>
      <input id="cd" type="date" className="input" value={d} onChange={(e) => setD(e.target.value)} />
    </Modal>
  );
}

function SaveMealModal({ open, onClose, defaultName, onSave }: { open: boolean; onClose: () => void; defaultName: string; onSave: (n: string) => Promise<void> }) {
  const { t } = useApp();
  const [name, setName] = useState('');
  useEffect(() => { if (open) setName(defaultName); }, [open, defaultName]);
  return (
    <Modal open={open} onClose={onClose} title={t('save_meal')} footer={<><button className="btn-secondary" onClick={onClose}>{t('cancel')}</button><button className="btn-primary" disabled={!name.trim()} onClick={() => onSave(name.trim())}>{t('save')}</button></>}>
      <label className="label" htmlFor="mn">{t('meal_name')}</label>
      <input id="mn" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
    </Modal>
  );
}

function SavedMealsModal({ meal, onClose, onLog }: { meal: MealType | null; onClose: () => void; onLog: (m: SavedMeal) => Promise<void> }) {
  const { t, backend, toast } = useApp();
  const [list, setList] = useState<SavedMeal[] | null>(null);
  useEffect(() => { if (meal) backend.listSavedMeals().then(setList).catch((e) => toast(e.message, 'error')); }, [meal, backend, toast]);
  return (
    <Modal open={!!meal} onClose={onClose} title={t('saved_meals')}>
      {list == null ? <Spinner /> : list.length === 0 ? <p className="py-6 text-center text-sm text-ink-400">{t('none')}</p> : (
        <ul className="divide-y divide-ink-100">
          {list.map((m) => {
            const tot = sumMacros(m.items.map((i) => entryMacros(i)));
            return (
              <li key={m.id} className="flex items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{m.name}</div><div className="text-[11px] text-ink-400">{m.items.length} món</div><MacroLine m={tot} /></div>
                <button className="btn-primary btn-sm" onClick={() => onLog(m)}><Plus size={14} />{t('add')}</button>
                <ConfirmButton onConfirm={async () => { await backend.deleteSavedMeal(m.id); setList((l) => (l ?? []).filter((x) => x.id !== m.id)); }} label={t('delete')}><Trash2 size={14} /></ConfirmButton>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
