import { useEffect, useState, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { ArrowLeft, Check, ChevronRight, Copy, Flag, Flame, Heart, Link2, Plus, Settings2, Share2, Sprout, TrendingUp, Trophy, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/segmented';
import { Sheet, SheetFooter } from '@/components/sheet';
import { TimedUndoButton } from '@/components/timed-undo-button';
import { CheckRow, EmptyState, ErrorText, FormField, NotePanel } from '@/components/pronark';
import { PlayStat, Pop, toneSurface, type Tone } from '@/components/playful';
import { CompanionCharacter, companionReact, toCharacterStyle, type CharacterStyle } from '@/components/companion-character';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/domain';
import { coachTip, daysLeftLabel, finishedToday, firstName, gameNames, inviteToken, laneProgress, leaders, podium, type GameKind, type GameMember, type GameState } from '@/lib/group-game';

type Group = { id: string; name: string; owner_id: string };
type Share = { group_id: string; user_id: string; show_summary: boolean; full_history: boolean; revision: number };
type Task = { id: string; title: string; archive_date: string | null };
type Mutation = { error: unknown; data?: unknown };
/** What each member chose to share in this group, from `read_group_overview`. */
type Shared = { user_id: string; full_history: boolean; activities: { id: string; title: string; scheduled_today: boolean; completed_today: boolean }[] };
type HistoryRow = { date: string; scheduled: boolean; completed: boolean };
type View = 'home' | 'points' | 'results' | 'invite' | 'habits' | 'manage';
type CheerKind = 'nice_work' | 'you_got_this' | 'thank_you';
type Level = 'score' | 'habits' | 'everything' | 'private';

const gameTone: Record<GameKind, Tone> = { race: 'sky', team: 'mint', streak: 'peach' };
const shortDate = (d: string) => formatDate(d, { month: 'short', day: 'numeric' });
const lookOf = (m: GameMember, crown = false): CharacterStyle => { const look = toCharacterStyle(m.character); return crown ? { ...look, hat: 'crown' } : look; };

export function GroupsPage({ client, owner, tasks, initialGroup, character }: { client: SupabaseClient; owner: string; tasks: Task[]; initialGroup?: string | null; character: CharacterStyle }) {
  const [groups, setGroups] = useState<Group[] | null>(null), [selected, setSelected] = useState(initialGroup ?? '');
  const [state, setState] = useState<GameState | null>(null), [view, setView] = useState<View>('home');
  const [sharing, setSharing] = useState<Share | null>(null), [sharedIds, setSharedIds] = useState<string[]>([]), [shared, setShared] = useState<Shared[]>([]);
  const [cheering, setCheering] = useState<GameMember | null>(null), [createOpen, setCreateOpen] = useState(false), [joinOpen, setJoinOpen] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');

  async function loadGroups() {
    const { data, error: failure } = await client.from('groups').select('id,name,owner_id').order('created_at');
    if (failure) { setError('Groups need the latest database update.'); setGroups([]); return; }
    const next = (data ?? []) as Group[]; setGroups(next);
    setSelected((s) => next.some((g) => g.id === s) ? s : next[0]?.id ?? '');
  }
  async function loadSelected(groupId: string) {
    const [game, share, items, overview] = await Promise.all([
      client.rpc('read_group_game', { p_group: groupId }),
      client.from('group_sharing').select('*').eq('group_id', groupId).eq('user_id', owner).maybeSingle(),
      client.from('group_activity_shares').select('task_id').eq('group_id', groupId).eq('user_id', owner),
      client.rpc('read_group_overview', { p_group: groupId }),
    ]);
    if (game.error) { setError(/read_group_game/.test(game.error.message) ? 'Group games need the latest database update.' : game.error.message); return; }
    setState(game.data as GameState); setSharing(share.data as Share | null); setSharedIds(((items.data ?? []) as { task_id: string }[]).map((x) => x.task_id));
    setShared(((overview.data as { members?: Shared[] } | null)?.members ?? []));
  }
  useEffect(() => { loadGroups(); }, [owner]);
  useEffect(() => { setState(null); if (selected) loadSelected(selected); }, [selected, owner]);
  async function act(action: () => PromiseLike<Mutation>, success: string) {
    setBusy(true); setError('');
    try { const result = await action(); if (result.error) throw result.error; await loadGroups(); if (selected) await loadSelected(selected); if (success) toast.success(success); return result.data ?? true; }
    catch (e) { setError(e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e)); return null; }
    finally { setBusy(false); }
  }
  const open = (next: View) => { setView(next); window.scrollTo({ top: 0 }); };
  const group = groups?.find((g) => g.id === selected);
  const back = (to: View = 'home', label = `Back to ${group?.name ?? 'your group'}`) => <Button variant="ghost" className="-ml-2 self-start" onClick={() => open(to)}><ArrowLeft data-icon="inline-start" />{label}</Button>;

  const createSheet = <CreateGroupSheet open={createOpen} busy={busy} onClose={() => setCreateOpen(false)}
    onCreate={async (name) => { const id = await act(() => client.rpc('create_private_group', { p_name: name }), `${name} is ready. Invite some friends!`); if (typeof id === 'string') { setSelected(id); setCreateOpen(false); open('invite'); } }} />;
  const joinSheet = <JoinGroupSheet open={joinOpen} busy={busy} onClose={() => setJoinOpen(false)}
    onJoin={async (token) => { const id = await act(() => client.rpc('redeem_invitation', { p_token: token }), 'You joined the group!'); if (typeof id === 'string') { setSelected(id); setJoinOpen(false); open('home'); } }} />;

  if (groups === null) return <p className="text-sm text-muted-foreground">Loading your groups…</p>;
  if (!groups.length) return (
    <div className="grid w-full items-start gap-5 lg:grid-cols-2">
      <StartCard character={character} onCreate={() => setCreateOpen(true)} onJoin={() => setJoinOpen(true)} />
      <ErrorText>{error}</ErrorText>{createSheet}{joinSheet}
    </div>
  );

  const me = state?.members.find((m) => m.user_id === owner);
  const isOwner = group?.owner_id === owner;
  return (
    <div className="flex w-full flex-col gap-5">
      {view === 'home' && <>
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Group">
          {groups.map((g) => <button key={g.id} type="button" role="radio" aria-checked={selected === g.id} onClick={() => setSelected(g.id)}
            className={cn('min-h-10 rounded-full px-3.5 text-sm ring-1 ring-inset transition-[background-color,scale] duration-100 active:scale-95', selected === g.id ? 'bg-mint font-semibold text-mint-ink ring-primary/40' : 'bg-card font-medium ring-foreground/10 hover:bg-muted/60')}>{g.name}</button>)}
          <Button variant="ghost" onClick={() => setCreateOpen(true)}><Plus data-icon="inline-start" />New group</Button>
          <Button variant="ghost" onClick={() => setJoinOpen(true)}><Link2 data-icon="inline-start" />Join</Button>
        </div>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        {state ? <GameCard state={state} owner={owner} onCheer={setCheering} onInvite={() => open('invite')} /> : !error && <div className="h-80 animate-pulse rounded-3xl bg-card/60" aria-label="Loading the game" />}
        <div className="flex flex-col gap-2">
          <NavRow icon={<Flag />} title="How can I earn points?" onClick={() => open('points')}>Change the game or see how scoring works.</NavRow>
          <NavRow icon={<Trophy />} title="Is your group killing it?" onClick={() => open('results')}>Last game’s podium and what everyone earned.</NavRow>
          <NavRow icon={<UserPlus />} title="Invite friends" onClick={() => open('invite')}>Share a link and choose what they see.</NavRow>
          <Button variant="ghost" className="self-center text-muted-foreground" onClick={() => open('manage')}><Settings2 data-icon="inline-start" />Manage group</Button>
        </div>
        </div>
      </>}

      {view === 'points' && state && <>{back()}<PointsView state={state} busy={busy}
        onStart={(kind, days) => act(() => client.rpc('start_group_challenge', { p_group: selected, p_kind: kind, p_days: days }), 'Game on! It starts tomorrow morning.').then((ok) => { if (ok) open('home'); })} /></>}
      {view === 'results' && state && <>{back()}<ResultsView state={state} owner={owner} onPick={() => open('points')} /></>}
      {view === 'invite' && group && <>{back()}<InviteView client={client} group={group} isOwner={isOwner} ownerName={state?.members.find((m) => m.user_id === group.owner_id)?.name ?? 'the owner'}
        sharing={sharing} sharedCount={sharedIds.filter((id) => tasks.some((t) => t.id === id && !t.archive_date)).length} busy={busy} onChooseHabits={() => open('habits')}
        onLevel={async (level) => {
          if (!sharing) return;
          const summary = level !== 'private', full = level === 'everything';
          await act(() => client.rpc('save_group_sharing', { p_group: selected, p_summary: summary, p_full_history: full, p_expected_revision: sharing.revision }), 'Sharing updated.');
          if (level === 'score' || level === 'private') for (const id of sharedIds) await client.rpc('set_group_activity_share', { p_group: selected, p_task: id, p_shared: false });
          if (level === 'score' || level === 'private') await loadSelected(selected);
        }}
        onRevoke={() => act(() => client.rpc('revoke_group_invitations', { p_group: selected }), 'Invite links turned off.')} onError={setError} /></>}
      {view === 'habits' && group && <>{back('invite', 'Back to invite and sharing')}
        <ScreenTitle title="Which habits can they see?" subtitle={`Friends in ${group.name} can see and cheer these. Your score always counts every habit.`} />
        <div className="grid gap-0.5 rounded-2xl bg-card p-3 ring-1 ring-foreground/8 sm:grid-cols-2">
          {tasks.filter((t) => !t.archive_date).map((t) => <CheckRow key={t.id} checked={sharedIds.includes(t.id)} disabled={busy || !sharing?.show_summary}
            onChange={(v) => act(() => client.rpc('set_group_activity_share', { p_group: selected, p_task: t.id, p_shared: v }), '')}>{t.title}</CheckRow>)}
        </div>
        {!sharing?.show_summary && <p className="text-sm text-muted-foreground">Your score is private in this group, so no habits are shared.</p>}
      </>}
      {view === 'manage' && group && state && <>{back()}<ManageView group={group} state={state} owner={owner} busy={busy}
        onTransfer={(m) => act(() => client.rpc('transfer_group_ownership', { p_group: selected, p_new_owner: m.user_id }), `${firstName(m.name)} now owns ${group.name}.`)}
        onRemove={(m) => act(() => client.rpc('remove_private_group_member', { p_group: selected, p_user: m.user_id }), `${firstName(m.name)} was removed.`)}
        onLeave={() => act(() => client.rpc('leave_private_group', { p_group: selected }), 'You left the group.').then((ok) => { if (ok) open('home'); })} /></>}

      <ErrorText>{error}</ErrorText>
      <CheerSheet member={cheering} me={me} busy={busy} shared={shared.find((x) => x.user_id === cheering?.user_id)} onClose={() => setCheering(null)}
        loadHistory={async (member) => { const to = state!.today, d = new Date(to + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 6); const { data } = await client.rpc('read_group_history', { p_group: selected, p_member: member, p_from: d.toISOString().slice(0, 10), p_to: to }); return (data ?? []) as HistoryRow[]; }}
        onSend={async (kind) => {
          if (!cheering) return;
          const ok = await act(() => client.rpc('send_garden_cheer', { p_group: selected, p_to: cheering.user_id, p_kind: kind }), `Cheer sent to ${firstName(cheering.name)}! +1 point for you both.`);
          if (ok) { companionReact('cheer'); setCheering(null); }
        }} />
      {createSheet}{joinSheet}
    </div>
  );
}

function ScreenTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="-mt-2"><h2 className="text-title text-3xl font-bold md:text-4xl">{title}</h2><p className="mt-1 text-muted-foreground">{subtitle}</p></div>;
}

