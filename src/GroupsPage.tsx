import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { Check, Eye, Plus, UserRound, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { TimedUndoButton } from '@/components/timed-undo-button';
import { CheckRow, Disclosure, ErrorText, FormField, Meter, SectionHeading } from '@/components/pronark';
import { TogetherPage } from './TogetherPage';

type Group={id:string;name:string;owner_id:string;revision:number};
type Share={group_id:string;user_id:string;show_summary:boolean;full_history:boolean;revision:number};
type Activity={id:string;title:string;scheduled_today:boolean;completed_today:boolean};
type Member={user_id:string;name:string;summary_visible:boolean;full_history:boolean;scheduled:number|null;completed:number|null;activities:Activity[]};
type Overview={id:string;name:string;members:Member[]};
type Task={id:string;title:string;archive_date:string|null};
type Mutation={error:unknown;data?:unknown};

export function GroupsPage({client,owner,tasks}:{client:SupabaseClient;owner:string;tasks:Task[]}){
 const [groups,setGroups]=useState<Group[]>([]),[selected,setSelected]=useState('');
 const [overview,setOverview]=useState<Overview|null>(null),[sharing,setSharing]=useState<Share|null>(null),[sharedIds,setSharedIds]=useState<string[]>([]);
 const [member,setMember]=useState(''),[history,setHistory]=useState<unknown[]|null>(null);
 const [newName,setNewName]=useState(''),[inviteCode,setInviteCode]=useState(''),[joinCode,setJoinCode]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function loadGroups(){
  const {data,error:failure}=await client.from('groups').select('*').order('created_at');
  if(failure){setError('Private groups need the new database migration.');return}
  const next=(data??[]) as Group[];setGroups(next);
  setSelected(s=>next.some(g=>g.id===s)?s:(next[0]?.id??''));
 }
 async function loadSelected(groupId:string){
  const [view,share,items]=await Promise.all([
   client.rpc('read_group_overview',{p_group:groupId}),
   client.from('group_sharing').select('*').eq('group_id',groupId).eq('user_id',owner).maybeSingle(),
   client.from('group_activity_shares').select('task_id').eq('group_id',groupId).eq('user_id',owner),
  ]);
  if(view.error||share.error||items.error){setError(view.error?.message??share.error?.message??items.error?.message??'Could not load group');return}
  const next=view.data as Overview;setOverview(next);setSharing(share.data as Share|null);setSharedIds((items.data??[]).map(x=>x.task_id));
  setMember(m=>next.members.some(x=>x.user_id===m)?m:next.members[0]?.user_id??'');setHistory(null);
 }
 useEffect(()=>{loadGroups()},[owner]);
 useEffect(()=>{if(selected)loadSelected(selected);else setOverview(null)},[selected,owner]);
 async function refresh(){await loadGroups();if(selected)await loadSelected(selected)}
 async function act(action:()=>PromiseLike<Mutation>,success:string){
  setBusy(true);setError('');
  try{const result=await action();if(result.error)throw result.error;await refresh();toast.success(success)}
  catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 const group=groups.find(g=>g.id===selected),chosen=overview?.members.find(m=>m.user_id===member),isOwner=group?.owner_id===owner,self=overview?.members.find(m=>m.user_id===owner);
 const [createOpen,setCreateOpen]=useState(false);
 return <div className="flex w-full max-w-5xl flex-col gap-5">
  <div className="flex flex-wrap items-center gap-2">
   {groups.length>1?<div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Group">{groups.map(g=><button key={g.id} type="button" role="radio" aria-checked={selected===g.id} onClick={()=>setSelected(g.id)} className={'rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 transition-[background-color,scale] duration-100 active:scale-95 '+(selected===g.id?'bg-mint text-mint-ink ring-primary/40':'bg-card ring-foreground/10 hover:bg-muted/60')}>{g.name}</button>)}</div>:<span className="text-sm text-muted-foreground">{groups.length?'Other groups you join show up here.':'You’re not in a group yet.'}</span>}
   <Button className="ml-auto" onClick={()=>setCreateOpen(!createOpen)} aria-expanded={createOpen}><Plus data-icon="inline-start"/>Create or join</Button>
  </div>
  {(createOpen||!groups.length)&&<Card><CardContent className="grid gap-4 sm:grid-cols-2">
   <div className="flex items-end gap-2"><FormField label="New group name" className="flex-1"><Input value={newName} maxLength={80} onChange={e=>setNewName(e.target.value)} placeholder="Family, friends…"/></FormField><Button disabled={busy||!newName.trim()} onClick={()=>act(async()=>{const result=await client.rpc('create_private_group',{p_name:newName});if(!result.error){setSelected(result.data as string);setNewName('')}return result},'Group created.')}>Create group</Button></div>
   <div className="flex items-end gap-2"><FormField label="Have an invitation code?" className="flex-1"><Input value={joinCode} onChange={e=>setJoinCode(e.target.value.trim())} placeholder="Paste a code"/></FormField><Button variant="outline" disabled={busy||!joinCode.trim()} onClick={()=>act(async()=>{const result=await client.rpc('redeem_invitation',{p_token:joinCode});if(!result.error){setSelected(result.data as string);setJoinCode('')}return result},'Joined group.')}>Join</Button></div>
  </CardContent></Card>}
  {group&&overview&&<>
   <section className="flex flex-col gap-3 rounded-2xl bg-lavender p-4 text-lavender-ink md:p-5" aria-label={group.name}>
    <div className="flex items-center gap-3">
     <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-card text-ink"><Users className="size-6" aria-hidden="true"/></span>
     <div className="min-w-0 flex-1"><h2 className="text-headline text-foreground">{overview.name}</h2><p className="text-xs">{overview.members.length} member{overview.members.length===1?'':'s'} · Private group</p></div>
    </div>
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-card/70 px-3 py-2.5">
     <p className="min-w-0 flex-1 text-sm">Members see only what each person chooses to share here.</p>
     <div className="flex -space-x-2">{overview.members.slice(0,5).map((m,i)=><span key={m.user_id} title={m.name} className={'grid size-8 place-items-center rounded-full text-xs font-semibold ring-2 ring-card '+['bg-peach text-peach-ink','bg-mint text-mint-ink','bg-lavender text-lavender-ink','bg-muted text-foreground'][i%4]}>{(m.name||'M').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase()}</span>)}</div>
     {isOwner&&<Button variant="outline" size="sm" className="bg-card" disabled={busy} onClick={async()=>{setBusy(true);setError('');const result=await client.rpc('issue_group_invitation',{p_group:selected});if(result.error)setError(result.error.message);else setInviteCode(result.data as string);setBusy(false)}}>Invite</Button>}
    </div>
    {inviteCode&&<p className="text-sm">Share this single-use code (expires in 48 hours): <code className="rounded bg-card px-1.5 py-0.5 font-mono text-xs text-foreground select-all">{inviteCode}</code></p>}
   </section>
   <Card><CardContent className="flex flex-col gap-4">
    <SectionHeading title="Members" description="Choose a person to see their consented summary and selected activities."/>
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Group member">{overview.members.map(m=><button key={m.user_id} type="button" role="radio" aria-checked={member===m.user_id} onClick={()=>{setMember(m.user_id);setHistory(null)}} className={'flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm ring-1 transition-[background-color,scale] duration-100 active:scale-95 '+(member===m.user_id?'bg-primary/10 ring-primary':'ring-foreground/10 hover:bg-muted/50')}><span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{(m.name||'M').slice(0,1).toUpperCase()}</span>{m.name||'Member'}{m.user_id===owner&&<span className="text-muted-foreground"> (you)</span>}</button>)}</div>
    {chosen&&<div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-4">
     <div className="flex items-baseline justify-between gap-2"><h3 className="text-headline">{chosen.name||'Member'}</h3>{chosen.summary_visible&&<span className="tabular text-sm text-muted-foreground">{chosen.completed} / {chosen.scheduled} today</span>}</div>
     {chosen.summary_visible?<Meter value={chosen.completed??0} max={chosen.scheduled??0} label={`${chosen.completed} of ${chosen.scheduled} scheduled activities completed today`}/>:<p className="text-sm text-muted-foreground">This member has hidden their progress summary.</p>}
     <h4 className="text-eyebrow text-muted-foreground">Shared activities</h4>
     {chosen.activities.length?<ul className="flex flex-col gap-1.5">{chosen.activities.map(a=><li key={a.id} className="flex items-center justify-between gap-2 text-sm"><span>{a.title}</span><Badge variant={a.scheduled_today&&a.completed_today?'default':'secondary'}>{a.scheduled_today?a.completed_today?'Complete today':'Scheduled today':'Not scheduled'}</Badge></li>)}</ul>:<p className="text-sm text-muted-foreground">No activities shared with this group.</p>}
     {chosen.full_history&&chosen.user_id!==owner&&<><Button variant="outline" className="self-start" onClick={async()=>{const to=new Date().toISOString().slice(0,10),from=new Date(Date.now()-6*86400000).toISOString().slice(0,10);const result=await client.rpc('read_group_history',{p_group:selected,p_member:chosen.user_id,p_from:from,p_to:to});if(result.error)setError(result.error.message);else setHistory(result.data as unknown[])}}>View last 7 days of shared history</Button>{history&&<pre className="max-h-64 overflow-auto rounded-lg bg-background p-3 font-mono text-[0.6875rem] ring-1 ring-foreground/10">{JSON.stringify(history,null,2)}</pre>}</>}
    </div>}
   </CardContent></Card>
   <div className="grid items-start gap-4 lg:grid-cols-2">
   <Card><CardContent className="flex flex-col gap-3">
    <SectionHeading title={<span className="inline-flex items-center gap-2"><Eye className="size-4" aria-hidden="true"/>What members can see</span>} description={`You control what’s shared in ${group.name}.`}/>
    <p className="-mt-1 text-xs text-muted-foreground">Full checklist and history are off unless you turn them on for this group.</p>
    {sharing&&<div className="flex flex-col divide-y rounded-xl ring-1 ring-foreground/10">
     <label className="flex items-center justify-between gap-3 px-3.5 py-3 text-sm">Show my progress summary<Switch checked={sharing.show_summary} disabled={busy} onCheckedChange={v=>act(()=>client.rpc('save_group_sharing',{p_group:selected,p_summary:v,p_full_history:sharing.full_history,p_expected_revision:sharing.revision}),'Sharing updated.')}/></label>
     <label className="flex items-center justify-between gap-3 px-3.5 py-3 text-sm">Let this group see my full checklist and history<Switch checked={sharing.full_history} disabled={busy} onCheckedChange={v=>act(()=>client.rpc('save_group_sharing',{p_group:selected,p_summary:sharing.show_summary,p_full_history:v,p_expected_revision:sharing.revision}),'Full history choice updated.')}/></label>
    </div>}
    <h4 className="text-eyebrow mt-1 text-muted-foreground">Shared activities</h4>
    <div className="grid gap-0.5 sm:grid-cols-2">{tasks.filter(t=>!t.archive_date).map(t=><CheckRow key={t.id} checked={sharedIds.includes(t.id)} disabled={busy} onChange={v=>act(()=>client.rpc('set_group_activity_share',{p_group:selected,p_task:t.id,p_shared:v}),'Activity sharing updated.')}>{t.title}</CheckRow>)}</div>
    <Disclosure summary="Can another group see this?">No. These choices apply only to {group.name}. A small group may infer a contribution from group totals.</Disclosure>
   </CardContent></Card>
   <Card><CardContent className="flex flex-col gap-3">
    <SectionHeading title={<span className="inline-flex items-center gap-2"><UserRound className="size-4" aria-hidden="true"/>Group preview (your view)</span>} description="What others in this group see from you."/>
    {self?<div className="flex flex-col gap-3 rounded-xl bg-muted/40 p-3.5">
     <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-full bg-peach text-sm font-semibold text-peach-ink">{(self.name||'Y').slice(0,1).toUpperCase()}</span><div><strong className="block text-sm">You</strong><small className="text-xs text-muted-foreground">{sharing?.show_summary?'Sharing a summary today':'Summary hidden'}</small></div></div>
     {sharing?.show_summary&&self.scheduled!==null?<p className="text-sm">{self.completed} of {self.scheduled} scheduled habits completed today.</p>:<p className="text-sm text-muted-foreground">Your progress summary is hidden from this group.</p>}
     {self.activities.length?<ul className="flex flex-col gap-1.5">{self.activities.map(a=><li key={a.id} className={'flex items-center gap-2 rounded-lg px-3 py-2 text-sm '+(a.completed_today?'bg-mint text-mint-ink':'bg-card')}><span className="flex-1">{a.title}</span>{a.completed_today&&<Check className="size-4" strokeWidth={3} aria-hidden="true"/>}</li>)}</ul>:<p className="text-xs text-muted-foreground">No activities shared yet. Tick some on the left.</p>}
    </div>:<p className="text-sm text-muted-foreground">Loading your preview…</p>}
   </CardContent></Card>
   </div>
   <TogetherPage client={client} groupId={selected} owner={owner} members={overview.members} tasks={tasks.filter(t=>!t.archive_date)}/>
   <Card><CardContent className="flex flex-col gap-3">
    <SectionHeading title="Group management"/>
    {isOwner?<>
     <div className="flex flex-wrap gap-2"><TimedUndoButton disabled={busy} label="Revoke pending invitations" runningLabel="Revoking…" onConfirm={()=>act(()=>client.rpc('revoke_group_invitations',{p_group:selected}),'Pending invitations revoked.')}/></div>
     {overview.members.filter(m=>m.user_id!==owner).map(m=><div key={m.user_id} className="flex flex-wrap items-center gap-2 border-t pt-3"><span className="flex-1 text-sm font-medium">{m.name}</span><TimedUndoButton size="sm" disabled={busy} label="Make owner" runningLabel="Transferring…" onConfirm={()=>act(()=>client.rpc('transfer_group_ownership',{p_group:selected,p_new_owner:m.user_id}),`${m.name} now owns ${group.name}.`)}/><TimedUndoButton size="sm" disabled={busy} label="Remove" runningLabel="Removing…" onConfirm={()=>act(()=>client.rpc('remove_private_group_member',{p_group:selected,p_user:m.user_id}),`${m.name} was removed.`)}/></div>)}
    </>:<div className="self-start"><TimedUndoButton disabled={busy} label={`Leave ${group.name}`} undoLabel="Stay in group" runningLabel="Leaving…" onConfirm={()=>act(()=>client.rpc('leave_private_group',{p_group:selected}),'You left the group.')}/></div>}
   </CardContent></Card>
  </>}
  <ErrorText>{error}</ErrorText>
 </div>;
}
