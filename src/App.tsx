import { Suspense, lazy, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { CalendarDays, ChartColumn, ChevronDown, Gift, House, LogOut, Settings as SettingsIcon, Smile, Target, UserRound, Users, type LucideProps } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetFooter } from '@/components/sheet';
import { Segmented } from '@/components/segmented';
import { Logo } from '@/components/pronark';
import { Burst, GiftBoxDoodle, MagnifierDoodle, PlantPotDoodle, Sparkle, SunDoodle } from '@/components/doodles';
import { CompanionCharacter, companionReact, toCharacterStyle } from '@/components/companion-character';
import { GoalsForm, KpiLogForm, TaskForm, TemplateForm } from '@/components/editors';
import { useSlidingIndicator } from '@/components/sliding-indicator';
import { OnboardingChecklist } from '@/components/onboarding-checklist';
import { cn } from '@/lib/utils';
import { setAppReducedMotion } from '@/lib/motion';
import { errorText, rpc, supabase, vapidPublicKey } from '@/lib/supabase';
import { dayNumber, eastDate, isDue, monthStart, settingFor, type ActivityKpi, type ActivityKpiLog, type Allocation, type BonusProgress, type Category, type ChecklistPresentation, type Completion, type Earning, type ItemAllocation, type Membership, type Profile, type Purchase, type ReportPreference, type Setting, type Task, type TaskPeriod, type Template, type View, type Wish } from '@/lib/domain';
import { reactionFor } from '@/companion-reactions';
import type { ExperienceRow, OnboardingRow } from '@/GuidedSetup';
import { getMonthSummary } from '@/lib/month-summary';
import { HomePage } from '@/pages/Home';

// Everything except Home loads on demand to keep the first paint small.
const named = <K extends string, M extends Record<K, ComponentType<any>>>(load: () => Promise<M>, key: K) => lazy(() => load().then((m) => ({ default: m[key] })));
const WelcomePage = named(() => import('@/WelcomePage'), 'WelcomePage');
const GuidedSetup = named(() => import('@/GuidedSetup'), 'GuidedSetup');
const SetupTour = named(() => import('@/SetupTour'), 'SetupTour');
const LegacySetup = named(() => import('@/pages/LegacySetup'), 'LegacySetup');
const MonthlyRecap = named(() => import('@/InsightsDashboard'), 'MonthlyRecap');
const ReactionSettings = named(() => import('@/ReactionSettings'), 'ReactionSettings');
const ReminderSettings = named(() => import('@/ReminderSettings'), 'ReminderSettings');
const GroupsPage = named(() => import('@/GroupsPage'), 'GroupsPage');
const CalendarPage = named(() => import('@/pages/Calendar'), 'CalendarPage');
const GoalsPage = named(() => import('@/pages/Goals'), 'GoalsPage');
const WalletPage = named(() => import('@/pages/Wallet'), 'WalletPage');
const ProfilePage = named(() => import('@/pages/Profile'), 'ProfilePage');
const SettingsPage = named(() => import('@/pages/Settings'), 'SettingsPage');
const WeeklyReportSettings = named(() => import('@/pages/Settings'), 'WeeklyReportSettings');
const InsightsHub = named(() => import('@/pages/InsightsHub'), 'InsightsHub');

const navIcons: Record<View, ComponentType<LucideProps>> = { Home: House, Calendar: CalendarDays, Insights: ChartColumn, Goals: Target, Wallet: Gift, Groups: Users, Profile: UserRound, Settings: SettingsIcon };
const navLabel = (v: View) => (v === 'Wallet' ? 'Rewards' : v);
const pageTitles: Record<View, string> = { Home: 'Your daily wins', Calendar: 'Your habit calendar', Insights: 'Your insights', Goals: 'My wishlist goals', Wallet: 'Your rewards', Groups: 'Your groups', Profile: 'Your profile', Settings: 'Settings' };
const pageSubtitles: Record<View, string> = {
  Home: 'Small steps today. Bigger tomorrows.',
  Calendar: 'See your progress, build consistency, and make it yours.',
  Insights: 'A snapshot of your month.',
  Goals: 'Use your wallet to fund the things you want. Assign funds whenever you’re ready.',
  Wallet: 'Use your earned funds for the things that motivate you.',
  Groups: 'Share your progress with people you trust.',
  Profile: 'Your name, monthly goals and companion.',
  Settings: 'Notifications, invitations and your account.',
};
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const sidebarViews: View[] = ['Home', 'Calendar', 'Insights', 'Goals', 'Wallet', 'Groups', 'Profile'];
const tabViews: View[] = ['Home', 'Calendar', 'Insights', 'Goals', 'Wallet', 'Profile'];

