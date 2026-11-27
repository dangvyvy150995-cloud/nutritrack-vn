import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UserCheck } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Card, PageHeader, Spinner } from '@/components/ui';
import { JoinCoachForm, useCoachError } from '@/components/CoachWidgets';
import type { MyCoach } from '@/types';
import { Link } from 'react-router-dom';
import { formatDate } from '@/lib/calc/dates';

/** Opened from a PT's invite link: /join?code=ABC234 */
export default function Join() {
  const { t, backend, lang } = useApp();
  const errText = useCoachError();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [mine, setMine] = useState<MyCoach | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { backend.getMyCoach().then(setMine).catch((e) => { setErr(errText(e)); setMine(null); }); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend]);
  return (
    <div>
      <PageHeader title={t('join_title')} />
      <Card className="max-w-xl" title={<span className="flex items-center gap-2"><UserCheck size={16} />{t('my_coach_title')}</span>}>
        {err ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{err}</p>
          : mine === undefined ? <Spinner />
          : mine ? <div className="space-y-3"><p className="text-sm text-ink-700">{t('my_coach_linked', { name: mine.display_name, date: formatDate(mine.linked_at.slice(0, 10), lang) })}</p>
            <Link to="/settings" className="btn-secondary btn-sm">{t('nav_settings')}</Link></div>
          : <JoinCoachForm initialCode={params.get('code') ?? ''} onJoined={() => navigate('/settings')} />}
      </Card>
    </div>
  );
}
