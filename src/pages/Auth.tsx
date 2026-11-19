import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '@/context/AppContext';
import { DemoBanner, LangSwitch, Logo } from '@/components/Layout';
import { TextInput } from '@/components/ui';
import { DEMO_ACCOUNT } from '@/lib/data/demo';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Shell({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useApp();
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-ink-50">
      <DemoBanner />
      <div className="mx-auto flex max-w-md flex-col px-4 py-10">
        <div className="mb-8 flex items-center justify-between"><Logo /><LangSwitch /></div>
        <div className="card p-6 sm:p-8">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-ink-500">{t('tagline')}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function ErrorBox({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{msg}</div>;
}

export function LoginPage() {
  const { backend, t } = useApp();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    if (!EMAIL_RE.test(email)) return setErr(t('invalid_email'));
    setBusy(true);
    try { await backend.signIn(email, pw); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <Shell title={t('login')}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextInput label={t('email')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <TextInput label={t('password')} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
        <ErrorBox msg={err} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? t('loading') : t('login')}</button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link to="/forgot-password" className="text-brand-600 hover:underline">{t('forgot_password')}</Link>
        <Link to="/register" className="text-brand-600 hover:underline">{t('register')}</Link>
      </div>
      {backend.mode === 'demo' && (
        <div className="mt-6 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          <p>{t('demo_account_hint')}</p>
          <p className="mt-1 font-mono">{DEMO_ACCOUNT.email} / {DEMO_ACCOUNT.password}</p>
          <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => { setEmail(DEMO_ACCOUNT.email); setPw(DEMO_ACCOUNT.password); }}>
            {t('login')} – {t('sample_data')}
          </button>
        </div>
      )}
    </Shell>
  );
}

export function RegisterPage() {
  const { backend, t, lang } = useApp();
  const [f, setF] = useState({ name: '', email: '', pw: '', pw2: '' });
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    if (!f.name.trim()) return setErr(`${t('full_name')}: ${t('required')}`);
    if (!EMAIL_RE.test(f.email)) return setErr(t('invalid_email'));
    if (f.pw.length < 8) return setErr(t('pw_min'));
    if (f.pw !== f.pw2) return setErr(t('pw_mismatch'));
    setBusy(true);
    try {
      const r = await backend.signUp(f.email.trim(), f.pw, f.name.trim(), lang);
      if (r.needsConfirmation) setDone(true);
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  if (done) return <Shell title={t('register')}><p className="text-sm text-ink-600">{t('check_email')}</p><Link to="/login" className="btn-primary mt-4 w-full">{t('login')}</Link></Shell>;
  return (
    <Shell title={t('register')}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextInput label={t('full_name')} autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <TextInput label={t('email')} type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        <TextInput label={t('password')} type="password" autoComplete="new-password" hint={t('pw_min')} value={f.pw} onChange={(e) => setF({ ...f, pw: e.target.value })} required />
        <TextInput label={t('confirm_password')} type="password" autoComplete="new-password" value={f.pw2} onChange={(e) => setF({ ...f, pw2: e.target.value })} required />
        <ErrorBox msg={err} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? t('loading') : t('register')}</button>
      </form>
      <p className="mt-4 text-sm text-ink-500">{t('have_account')} <Link to="/login" className="text-brand-600 hover:underline">{t('login')}</Link></p>
    </Shell>
  );
}

export function ForgotPasswordPage() {
  const { backend, t } = useApp();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setMsg(null);
    if (!EMAIL_RE.test(email)) return setErr(t('invalid_email'));
    try { await backend.requestPasswordReset(email.trim()); setMsg(t('reset_sent')); } catch (x) { setErr((x as Error).message); }
  };
  return (
    <Shell title={t('forgot_password')}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextInput label={t('email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <ErrorBox msg={err} />
        {msg && <div className="rounded-xl bg-brand-50 px-3 py-2 text-sm text-brand-700">{msg}</div>}
        <button className="btn-primary w-full">{t('send_reset')}</button>
      </form>
      <Link to="/login" className="mt-4 inline-block text-sm text-brand-600 hover:underline">{t('back')}</Link>
    </Shell>
  );
}

export function ResetPasswordPage() {
  const { backend, t, toast } = useApp();
  const nav = useNavigate();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    if (pw.length < 8) return setErr(t('pw_min'));
    if (pw !== pw2) return setErr(t('pw_mismatch'));
    try { await backend.updatePassword(pw); toast(t('password_updated')); nav('/'); } catch (x) { setErr((x as Error).message); }
  };
  return (
    <Shell title={t('set_new_password')}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <TextInput label={t('new_password')} type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <TextInput label={t('confirm_password')} type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        <ErrorBox msg={err} />
        <button className="btn-primary w-full">{t('save')}</button>
      </form>
    </Shell>
  );
}