function NavRow({ icon, title, children, onClick }: { icon: ReactNode; title: string; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-4 rounded-2xl bg-card p-4 text-left ring-1 ring-foreground/8 transition-[background-color,scale] duration-100 hover:bg-card/70 active:scale-[0.99]">
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-lavender text-lavender-ink [&_svg]:size-5" aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1"><strong className="block font-semibold">{title}</strong><span className="text-sm text-muted-foreground">{children}</span></span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

/** Speech bubble from a companion, in the floating companion's handwriting. */
function Bubble({ children }: { children: ReactNode }) {
  return <p className="font-hand mb-2 flex-1 rounded-[1.125rem] rounded-bl-md bg-card px-3.5 py-2.5 text-xl leading-tight text-foreground shadow-[0_8px_20px_-12px_rgb(30_27_43/0.35)] ring-1 ring-foreground/8">{children}</p>;
}

function GameCard({ state, owner, onCheer, onInvite }: { state: GameState; owner: string; onCheer: (m: GameMember) => void; onInvite: () => void }) {
  const { game, members, today, next } = state;
  const tone = gameTone[game.kind];
  const crowned = game.kind === 'streak' ? [] : leaders(members);
  const me = members.find((m) => m.user_id === owner);
  const title = game.kind === 'race' ? 'Most check-offs wins' : game.kind === 'team' ? `Hit ${game.team_target} check-offs together` : 'Who can keep it going?';
  const rule = game.kind === 'race' ? '1 point per habit · +2 for finishing your day' : game.kind === 'team' ? 'Every check-off anyone makes counts.' : 'Finish every scheduled habit each day to stay in.';
  const ordered = [...members].sort((a, b) => Number(b.visible) - Number(a.visible) || (game.kind === 'streak' ? Number(b.alive) - Number(a.alive) : 0) || b.points - a.points);
  return (
    <section aria-label={`${gameNames[game.kind]}: ${title}`} className={cn('relative flex flex-col gap-3.5 overflow-hidden rounded-3xl p-4 ring-1 ring-inset md:p-5', toneSurface[tone])}>
      <Pop tone={tone} className="absolute top-3 right-3 size-9" />
      <div className="pr-10">
        <p className="text-eyebrow">{gameNames[game.kind]} · {daysLeftLabel(game.ends_on, today)}</p>
        <h2 className="text-title mt-1 text-2xl text-foreground">{title}</h2>
        <p className="mt-1 text-sm">{rule}</p>
      </div>
      {game.kind === 'team' && <TeamMeter state={state} />}
      <div className="flex flex-col gap-2">
        {ordered.map((m) => game.kind === 'team'
          ? <TeamRow key={m.user_id} m={m} self={m.user_id === owner} onCheer={onCheer} />
          : <Lane key={m.user_id} m={m} self={m.user_id === owner} crown={crowned.includes(m.user_id)} progress={laneProgress(game.kind, m, members, game, today)} kind={game.kind} onCheer={onCheer} />)}
      </div>
      {me && <div className="flex items-end gap-1.5">
        <CompanionCharacter style={toCharacterStyle(me.character)} className="h-16 w-14 shrink-0" label="Your companion" />
        <Bubble>{coachTip(state, owner)}</Bubble>
      </div>}
      {members.length === 1 && <Button onClick={onInvite} className="self-start"><UserPlus data-icon="inline-start" />Invite a friend</Button>}
      {next && <p className="rounded-xl bg-card/70 px-3 py-2 text-sm text-foreground">Next up: <strong className="font-semibold">{gameNames[next.kind]}</strong> starts {shortDate(next.starts_on)}.</p>}
    </section>
  );
}

function CheerButton({ m, onCheer }: { m: GameMember; onCheer: (m: GameMember) => void }) {
  if (!m.visible) return null;
  if (m.cheered_today) return <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><Check className="size-3.5" aria-hidden="true" />Cheered</span>;
  const done = finishedToday(m);
  return <Button size="sm" variant={done ? 'default' : 'outline'} className="ml-auto rounded-full bg-card" onClick={() => onCheer(m)} aria-label={`Cheer on ${firstName(m.name)}`}>{done ? 'Nice work!' : 'You got this!'}</Button>;
}

function Lane({ m, self, crown, progress, kind, onCheer }: { m: GameMember; self: boolean; crown: boolean; progress: number; kind: GameKind; onCheer: (m: GameMember) => void }) {
  const out = kind === 'streak' && m.visible && !m.alive;
  const status = !m.visible ? 'Keeps their score private' : kind === 'streak' ? (m.alive ? 'Still in' : `Out ${shortDate(m.out_on!)}`) : `${m.points} pts`;
  return (
    <div className={cn('relative h-[5.25rem] rounded-2xl', self ? 'bg-card ring-2 ring-primary/45' : 'bg-card/60')}>
      <div className="absolute inset-x-3 top-2 flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{self ? 'You' : firstName(m.name)}</span>
        <span className="tabular text-xs">{status}</span>
        {!self && <CheerButton m={m} onCheer={onCheer} />}
      </div>
      <div className="absolute right-11 bottom-2.5 left-3 border-t-2 border-dashed border-current opacity-20" aria-hidden="true" />
      <Flag className="absolute right-3 bottom-2 size-6 fill-butter-pop text-foreground/70" aria-hidden="true" />
      <div className={cn('absolute bottom-0.5 transition-[left] duration-700', (out || !m.visible) && 'opacity-50 grayscale')} style={{ left: `calc((100% - 6rem) * ${progress.toFixed(3)} + 0.5rem)` }}>
        <CompanionCharacter style={lookOf(m, crown)} listen={self} entrance={crown ? 'cheer' : undefined} className="h-[3.25rem] w-11"
          label={`${self ? 'You' : firstName(m.name)}${crown ? ', in the lead' : ''}`} />
      </div>
    </div>
  );
}

function TeamMeter({ state }: { state: GameState }) {
  const target = state.game.team_target ?? 1, total = state.game.team_total, pct = Math.min(100, Math.round((total / target) * 100));
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-card/70 p-3.5">
      <span className="grid size-14 shrink-0 place-items-center rounded-full bg-card shadow-sm"><Sprout className={cn('text-ink transition-[scale]', pct >= 100 ? 'size-9' : pct >= 50 ? 'size-7' : 'size-5')} aria-hidden="true" /></span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div role="progressbar" aria-label={`${total} of ${target} check-offs`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2.5 overflow-hidden rounded-full bg-card">
          <div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm text-foreground"><strong className="tabular font-semibold">{total} of {target}</strong> · {pct >= 100 ? 'the team plant bloomed!' : `${target - total} to go`}</p>
      </div>
    </div>
  );
}

function TeamRow({ m, self, onCheer }: { m: GameMember; self: boolean; onCheer: (m: GameMember) => void }) {
  return (
    <div className={cn('flex items-center gap-3 rounded-2xl py-1.5 pr-3 pl-1.5', self ? 'bg-card ring-2 ring-primary/45' : 'bg-card/60', !m.visible && 'opacity-60')}>
      <span className="grid size-12 shrink-0 place-items-end overflow-hidden rounded-xl bg-card"><CompanionCharacter style={lookOf(m)} listen={self} className="h-11 w-9" label={self ? 'You' : firstName(m.name)} /></span>
      <span className="min-w-0"><strong className="block text-sm font-semibold text-foreground">{self ? 'You' : firstName(m.name)}</strong><span className="tabular text-xs">{m.visible ? `${m.checkoffs} check-offs` : 'Keeps their score private'}</span></span>
      {!self && <CheerButton m={m} onCheer={onCheer} />}
    </div>
  );
}

function CheerSheet({ member, me, busy, shared, loadHistory, onClose, onSend }: {
  member: GameMember | null; me?: GameMember; busy: boolean; shared?: Shared; loadHistory: (member: string) => Promise<HistoryRow[]>; onClose: () => void; onSend: (kind: CheerKind) => void;
}) {
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  useEffect(() => { setHistory(null); if (member && shared?.full_history) loadHistory(member.user_id).then(setHistory).catch(() => setHistory(null)); }, [member?.user_id, shared?.full_history]);
  const todays = shared?.activities.filter((a) => a.scheduled_today) ?? [];
  const week = history ? [...new Set(history.map((r) => r.date))].sort().map((date) => { const rows = history.filter((r) => r.date === date && r.scheduled); return { date, due: rows.length, done: rows.filter((r) => r.completed).length }; }) : [];
  const done = member ? finishedToday(member) : false;
  const [kind, setKind] = useState<CheerKind>('nice_work');
  useEffect(() => { if (member) setKind(finishedToday(member) ? 'nice_work' : 'you_got_this'); }, [member?.user_id]);
  const name = member ? firstName(member.name) : '';
  const left = member ? Math.max(0, (member.due_today ?? 0) - (member.done_today ?? 0)) : 0;
  const choices: [CheerKind, string, string][] = [['nice_work', 'Nice work!', 'for a win'], ['you_got_this', 'You got this!', 'for a push'], ['thank_you', 'Thank you!', 'for the motivation']];
  return (
    <Sheet open={!!member} onClose={onClose} title={done ? `${name} finished every habit today!` : left ? `${name} has ${left} habit${left === 1 ? '' : 's'} left today` : `Cheer on ${name}`}
      description="Pick a cheer. They get a notification and you both get +1 point.">
      <div className="relative mb-4 flex items-end justify-center overflow-hidden rounded-3xl bg-lavender pt-4 ring-1 ring-inset ring-lavender-pop/30">
        <Pop tone="lavender" className="absolute top-3 left-3 size-8 -scale-x-100" /><Pop tone="lavender" className="absolute top-3 right-3 size-8" />
        {me && <CompanionCharacter style={toCharacterStyle(me.character)} listen={false} entrance="cheer" className="h-32 w-28" label="Your companion" />}
        {member && <CompanionCharacter style={toCharacterStyle(member.character)} listen={false} entrance="celebrate" className="h-32 w-28" label={`${name}’s companion`} />}
      </div>
      {todays.length > 0 && <div className="mb-3">
        <p className="text-eyebrow mb-1.5 text-muted-foreground">{name}’s habits today</p>
        <ul className="flex flex-wrap gap-1.5">{todays.map((a) => <li key={a.id} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ring-1 ring-inset', a.completed_today ? 'bg-mint text-mint-ink ring-mint-pop/40' : 'bg-card ring-foreground/12')}>
          {a.completed_today ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : <span className="size-2.5 rounded-full ring-2 ring-foreground/25" aria-hidden="true" />}{a.title}<span className="sr-only">{a.completed_today ? ', done' : ', not done yet'}</span></li>)}</ul>
      </div>}
      {week.length > 0 && <div className="mb-3">
        <p className="text-eyebrow mb-1.5 text-muted-foreground">Last 7 days</p>
        <ol className="grid grid-cols-7 gap-1.5">{week.map((d) => <li key={d.date} className="flex flex-col items-center gap-1 text-[0.6875rem] text-muted-foreground">
          <span className={cn('grid size-8 place-items-center rounded-full text-[0.6875rem] font-semibold', !d.due ? 'bg-muted' : d.done === d.due ? 'bg-mint-pop text-white' : d.done ? 'bg-mint text-mint-ink' : 'bg-card ring-1 ring-foreground/15')}
            aria-label={`${formatDate(d.date, { weekday: 'long' })}: ${d.due ? `${d.done} of ${d.due} done` : 'rest day'}`}>{d.due ? d.done : ''}</span>
          {formatDate(d.date, { weekday: 'narrow' })}</li>)}</ol>
      </div>}
      <div role="radiogroup" aria-label="Choose a cheer" className="flex flex-col gap-2">
        {choices.map(([id, label, hint]) => (
          <button key={id} type="button" role="radio" aria-checked={kind === id} onClick={() => setKind(id)}
            className={cn('flex min-h-14 items-center gap-3 rounded-2xl px-4 text-left font-semibold transition-[background-color,box-shadow] duration-100', kind === id ? 'bg-mint text-mint-ink ring-2 ring-primary' : 'bg-card ring-1 ring-foreground/12')}>
            <span className={cn('grid size-5 place-items-center rounded-full ring-2', kind === id ? 'bg-primary ring-primary' : 'ring-foreground/25')} aria-hidden="true">{kind === id && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}</span>
            <span className="flex-1 text-[0.9375rem] text-foreground">{label}</span><span className="font-hand text-lg opacity-80">{hint}</span>
          </button>
        ))}
      </div>
      <SheetFooter>
        <Button variant="ghost" onClick={onClose}>Not now</Button>
        <Button size="lg" disabled={busy} onClick={() => onSend(kind)}><Heart data-icon="inline-start" />Send cheer</Button>
      </SheetFooter>
    </Sheet>
  );
}

const games: { id: GameKind; title: string; blurb: string; icon: ReactNode; rules: string[] }[] = [
  { id: 'race', title: 'Most check-offs wins', blurb: 'Every habit is a point. Top score at the end wears the crown.', icon: <Flag strokeWidth={1.75} />,
    rules: ['Check off your habits like normal. Each one is 1 point.', 'Finish your whole day for a +2 bonus.', 'Most points when it ends wins the crown.'] },
  { id: 'team', title: 'Hit a goal together', blurb: 'Everyone adds to one total. Reach it and the team plant blooms.', icon: <Sprout strokeWidth={1.75} />,
    rules: ['Check off your habits like normal.', 'Every check-off adds to the team total.', 'We set a goal that fits your group’s schedules.'] },
  { id: 'streak', title: 'Who can keep it going?', blurb: 'Finish every scheduled habit each day. Miss one and you’re out.', icon: <Flame strokeWidth={1.75} />,
    rules: ['Finish all your scheduled habits each day.', 'Miss a day and you’re out. Rest days don’t count.', 'Last one still going wins. Ties share the crown.'] },
];

function PointsView({ state, busy, onStart }: { state: GameState; busy: boolean; onStart: (kind: GameKind, days: number) => void }) {
  const [kind, setKind] = useState<GameKind>(state.game.kind), [days, setDays] = useState<'3' | '7' | '14'>('7');
  const chosen = games.find((g) => g.id === kind)!;
  const length = { '3': '3-day', '7': '1-week', '14': '2-week' }[days];
  return (
    <>
      <ScreenTitle title="How can I earn points?" subtitle="Your habits already count. Nothing extra to set up." />
      <div className="grid gap-2.5 sm:grid-cols-3">
        <PlayStat tone="mint" icon={<Check strokeWidth={2} />} label="Each habit you check off" value="+1" />
        <PlayStat tone="peach" icon={<Flame strokeWidth={1.75} />} label="Finishing your whole day" value="+2" />
        <PlayStat tone="rose" icon={<Heart strokeWidth={1.75} />} label="Cheering, or being cheered (once a day)" value="+1" />
      </div>
      <section aria-labelledby="pick-game" className="flex flex-col gap-3">
        <div><h3 id="pick-game" className="text-headline">Pick the next game</h3><p className="text-sm text-muted-foreground">Everyone in the group plays. It starts tomorrow morning.</p></div>
        <div role="radiogroup" aria-label="Game" className="grid gap-2.5 lg:grid-cols-3">
          {games.map((g) => {
            const tone = gameTone[g.id], on = kind === g.id;
            return (
              <button key={g.id} type="button" role="radio" aria-checked={on} onClick={() => setKind(g.id)}
                className={cn('relative flex items-center gap-4 overflow-hidden rounded-3xl p-4 text-left ring-inset transition-[box-shadow,scale] duration-100 active:scale-[0.99]', toneSurface[tone], on ? 'ring-[2.5px] ring-current' : 'ring-1')}>
                <Pop tone={tone} className="absolute top-3 right-3 size-8" />
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-card/85 text-ink shadow-sm [&_svg]:size-7" aria-hidden="true">{g.icon}</span>
                <span className="flex min-w-0 flex-col gap-0.5 pr-8">
                  <span className="text-eyebrow">{gameNames[g.id]}</span>
                  <span className="text-[1.0625rem] font-semibold text-foreground">{g.title}</span>
                  <span className="text-sm text-foreground/85">{g.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-headline">How long?</h3>
          <Segmented label="Game length" value={days} onChange={setDays} options={[{ value: '3', label: '3 days' }, { value: '7', label: '1 week' }, { value: '14', label: '2 weeks' }]} />
        </div>
        <div className="flex flex-col gap-3 rounded-3xl bg-card p-4 ring-1 ring-foreground/8">
          <h3 className="text-headline">The rules, in three steps</h3>
          {chosen.rules.map((r, i) => <p key={r} className="flex items-start gap-3 text-sm"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-mint text-[0.8125rem] font-bold text-mint-ink">{i + 1}</span><span className="pt-1">{r}</span></p>)}
        </div>
        {state.game.chosen && <p className="text-sm text-muted-foreground">Starting a new game ends the current {gameNames[state.game.kind].toLowerCase()} today.</p>}
        <Button size="lg" disabled={busy} onClick={() => onStart(kind, Number(days))}>Start the {length} game</Button>
      </section>
    </>
  );
}

function ResultsView({ state, owner, onPick }: { state: GameState; owner: string; onPick: () => void }) {
  const last = state.last;
  if (!last) return (
    <>
      <ScreenTitle title="Is your group killing it?" subtitle="See who came out on top and what everyone earned." />
      <div className="flex flex-col items-center gap-2 rounded-3xl bg-lavender px-4 pt-5 text-center text-lavender-ink ring-1 ring-inset ring-lavender-pop/30">
        <p className="font-hand text-2xl text-foreground">Results show up after your first game ends.</p>
        <p className="text-sm">Keep checking off habits. The podium lands {shortDate(state.game.ends_on)}.</p>
        <CompanionCharacter style={toCharacterStyle(state.members.find((m) => m.user_id === owner)?.character)} className="h-36 w-32" label="Your companion" />
      </div>
    </>
  );
  const top = podium(last);
  const winners = last.kind === 'streak' ? top.filter((m) => m.alive) : top.slice(0, 1);
  const myPlace = top.findIndex((m) => m.user_id === owner);
  const mine = last.standings.find((m) => m.user_id === owner);
  const reached = last.kind === 'team' && last.team_target !== null && last.team_total >= last.team_target;
  const headline = last.kind === 'team' ? (reached ? 'Your team did it!' : 'So close this time!')
    : winners.length > 1 ? `${winners.map((w) => firstName(w.name)).join(' and ')} share the crown!`
    : winners[0] ? (winners[0].user_id === owner ? 'You take the crown!' : `${firstName(winners[0].name)} takes the crown!`) : 'Nobody made it to the end!';
  const order = top.length >= 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;
  const heights = (m: GameMember) => m === top[0] ? 'h-32' : m === top[1] ? 'h-24' : 'h-[4.5rem]';
  const badgeInfo = { never_missed: { title: 'Never missed', tone: 'peach' as Tone, icon: <Flame strokeWidth={1.75} /> }, comeback: { title: 'Big comeback', tone: 'sky' as Tone, icon: <TrendingUp strokeWidth={1.75} /> }, cheerleader: { title: 'Top cheerleader', tone: 'rose' as Tone, icon: <Heart strokeWidth={1.75} /> } };
  return (
    <>
      <div className="-mt-2">
        <p className="text-eyebrow text-lavender-ink">{gameNames[last.kind]} · {shortDate(last.starts_on)} – {shortDate(last.ends_on)}</p>
        <h2 className="text-title mt-1 text-3xl font-bold md:text-4xl">{headline}</h2>
        <p className="font-hand mt-1 text-2xl text-lavender-ink">What a week. Rematch?</p>
      </div>
      {last.kind === 'team' && <NotePanel tone="mint" icon={<Sprout className="size-5" aria-hidden="true" />} title={reached ? 'The team plant bloomed!' : `${last.team_total} of ${last.team_target} check-offs`}>
        {reached ? `${last.team_total} check-offs together. Everyone earned the Grower badge.` : 'Pick a team goal again and finish what you started.'}</NotePanel>}
      <div className="grid items-start gap-5 lg:grid-cols-2">
      {top.length > 0 && <section aria-label="Podium" className="relative overflow-hidden rounded-3xl bg-lavender px-3 pt-6 ring-1 ring-inset ring-lavender-pop/30">
        <Pop tone="lavender" className="absolute top-3 left-3 size-9 -scale-x-100" /><Pop tone="lavender" className="absolute top-3 right-3 size-9" />
        <div className="grid grid-cols-3 items-end gap-2">
          {order.map((m) => {
            const first = m === top[0], place = top.indexOf(m) + 1;
            return (
              <div key={m.user_id} className={cn('flex flex-col items-center', top.length < 3 && 'col-span-1')}>
                <CompanionCharacter style={lookOf(m, first && (last.kind !== 'streak' || m.alive))} listen={false} entrance={first ? 'celebrate' : undefined} className={first ? 'h-28 w-24' : 'h-24 w-20'} label={`${firstName(m.name)}, place ${place}`} />
                <div className={cn('mt-1 flex w-full flex-col items-center justify-center rounded-t-2xl', heights(m), first ? 'bg-butter ring-1 ring-inset ring-butter-pop/50' : 'bg-card')}>
                  <strong className={cn('text-2xl font-bold', first ? 'text-butter-ink' : 'text-lavender-ink')}>{place}</strong>
                  <span className="text-sm font-semibold">{m.user_id === owner ? 'You' : firstName(m.name)}</span>
                  <span className="tabular text-xs text-muted-foreground">{last.kind === 'team' ? `${m.checkoffs} check-offs` : last.kind === 'streak' ? (m.alive ? 'Made it!' : `Out ${shortDate(m.out_on!)}`) : `${m.points} pts`}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>}
      <div className="flex flex-col gap-4">
      {mine?.visible && <PlayStat tone="mint" icon={<TrendingUp strokeWidth={1.75} />} label={myPlace >= 0 ? `You finished ${['1st', '2nd', '3rd'][myPlace]}` : 'Your game'} value={last.kind === 'team' ? `${mine.checkoffs} check-offs` : `${mine.points} points`} />}
      <section aria-label="Badges" className="flex flex-col gap-2.5">
        <h3 className="text-headline">Badges</h3>
        {last.badges.length ? <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-1">
          {last.badges.map((b) => { const info = badgeInfo[b.kind]; return (
            <PlayStat key={b.kind + b.user_id} tone={info.tone} icon={info.icon} label={info.title}
              value={<span className="text-xl">{b.user_id === owner ? 'You' : firstName(b.name)}</span>}
              hint={b.kind === 'comeback' ? `+${b.detail} points` : b.kind === 'cheerleader' ? `${b.detail} cheer${b.detail === 1 ? '' : 's'}` : 'every habit, every day'} />
          ); })}
        </div> : <EmptyState>No badges this time. Finish every day, cheer a lot, or beat your last score to earn one.</EmptyState>}
      </section>
      </div>
      </div>
      <Button size="lg" onClick={onPick}>Pick this week’s game</Button>
    </>
  );
}

function InviteView({ client, group, isOwner, ownerName, sharing, sharedCount, busy, onChooseHabits, onLevel, onRevoke, onError }: {
  client: SupabaseClient; group: Group; isOwner: boolean; ownerName: string; sharing: Share | null; sharedCount: number; busy: boolean;
  onChooseHabits: () => void; onLevel: (level: Level) => void; onRevoke: () => void; onError: (message: string) => void;
}) {
  const [link, setLink] = useState(''), [making, setMaking] = useState(false);
  const level: Level = !sharing ? 'habits' : !sharing.show_summary ? 'private' : sharing.full_history ? 'everything' : sharedCount ? 'habits' : 'score';
  const levels: [Level, string, string][] = [['score', 'Just my score', 'Points and how many habits you finished. No habit names.'], ['habits', 'Score and the habits I pick', 'Recommended. Friends can cheer specific habits.'], ['everything', 'Everything', 'All your habits and your last 7 days.'], ['private', 'Keep my score private', 'You still see the game, but your score is hidden.']];
  async function makeLink() {
    setMaking(true);
    const { data, error } = await client.rpc('issue_group_link', { p_group: group.id });
    setMaking(false);
    if (error) { onError(error.message); return; }
    setLink(`${location.origin}${import.meta.env.BASE_URL}?join=${data as string}`);
  }
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast.success('Link copied.'); } catch { onError('Couldn’t copy. Select the link and copy it instead.'); } };
  const share = async () => { try { await navigator.share({ title: `Join ${group.name} on Pronark`, text: `Join ${group.name} on Pronark. Let’s keep each other going!`, url: link }); } catch { /* closed the share sheet */ } };
  return (
    <>
      <ScreenTitle title="Invite friends" subtitle={`When they tap your link, they join ${group.name}.`} />
      <div className="grid items-start gap-5 lg:grid-cols-2">
      {isOwner ? (
        <section aria-label="Invite link" className={cn('relative flex flex-col gap-2.5 overflow-hidden rounded-3xl p-4 ring-1 ring-inset', toneSurface.mint)}>
          {!link && <Pop tone="mint" className="absolute top-3 right-3 size-8" />}
          {link ? <>
            <div className="flex items-center gap-2 rounded-xl bg-card py-1 pr-1 pl-3 text-foreground">
              <span className="min-w-0 flex-1 truncate font-mono text-sm select-all">{link}</span>
              <Button variant="secondary" onClick={copy}><Copy data-icon="inline-start" />Copy</Button>
            </div>
            {'share' in navigator && <Button variant="outline" className="bg-card" onClick={share}><Share2 data-icon="inline-start" />Share invite</Button>}
          </> : <>
            <p className="pr-10 text-sm text-foreground">Make a link to send by text or any app. Anyone with it can join for 7 days.</p>
            <Button className="self-start bg-card" disabled={making} onClick={makeLink}><Link2 data-icon="inline-start" />{making ? 'Making your link…' : 'Create invite link'}</Button>
          </>}
          <p className="text-xs">Links work for 7 days. You can turn them all off anytime.</p>
          <div className="self-start"><TimedUndoButton size="sm" tone="neutral" disabled={busy} label="Turn off all links" runningLabel="Turning off…" onConfirm={() => { setLink(''); onRevoke(); }} /></div>
        </section>
      ) : <NotePanel tone="mint" icon={<UserPlus className="size-5" aria-hidden="true" />} title="Want to add someone?">Only {firstName(ownerName)} can make invite links for {group.name}. Ask them to send one.</NotePanel>}
      <section aria-labelledby="share-level" className="flex flex-col gap-2">
        <div><h3 id="share-level" className="text-headline">What can this group see?</h3><p className="text-sm text-muted-foreground">Money amounts are never shared. This only applies to {group.name}.</p></div>
        <div role="radiogroup" aria-labelledby="share-level" className="flex flex-col gap-2">
          {levels.map(([id, title, hint]) => (
            <button key={id} type="button" role="radio" aria-checked={level === id} disabled={busy || !sharing} onClick={() => level !== id && onLevel(id)}
              className={cn('flex items-center gap-3 rounded-2xl bg-card p-3.5 text-left transition-[box-shadow] duration-100 disabled:opacity-60', level === id ? 'ring-2 ring-primary' : 'ring-1 ring-foreground/10')}>
              <span className={cn('grid size-5 shrink-0 place-items-center rounded-full ring-2', level === id ? 'bg-primary ring-primary' : 'ring-foreground/25')} aria-hidden="true">{level === id && <Check className="size-3 text-primary-foreground" strokeWidth={3} />}</span>
              <span><strong className="block text-[0.9375rem] font-semibold">{title}</strong><span className="text-sm text-muted-foreground">{hint}</span></span>
            </button>
          ))}
        </div>
        {level === 'habits' || level === 'score' ? <button type="button" onClick={onChooseHabits} className="flex min-h-12 items-center gap-3 rounded-2xl px-3.5 text-left hover:bg-card/60">
          <span className="flex-1 text-sm"><strong className="font-semibold">Choose habits</strong> <span className="text-muted-foreground">· {sharedCount} shared</span></span>
          <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
        </button> : null}
      </section>
      </div>
    </>
  );
}

function ManageView({ group, state, owner, busy, onTransfer, onRemove, onLeave }: { group: Group; state: GameState; owner: string; busy: boolean; onTransfer: (m: GameMember) => void; onRemove: (m: GameMember) => void; onLeave: () => void }) {
  const isOwner = group.owner_id === owner;
  return (
    <>
      <ScreenTitle title={`Manage ${group.name}`} subtitle={`${state.members.length} member${state.members.length === 1 ? '' : 's'} · Private group`} />
      <div className="flex flex-col divide-y rounded-2xl bg-card ring-1 ring-foreground/8">
        {state.members.map((m) => (
          <div key={m.user_id} className="flex flex-wrap items-center gap-3 p-3">
            <span className="grid size-11 shrink-0 place-items-end overflow-hidden rounded-xl bg-lavender"><CompanionCharacter style={lookOf(m)} listen={false} className="h-10 w-8" label="" /></span>
            <span className="min-w-0 flex-1"><strong className="block text-sm font-semibold">{m.user_id === owner ? 'You' : m.name || 'Member'}</strong><span className="text-xs text-muted-foreground">{m.user_id === group.owner_id ? 'Owner' : 'Member'}</span></span>
            {isOwner && m.user_id !== owner && <>
              <TimedUndoButton size="sm" tone="neutral" disabled={busy} label="Make owner" runningLabel="Transferring…" onConfirm={() => onTransfer(m)} />
              <TimedUndoButton size="sm" disabled={busy} label="Remove" runningLabel="Removing…" onConfirm={() => onRemove(m)} />
            </>}
          </div>
        ))}
      </div>
      {isOwner ? <p className="text-sm text-muted-foreground">To leave {group.name}, make someone else the owner first.</p>
        : <div className="self-start"><TimedUndoButton disabled={busy} label={`Leave ${group.name}`} undoLabel="Stay in group" runningLabel="Leaving…" onConfirm={onLeave} /></div>}
    </>
  );
}

function StartCard({ character, onCreate, onJoin }: { character: CharacterStyle; onCreate: () => void; onJoin: () => void }) {
  const steps: [string, string, Tone][] = [['Make a group', 'and send friends a link.', 'mint'], ['Check off your habits', 'like you already do. Each one scores a point.', 'sky'], ['Win the week,', 'earn badges and cheer each other on.', 'butter']];
  return (
    <>
      <section className="relative flex flex-col items-center overflow-hidden rounded-3xl bg-lavender px-4 pt-4 ring-1 ring-inset ring-lavender-pop/30 lg:row-span-2">
        <Pop tone="lavender" className="absolute top-3 right-3 size-9" />
        <div className="self-stretch pr-8"><Bubble>Habits stick better with friends. Want to bring a few along?</Bubble></div>
        <div className="flex items-end">
          <CompanionCharacter style={{ color: 'lavender', hat: 'beanie', outfit: 'none' }} listen={false} className="-mr-3 h-24 w-20 opacity-55" label="" />
          <CompanionCharacter style={character} interactive entrance="hello" className="h-40 w-36" label="Your companion, waving" />
          <CompanionCharacter style={{ color: 'peach', hat: 'none', outfit: 'overalls' }} listen={false} className="-ml-3 h-24 w-20 opacity-55" label="" />
        </div>
      </section>
      <section aria-labelledby="how-groups" className="flex flex-col gap-3 rounded-3xl bg-card p-4 ring-1 ring-foreground/8">
        <h2 id="how-groups" className="text-headline">How it works</h2>
        {steps.map(([lead, rest, tone], i) => <p key={lead} className="flex items-center gap-3 text-sm"><span className={cn('grid size-8 shrink-0 place-items-center rounded-full font-bold', toneSurface[tone])}>{i + 1}</span><span><strong className="font-semibold">{lead}</strong> {rest}</span></p>)}
      </section>
      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={onCreate}><Plus data-icon="inline-start" />Start a group</Button>
        <Button size="lg" variant="outline" onClick={onJoin}><Link2 data-icon="inline-start" />I have an invite link</Button>
        <p className="mt-1 text-center text-xs text-muted-foreground">Friends only see what you choose. Money amounts are never shared.</p>
      </div>
    </>
  );
}

function CreateGroupSheet({ open, busy, onClose, onCreate }: { open: boolean; busy: boolean; onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState('');
  useEffect(() => { if (open) setName(''); }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Start a group" description="Give it a name your friends will recognize.">
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) onCreate(name.trim()); }} className="flex flex-col">
        <FormField label="Group name"><Input value={name} maxLength={80} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Gym Buddies, Family, Roommates…" /></FormField>
        <SheetFooter><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" size="lg" disabled={busy || !name.trim()}>Create group</Button></SheetFooter>
      </form>
    </Sheet>
  );
}

function JoinGroupSheet({ open, busy, onClose, onJoin }: { open: boolean; busy: boolean; onClose: () => void; onJoin: (token: string) => void }) {
  const [text, setText] = useState('');
  useEffect(() => { if (open) setText(''); }, [open]);
  const token = inviteToken(text);
  return (
    <Sheet open={open} onClose={onClose} title="Join a group" description="Paste the invite link (or code) a friend sent you.">
      <form onSubmit={(e) => { e.preventDefault(); if (token) onJoin(token); }} className="flex flex-col">
        <FormField label="Invite link" hint={text && !token ? 'That doesn’t look like a Pronark invite yet.' : undefined}><Input value={text} autoFocus onChange={(e) => setText(e.target.value)} placeholder="Paste it here" /></FormField>
        <SheetFooter><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" size="lg" disabled={busy || !token}>Join group</Button></SheetFooter>
      </form>
    </Sheet>
  );
}
