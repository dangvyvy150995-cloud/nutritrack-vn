import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Ruler, ArrowRightLeft, Info } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, ConfirmButton, Delta, EmptyState, fmt, Modal, NumberInput, PageHeader, Spinner, TextInput } from '@/components/ui';
import type { BodyMeasurement, NewBodyMeasurement } from '@/types';
import { bmiCategory, calcBmi, compareMeasurements, trendOf, validateMeasurement, waistHipRatio } from '@/lib/calc/body';
import { formatDate } from '@/lib/calc/dates';

const SEGMENTS = ['arm_l', 'arm_r', 'trunk', 'leg_l', 'leg_r'] as const;

export default function Body() {
  const { t, backend, toast, lang, settings, profile, dataVersion } = useApp();
  const [list, setList] = useState<BodyMeasurement[] | null>(null);
  const [edit, setEdit] = useState<BodyMeasurement | 'new' | null>(null);
  const [cmp, setCmp] = useState<{ a: string; b: string }>({ a: '', b: '' });

  const load = useCallback(() => { backend.listMeasurements().then((l) => {
    setList(l);
    if (l.length >= 2) setCmp((c) => (c.a && l.some((x) => x.id === c.a) ? c : { a: l[0].id, b: l[l.length - 1].id }));
  }).catch((e) => toast(e.message, 'error')); }, [backend, toast]);
  useEffect(load, [load, dataVersion]);

  const std = settings?.bmi_standard ?? 'who';
  const desc = useMemo(() => [...(list ?? [])].sort((a, b) => b.measured_on.localeCompare(a.measured_on) || b.created_at.localeCompare(a.created_at)), [list]);
  const A = list?.find((x) => x.id === cmp.a);
  const B = list?.find((x) => x.id === cmp.b);
  const [from, to] = A && B ? (A.measured_on <= B.measured_on ? [A, B] : [B, A]) : [null, null];
  const diff = from && to ? compareMeasurements(from, to) : null;
  const wantsLoss = profile ? ['weight_loss', 'fat_loss'].includes(profile.fitness_goal) : undefined;
  const label = (m: BodyMeasurement) => `${formatDate(m.measured_on, lang)} · ${fmt(m.weight_kg, 1)} kg`;
  const catLabel = (bmi: number) => { const c = bmiCategory(bmi, std); return c ? (std === 'asian' && c.category === 'overweight' ? t('bmi_asian_overweight') : t(`bmi_${c.category}` as 'bmi_normal')) : ''; };

  return (
    <div>
      <PageHeader title={t('nav_body')} subtitle={t('no_estimate_note')} actions={<button className="btn-primary" onClick={() => setEdit('new')}><Plus size={16} />{t('new_measurement')}</button>} />
      {list == null ? <Spinner /> : list.length === 0 ? (
        <div className="card"><EmptyState icon={<Ruler />} title={t('no_measurements')} action={<button className="btn-primary" onClick={() => setEdit('new')}><Plus size={16} />{t('new_measurement')}</button>} /></div>
      ) : (
        <div className="space-y-5">
          {list.length >= 2 && (
            <Card title={<span className="flex items-center gap-2"><ArrowRightLeft size={16} />{t('compare_title')}</span>}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className="label" htmlFor="ca">{t('from')}</label><select id="ca" className="input" value={cmp.a} onChange={(e) => setCmp({ ...cmp, a: e.target.value })}>{desc.map((m) => <option key={m.id} value={m.id}>{label(m)}</option>)}</select></div>
                <div><label className="label" htmlFor="cb">{t('to')}</label><select id="cb" className="input" value={cmp.b} onChange={(e) => setCmp({ ...cmp, b: e.target.value })}>{desc.map((m) => <option key={m.id} value={m.id}>{label(m)}</option>)}</select></div>
              </div>
              {diff && from && to && (
                <div className="mt-4 overflow-x-auto">
                  <p className="mb-2 text-xs text-ink-500">{formatDate(from.measured_on, lang)} → {formatDate(to.measured_on, lang)} ({diff.days} {t('days')})</p>
                  <table className="w-full min-w-[480px] text-sm">
                    <thead className="text-left text-[11px] uppercase text-ink-400"><tr><th className="py-1"></th><th className="text-right">{t('from')}</th><th className="text-right">{t('to')}</th><th className="text-right">{t('difference')}</th></tr></thead>
                    <tbody className="divide-y divide-ink-100">
                      {([
                        ['weight', t('weight_kg'), from.weight_kg, to.weight_kg, diff.weight, 'kg'],
                        ['bmi', t('bmi'), from.bmi, to.bmi, diff.bmi, ''],
                        ['smm', t('smm_kg'), from.smm_kg, to.smm_kg, diff.smm, 'kg'],
                        ['bodyFatMass', t('bfm_kg'), from.body_fat_mass_kg, to.body_fat_mass_kg, diff.bodyFatMass, 'kg'],
                        ['bodyFatPct', t('bf_pct'), from.body_fat_pct, to.body_fat_pct, diff.bodyFatPct, '%'],
                        ['waist', t('waist_cm'), from.waist_cm, to.waist_cm, diff.waist, 'cm'],
                        ['hip', t('hip_cm'), from.hip_cm, to.hip_cm, diff.hip, 'cm'],
                      ] as const).map(([k, name, a, b, d, u]) => (
                        <tr key={k}><td className="py-2 text-ink-600">{name}</td><td className="text-right tabular">{fmt(a, 1)}</td><td className="text-right tabular">{fmt(b, 1)}</td>
                          <td className="text-right"><Delta value={d} unit={u} good={trendOf(k, d, wantsLoss)} /></td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          <Card title={t('history')} padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-ink-50 text-left text-[11px] uppercase tracking-wide text-ink-400">
                  <tr><th className="px-4 py-2">{t('measured_on')}</th><th className="px-2 text-right">kg</th><th className="px-2 text-right">BMI</th><th className="px-2 text-right">SMM</th><th className="px-2 text-right">{t('bfm_kg').split(' (')[0]}</th><th className="px-2 text-right">% mỡ</th><th className="px-2 text-right">{t('waist_cm').split(' (')[0]}</th><th className="px-2 text-right">{t('hip_cm').split(' (')[0]}</th><th className="px-2 text-right">WHR</th><th></th></tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {desc.map((m) => (
                    <tr key={m.id} className="hover:bg-ink-50">
                      <td className="px-4 py-2.5"><div className="font-medium">{formatDate(m.measured_on, lang)}</div>{m.device && <div className="text-[11px] text-ink-400">{m.device}</div>}</td>
                      <td className="px-2 text-right tabular font-semibold">{fmt(m.weight_kg, 1)}</td>
                      <td className="px-2 text-right tabular" title={catLabel(m.bmi)}>{fmt(m.bmi, 1)}</td>
                      <td className="px-2 text-right tabular">{fmt(m.smm_kg, 1)}</td>
                      <td className="px-2 text-right tabular">{fmt(m.body_fat_mass_kg, 1)}</td>
                      <td className="px-2 text-right tabular">{fmt(m.body_fat_pct, 1)}</td>
                      <td className="px-2 text-right tabular">{fmt(m.waist_cm, 1)}</td>
                      <td className="px-2 text-right tabular">{fmt(m.hip_cm, 1)}</td>
                      <td className="px-2 text-right tabular">{fmt(waistHipRatio(m.waist_cm, m.hip_cm), 2)}</td>
                      <td className="whitespace-nowrap px-2 text-right">
                        <button className="btn-ghost btn-sm" aria-label={t('edit')} onClick={() => setEdit(m)}><Pencil size={14} /></button>
                        <ConfirmButton label={t('delete')} onConfirm={async () => { await backend.deleteMeasurement(m.id); load(); toast(t('deleted')); }}><Trash2 size={14} /></ConfirmButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
      <MeasurementModal open={!!edit} existing={edit && edit !== 'new' ? edit : null} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
    </div>
  );
}

type Form = NewBodyMeasurement;

export function MeasurementModal({ open, onClose, onSaved, existing }: { open: boolean; onClose: () => void; onSaved: () => void; existing?: BodyMeasurement | null }) {
  const { t, backend, profile, today, settings, toast, setProfile } = useApp();
  const [f, setF] = useState<Form | null>(null);
  const [adv, setAdv] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    if (existing) {
      const { id: _i, user_id: _u, bmi: _b, created_at: _c, updated_at: _up, ...rest } = existing;
      setF(rest); setAdv(!!(existing.visceral_fat_level || existing.total_body_water_l || existing.device_bmr_kcal || existing.segmental_lean));
    } else {
      setF({ measured_on: today, weight_kg: profile?.current_weight_kg ?? (null as unknown as number), height_cm: profile?.height_cm ?? (null as unknown as number),
        smm_kg: null, body_fat_mass_kg: null, body_fat_pct: null, waist_cm: null, hip_cm: null, visceral_fat_level: null, total_body_water_l: null,
        device_bmr_kcal: null, segmental_lean: null, segmental_fat: null, device: null, notes: null });
      setAdv(false);
    }
  }, [open, existing, profile, today]);

  if (!open || !f) return null;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF({ ...f, [k]: v });
  const bmi = calcBmi(f.weight_kg, f.height_cm);
  const cat = bmiCategory(bmi, settings?.bmi_standard ?? 'who');
  const seg = (kind: 'segmental_lean' | 'segmental_fat', k: string, v: number | null) => {
    const cur = { ...(f[kind] ?? {}) } as Record<string, number>;
    if (v == null) delete cur[k]; else cur[k] = v;
    set(kind, Object.keys(cur).length ? cur : null);
  };

  const save = async () => {
    const issues = validateMeasurement(f);
    if (issues.length) {
      setErrors(Object.fromEntries(issues.map((i) => [i.field, i.code === 'inconsistent' ? t('err_inconsistent') : i.code === 'required' ? t('required') : t('err_range')])));
      return;
    }
    setBusy(true);
    try {
      const payload: Form = { ...f, device: f.device?.trim() || null, notes: f.notes?.trim() || null };
      if (existing) await backend.updateMeasurement(existing.id, payload); else await backend.addMeasurement(payload);
      // keep profile's "current" values in sync with the newest measurement (old values stay in profile history)
      const all = await backend.listMeasurements();
      const newest = all[all.length - 1];
      if (newest && profile && (newest.weight_kg !== profile.current_weight_kg || newest.height_cm !== profile.height_cm)) {
        setProfile(await backend.saveProfile({ current_weight_kg: newest.weight_kg, height_cm: newest.height_cm }));
      }
      toast(t('saved')); onSaved();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={existing ? t('edit') : t('new_measurement')} wide
      footer={<><button className="btn-secondary" onClick={onClose}>{t('cancel')}</button><button className="btn-primary" disabled={busy} onClick={save}>{t('save')}</button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <TextInput label={`${t('measured_on')} *`} type="date" value={f.measured_on} onChange={(e) => set('measured_on', e.target.value)} error={errors.measured_on} max="2100-12-31" />
          <NumberInput label={`${t('weight_kg')} *`} value={f.weight_kg} onChange={(v) => set('weight_kg', v as number)} min={20} max={350} step="0.1" error={errors.weight_kg} />
          <NumberInput label={`${t('height_cm')} *`} value={f.height_cm} onChange={(v) => set('height_cm', v as number)} min={100} max={250} step="0.1" error={errors.height_cm} />
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-brand-50 px-3 py-2 text-sm">
          <span className="font-medium text-brand-800">BMI: <b className="tabular">{bmi ? fmt(bmi, 1) : '—'}</b></span>
          {cat && <span className="chip bg-white text-brand-700">{t(`bmi_${cat.category}` as 'bmi_normal')}</span>}
          <span className="text-[11px] text-brand-700">{t('bmi_auto')}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <NumberInput label={t('smm_kg')} value={f.smm_kg} onChange={(v) => set('smm_kg', v)} min={1} step="0.1" error={errors.smm_kg} />
          <NumberInput label={t('bfm_kg')} value={f.body_fat_mass_kg} onChange={(v) => set('body_fat_mass_kg', v)} min={0} step="0.1" error={errors.body_fat_mass_kg} />
          <NumberInput label={t('bf_pct')} value={f.body_fat_pct} onChange={(v) => set('body_fat_pct', v)} min={2} max={75} step="0.1" error={errors.body_fat_pct} />
          <NumberInput label={t('waist_cm')} value={f.waist_cm} onChange={(v) => set('waist_cm', v)} min={30} max={250} step="0.1" error={errors.waist_cm} />
          <NumberInput label={t('hip_cm')} value={f.hip_cm} onChange={(v) => set('hip_cm', v)} min={40} max={250} step="0.1" error={errors.hip_cm} />
          <TextInput label={t('device')} value={f.device ?? ''} onChange={(e) => set('device', e.target.value)} placeholder="InBody 270" />
        </div>
        <p className="flex items-start gap-1.5 text-[11px] text-ink-500"><Info size={12} className="mt-0.5 shrink-0" />{t('no_estimate_note')}</p>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setAdv(!adv)} aria-expanded={adv}>{adv ? '−' : '+'} {t('show_advanced')}</button>
        {adv && (
          <div className="space-y-3 rounded-xl border border-ink-100 p-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <NumberInput label={t('visceral')} value={f.visceral_fat_level} onChange={(v) => set('visceral_fat_level', v)} min={0} max={60} step="0.5" />
              <NumberInput label={t('tbw')} value={f.total_body_water_l} onChange={(v) => set('total_body_water_l', v)} min={5} max={150} step="0.1" />
              <NumberInput label={t('device_bmr')} value={f.device_bmr_kcal} onChange={(v) => set('device_bmr_kcal', v)} min={500} max={5000} step="1" />
            </div>
            {(['segmental_lean', 'segmental_fat'] as const).map((kind) => (
              <div key={kind}>
                <div className="label">{t(kind)}</div>
                <div className="grid grid-cols-5 gap-2">
                  {SEGMENTS.map((s) => (
                    <NumberInput key={s} label={<span className="text-[10px]">{t(s)}</span>} value={(f[kind] as Record<string, number> | null)?.[s] ?? null} onChange={(v) => seg(kind, s, v)} min={0} step="0.01" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <TextInput label={t('notes')} value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
      </div>
    </Modal>
  );
}
