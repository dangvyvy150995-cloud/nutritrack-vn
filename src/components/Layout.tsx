import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { LayoutDashboard, NotebookPen, Database, ChefHat, Ruler, LineChart, Target, User, Settings, Shield, LogOut, Menu, X, Leaf, AlertTriangle, FileBarChart } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { cx, Toasts } from './ui';
import { PwaBanner, ReminderNotifier } from './PwaWidgets';
import type { DictKey } from '@/i18n/dict';

const NAV: { to: string; key: DictKey; icon: typeof LayoutDashboard; mobile?: boolean }[] = [
  { to: '/', key: 'nav_dashboard', icon: LayoutDashboard, mobile: true },
  { to: '/diary', key: 'nav_diary', icon: NotebookPen, mobile: true },
  { to: '/foods', key: 'nav_foods', icon: Database },
  { to: '/recipes', key: 'nav_recipes', icon: ChefHat },
  { to: '/body', key: 'nav_body', icon: Ruler, mobile: true },
  { to: '/progress', key: 'nav_progress', icon: LineChart, mobile: true },
  { to: '/reports', key: 'nav_reports', icon: FileBarChart },
  { to: '/goals', key: 'nav_goals', icon: Target },
  { to: '/profile', key: 'nav_profile', icon: User },
  { to: '/settings', key: 'nav_settings', icon: Settings },
];

export function DemoBanner() {
  const { backend, t } = useApp();
  if (backend.mode !== 'demo') return null;
  return (
    <div className="flex items-start gap-2 bg-amber-50 px-4 py-2 text-xs text-amber-800 border-b border-amber-200" role="status">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span>{t('demo_banner')}</span>
    </div>
  );
}

export function LangSwitch({ className }: { className?: string }) {
  const { lang, setLang } = useApp();
  return (
    <div className={cx('inline-flex rounded-lg bg-ink-100 p-0.5 text-xs font-semibold', className)} role="group" aria-label="Language">
      {(['vi', 'en'] as const).map((l) => (
        <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
          className={cx('rounded-md px-2 py-1', lang === l ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500')}>{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-500 text-white"><Leaf size={18} /></span>
      <span className="text-base font-semibold tracking-tight">NutriTrack <span className="text-brand-600">VN</span></span>
    </div>
  );
}

export default function Layout() {
  const { t, isAdmin, backend, profile } = useApp();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const items = isAdmin ? [...NAV, { to: '/admin', key: 'nav_admin' as DictKey, icon: Shield }] : NAV;

  const link = (it: (typeof items)[number], onClick?: () => void) => (
    <NavLink key={it.to} to={it.to} end={it.to === '/'} onClick={onClick}
      className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
        isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900')}>
      <it.icon size={18} />{t(it.key)}
    </NavLink>
  );

  return (
    <div className="min-h-screen">
      <DemoBanner />
      <PwaBanner />
      <ReminderNotifier />
      <div className="lg:flex">
        {/* desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-ink-100 bg-white px-4 py-5 lg:flex">
          <Logo />
          <nav className="mt-6 flex flex-1 flex-col gap-0.5 overflow-y-auto">{items.map((it) => link(it))}</nav>
          <div className="mt-4 border-t border-ink-100 pt-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="truncate text-xs text-ink-500" title={profile?.email}>{profile?.full_name || profile?.email}</span>
              <LangSwitch />
            </div>
            <button className="btn-ghost w-full justify-start" onClick={() => backend.signOut()}><LogOut size={16} />{t('logout')}</button>
          </div>
        </aside>

        {/* mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-100 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <Logo />
          <div className="flex items-center gap-2">
            <LangSwitch />
            <button className="btn-ghost btn-sm" onClick={() => setOpen(true)} aria-label={t('more')}><Menu size={20} /></button>
          </div>
        </header>

        {open && (
          <div className="fixed inset-0 z-50 bg-ink-900/40 lg:hidden" onClick={() => setOpen(false)}>
            <div className="absolute right-0 top-0 flex h-full w-72 flex-col bg-white p-4" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between"><Logo /><button className="btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label={t('close')}><X size={18} /></button></div>
              <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">{items.map((it) => link(it, () => setOpen(false)))}</nav>
              <button className="btn-ghost mt-4 justify-start" onClick={() => backend.signOut()}><LogOut size={16} />{t('logout')}</button>
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8" key={loc.pathname}>
          <div className="mx-auto max-w-6xl"><Outlet /></div>
        </main>
      </div>

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-ink-100 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.filter((n) => n.mobile).map((it) => (
          <NavLink key={it.to} to={it.to} end={it.to === '/'}
            className={({ isActive }) => cx('flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium', isActive ? 'text-brand-600' : 'text-ink-400')}>
            <it.icon size={20} /><span className="max-w-full truncate px-1">{t(it.key)}</span>
          </NavLink>
        ))}
        <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-ink-400"><Menu size={20} />{t('more')}</button>
      </nav>
      <Toasts />
    </div>
  );
}
