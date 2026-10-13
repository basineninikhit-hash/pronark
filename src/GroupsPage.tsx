import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import './groups-page.css';
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
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
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
  setBusy(true);setError('');setMessage('');
  try{const result=await action();if(result.error)throw result.error;await refresh();setMessage(success)}
  catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 const group=groups.find(g=>g.id===selected),chosen=overview?.members.find(m=>m.user_id===member),isOwner=group?.owner_id===owner;
 return <div className="groups-page">
  <section className="groups-hero card"><div><span className="eyebrow">YOUR PRIVATE CIRCLES</span><h2>Groups</h2><p>Members see only what you choose to share in each group.</p></div><span aria-hidden="true">🌿</span></section>
  <section className="card"><h2>Choose a group</h2><label>Group<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select a group</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
   {group&&<p>Viewing <strong>{group.name}</strong>. Other groups stay private.</p>}
   <div className="groups-actions"><label>New group name<input value={newName} maxLength={80} onChange={e=>setNewName(e.target.value)} placeholder="Family, friends…"/></label><button disabled={busy||!newName.trim()} onClick={()=>act(async()=>{const result=await client.rpc('create_private_group',{p_name:newName});if(!result.error){setSelected(result.data as string);setNewName('')}return result},'Group created.')}>Create group</button></div>
   <div className="groups-actions"><label>Invitation code<input value={joinCode} onChange={e=>setJoinCode(e.target.value.trim())} placeholder="Paste a code"/></label><button className="secondary" disabled={busy||!joinCode.trim()} onClick={()=>act(async()=>{const result=await client.rpc('redeem_invitation',{p_token:joinCode});if(!result.error){setSelected(result.data as string);setJoinCode('')}return result},'Joined group.')}>Join group</button></div>
  </section>
  {group&&overview&&<>
   <section className="card"><h2>{overview.name}</h2><p>Choose a person to see their consented summary and selected activities.</p>
    <label>Group member<select value={member} onChange={e=>{setMember(e.target.value);setHistory(null)}}>{overview.members.map(m=><option value={m.user_id} key={m.user_id}>{m.name||'Member'}{m.user_id===owner?' (you)':''}</option>)}</select></label>
    {chosen&&<div className="groups-member"><h3>{chosen.name||'Member'}</h3>{chosen.summary_visible?<p>{chosen.completed} of {chosen.scheduled} scheduled activities completed today</p>:<p>This member has hidden their progress summary.</p>}
     <h4>Shared activities</h4>{chosen.activities.length?<ul>{chosen.activities.map(a=><li key={a.id}>{a.title} · {a.scheduled_today?a.completed_today?'Complete today':'Scheduled today':'Not scheduled today'}</li>)}</ul>:<p>No activities shared with this group.</p>}
     {chosen.full_history&&chosen.user_id!==owner&&<><button className="secondary" onClick={async()=>{const to=new Date().toISOString().slice(0,10),from=new Date(Date.now()-6*86400000).toISOString().slice(0,10);const result=await client.rpc('read_group_history',{p_group:selected,p_member:chosen.user_id,p_from:from,p_to:to});if(result.error)setError(result.error.message);else setHistory(result.data as unknown[])}}>View last 7 days of shared history</button>{history&&<pre className="groups-history">{JSON.stringify(history,null,2)}</pre>}</>}
    </div>}
   </section>
   <section className="card"><h2>What {group.name} can see from me</h2><p>Full checklist and history are off unless you turn them on for this group.</p>
    {sharing&&<><label><input type="checkbox" checked={sharing.show_summary} disabled={busy} onChange={e=>act(()=>client.rpc('save_group_sharing',{p_group:selected,p_summary:e.target.checked,p_full_history:sharing.full_history,p_expected_revision:sharing.revision}),'Sharing updated.')}/> Show my progress summary</label><label><input type="checkbox" checked={sharing.full_history} disabled={busy} onChange={e=>act(()=>client.rpc('save_group_sharing',{p_group:selected,p_summary:sharing.show_summary,p_full_history:e.target.checked,p_expected_revision:sharing.revision}),'Full history choice updated.')}/> Let this group see my full checklist and history</label></>}
    {tasks.filter(t=>!t.archive_date).map(t=><label key={t.id}><input type="checkbox" checked={sharedIds.includes(t.id)} disabled={busy} onChange={e=>act(()=>client.rpc('set_group_activity_share',{p_group:selected,p_task:t.id,p_shared:e.target.checked}),'Activity sharing updated.')}/> {t.title}</label>)}
    <details><summary>Can another group see this?</summary><p>No. These choices apply only to {group.name}. A small group may infer a contribution from group totals.</p></details>
   </section>
   <TogetherPage client={client} groupId={selected} owner={owner} members={overview.members} tasks={tasks.filter(t=>!t.archive_date)}/>
   <section className="card"><h2>Group management</h2>{isOwner?<>
    <button disabled={busy} onClick={async()=>{setBusy(true);setError('');const result=await client.rpc('issue_group_invitation',{p_group:selected});if(result.error)setError(result.error.message);else setInviteCode(result.data as string);setBusy(false)}}>Create single-use invitation</button>{inviteCode&&<p>Expires in 48 hours: <code>{inviteCode}</code></p>}
    <button className="secondary" disabled={busy} onClick={()=>act(()=>client.rpc('revoke_group_invitations',{p_group:selected}),'Pending invitations revoked.')}>Revoke pending invitations</button>
    {overview.members.filter(m=>m.user_id!==owner).map(m=><div className="groups-member-action" key={m.user_id}><span>{m.name}</span><button className="secondary" disabled={busy} onClick={()=>{if(confirm(`Remove ${m.name} from ${group.name}?`))act(()=>client.rpc('remove_private_group_member',{p_group:selected,p_user:m.user_id}),'Member removed.')}}>Remove</button><button className="secondary" disabled={busy} onClick={()=>{if(confirm(`Transfer ownership of ${group.name} to ${m.name}?`))act(()=>client.rpc('transfer_group_ownership',{p_group:selected,p_new_owner:m.user_id}),'Ownership transferred.')}}>Make owner</button></div>)}
   </>:<button className="secondary" disabled={busy} onClick={()=>{if(confirm(`Leave ${group.name}?`))act(()=>client.rpc('leave_private_group',{p_group:selected}),'You left the group.')}}>Leave group</button>}</section>
  </>}
  {message&&<p className="success" role="status">{message}</p>}{error&&<p className="error" role="alert">{error}</p>}
 </div>;
}