export function App() {
  const [session, setSession] = useState<Session | null>(null), [ready, setReady] = useState(false), [page, setPage] = useState<View>('Home');
  const [profiles, setProfiles] = useState<Profile[]>([]), [memberships, setMemberships] = useState<Membership[]>([]), [tasks, setTasks] = useState<Task[]>([]), [settings, setSettings] = useState<Setting[]>([]), [completions, setCompletions] = useState<Completion[]>([]);
  const [activityKpis, setActivityKpis] = useState<ActivityKpi[]>([]), [activityKpiLogs, setActivityKpiLogs] = useState<ActivityKpiLog[]>([]), [kpiReady, setKpiReady] = useState(false), [earnings, setEarnings] = useState<Earning[]>([]), [purchases, setPurchases] = useState<Purchase[]>([]);
  const [categories, setCategories] = useState<Category[]>([]), [wishes, setWishes] = useState<Wish[]>([]), [allocations, setAllocations] = useState<Allocation[]>([]), [itemAllocations, setItemAllocations] = useState<ItemAllocation[]>([]), [itemAllocationReady, setItemAllocationReady] = useState(false);
  const [bonusProgress, setBonusProgress] = useState<BonusProgress[]>([]), [bonusProgressReady, setBonusProgressReady] = useState(false), [, setTemplates] = useState<Template[]>([]), [reportPrefs, setReportPrefs] = useState<ReportPreference[]>([]), [dataReady, setDataReady] = useState(false);
  const [person, setPerson] = useState<string>(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [editor, setEditor] = useState<Task | null | undefined>(undefined), [details, setDetails] = useState<Task | null>(null), [templateTask, setTemplateTask] = useState<Task | null>(null), [goalsEditor, setGoalsEditor] = useState(false), [kpiEntry, setKpiEntry] = useState<{ task: Task; date: string } | null>(null);
  const [presentations, setPresentations] = useState<ChecklistPresentation[]>([]), [taskPeriods, setTaskPeriods] = useState<TaskPeriod[]>([]), [presentationReady, setPresentationReady] = useState(false);
  const [onboardingProgress, setOnboardingProgress] = useState<OnboardingRow | null>(null), [onboardingReady, setOnboardingReady] = useState(false), [experiencePrefs, setExperiencePrefs] = useState<ExperienceRow[]>([]);
  const [tourOpen, setTourOpen] = useState(false), [guideHidden, setGuideHidden] = useState(false);
  const [invite, setInvite] = useState(''), [issued, setIssued] = useState(''), [pushStatus, setPushStatus] = useState('Not checked');
  const [recapMonth, setRecapMonth] = useState<string | null>(null), [celebration, setCelebration] = useState('');
  const today = eastDate(), month = monthStart(today), own = session?.user.id ?? '', owner = person || own, readOnly = owner !== own;
  const ownProfile = profiles.find((p) => p.user_id === own), group = memberships.find((m) => m.user_id === own);
  const ownExperience = experiencePrefs.find((p) => p.owner_id === own);
  const characterStyle = toCharacterStyle(ownExperience?.character_style);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => { setSession(s); setPerson(s?.user.id ?? ''); });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => { setAppReducedMotion(!!ownExperience?.reduced_motion); }, [ownExperience?.reduced_motion]);
  useEffect(() => { setGuideHidden(!!own && localStorage.getItem('pronark-getting-started-hidden:' + own) === '1'); }, [own]);
  useEffect(() => {
    if (!dataReady || !ownProfile?.setup_completed_at || !own) return;
    const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
    const previous = d.toISOString().slice(0, 7) + '-01', key = 'pronark-recap-shown:' + own + ':' + previous;
    if (!localStorage.getItem(key) && getMonthSummary(own, previous, today, tasks, settings, completions).scheduled > 0) { localStorage.setItem(key, '1'); setRecapMonth(previous); }
  }, [dataReady, own, ownProfile?.setup_completed_at, today]);

  async function refresh() {
    if (!supabase || !session) return;
    const core = ['profiles', 'memberships', 'tasks', 'task_month_settings', 'completions', 'earnings'] as const;
    const results = await Promise.all(core.map((n) => supabase!.from(n).select('*')));
    const bad = results.find((r) => r.error); if (bad?.error) throw bad.error;
    setProfiles((results[0].data ?? []) as Profile[]); setMemberships((results[1].data ?? []) as Membership[]); setTasks((results[2].data ?? []) as Task[]); setSettings((results[3].data ?? []) as Setting[]); setCompletions((results[4].data ?? []) as Completion[]); setEarnings((results[5].data ?? []) as Earning[]);
    const optional = await Promise.all(['purchases', 'categories', 'wishlist_items', 'allocation_events', 'routine_templates', 'report_preferences'].map((n) => supabase!.from(n).select('*')));
    setPurchases((optional[0].data ?? []) as Purchase[]); setCategories((optional[1].data ?? []) as Category[]); setWishes((optional[2].data ?? []) as Wish[]); setAllocations((optional[3].data ?? []) as Allocation[]); setTemplates((optional[4].data ?? []) as Template[]); setReportPrefs((optional[5].data ?? []) as ReportPreference[]);
    const itemRows = await supabase.from('item_allocations').select('*'); setItemAllocations((itemRows.data ?? []) as ItemAllocation[]); setItemAllocationReady(!itemRows.error);
    const bonusRows = await supabase.from('bonus_progress_rows').select('*'); setBonusProgress((bonusRows.data ?? []) as BonusProgress[]); setBonusProgressReady(!bonusRows.error);
    const [kpiRows, kpiLogRows] = await Promise.all([supabase.from('activity_kpis').select('*'), supabase.from('activity_kpi_logs').select('*')]);
    setKpiReady(!kpiRows.error && !kpiLogRows.error); setActivityKpis((kpiRows.data ?? []) as ActivityKpi[]); setActivityKpiLogs((kpiLogRows.data ?? []) as ActivityKpiLog[]);
    const [presentationRows, periodRows] = await Promise.all([supabase.from('checklist_presentation').select('*'), supabase.from('task_periods').select('*')]);
    setPresentationReady(!presentationRows.error && !periodRows.error); setPresentations((presentationRows.data ?? []) as ChecklistPresentation[]); setTaskPeriods((periodRows.data ?? []) as TaskPeriod[]);
    const [onboarding, prefs] = await Promise.all([supabase.from('onboarding_progress').select('*').eq('owner_id', session.user.id).maybeSingle(), supabase.from('experience_preferences').select('*')]);
    setOnboardingReady(!onboarding.error && !prefs.error); setOnboardingProgress((onboarding.data ?? null) as OnboardingRow | null); setExperiencePrefs((prefs.data ?? []) as ExperienceRow[]);
    setDataReady(true);
  }
  useEffect(() => {
    if (session) { setDataReady(false); refresh().then(() => rpc('ensure_categories').then(refresh).catch(() => {})).catch((e) => { setError(errorText(e)); setDataReady(true); }); }
    else { setDataReady(false); setProfiles([]); setMemberships([]); setTasks([]); }
  }, [session?.user.id]);

  /** Runs a write, reloads data, and shows `message` as a toast (pass '' to stay quiet). */
  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(errorText(e)); setBusy(false); return false; }
    try { await refresh(); if (message) toast.success(message); }
    catch (e) { setError(`${message} The latest records could not be loaded: ${errorText(e)}. Refresh the page before making another change.`); }
    finally { setBusy(false); }
    return true;
  }
  async function signIn() {
    if (!supabase) { setError('Sign-in is not configured yet. Please connect the app to Supabase to continue.'); return; }
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: new URL(import.meta.env.BASE_URL, location.origin).href } });
    if (error) setError(error.message);
  }
  async function checkPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setPushStatus('This browser does not support the required push APIs.'); return; }
    try { await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js'); setPushStatus(`Service worker registered. Notification permission: ${Notification.permission}. Device delivery still needs an iPhone test.`); }
    catch (e) { setPushStatus(`Service worker failed: ${errorText(e)}`); }
  }
  async function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setPushStatus('This browser does not support Web Push.'); return; }
    if (!vapidPublicKey) { setPushStatus('Push subscription needs a configured VAPID public key.'); return; }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setPushStatus(`Notification permission: ${permission}. You can keep using Pronark without alerts.`); return; }
      const registration = await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js');
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const padded = vapidPublicKey + '='.repeat((4 - vapidPublicKey.length % 4) % 4);
        const bytes = Uint8Array.from(atob(padded.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes.buffer });
      }
      if (!subscription) throw new Error('Subscription unavailable.');
      const json = subscription.toJSON();
      await rpc('save_push_subscription', { p_endpoint: subscription.endpoint, p_keys: json.keys, p_user_agent: navigator.userAgent });
      await rpc('set_notification_preference', { p_enabled: true });
      setPushStatus('This device is registered for push. Actual delivery requires the configured backend worker and an HTTPS iPhone test.');
    } catch (e) { setPushStatus(`Could not enable notifications: ${errorText(e)}`); }
  }

  const visible = tasks.filter((t) => t.owner_id === owner && (!t.archive_date || t.archive_date > today));
  const due = visible.filter((t) => isDue(t, settingFor(settings, t.id, today), today));
  const presentation = presentations.find((p) => p.owner_id === owner);
  const order = (t: Task) => { const i = presentation?.ordered_ids.indexOf(t.id) ?? -1; return i < 0 ? 10000 + visible.findIndex((x) => x.id === t.id) : i; };
  const periodOf = (t: Task) => taskPeriods.find((p) => p.task_id === t.id)?.period ?? 'anytime';
  const periodRank = (p: string) => ({ morning: 0, afternoon: 1, evening: 2, anytime: 3 })[p as TaskPeriod['period']];
  const orderedDue = [...due].sort((a, b) => (presentation?.grouped ? periodRank(periodOf(a)) - periodRank(periodOf(b)) || order(a) - order(b) : order(a) - order(b)));
  const orderedIds = [...visible].sort((a, b) => order(a) - order(b)).map((t) => t.id);

  async function moveTask(t: Task, direction: number) {
    const ids = [...orderedIds], i = ids.indexOf(t.id), j = i + direction;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await run(() => rpc('save_checklist_presentation', { p_ordered_ids: ids, p_grouped: presentation?.grouped ?? false, p_expected_revision: presentation?.revision ?? 0 }), 'Checklist order saved.');
  }
  async function toggle(t: Task, date: string) {
    const existing = completions.find((c) => c.task_id === t.id && c.local_date === date);
    const next = !existing?.completed;
    if (date < today && !confirm('Please remember to be honest. Save this correction?')) return false;
    // One toast that "thinks" while saving, then turns into the result. It stays up at least
    // briefly so a fast save doesn't flash; the checkbox itself already changed on tap.
    const toastId = toast.loading(next ? 'Great job! Checking that off for you…' : 'No problem! Unchecking that for you…');
    const [saved] = await Promise.all([
      run(() => rpc('save_completion', { p_task: t.id, p_date: date, p_completed: next, p_expected_version: existing?.version ?? 0 }), ''),
      new Promise((resolve) => setTimeout(resolve, 700)),
    ]);
    if (!saved) { toast.error('Couldn’t save that. Please try again.', { id: toastId }); return false; }
    companionReact(next ? 'cheer' : 'shrug');
    let cheer: { text: string; cue: string } | null = null;
    if (next && date === today && ownExperience?.chatter === 'full') {
      const key = 'pronark-reaction:' + own + ':' + t.id + ':' + date;
      if (!localStorage.getItem(key)) { localStorage.setItem(key, '1'); cheer = reactionFor(t.reaction_category ?? 'other', t.id, date); }
    }
    toast.success(next ? 'All done and ready to go!' : 'Unchecked. You’re all set.', {
      id: toastId,
      description: cheer ? `${cheer.cue} ${cheer.text}` : undefined,
      duration: cheer ? 5000 : 2500,
    });
    if (!next || date !== today) return true;
    if (due.length && due.every((x) => x.id === t.id || completions.some((c) => c.task_id === x.id && c.local_date === today && c.completed)) && ownExperience?.chatter !== 'off') {
      const key = 'pronark-celebrated-checklist:' + own + ':' + today;
      if (!localStorage.getItem(key)) { localStorage.setItem(key, '1'); setCelebration('You finished every scheduled activity today. That is worth celebrating!'); }
    }
    return true;
  }

  const go = (view: View) => { setPage(view); window.scrollTo({ top: 0 }); };

  async function startOver() {
    const saved = await run(async () => {
      try { await rpc('start_over', { p_confirm: 'DELETE' }); }
      catch (e) {
        if (/start_over|schema cache/i.test(errorText(e))) throw new Error('Starting over needs the latest database update (202610200023_start_over.sql). Nothing was deleted.');
        throw e;
      }
    }, 'Your data was deleted. Let’s start fresh!');
    if (!saved) return false;
    // Device-only memories (shown celebrations, hidden checklist) belong to the old data too.
    for (const key of Object.keys(localStorage)) if (key.startsWith('pronark-') && key.includes(own)) localStorage.removeItem(key);
    setPerson(own); setPage('Home');
    return true;
  }

  const fallback = <Splash />;
  if (!ready) return <Splash>Loading your account…</Splash>;
  if (!supabase || !session || location.pathname === import.meta.env.BASE_URL + 'welcome')
    return <Suspense fallback={fallback}><WelcomePage signedIn={!!session} onSignIn={() => (session ? location.assign(import.meta.env.BASE_URL) : signIn())} error={error} /></Suspense>;
  if (!dataReady) return <Splash title="Loading your private group…">{error || 'Checking your saved records.'}{error && <Button className="mt-4" onClick={() => refresh().catch((e) => setError(errorText(e)))}>Retry</Button>}</Splash>;
  if (!ownProfile?.setup_completed_at)
    return <Suspense fallback={fallback}>{onboardingReady
      ? <GuidedSetup key="setup" client={supabase} progress={onboardingProgress} preference={ownExperience ?? null} setupCompleted={false} hasGroup={!!group} categories={categories.filter((x) => x.owner_id === own)} onRefresh={refresh} />
      : <LegacySetup busy={busy} error={error} invite={group ? undefined : invite} onInviteChange={setInvite}
          onJoin={group ? undefined : () => run(() => rpc('redeem_invitation', { p_token: invite }), 'Invitation accepted. Finish setting up your routine.')}
          submit={(name, goal, water, unit, items) => run(() => rpc('start_setup', { p_name: name, p_step_goal: goal, p_water_quantity: water, p_water_unit: unit, p_tasks: items }), 'Setup saved.')} />}</Suspense>;
  if (onboardingReady && onboardingProgress && !onboardingProgress.completed_at)
    return <Suspense fallback={fallback}><GuidedSetup key="goals" client={supabase} progress={onboardingProgress} preference={ownExperience ?? null} setupCompleted hasGroup={!!group} categories={categories.filter((x) => x.owner_id === own)} onRefresh={refresh} /></Suspense>;
  if (tourOpen) return <Suspense fallback={fallback}><SetupTour onClose={() => setTourOpen(false)} /></Suspense>;

  const partner = profiles.find((p) => p.user_id !== own && memberships.some((m) => m.user_id === p.user_id && memberships.some((mine) => mine.user_id === own && mine.group_id === m.group_id)));
  const ownerEarnings = earnings.filter((x) => x.owner_id === owner && x.active), ownerPurchases = purchases.filter((x) => x.owner_id === owner && !x.deleted_at);
  const earnedOn = (from: string, to: string) => ownerEarnings.filter((x) => x.earned_date >= from && x.earned_date <= to).reduce((n, x) => n + x.cents, 0);
  const weekStart = (() => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - dayNumber(today) + 1); return d.toISOString().slice(0, 10); })();
  const totalEarned = ownerEarnings.reduce((n, x) => n + x.cents, 0), totalSpent = ownerPurchases.reduce((n, x) => n + x.amount_cents, 0), balance = totalEarned - totalSpent;
  const ownerKpis = activityKpis.filter((k) => k.owner_id === owner), ownerKpiLogs = activityKpiLogs.filter((k) => k.owner_id === owner);
  const ownerProfile = profiles.find((p) => p.user_id === owner) ?? ownProfile;
  const editorSetting = editor ? settingFor(settings, editor.id, today) : undefined;
  const templateSetting = templateTask ? settingFor(settings, templateTask.id, today) : undefined;
  const kpiForEntry = kpiEntry ? activityKpis.find((k) => k.task_id === kpiEntry.task.id) : undefined;

  // Getting started: each step completes itself from the member's own records.
  const ownTaskIds = new Set(tasks.filter((t) => t.owner_id === own).map((t) => t.id));
  const firstTask = tasks.find((t) => t.owner_id === own && !t.archive_date);
  const gettingStarted = [
    { id: 'profile', title: 'Set up your profile', isCompleted: !!ownProfile.setup_completed_at },
    { id: 'activity', title: 'Add your first activity', isCompleted: ownTaskIds.size > 0, description: 'Pick a habit you want to build and give it a reward.', actionLabel: 'Add', onAction: () => setEditor(null) },
    { id: 'checkoff', title: 'Check off your first activity', isCompleted: completions.some((c) => c.completed && ownTaskIds.has(c.task_id)), description: 'Tap “Check off” next to something you did today.', actionLabel: 'Show me',
      onAction: () => document.getElementById('checklist-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
    { id: 'goal', title: 'Set a savings goal', isCompleted: categories.some((c) => c.owner_id === own && (c.general_target_cents ?? 0) > 0) || wishes.some((w) => w.owner_id === own), description: 'Choose something you’re saving toward, like a trip or new shoes.', actionLabel: 'Open goals', onAction: () => go('Goals') },
    { id: 'number', title: 'Track a number, like steps or water', isCompleted: activityKpis.some((k) => k.owner_id === own), description: 'Turn on “Track a measurable goal” when editing an activity.', actionLabel: 'Set it up',
      onAction: () => (firstTask ? setEditor(firstTask) : setEditor(null)) },
    { id: 'group', title: 'Invite someone to a group', isCompleted: memberships.some((m) => m.user_id !== own), description: 'Share progress with a partner, family or friends.', actionLabel: 'Open groups', onAction: () => go('Groups') },
  ];
  const hideGuide = () => { localStorage.setItem('pronark-getting-started-hidden:' + own, '1'); setGuideHidden(true); };

  const accountMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" className="gap-2 rounded-full pr-2 pl-1" />}>
        <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{(ownProfile.display_name || 'P').trim().slice(0, 1).toUpperCase()}</span>
        <span className="hidden max-w-32 truncate md:inline">{ownProfile.display_name || 'Profile'}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem onClick={() => go('Profile')}><UserRound />Profile</DropdownMenuItem>
        <DropdownMenuItem onClick={() => { go('Profile'); setTimeout(() => document.getElementById('companion-picker')?.scrollIntoView({ behavior: 'smooth' }), 50); }}><Smile />My companion</DropdownMenuItem>
        <DropdownMenuItem onClick={() => go('Settings')}><SettingsIcon />Settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => supabase!.auth.signOut()}><LogOut />Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="relative flex min-h-dvh bg-background">
      <div aria-hidden="true" className="pronark-blobs" />
      <Sidebar page={page} onPage={go} />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <AppBar title={page === 'Home' ? `${greeting()}, ${(ownerProfile.display_name || 'there').split(' ')[0]}!` : pageTitles[page]} subtitle={pageSubtitles[page]} decoration={page === 'Home' ? <SunDoodle className="size-10 text-ink" /> : page === 'Wallet' ? <span className="relative text-ink"><GiftBoxDoodle className="size-14" /><Sparkle className="absolute -top-1 -left-7 size-6" /></span> : page === 'Insights' ? <MagnifierDoodle className="size-14 text-ink" /> : page === 'Calendar' ? <PlantPotDoodle className="h-14 w-12 text-ink" /> : page === 'Groups' ? <Burst className="size-8 text-ink" /> : null} accountMenu={accountMenu}
          switcher={<Segmented label="Me or groups" value={page === 'Groups' ? 'groups' : 'me'} onChange={(v) => { setPerson(own); go(v === 'groups' ? 'Groups' : 'Home'); }}
            options={[{ value: 'me', label: 'Me' }, { value: 'groups', label: 'Groups' }]} />} />
        <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 overflow-x-clip px-4 pt-2 pb-32 md:px-8 md:pt-2 md:pb-12">
          {readOnly && <Alert variant="info"><AlertDescription>Viewing partner · Read-only</AlertDescription></Alert>}
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <Suspense fallback={<PageSkeleton />}>

          {page === 'Home' && <HomePage character={characterStyle} name={ownerProfile.display_name ?? 'you'} due={orderedDue} activities={visible} orderedIds={orderedIds} periods={taskPeriods}
            grouped={presentation?.grouped ?? false} presentationReady={presentationReady} onMove={moveTask}
            onGrouped={(grouped) => run(() => rpc('save_checklist_presentation', { p_ordered_ids: orderedIds, p_grouped: grouped, p_expected_revision: presentation?.revision ?? 0 }), 'Checklist view saved.')}
            onPeriod={(task, period) => run(() => rpc('save_task_period', { p_task: task.id, p_period: period, p_expected_revision: taskPeriods.find((p) => p.task_id === task.id)?.revision ?? 0 }), 'Time of day saved.')}
            settings={settings} completions={completions} kpis={ownerKpis} kpiLogs={ownerKpiLogs} today={today}
            earnedToday={earnedOn(today, today)} earnedWeek={earnedOn(weekStart, today)} earnedMonth={earnedOn(month, today)} balance={balance}
            bonusProgress={bonusProgress.filter((p) => p.owner_id === owner)} bonusProgressReady={bonusProgressReady} busy={busy} readOnly={readOnly}
            onToggle={toggle} onLog={(task, date) => setKpiEntry({ task, date })} onAdd={() => setEditor(null)} onDetails={setDetails} onWallet={() => go('Wallet')}
            intro={!readOnly && !guideHidden && <OnboardingChecklist steps={gettingStarted} onDismiss={hideGuide} />} />}
          {page === 'Calendar' && <CalendarPage owner={owner} tasks={tasks} settings={settings} completions={completions} kpis={ownerKpis} kpiLogs={ownerKpiLogs} earnings={ownerEarnings} today={today} readOnly={readOnly} busy={busy} toggle={toggle} onLog={(task, date) => setKpiEntry({ task, date })} />}
          {page === 'Insights' && (
            <InsightsHub client={supabase} owner={owner} today={today} tasks={tasks} settings={settings} completions={completions} earnings={ownerEarnings} kpis={activityKpis} kpiLogs={activityKpiLogs} readOnly={readOnly}
              onOpenRecap={() => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); setRecapMonth(d.toISOString().slice(0, 7) + '-01'); }}
              onSetReminder={() => go('Settings')} onEditTask={(task) => setEditor(task)} />
          )}
          {page === 'Goals' && <GoalsPage client={supabase} owner={owner} readOnly={readOnly} balance={balance} categories={categories} wishes={wishes} allocations={allocations} itemAllocations={itemAllocations} itemAllocationReady={itemAllocationReady} busy={busy} today={today} onRun={run} />}
          {page === 'Wallet' && (
            <>
              <WalletPage client={supabase} onReceiptSaved={refresh} readOnly={readOnly} today={today} earned={totalEarned} spent={totalSpent} balance={balance} earnings={ownerEarnings} purchases={ownerPurchases} busy={busy} error={error} onRun={run} />
            </>
          )}
          {page === 'Profile' && (
            <ProfilePage profile={ownerProfile} readOnly={readOnly} busy={busy} today={today} character={characterStyle}
              onSaveCharacter={(style) => run(async () => {
                try { await rpc('save_character_style', { p_style: style, p_expected_revision: ownExperience?.revision ?? 0 }); }
                catch (e) {
                  if (/save_character_style|schema cache/i.test(errorText(e))) throw new Error('Saving your companion’s look needs the latest database update (202610210024_companion_character.sql).');
                  throw e;
                }
              }, 'Your companion’s new look is saved.')}
              onSettings={() => go('Settings')} onEditGoals={() => setGoalsEditor(true)} onTour={() => setTourOpen(true)} onGroups={() => go('Groups')}
              onSaveName={(name) => run(() => rpc('save_profile_name', { p_name: name, p_expected_revision: ownProfile.revision }), 'Profile name saved.')}>
              {!readOnly && onboardingReady && <ReactionSettings key={own} client={supabase} tasks={tasks.filter((t) => t.owner_id === own && !t.archive_date)} preference={ownExperience ?? null} onRefresh={refresh} />}
            </ProfilePage>
          )}
          {page === 'Groups' && <GroupsPage client={supabase} owner={own} tasks={tasks.filter((t) => t.owner_id === own)} />}
          {page === 'Settings' && !readOnly && (
            <SettingsPage profile={ownProfile} today={today} busy={busy} error={error} hasPartner={!!partner} onStartOver={startOver} issued={issued} pushStatus={pushStatus}
              onEditGoals={() => setGoalsEditor(true)} onInvite={() => run(async () => { setIssued(await rpc<string>('issue_invitation')); }, 'Invitation issued.')}
              onCheckPush={checkPush} onEnablePush={enablePush}
              report={<WeeklyReportSettings preference={reportPrefs.find((p) => p.owner_id === own)} busy={busy}
                onSaveEmail={(email) => run(() => rpc('save_report_preference', { p_email: email, p_enabled: true }), 'Report preference saved. Only a verified address can receive email.')}
                onToggleEmail={(enabled) => run(() => rpc('set_weekly_report_enabled', { p_enabled: enabled }), enabled ? 'Weekly email enabled.' : 'Weekly email disabled.')} />}>
              <ReminderSettings client={supabase} owner={own} tasks={tasks.filter((t) => t.owner_id === own)} />
            </SettingsPage>
          )}
          </Suspense>
        </main>
      </div>
      <TabBar page={page} onPage={go} />

      <Sheet open={!!details} onClose={() => setDetails(null)} eyebrow="Routine details" title={details?.title} label="Activity details">
        {details && (
          <div className="flex flex-col gap-3">
            <p className="whitespace-pre-wrap text-sm">{details.description || 'No description yet.'}</p>
            <p className="text-xs text-muted-foreground">Notes can include multiline steps, product names and reminders.</p>
            {!readOnly && (
              <SheetFooter>
                <Button variant="outline" onClick={() => { setTemplateTask(details); setDetails(null); }}>Save as template</Button>
                <Button onClick={() => { setEditor(details); setDetails(null); }}>Edit routine</Button>
              </SheetFooter>
            )}
          </div>
        )}
      </Sheet>
      <Sheet open={!!templateTask} onClose={() => setTemplateTask(null)} title="Save as template" description="This saves a reusable copy. Existing routines will never change from template edits.">
        {templateTask && <TemplateForm task={templateTask} busy={busy} onClose={() => setTemplateTask(null)}
          onSave={(name) => run(() => rpc('save_template', { p_id: crypto.randomUUID(), p_name: name, p_title: templateTask.title, p_description: templateTask.description, p_weekdays: templateSetting?.weekdays ?? [1, 2, 3, 4, 5, 6, 7], p_reward: templateSetting?.reward_cents ?? 0 }), 'Template saved.')} />}
      </Sheet>
      <Sheet open={editor !== undefined} onClose={() => setEditor(undefined)} eyebrow="Your routine" title={editor ? 'Edit activity' : 'Add activity'}>
        {editor !== undefined && <TaskForm key={editor?.id ?? 'new'} task={editor} kpi={editor ? activityKpis.find((k) => k.task_id === editor.id) : undefined} kpiReady={kpiReady} setting={editorSetting} today={today} busy={busy} error={error} onClose={() => setEditor(undefined)}
          onArchive={editor ? async () => { const saved = await run(() => rpc('archive_task', { p_task: editor.id, p_expected_revision: editor.revision }), 'Activity will leave the checklist tomorrow.'); if (saved) setEditor(undefined); } : undefined}
          onSave={async (title, desc, reward, days, requestId, kpiTarget, kpiUnit) => {
            const saved = await run(async () => {
              const taskId = await (editor ? rpc<string>('save_task', { p_id: editor.id, p_title: title, p_description: desc, p_reward_cents: reward, p_weekdays: days, p_expected_revision: editor.revision }) : rpc<string>('create_task', { p_id: requestId, p_title: title, p_description: desc, p_reward_cents: reward, p_weekdays: days }));
              const prior = activityKpis.find((k) => k.task_id === taskId);
              if (kpiTarget !== null && (!prior || prior.target !== kpiTarget || prior.unit !== kpiUnit)) await rpc('save_activity_kpi', { p_task: taskId, p_target: kpiTarget, p_unit: kpiUnit, p_expected_revision: prior?.revision ?? 0 });
              if (kpiTarget === null && prior) await rpc('remove_activity_kpi', { p_task: taskId, p_expected_revision: prior.revision });
            }, 'Activity saved.');
            if (saved) setEditor(undefined);
          }} />}
      </Sheet>
      <Sheet open={!!kpiEntry && !!kpiForEntry} onClose={() => setKpiEntry(null)} eyebrow="Daily tracker" title={kpiEntry?.task.title}
        description={kpiForEntry ? `Target: ${kpiForEntry.target} ${kpiForEntry.unit}. Record what you actually did. This number does not automatically mark the activity complete or award money.` : undefined}>
        {kpiEntry && kpiForEntry && <KpiLogForm key={kpiEntry.task.id + kpiEntry.date} kpi={kpiForEntry} log={activityKpiLogs.find((l) => l.task_id === kpiEntry.task.id && l.local_date === kpiEntry.date)} busy={busy} error={error} onClose={() => setKpiEntry(null)}
          onSave={async (value) => {
            const prior = activityKpiLogs.find((l) => l.task_id === kpiEntry.task.id && l.local_date === kpiEntry.date);
            const saved = await run(() => rpc('save_activity_kpi_log', { p_task: kpiEntry.task.id, p_date: kpiEntry.date, p_value: value, p_expected_revision: prior?.revision ?? 0 }), 'Measurement saved.');
            if (saved) {
              if (value >= kpiForEntry.target && (!prior || prior.value < kpiForEntry.target)) {
                const key = 'pronark-celebrated-kpi:' + own + ':' + kpiEntry.task.id + ':' + kpiEntry.date;
                if (!localStorage.getItem(key)) { localStorage.setItem(key, '1'); setCelebration('You reached your ' + kpiEntry.task.title + ' target. Look at you go!'); }
              }
              setKpiEntry(null);
            }
            return saved;
          }} />}
      </Sheet>
      <Sheet open={goalsEditor} onClose={() => setGoalsEditor(false)} title="Monthly goals" description="Changes on the first calendar day apply to this month. Earlier months stay unchanged.">
        <GoalsForm profile={ownProfile} busy={busy} error={error} onClose={() => setGoalsEditor(false)}
          onSave={async (step, water, unit) => { const saved = await run(() => rpc('save_month_goals', { p_step_goal: step, p_water_quantity: water, p_water_unit: unit }), 'Monthly goals saved.'); if (saved) setGoalsEditor(false); }} />
      </Sheet>
      <Sheet open={!!celebration} onClose={() => setCelebration('')} title="Wonderful work!" label="Achievement celebration">
        <div className="flex flex-col items-center gap-3 text-center">
          <CompanionCharacter style={characterStyle} entrance="celebrate" interactive listen={false} className="h-48 w-44" label="Your companion celebrating" />
          <p className="text-sm">{celebration}</p>
          <Button size="lg" className="w-full sm:w-auto" onClick={() => setCelebration('')}>Keep going</Button>
        </div>
      </Sheet>
      {recapMonth && <Suspense fallback={null}><MonthlyRecap owner={own} name={ownProfile.display_name} month={recapMonth} today={today} tasks={tasks} settings={settings} completions={completions} kpis={activityKpis} kpiLogs={activityKpiLogs} character={characterStyle} onClose={() => setRecapMonth(null)} /></Suspense>}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
    </div>
  );
}

