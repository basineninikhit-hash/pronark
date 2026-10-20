import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { Leaf } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
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
 const group=groups.find(g=>g.id===selected),chosen=overview?.members.find(m=>m.user_id===member),isOwner=group?.owner_id===owner;
 return <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
  <section className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-primary/12 to-transparent p-5 ring-1 ring-primary/15"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><Leaf className="size-6" aria-hidden="true"/></span><div><div className="text-eyebrow text-muted-foreground">Your private circles</div><h2 className="text-title">Groups</h2><p className="text-sm text-muted-foreground">Members see only what you choose to share in each group.</p></div></section>
  <Card><CardContent className="flex flex-col gap-4">
   <SectionHeading title="Choose a group" description={group?<>Viewing <strong className="text-foreground">{group.name}</strong>. Other groups stay private.</>:undefined}/>
   <NativeSelect aria-label="Group" value={selected} onChange={e=>setSelected(e.target.value)}><NativeSelectOption value="">Select a group</NativeSelectOption>{groups.map(g=><NativeSelectOption key={g.id} value={g.id}>{g.name}</NativeSelectOption>)}</NativeSelect>
   <div className="grid gap-4 sm:grid-cols-2">
    <div className="flex items-end gap-2"><FormField label="New group name" className="flex-1"><Input value={newName} maxLength={80} onChange={e=>setNewName(e.target.value)} placeholder="Family, friends…"/></FormField><Button disabled={busy||!newName.trim()} onClick={()=>act(async()=>{const result=await client.rpc('create_private_group',{p_name:newName});if(!result.error){setSelected(result.data as string);setNewName('')}return result},'Group created.')}>Create</Button></div>
    <div className="flex items-end gap-2"><FormField label="Invitation code" className="flex-1"><Input value={joinCode} onChange={e=>setJoinCode(e.target.value.trim())} placeholder="Paste a code"/></FormField><Button variant="outline" disabled={busy||!joinCode.trim()} onClick={()=>act(async()=>{const result=await client.rpc('redeem_invitation',{p_token:joinCode});if(!result.error){setSelected(result.data as string);setJoinCode('')}return result},'Joined group.')}>Join</Button></div>
   </div>
  </CardContent></Card>
  {group&&overview&&<>
   <Card><CardContent className="flex flex-col gap-4">
    <SectionHeading title={overview.name} description="Choose a person to see their consented summary and selected activities."/>
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Group member">{overview.members.map(m=><button key={m.user_id} type="button" role="radio" aria-checked={member===m.user_id} onClick={()=>{setMember(m.user_id);setHistory(null)}} className={'flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm ring-1 transition-[background-color,scale] duration-100 active:scale-95 '+(member===m.user_id?'bg-primary/10 ring-primary':'ring-foreground/10 hover:bg-muted/50')}><span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{(m.name||'M').slice(0,1).toUpperCase()}</span>{m.name||'Member'}{m.user_id===owner&&<span className="text-muted-foreground"> (you)</span>}</button>)}</div>
    {chosen&&<div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-4">
     <div className="flex items-baseline justify-between gap-2"><h3 className="text-headline">{chosen.name||'Member'}</h3>{chosen.summary_visible&&<span className="tabular text-sm text-muted-foreground">{chosen.completed} / {chosen.scheduled} today</span>}</div>
     {chosen.summary_visible?<Meter value={chosen.completed??0} max={chosen.scheduled??0} label={`${chosen.completed} of ${chosen.scheduled} scheduled activities completed today`}/>:<p className="text-sm text-muted-foreground">This member has hidden their progress summary.</p>}
     <h4 className="text-eyebrow text-muted-foreground">Shared activities</h4>
     {chosen.activities.length?<ul className="flex flex-col gap-1.5">{chosen.activities.map(a=><li key={a.id} className="flex items-center justify-between gap-2 text-sm"><span>{a.title}</span><Badge variant={a.scheduled_today&&a.completed_today?'default':'secondary'}>{a.scheduled_today?a.completed_today?'Complete today':'Scheduled today':'Not scheduled'}</Badge></li>)}</ul>:<p className="text-sm text-muted-foreground">No activities shared with this group.</p>}
     {chosen.full_history&&chosen.user_id!==owner&&<><Button variant="outline" className="self-start" onClick={async()=>{const to=new Date().toISOString().slice(0,10),from=new Date(Date.now()-6*86400000).toISOString().slice(0,10);const result=await client.rpc('read_group_history',{p_group:selected,p_member:chosen.user_id,p_from:from,p_to:to});if(result.error)setError(result.error.message);else setHistory(result.data as unknown[])}}>View last 7 days of shared history</Button>{history&&<pre className="max-h-64 overflow-auto rounded-lg bg-background p-3 font-mono text-[0.6875rem] ring-1 ring-foreground/10">{JSON.stringify(history,null,2)}</pre>}</>}
    </div>}
   </CardContent></Card>
   <Card><CardContent className="flex flex-col gap-3">
    <SectionHeading title={`What ${group.name} can see from me`} description="Full checklist and history are off unless you turn them on for this group."/>
    {sharing&&<div className="flex flex-col divide-y rounded-xl ring-1 ring-foreground/10">
     <label className="flex items-center justify-between gap-3 px-3.5 py-3 text-sm">Show my progress summary<Switch checked={sharing.show_summary} disabled={busy} onCheckedChange={v=>act(()=>client.rpc('save_group_sharing',{p_group:selected,p_summary:v,p_full_history:sharing.full_history,p_expected_revision:sharing.revision}),'Sharing updated.')}/></label>
     <label className="flex items-center justify-between gap-3 px-3.5 py-3 text-sm">Let this group see my full checklist and history<Switch checked={sharing.full_history} disabled={busy} onCheckedChange={v=>act(()=>client.rpc('save_group_sharing',{p_group:selected,p_summary:sharing.show_summary,p_full_history:v,p_expected_revision:sharing.revision}),'Full history choice updated.')}/></label>
    </div>}
    <h4 className="text-eyebrow mt-1 text-muted-foreground">Shared activities</h4>
    <div className="grid gap-0.5 sm:grid-cols-2">{tasks.filter(t=>!t.archive_date).map(t=><CheckRow key={t.id} checked={sharedIds.includes(t.id)} disabled={busy} onChange={v=>act(()=>client.rpc('set_group_activity_share',{p_group:selected,p_task:t.id,p_shared:v}),'Activity sharing updated.')}>{t.title}</CheckRow>)}</div>
    <Disclosure summary="Can another group see this?">No. These choices apply only to {group.name}. A small group may infer a contribution from group totals.</Disclosure>
   </CardContent></Card>
   <TogetherPage client={client} groupId={selected} owner={owner} members={overview.members} tasks={tasks.filter(t=>!t.archive_date)}/>
   <Card><CardContent className="flex flex-col gap-3">
    <SectionHeading title="Group management"/>
    {isOwner?<>
     <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={async()=>{setBusy(true);setError('');const result=await client.rpc('issue_group_invitation',{p_group:selected});if(result.error)setError(result.error.message);else setInviteCode(result.data as string);setBusy(false)}}>Create single-use invitation</Button><Button variant="outline" disabled={busy} onClick={()=>act(()=>client.rpc('revoke_group_invitations',{p_group:selected}),'Pending invitations revoked.')}>Revoke pending invitations</Button></div>
     {inviteCode&&<p className="text-sm">Expires in 48 hours: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs select-all">{inviteCode}</code></p>}
     {overview.members.filter(m=>m.user_id!==owner).map(m=><div key={m.user_id} className="flex flex-wrap items-center gap-2 border-t pt-3"><span className="flex-1 text-sm font-medium">{m.name}</span><Button variant="outline" size="sm" disabled={busy} onClick={()=>{if(confirm(`Transfer ownership of ${group.name} to ${m.name}?`))act(()=>client.rpc('transfer_group_ownership',{p_group:selected,p_new_owner:m.user_id}),'Ownership transferred.')}}>Make owner</Button><Button variant="destructive" size="sm" disabled={busy} onClick={()=>{if(confirm(`Remove ${m.name} from ${group.name}?`))act(()=>client.rpc('remove_private_group_member',{p_group:selected,p_user:m.user_id}),'Member removed.')}}>Remove</Button></div>)}
    </>:<Button variant="destructive" className="self-start" disabled={busy} onClick={()=>{if(confirm(`Leave ${group.name}?`))act(()=>client.rpc('leave_private_group',{p_group:selected}),'You left the group.')}}>Leave group</Button>}
   </CardContent></Card>
  </>}
  <ErrorText>{error}</ErrorText>
 </div>;
}
