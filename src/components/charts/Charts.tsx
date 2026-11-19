import type { ReactNode } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, BarChart, Bar, Legend, Cell,
} from 'recharts';
import { formatDate } from '@/lib/calc/dates';
import type { BmiBand } from '@/lib/calc/body';

// Validated categorical order (dataviz validator: all checks pass on light surface).
export const SERIES = { protein: '#16803c', carbs: '#2563eb', fat: '#d9590f', fiber: '#9333ea' } as const;
export const PRIMARY = '#16803c';
export const SECONDARY = '#2563eb';
const GRID = '#e3e5e6';
const AXIS = '#7c8489';
const TARGET = '#61696e';

const axisProps = { tick: { fontSize: 11, fill: AXIS }, tickLine: false, axisLine: false } as const;
const yTick = (v: number) => (Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : String(Math.round(v * 10) / 10));
const legendText = (v: string) => <span style={{ color: '#4c5257' }}>{v}</span>;

export interface Pt { date: string; [k: string]: number | string | null }

function Tip({ active, payload, label, lang, unit, extra }: { active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: string; lang: 'vi' | 'en'; unit?: string; extra?: (d: Pt) => ReactNode }) {
  if (!active || !payload?.length || !label) return null;
  const row = (payload[0] as unknown as { payload: Pt }).payload;
  return (
    <div className="rounded-xl border border-ink-100 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-ink-800">{formatDate(label, lang, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })}</div>
      {payload.filter((p) => p.value != null).map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-ink-600">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}: <b className="tabular text-ink-900">{Number(p.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}{unit ? ` ${unit}` : ''}</b>
        </div>
      ))}
      {extra?.(row)}
    </div>
  );
}

const tickDate = (lang: 'vi' | 'en') => (d: string) => formatDate(d, lang, { day: '2-digit', month: '2-digit' });

export function TrendLine({ data, series, lang, unit, height = 240, domain, target, bands, extraTip }: {
  data: Pt[]; series: { key: string; name: string; color: string; dashed?: boolean }[]; lang: 'vi' | 'en'; unit?: string; height?: number;
  domain?: [number | string, number | string]; target?: { value: number; label: string } | null; bands?: BmiBand[]; extraTip?: (d: Pt) => ReactNode;
}) {
  return (
    <div style={{ height }} role="img" aria-label={series.map((s) => s.name).join(', ')}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          {bands?.map((b) => <ReferenceArea key={b.category} y1={b.min} y2={Math.min(b.max, 60)} fill={b.color} fillOpacity={0.18} ifOverflow="hidden" />)}
          <XAxis dataKey="date" tickFormatter={tickDate(lang)} {...axisProps} minTickGap={24} />
          <YAxis {...axisProps} domain={domain ?? ['auto', 'auto']} width={48} allowDecimals tickFormatter={yTick} />
          {target && <ReferenceLine y={target.value} stroke={TARGET} strokeDasharray="5 4" label={{ value: target.label, position: 'insideTopRight', fontSize: 10, fill: TARGET }} />}
          <Tooltip content={<Tip lang={lang} unit={unit} extra={extraTip} />} cursor={{ stroke: AXIS, strokeDasharray: '3 3' }} />
          {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} formatter={legendText} />}
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '5 4' : undefined}
              dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CalorieBars({ data, lang, target, names }: { data: Pt[]; lang: 'vi' | 'en'; target: number | null; names: { consumed: string; target: string; surplus: string; deficit: string } }) {
  return (
    <div style={{ height: 260 }} role="img" aria-label={names.consumed}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }} barCategoryGap={2}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={tickDate(lang)} {...axisProps} minTickGap={24} />
          <YAxis {...axisProps} width={48} tickFormatter={yTick} />
          {target ? <ReferenceLine y={target} stroke={TARGET} strokeDasharray="5 4" label={{ value: `${names.target} ${target}`, position: 'insideTopRight', fontSize: 10, fill: TARGET }} /> : null}
          <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<Tip lang={lang} unit="kcal" extra={(d) => target && d.calories != null ? (
            <div className="mt-1 text-ink-500">{Number(d.calories) > target ? names.surplus : names.deficit}: <b className="tabular">{Math.abs(Math.round(Number(d.calories) - target))} kcal</b></div>) : null} />} />
          <Bar dataKey="calories" name={names.consumed} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.date} fill={target && Number(d.calories) > target * 1.1 ? SERIES.fat : PRIMARY} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MacroBars({ data, lang, names }: { data: Pt[]; lang: 'vi' | 'en'; names: Record<'protein' | 'carbs' | 'fat' | 'fiber', string> }) {
  return (
    <div style={{ height: 260 }} role="img" aria-label="macros">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }} barGap={2}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={tickDate(lang)} {...axisProps} minTickGap={24} />
          <YAxis {...axisProps} width={44} unit="g" />
          <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<Tip lang={lang} unit="g" />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} formatter={legendText} />
          {(['protein', 'carbs', 'fat', 'fiber'] as const).map((k) => (
            <Bar key={k} dataKey={k} name={names[k]} fill={SERIES[k]} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
