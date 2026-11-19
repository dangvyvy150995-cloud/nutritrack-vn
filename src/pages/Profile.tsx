import { useEffect, useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Card, NumberInput, PageHeader, SelectInput, TextInput } from '@/components/ui';
import type { ActivityLevel, Experience, FitnessGoal, Gender, UserProfile } from '@/types';
import { ageOn } from '@/lib/calc/dates';

export default function Profile() {
  const { t, profile, backend, setProfile, toast, today } = useApp();
  const [f, setF] = useState<UserProfile | null>(profile);
  const [pw, setPw] = useState({ a: '', b: '' });
  useEffect(() => setF(profile), [profile]);
  if (!f) return null;
  const set = <K extends keyof UserProfile>(k: K, v: UserProfile[K]) => setF({ ...f, [k]: v });

  const save = async () => {
    if (!f.full_name.trim()) { toast(`${t('full_name')}: ${t('required')}`, 'error'); return; }
    if (f.height_cm != null && !(f.height_cm >= 100 && f.height_cm <= 250)) { toast(`${t('height_cm')}: ${t('err_range')}`, 'error'); return; }
    if (f.current_weight_kg != null && !(f.current_weight_kg >= 20 && f.current_weight_kg <= 350)) { toast(`${t('weight_kg')}: ${t('err_range')}`, 'error'); return; }
    if (f.date_of_birth && (f.date_of_birth > today || ageOn(f.date_of_birth, today) < 13)) { toast(`${t('dob')}: ${t('err_range')}`, 'error'); return; }
    try {
      const changedBody = f.current_weight_kg !== profile!.current_weight_kg || f.height_cm !== profile!.height_cm;
      const saved = await backend.saveProfile({ ...f, full_name: f.full_name.trim() });
      // Preserve history: a weight/height change becomes a dated measurement record (old ones are never overwritten).
      if (changedBody && saved.current_weight_kg && saved.height_cm) {
        const existing = (await backend.listMeasurements()).filter((m) => m.measured_on === today);
        if (!existing.length) {
          await backend.addMeasurement({ measured_on: today, weight_kg: saved.current_weight_kg, height_cm: saved.height_cm, smm_kg: null, body_fat_mass_kg: null, body_fat_pct: null,
            waist_cm: null, hip_cm: null, visceral_fat_level: null, total_body_water_l: null, device_bmr_kcal: null, segmental_lean: null, segmental_fat: null, device: null, notes: 'Từ hồ sơ / from profile' });
        }
      }
      setProfile(saved); toast(t('saved'));
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const changePw = async () => {
    if (pw.a.length < 8) { toast(t('pw_min'), 'error'); return; }
    if (pw.a !== pw.b) { toast(t('pw_mismatch'), 'error'); return; }
    try { await backend.updatePassword(pw.a); setPw({ a: '', b: '' }); toast(t('password_updated')); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const opt = <T extends string>(vals: T[], prefix: string) => vals.map((v) => ({ value: v, label: t(`${prefix}${v}` as 'male') }));

  return (
    <div>
      <PageHeader title={t('nav_profile')} actions={<button className="btn-primary" onClick={save}>{t('save')}</button>} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title={t('nav_profile')} className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label={`${t('full_name')} *`} value={f.full_name} onChange={(e) => set('full_name', e.target.value)} maxLength={120} />
            <TextInput label={t('email')} value={f.email} disabled />
            <SelectInput label={t('gender')} value={f.gender ?? ''} onChange={(e) => set('gender', (e.target.value || null) as Gender | null)} options={[{ value: '', label: '—' }, ...opt(['male', 'female'] as Gender[], '')]} />
            <TextInput label={`${t('dob')}${f.date_of_birth ? ` (${t('age')} ${ageOn(f.date_of_birth, today)})` : ''}`} type="date" value={f.date_of_birth ?? ''} max={today} onChange={(e) => set('date_of_birth', e.target.value || null)} />
            <NumberInput label={t('height_cm')} value={f.height_cm} onChange={(v) => set('height_cm', v)} min={100} max={250} step="0.1" />
            <NumberInput label={t('weight_kg')} value={f.current_weight_kg} onChange={(v) => set('current_weight_kg', v)} min={20} max={350} step="0.1" />
            <SelectInput label={t('activity_level')} value={f.activity_level} onChange={(e) => set('activity_level', e.target.value as ActivityLevel)} options={opt(['sedentary', 'light', 'moderate', 'very', 'extreme'] as ActivityLevel[], 'act_')} />
            <SelectInput label={`${t('experience')} (${t('optional')})`} value={f.experience ?? ''} onChange={(e) => set('experience', (e.target.value || null) as Experience | null)} options={[{ value: '', label: '—' }, ...opt(['beginner', 'intermediate', 'advanced'] as Experience[], 'exp_')]} />
            <SelectInput label={t('fitness_goal')} value={f.fitness_goal} onChange={(e) => set('fitness_goal', e.target.value as FitnessGoal)} options={opt(['weight_loss', 'fat_loss', 'recomp', 'muscle_gain', 'maintenance'] as FitnessGoal[], 'goal_')} />
            <NumberInput label={t('target_weight')} value={f.target_weight_kg} onChange={(v) => set('target_weight_kg', v)} min={20} max={350} step="0.1" />
            <NumberInput label={t('target_bf')} value={f.target_body_fat_pct} onChange={(v) => set('target_body_fat_pct', v)} min={2} max={75} step="0.1" />
            <NumberInput label={`${t('target_smm')} (${t('optional')})`} value={f.target_smm_kg} onChange={(v) => set('target_smm_kg', v)} min={5} max={150} step="0.1" />
          </div>
          <p className="mt-3 text-[11px] text-ink-400">{t('profile_history_note')}</p>
        </Card>
        <Card title={t('change_password')}>
          <div className="space-y-3">
            <TextInput label={t('new_password')} type="password" autoComplete="new-password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} />
            <TextInput label={t('confirm_password')} type="password" autoComplete="new-password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} />
            <button className="btn-secondary w-full" onClick={changePw}>{t('save')}</button>
          </div>
        </Card>
      </div>
    </div>
  );
}
