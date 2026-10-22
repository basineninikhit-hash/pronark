import type { ReactionCategory } from '@/companion-reactions';

export type Task = { id: string; owner_id: string; title: string; description: string; start_date: string; archive_date: string | null; revision: number; reaction_category?: ReactionCategory };
export type Setting = { task_id: string; month: string; reward_cents: number; weekdays: number[] };
export type Completion = { task_id: string; local_date: string; completed: boolean; version: number };
export type ActivityKpi = { task_id: string; owner_id: string; target: number; unit: string; revision: number };
export type ActivityKpiLog = { task_id: string; owner_id: string; local_date: string; value: number; revision: number };
export type Profile = { user_id: string; display_name: string; setup_completed_at: string | null; step_goal: number | null; water_quantity: number | null; water_unit: string | null; revision: number };
export type Membership = { group_id: string; user_id: string };
export type Earning = { id: string; owner_id: string; task_id: string; earned_date: string; kind: 'base' | 'bonus14' | 'bonus28'; cents: number; active: boolean };
export type Purchase = { id: string; owner_id: string; title: string; amount_cents: number; purchase_date: string; note: string; linked_wishlist_id: string | null; deleted_at: string | null; revision: number };
export type Category = { id: string; owner_id: string; category_key: string; general_target_cents?: number; priority_order?: number; revision: number };
export type Wish = { id: string; category_id: string; owner_id: string; title: string; estimated_cents: number; external_url: string | null; note: string; status: 'active' | 'purchased' | 'archived'; linked_purchase_id: string | null; icon?: string | null; revision: number };
export type Allocation = { id: string; owner_id: string; category_id: string; cents: number };
export type ItemAllocation = { item_id: string; owner_id: string; cents: number; revision: number };
export type BonusProgress = { task_id: string; owner_id: string; eligible_days: number };
export type Template = { id: string; owner_id: string; name: string; title: string; description: string; weekdays: number[]; suggested_reward_cents: number | null; archived_at: string | null; revision: number };
export type ReportPreference = { owner_id: string; pending_email: string | null; verified_email: string | null; enabled: boolean; verification_state: string };
export type ChecklistPresentation = { owner_id: string; ordered_ids: string[]; grouped: boolean; revision: number };
export type TaskPeriod = { task_id: string; owner_id: string; period: 'morning' | 'afternoon' | 'evening' | 'anytime'; revision: number };
export type View = 'Home' | 'Calendar' | 'Routines' | 'Insights' | 'Goals' | 'Wallet' | 'Groups' | 'Profile' | 'Settings';
export type Companion = 'robot' | 'dog' | 'cat' | 'muse' | 'care';
export type RunAction = (action: () => Promise<unknown>, message: string) => Promise<boolean>;

export const initialActivities = [
  ['Going to the gym', 200], ['Meeting the monthly step goal', 200], ['Healthy lunch', 100], ['Healthy dinner', 100],
  ['No sugar', 100], ['Night skin care routine', 100], ['Morning routine', 100], ['Reaching water goal', 200],
] as const;
export const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const periodLabels: Record<TaskPeriod['period'], string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening / Night', anytime: 'Anytime' };

export const eastDate = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
export const cents = (n: number) => `${n < 0 ? '-' : ''}$${(Math.abs(n) / 100).toFixed(2)}`;
export const dayNumber = (s: string) => (new Date(`${s}T12:00:00Z`).getUTCDay() + 6) % 7 + 1;
export const monthStart = (s: string) => s.slice(0, 7) + '-01';
export const isDue = (t: Task, s: Setting | undefined, date: string) => !!s && date >= t.start_date && (!t.archive_date || date < t.archive_date) && s.weekdays.includes(dayNumber(date));
export const settingFor = (settings: Setting[], taskId: string, date: string) => settings.filter((s) => s.task_id === taskId && s.month <= monthStart(date)).sort((a, b) => b.month.localeCompare(a.month))[0];
export const isFirstOfMonth = (today: string) => Number(today.slice(-2)) === 1;
export const moneyPattern = /^\d+(\.\d{1,2})?$/;
export const formatDate = (date: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...options, timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z'));

export function streakFor(task: string, completions: Completion[], settings: Setting[], today: string) {
  let n = 0;
  const d = new Date(today + 'T12:00:00Z');
  for (let i = 0; i < 31; i++) {
    const date = d.toISOString().slice(0, 10);
    const setting = settingFor(settings, task, date);
    if (setting?.weekdays.includes(dayNumber(date))) {
      const hit = completions.find((x) => x.task_id === task && x.local_date === date)?.completed;
      if (hit) n++;
      else if (date < today) break;
    }
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}