function Splash({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <Logo className="h-24 animate-pulse" />
        {title && <h1 className="text-headline">{title}</h1>}
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </main>
  );
}

function Sidebar({ page, onPage }: { page: View; onPage: (view: View) => void }) {
  const navRef = useRef<HTMLElement>(null), indicatorRef = useRef<HTMLSpanElement>(null);
  useSlidingIndicator(navRef, indicatorRef, page);
  const item = (v: View) => {
    const Icon = navIcons[v];
    return (
      <button key={v} type="button" data-active={page === v} aria-current={page === v ? 'page' : undefined} onClick={() => onPage(v)}
        className={cn('relative z-10 flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-[color,scale] duration-100 active:scale-[0.98]',
          page === v ? 'text-sidebar-primary-foreground' : 'text-sidebar-foreground/70 hover:text-sidebar-foreground')}>
        <Icon className="size-4" aria-hidden="true" />{navLabel(v)}
      </button>
    );
  };
  return (
    <aside className="sticky top-0 z-20 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 px-3 py-5 backdrop-blur md:flex">
      <div className="mx-2 mb-7 flex items-center gap-2"><Logo variant="mark" className="h-9" /><span className="text-lg font-bold tracking-tight">Pronark</span></div>
      <nav ref={navRef} aria-label="Main navigation" className="relative flex flex-1 flex-col gap-0.5">
        <span ref={indicatorRef} aria-hidden="true" className="absolute top-0 left-0 rounded-lg bg-sidebar-primary shadow-sm" />
        {sidebarViews.map(item)}
        <div className="mt-auto pt-4">{item('Settings')}</div>
      </nav>
      <p className="mt-4 px-3 text-xs text-muted-foreground">Small habits.<br />Brighter days.</p>
    </aside>
  );
}

