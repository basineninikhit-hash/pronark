import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import { Droplet, Heart, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Segmented } from '@/components/segmented';
import { Disclosure, EmptyState, ErrorText, FormField, Meter, SectionHeading } from '@/components/pronark';
type Member={user_id:string;name:string};
type Task={id:string;title:string};
type Participant={user_id:string;accepted:boolean;contribution:number};
type Plant={id:string;name:string;species:string;rule_kind:'checkoff'|'kpi'|'weekly_total'|'custom_visual';target:number;starts_on:string;ends_on:string;status:string;revision:number;creator_id:string;progress:number;participants:Participant[]};
type OwnParticipation={plant_id:string;task_id:string|null;accepted:boolean;revision:number};
type Versus={user_id:string;name:string;scheduled:number;completed:number};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const addDays=(date:string,n:number)=>{const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
export function TogetherPage({client,groupId,owner,members,tasks}:{client:SupabaseClient;groupId:string;owner:string;members:Member[];tasks:Task[]}){
 const [tab,setTab]=useState<'garden'|'missions'|'cheers'|'versus'>('garden');
 const [plants,setPlants]=useState<Plant[]>([]),[ownParts,setOwnParts]=useState<OwnParticipation[]>([]),[cheers,setCheers]=useState<{id:string;from_user:string;to_user:string;kind:string}[]>([]);
 const [versus,setVersus]=useState<Versus[]|null>(null),[optin,setOptin]=useState<{enabled:boolean;revision:number}|null>(null);
 const [name,setName]=useState(''),[species,setSpecies]=useState('sprout'),[rule,setRule]=useState<Plant['rule_kind']>('weekly_total'),[target,setTarget]=useState('12'),[days,setDays]=useState(7);
 const [pickedTask,setPickedTask]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){
  const [garden,parts,cheerRows,versusRow]=await Promise.all([
   client.rpc('read_group_garden',{p_group:groupId}),client.from('garden_participants').select('*').eq('user_id',owner),
   client.from('garden_cheers').select('id,from_user,to_user,kind').eq('group_id',groupId).order('created_at',{ascending:false}).limit(10),
   client.from('group_versus_optins').select('enabled,revision').eq('group_id',groupId).eq('user_id',owner).maybeSingle(),
  ]);
  if(garden.error){setError('Together needs the new garden database migration.');return}
  setPlants((garden.data??[]) as Plant[]);setOwnParts((parts.data??[]) as OwnParticipation[]);setCheers((cheerRows.data??[]) as typeof cheers);setOptin(versusRow.data as typeof optin);
 }
 useEffect(()=>{load();setVersus(null)},[groupId]);
 async function act(action:()=>PromiseLike<{error:unknown}>,message:string){setBusy(true);setError('');try{const result=await action();if(result.error)throw result.error;await load();toast.success(message);return true}catch(e){setError(e instanceof Error?e.message:String(e));return false}finally{setBusy(false)}}
 async function create(){const start=today();const saved=await act(()=>client.rpc('save_garden_plant',{p_id:crypto.randomUUID(),p_group:groupId,p_name:name,p_species:species,p_rule_kind:rule,p_target:Number(target),p_starts_on:start,p_ends_on:addDays(start,days-1),p_status:'active',p_expected_revision:0}),'Plant created. Invite a member and choose your own contribution.');if(saved)setName('')}
 const stage=(p:Plant)=>{const ratio=Number(p.progress)/Number(p.target);return ratio>=1?'flower':ratio>=.66?'leaves':ratio>=.33?'sprout':'seed'};
 const icons:Record<string,string>={seed:'🫘',sprout:'🌱',leaves:'🌿',flower:'🌸'};
 const mission=plants.filter(p=>p.status==='active'&&new Date(p.ends_on).getTime()-new Date(p.starts_on).getTime()<=6*86400000);
 const plantStyles:Record<string,string>={seed:'from-warning/15',sprout:'from-primary/10',leaves:'from-primary/20',flower:'from-pink-400/20'};
 return <Card><CardContent className="flex flex-col gap-4">
 <div className="flex items-start justify-between gap-3"><div><div className="text-eyebrow text-muted-foreground">Grow together</div><h2 className="text-title mt-1">Together</h2><p className="mt-1 text-sm text-muted-foreground">Build something kind with this group. Garden growth is visual and does not change anyone’s wallet.</p></div><span className="text-4xl" aria-hidden="true">🌻</span></div>
 <Segmented role="tablist" label="Together sections" className="w-full sm:w-auto sm:self-start" value={tab} onChange={setTab} options={(['garden','missions','cheers','versus'] as const).map(x=>({value:x,label:x[0].toUpperCase()+x.slice(1)}))}/>
 {tab==='garden'&&<div className="flex flex-col gap-4"><div className="grid gap-3 sm:grid-cols-2">{plants.filter(p=>p.status!=='archived').map(p=>{const mine=ownParts.find(x=>x.plant_id===p.id);const st=stage(p);return <article key={p.id} className="flex flex-col gap-2 overflow-hidden rounded-xl ring-1 ring-foreground/10">
  <div className={'grid h-24 place-items-center bg-gradient-to-b to-transparent '+plantStyles[st]} aria-hidden="true"><span className={'leading-none transition-[font-size] duration-500 '+(st==='seed'?'text-3xl':st==='sprout'?'text-4xl':st==='leaves'?'text-5xl':'text-6xl')}>{icons[st]}</span></div>
  <div className="flex flex-col gap-2 px-3.5 pb-3.5">
   <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{p.name}</h3><Badge variant={p.status==='active'?'secondary':'outline'}>{p.status}</Badge></div>
   <p className="text-xs text-muted-foreground">{p.rule_kind.replace('_',' ')} · {p.participants.filter(x=>x.accepted).length} participating · {st} stage</p>
   <Meter value={Math.min(Number(p.target),Number(p.progress))} max={Number(p.target)} label={`${Number(p.progress)} of ${Number(p.target)} contributions`}/>
   <p className="tabular text-xs text-muted-foreground">{Number(p.progress)} of {Number(p.target)} contributions · {p.starts_on} – {p.ends_on}</p>
   {mine&&!mine.accepted&&<div className="flex flex-col gap-2">{(p.rule_kind==='checkoff'||p.rule_kind==='kpi')&&<FormField label="My activity"><NativeSelect value={pickedTask} onChange={e=>setPickedTask(e.target.value)}><NativeSelectOption value="">Choose</NativeSelectOption>{tasks.map(t=><NativeSelectOption value={t.id} key={t.id}>{t.title}</NativeSelectOption>)}</NativeSelect></FormField>}<Button disabled={busy||((p.rule_kind==='checkoff'||p.rule_kind==='kpi')&&!pickedTask)} onClick={()=>act(()=>client.rpc('accept_garden_participation',{p_plant:p.id,p_task:pickedTask||null,p_accept:true,p_expected_revision:mine.revision}),'You joined this plant.')}>Join plant</Button></div>}
   {mine?.accepted&&<div className="flex flex-wrap gap-1.5">{p.rule_kind==='custom_visual'&&<Button size="sm" disabled={busy||p.ends_on<today()} onClick={()=>act(()=>client.rpc('water_visual_plant',{p_plant:p.id}),'Plant watered today.')}><Droplet data-icon="inline-start"/>Water today</Button>}<Button variant="outline" size="sm" disabled={busy} onClick={()=>act(()=>client.rpc('accept_garden_participation',{p_plant:p.id,p_task:null,p_accept:false,p_expected_revision:mine.revision}),'You left this plant.')}>Leave plant</Button></div>}
   {p.creator_id===owner&&<div className="flex flex-wrap gap-1.5 border-t pt-2">{members.filter(m=>!p.participants.some(x=>x.user_id===m.user_id)).map(m=><Button variant="outline" size="sm" key={m.user_id} disabled={busy} onClick={()=>act(()=>client.rpc('invite_garden_participant',{p_plant:p.id,p_user:m.user_id}),`${m.name} invited.`)}>Invite {m.name}</Button>)}<Button variant="ghost" size="sm" disabled={busy||p.status==='archived'} onClick={()=>act(()=>client.rpc('save_garden_plant',{p_id:p.id,p_group:groupId,p_name:p.name,p_species:p.species,p_rule_kind:p.rule_kind,p_target:p.target,p_starts_on:p.starts_on,p_ends_on:p.ends_on,p_status:p.status==='paused'?'active':'paused',p_expected_revision:p.revision}),p.status==='paused'?'Plant resumed.':'Plant paused.')}>{p.status==='paused'?'Resume':'Pause'}</Button></div>}
  </div>
 </article>})}{!plants.length&&<EmptyState className="sm:col-span-2">No plants yet. Plant the first seed together.</EmptyState>}</div>
 <div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-4"><SectionHeading title="Plant a new seed" description="Choose one clear rule. Contributions come from confirmed checkoffs or logs; custom watering is visual-only."/>
  <FormField label="Name"><Input value={name} maxLength={80} onChange={e=>setName(e.target.value)} placeholder="Our morning walks"/></FormField>
  <div className="grid gap-3 sm:grid-cols-2">
   <FormField label="Plant"><NativeSelect value={species} onChange={e=>setSpecies(e.target.value)}><NativeSelectOption value="sprout">Sprout</NativeSelectOption><NativeSelectOption value="flower">Flower</NativeSelectOption><NativeSelectOption value="tree">Tree</NativeSelectOption><NativeSelectOption value="constellation">Constellation</NativeSelectOption></NativeSelect></FormField>
   <FormField label="Rule"><NativeSelect value={rule} onChange={e=>setRule(e.target.value as Plant['rule_kind'])}><NativeSelectOption value="weekly_total">Combined scheduled checkoffs</NativeSelectOption><NativeSelectOption value="checkoff">Each person’s chosen activity</NativeSelectOption><NativeSelectOption value="kpi">Each person’s chosen KPI target</NativeSelectOption><NativeSelectOption value="custom_visual">Manual watering (visual only)</NativeSelectOption></NativeSelect></FormField>
   <FormField label="Contribution target"><Input type="number" min="1" value={target} onChange={e=>setTarget(e.target.value)}/></FormField>
   <FormField label="Duration"><NativeSelect value={days} onChange={e=>setDays(Number(e.target.value))}><NativeSelectOption value={7}>One week</NativeSelectOption><NativeSelectOption value={30}>30 days</NativeSelectOption><NativeSelectOption value={90}>90 days</NativeSelectOption></NativeSelect></FormField>
  </div>
  <Button className="self-start" disabled={busy||!name.trim()||!(Number(target)>0)||Number(target)>1000000} onClick={create}><Sprout data-icon="inline-start"/>Create plant</Button>
 </div></div>}
 {tab==='missions'&&<div className="flex flex-col gap-3"><h3 className="text-headline">This week’s shared builds</h3>{mission.length?mission.map(p=><div key={p.id} className="flex flex-col gap-1.5 rounded-xl p-3.5 ring-1 ring-foreground/10"><div className="flex justify-between gap-2 text-sm"><strong className="font-semibold">{p.name}</strong><span className="tabular text-muted-foreground">{p.progress} / {p.target}</span></div><Meter value={Math.min(Number(p.target),Number(p.progress))} max={Number(p.target)}/></div>):<EmptyState>Create a seven-day plant in Garden to start a cooperative mission.</EmptyState>}<p className="text-xs text-muted-foreground">There is no penalty or decay for a missed day. Corrections update progress from the original activity records.</p></div>}
 {tab==='cheers'&&<div className="flex flex-col gap-3"><SectionHeading title="Send a little encouragement" description="Choose a supportive note. To prevent noise, each person can send five per day."/>{members.filter(m=>m.user_id!==owner).map(m=><div key={m.user_id} className="flex flex-wrap items-center gap-2 rounded-xl p-3 ring-1 ring-foreground/10"><strong className="mr-auto text-sm font-semibold">{m.name}</strong>{([['you_got_this','You’ve got this'],['nice_work','Nice work'],['thank_you','Thank you']] as const).map(([id,label])=><Button variant="secondary" size="sm" key={id} disabled={busy} onClick={()=>act(()=>client.rpc('send_garden_cheer',{p_group:groupId,p_to:m.user_id,p_kind:id}),'Cheer added to this group.')}><Heart data-icon="inline-start"/>{label}</Button>)}</div>)}<h4 className="text-eyebrow text-muted-foreground">Recent cheers</h4>{cheers.length?cheers.map(c=><p key={c.id} className="text-sm">{members.find(m=>m.user_id===c.from_user)?.name??'Member'} → {members.find(m=>m.user_id===c.to_user)?.name??'Member'}: <span className="text-muted-foreground">{c.kind.replaceAll('_',' ')}</span></p>):<p className="text-sm text-muted-foreground">No cheers yet.</p>}</div>}
 {tab==='versus'&&<div className="flex flex-col gap-3"><SectionHeading title="Private, optional comparison" description="Compare each consenting person against their own scheduled plan for seven days. No public leaderboard, wallet, or purchase data."/><div className="flex flex-wrap gap-2"><Button variant={optin?.enabled?'outline':'default'} disabled={busy} onClick={()=>act(()=>client.rpc('save_versus_optin',{p_group:groupId,p_enabled:!optin?.enabled,p_expected_revision:optin?.revision??0}),optin?.enabled?'You left Versus.':'You opted in for seven days.')}>{optin?.enabled?'Leave Versus':'Opt in for seven days'}</Button>{optin?.enabled&&<Button variant="outline" onClick={async()=>{const result=await client.rpc('read_group_versus',{p_group:groupId});if(result.error)setError(result.error.message);else setVersus(result.data as Versus[])}}>Show consenting members</Button>}</div>{versus?.map(v=><div key={v.user_id} className="flex flex-col gap-1.5"><div className="flex justify-between text-sm"><span>{v.name}</span><span className="tabular text-muted-foreground">{v.completed} of {v.scheduled} ({v.scheduled?Math.round(v.completed/v.scheduled*100):0}%)</span></div><Meter value={v.completed} max={v.scheduled}/></div>)}</div>}
 <ErrorText>{error}</ErrorText>
 <Disclosure summary="Frequently asked questions">A plant does not change your wallet. Only consenting members contribute. The plant displays group progress, not your private activity title or KPI value. Versus is visible only to members who opt in.</Disclosure>
 </CardContent></Card>;
}
