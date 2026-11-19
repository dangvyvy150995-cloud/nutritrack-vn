import { useEffect, useId, useRef, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { X, ChevronLeft, ChevronRight, Loader2, CheckCircle2, AlertCircle, Info, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { addDays, formatDate, RANGE_KEYS, type RangeKey } from '@/lib/calc/dates';
import type { VerificationStatus } from '@/types';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Card({ title, action, children, className, padded = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cx('card', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
          {title && <h2 className="text-sm font-semibold text-ink-800">{title}</h2>}
          {action}
        </header>
      )}
      <div className={cx(padded && 'px-5 pb-5', !title && padded && 'pt-5')}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-[11px] text-ink-400">{hint}</p>}
      {error && <p className="mt-1 text-[11px] text-red-600" role="alert">{error}</p>}
    </div>
  );
}

export function TextInput({ label, hint, error, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode; error?: string | null }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={rest.id ?? id}>
      <input id={rest.id ?? id} className={cx('input', error && 'border-red-300')} aria-invalid={!!error} {...rest} />
    </Field>
  );
}

export function NumberInput({ label, value, onChange, hint, error, step = 'any', min, max, placeholder, required, disabled }: {
  label: ReactNode; value: number | null | undefined; onChange: (v: number | null) => void; hint?: ReactNode; error?: string | null;
  step?: string | number; min?: number; max?: number; placeholder?: string; required?: boolean; disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <input id={id} type="number" inputMode="decimal" className={cx('input tabular', error && 'border-red-300')} step={step} min={min} max={max}
        placeholder={placeholder} required={required} disabled={disabled} aria-invalid={!!error}
        value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
    </Field>
  );
}

export function SelectInput({ label, options, hint, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; options: { value: string; label: string }[]; hint?: ReactNode }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select id={id} className="input" {...rest}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus(), 30);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" className={cx('flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <header className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-ink-100 px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function ConfirmButton({ onConfirm, children, className, label }: { onConfirm: () => void; children: ReactNode; className?: string; label?: string }) {
  const { t } = useApp();
  return (
    <button type="button" className={className ?? 'btn-ghost btn-sm text-red-600'} aria-label={label}
      onClick={() => { if (window.confirm(t('confirm_delete'))) onConfirm(); }}>
      {children}
    </button>
  );
}

export function ProgressBar({ value, max, color = 'bg-brand-500', overColor = 'bg-accent-500', label, unit, compact }: {
  value: number; max: number; color?: string; overColor?: string; label?: ReactNode; unit?: string; compact?: boolean;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const over = pct > 100;
  return (
    <div>
      {label && (
        <div className="mb-1 flex items-baseline justify-between text-xs">
          <span className="font-medium text-ink-700">{label}</span>
          <span className="tabular text-ink-500"><b className={cx('font-semibold', over ? 'text-accent-600' : 'text-ink-800')}>{fmt(value)}</b> / {max > 0 ? fmt(max) : '—'} {unit}</span>
        </div>
      )}
      <div className={cx('w-full overflow-hidden rounded-full bg-ink-100', compact ? 'h-1.5' : 'h-2.5')}
        role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={Math.round(max)}>
        <div className={cx('h-full rounded-full transition-all', over ? overColor : color)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

export function fmt(n: number | null | undefined, d = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });
}

export function StatCard({ icon, label, value, unit, sub, tone = 'brand' }: { icon: ReactNode; label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: 'brand' | 'accent' | 'ink' }) {
  const toneCls = tone === 'accent' ? 'bg-accent-50 text-accent-600' : tone === 'ink' ? 'bg-ink-100 text-ink-700' : 'bg-brand-50 text-brand-600';
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <span className={cx('grid h-8 w-8 place-items-center rounded-lg', toneCls)}>{icon}</span>
        <span className="text-xs font-medium text-ink-500">{label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="tabular text-2xl font-semibold tracking-tight text-ink-900">{value}</span>
        {unit && <span className="text-xs text-ink-400">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-[11px] text-ink-500">{sub}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, action }: { icon: ReactNode; title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-brand-500">{icon}</div>
      <p className="max-w-sm text-sm text-ink-500">{title}</p>
      {action}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-400"><Loader2 className="animate-spin" size={18} />{label}</div>;
}

export function StatusBadge({ status }: { status: VerificationStatus }) {
  const { t } = useApp();
  const cls = status === 'VERIFIED' ? 'bg-brand-50 text-brand-700' : status === 'ESTIMATED' ? 'bg-amber-50 text-amber-700' : 'bg-sky-50 text-sky-700';
  return <span className={cx('chip', cls)} title={status}>{t(`status_${status}` as 'status_VERIFIED')}</span>;
}

export function DateNav({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const { lang, today, t } = useApp();
  return (
    <div className="flex items-center gap-1 rounded-xl border border-ink-200 bg-white p-1">
      <button className="btn-ghost btn-sm" onClick={() => onChange(addDays(value, -1))} aria-label="Previous day"><ChevronLeft size={16} /></button>
      <input type="date" className="w-[8.5rem] border-0 bg-transparent px-1 text-sm font-medium focus:ring-0" value={value} max="2100-12-31"
        onChange={(e) => e.target.value && onChange(e.target.value)} aria-label={t('date')} />
      <button className="btn-ghost btn-sm" onClick={() => onChange(addDays(value, 1))} aria-label="Next day"><ChevronRight size={16} /></button>
      {value !== today && <button className="btn-ghost btn-sm text-brand-600" onClick={() => onChange(today)}>{t('today')}</button>}
      <span className="sr-only">{formatDate(value, lang)}</span>
    </div>
  );
}

export function RangeTabs({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) {
  const { t } = useApp();
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-ink-100 p-1" role="tablist">
      {RANGE_KEYS.map((r) => (
        <button key={r} role="tab" aria-selected={value === r} onClick={() => onChange(r)}
          className={cx('rounded-lg px-2.5 py-1 text-xs font-medium transition', value === r ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800')}>
          {t(`range_${r}` as 'range_7d')}
        </button>
      ))}
    </div>
  );
}

export function Delta({ value, unit, good, decimals = 1 }: { value: number | null; unit?: string; good?: 'good' | 'bad' | 'neutral'; decimals?: number }) {
  if (value == null) return <span className="text-ink-300">—</span>;
  const cls = good === 'good' ? 'text-brand-600 bg-brand-50' : good === 'bad' ? 'text-accent-600 bg-accent-50' : 'text-ink-600 bg-ink-100';
  const Icon = value > 0 ? ArrowUp : value < 0 ? ArrowDown : Minus;
  return (
    <span className={cx('chip gap-0.5 tabular', cls)}>
      <Icon size={11} />{value > 0 ? '+' : ''}{fmt(value, decimals)}{unit ? ` ${unit}` : ''}
    </span>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} className={cx('pointer-events-auto flex max-w-md items-center gap-2 rounded-xl px-4 py-2.5 text-sm shadow-lg',
          x.kind === 'error' ? 'bg-red-600 text-white' : x.kind === 'info' ? 'bg-ink-800 text-white' : 'bg-brand-600 text-white')}>
          {x.kind === 'error' ? <AlertCircle size={16} /> : x.kind === 'info' ? <Info size={16} /> : <CheckCircle2 size={16} />}
          {x.text}
        </div>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-xl bg-ink-100 p-1">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={cx('rounded-lg px-3 py-1 text-xs font-medium', value === o.value ? 'bg-white shadow-sm text-ink-900' : 'text-ink-500')}>{o.label}</button>
      ))}
    </div>
  );
}