/** Translucent top bar plus the page's large title and subtitle. The compact title fades into
 *  the bar once the large title scrolls under it (on every screen size). */
function AppBar({ title, subtitle, decoration, switcher, accountMenu }: { title: string; subtitle: string; decoration?: ReactNode; switcher: ReactNode; accountMenu: ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), { rootMargin: '-64px 0px 0px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <header className={cn('sticky top-0 z-40 pt-[env(safe-area-inset-top)] transition-[background-color,box-shadow] duration-200', scrolled ? 'glass shadow-[0_1px_0_var(--border)]' : 'bg-transparent')}>
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 md:h-16 md:px-8">
          <span className={cn('transition-opacity duration-200 md:hidden', scrolled && 'opacity-0')}><Logo variant="mark" className="h-9" /></span>
          <span aria-hidden={!scrolled} className={cn('absolute left-1/2 -translate-x-1/2 text-sm font-semibold transition-opacity duration-200 md:static md:translate-x-0 md:text-base', scrolled ? 'opacity-100' : 'opacity-0')}>{title}</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden md:block">{switcher}</div>
            {accountMenu}
          </div>
        </div>
      </header>
      <div className="relative z-10 mx-auto flex w-full max-w-6xl items-end justify-between gap-4 px-4 pb-4 md:px-8 md:pb-5">
        <div className="min-w-0">
          <h1 className="text-display font-bold">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground md:text-base">{subtitle}</p>
        </div>
        {decoration && <div aria-hidden="true" className="hidden shrink-0 pb-1 sm:block">{decoration}</div>}
      </div>
      <div ref={sentinel} aria-hidden="true" className="h-px" />
    </>
  );
}

