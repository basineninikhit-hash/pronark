import { useState, type ReactNode } from 'react';
import { Bell, Copy, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FormField, SectionHeading } from '@/components/pronark';
import { isFirstOfMonth, type Profile, type ReportPreference } from '@/lib/domain';

export function SettingsPage({ profile, today, busy, hasPartner, issued, pushStatus, onEditGoals, onInvite, onCheckPush, onEnablePush, report, children }: {
  profile: Profile; today: string; busy: boolean; hasPartner: boolean; issued: string; pushStatus: string;
  onEditGoals: () => void; onInvite: () => void; onCheckPush: () => void; onEnablePush: () => void; report: ReactNode; children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      {children}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <SectionHeading title="Group and settings" description="Accounting days follow America/New_York. Rewards and schedules change on the first calendar day of each month." />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 p-3 text-sm">
            <span>Step goal <strong className="tabular">{profile.step_goal?.toLocaleString()}</strong> · Water goal <strong className="tabular">{profile.water_quantity} {profile.water_unit}</strong></span>
            {isFirstOfMonth(today) ? <Button variant="outline" size="sm" onClick={onEditGoals}>Edit monthly goals</Button> : <span className="text-xs text-muted-foreground">Monthly goal changes reopen on the first calendar day next month.</span>}
          </div>
          {!hasPartner && (
            <div className="flex flex-col gap-2">
              <Button className="self-start" disabled={busy} onClick={onInvite}>Create invitation</Button>
              {issued && (
                <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
                  <span className="text-muted-foreground">Single-use code (expires in 48 hours):</span>
                  <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs ring-1 ring-foreground/10 select-all">{issued}</code>
                  <Button variant="ghost" size="icon-sm" aria-label="Copy code" onClick={() => navigator.clipboard?.writeText(issued).catch(() => {})}><Copy /></Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-3">
          <SectionHeading title={<span className="inline-flex items-center gap-2"><Bell className="size-4" aria-hidden="true" />Phone notifications</span>} description="For iPhone, add this app to the Home Screen, open it there, then enable notifications after setup." />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={onCheckPush}>Check browser push support</Button>
            <Button onClick={onEnablePush}>Enable notifications</Button>
          </div>
          <p role="status" className="text-xs text-muted-foreground">{pushStatus}</p>
        </CardContent>
      </Card>
      {report}
    </div>
  );
}

export function WeeklyReportSettings({ preference, busy, onSaveEmail, onToggleEmail }: { preference?: ReportPreference; busy: boolean; onSaveEmail: (email: string) => Promise<boolean>; onToggleEmail: (enabled: boolean) => Promise<boolean> }) {
  const [email, setEmail] = useState(preference?.pending_email ?? preference?.verified_email ?? '');
  const state = preference?.verification_state === 'pending' ? 'Verification pending — delivery remains disabled.' : preference?.verified_email ? (preference.enabled ? 'Weekly email enabled.' : 'Email verified; weekly email off.') : 'No verified email.';
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <SectionHeading title={<span className="inline-flex items-center gap-2"><Mail className="size-4" aria-hidden="true" />Weekly email report</span>} description="Monday at 6 AM Eastern. Reports only go to a verified address."
          action={<Badge variant={preference?.verified_email && preference.enabled ? 'default' : 'secondary'}>{preference?.verified_email ? (preference.enabled ? 'On' : 'Off') : 'Not verified'}</Badge>} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <FormField label="Email address" className="flex-1"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></FormField>
          <Button disabled={busy || !email} onClick={() => onSaveEmail(email)}>Save and verify email</Button>
        </div>
        <p className="text-xs text-muted-foreground">{state}</p>
        {preference?.verified_email && <Button variant="outline" className="self-start" disabled={busy} onClick={() => onToggleEmail(!preference.enabled)}>{preference.enabled ? 'Turn off weekly email' : 'Turn on weekly email'}</Button>}
      </CardContent>
    </Card>
  );
}