/** Floating frosted tab bar for phones, with a highlight that springs between tabs. */
function TabBar({ page, onPage }: { page: View; onPage: (view: View) => void }) {
  const barRef = useRef<HTMLDivElement>(null), indicatorRef = useRef<HTMLSpanElement>(null);
  useSlidingIndicator(barRef, indicatorRef, page);
  return (
    <nav aria-label="Mobile navigation" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 md:hidden">
      <div ref={barRef} className="glass relative grid grid-cols-6 rounded-[1.75rem] p-1.5 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.35)] ring-1 ring-foreground/10">
        <span ref={indicatorRef} aria-hidden="true" className="absolute top-0 left-0 rounded-[1.375rem] bg-mint" />
        {tabViews.map((v) => {
          const Icon = navIcons[v];
          return (
            <button key={v} type="button" data-active={page === v} aria-current={page === v ? 'page' : undefined} onClick={() => onPage(v)}
              className={cn('relative z-10 flex flex-col items-center gap-0.5 rounded-[1.375rem] py-2 text-[0.625rem] font-medium transition-[color,scale] duration-100 active:scale-90',
                page === v ? 'text-mint-ink' : 'text-muted-foreground')}>
              <Icon className="size-5" strokeWidth={page === v ? 2.25 : 1.75} aria-hidden="true" />
              {navLabel(v)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
