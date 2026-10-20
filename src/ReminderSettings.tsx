import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Disclosure, ErrorText, FormField, SectionHeading } from '@/components/pronark';

type Preference={owner_id:string;mode:'standard'|'custom'|'off';quiet_start:string;quiet_end:string;max_per_day:number;revision:number};
type Rule={id:string;task_id:string|null;local_time:string;enabled:boolean;revision:number};
type Activity={id:string;title:string;archive_date:string|null};
export function ReminderSettings({client,owner,tasks}:{client:SupabaseClient;owner:string;tasks:Activity[]}){
 const [pref,setPref]=useState<Preference|null>(null),[rules,setRules]=useState<Rule[]>([]),[ready,setReady]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const [mode,setMode]=useState<Preference['mode']>('standard'),[start,setStart]=useState('21:00'),[end,setEnd]=useState('07:00'),[max,setMax]=useState(3);
 const [task,setTask]=useState(''),[time,setTime]=useState('12:00');
 async function load(){const [p,r]=await Promise.all([client.from('reminder_preferences').select('*').eq('owner_id',owner).maybeSingle(),client.from('reminder_rules').select('*').eq('owner_id',owner).order('local_time')]);if(p.error||r.error){setError('Custom reminder controls need the new database migration. Standard notifications are unchanged.');setReady(false);return}const row=(p.data??null) as Preference|null;setPref(row);setRules((r.data??[]) as Rule[]);setMode(row?.mode??'standard');setStart(row?.quiet_start?.slice(0,5)??'21:00');setEnd(row?.quiet_end?.slice(0,5)??'07:00');setMax(row?.max_per_day??3);setReady(true);setError('')}
 useEffect(()=>{load()},[owner]);
 async function save(){setBusy(true);setError('');setStatus('');try{const {error:failure}=await client.rpc('save_reminder_preferences',{p_mode:mode,p_quiet_start:start,p_quiet_end:end,p_max_per_day:max,p_expected_revision:pref?.revision??0});if(failure)throw failure;if(mode!=='standard'){const {error:pushError}=await client.rpc('set_notification_preference',{p_enabled:false});if(pushError)throw pushError}await load();setStatus(mode==='standard'?'Standard schedule selected. Browser permission and notification enablement still apply.':mode==='off'?'Notifications turned off.':'Custom schedule saved as a draft. Delivery stays off until the worker is released and you enable notifications again.')}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 async function addRule(){setBusy(true);setError('');setStatus('');const {error:failure}=await client.rpc('save_reminder_rule',{p_id:crypto.randomUUID(),p_task:task||null,p_time:time,p_enabled:true,p_expected_revision:0});if(failure)setError(failure.message);else{await load();setStatus('Reminder draft saved. It does not send until custom delivery is released and enabled.')}setBusy(false)}
 async function toggleRule(rule:Rule){setBusy(true);setError('');const {error:failure}=await client.rpc('save_reminder_rule',{p_id:rule.id,p_task:rule.task_id,p_time:rule.local_time.slice(0,5),p_enabled:!rule.enabled,p_expected_revision:rule.revision});if(failure)setError(failure.message);else await load();setBusy(false)}
 const active=rules.filter(r=>r.enabled);
 const modeLabels={standard:['Standard','Existing morning and evening windows'],custom:['Custom','Draft extra reminders'],off:['Off','No reminders from Pronark']} as const;
 return <Card><CardContent className="flex flex-col gap-4">
  <SectionHeading title="Notification schedule" description="Standard stays at the existing morning and evening windows. Extra reminders are optional and require a future worker release; no test sends happen here."/>
  {!ready?<p role="status" className="text-sm text-muted-foreground">{error||'Loading reminder settings…'}</p>:<>
   <fieldset className="grid gap-2 sm:grid-cols-3"><legend className="sr-only">Reminder mode</legend>{(['standard','custom','off'] as const).map(m=><label key={m} className={'flex cursor-pointer flex-col gap-0.5 rounded-xl p-3 ring-1 transition-[background-color,box-shadow] duration-100 '+(mode===m?'bg-primary/8 ring-2 ring-primary':'ring-foreground/10 hover:bg-muted/50')}><input type="radio" name="reminder-mode" className="sr-only" checked={mode===m} onChange={()=>setMode(m)}/><span className="text-sm font-medium">{modeLabels[m][0]}</span><span className="text-xs text-muted-foreground">{modeLabels[m][1]}</span></label>)}</fieldset>
   {mode==='custom'&&<>
    <div className="grid gap-3 sm:grid-cols-3"><FormField label="Quiet hours start"><Input type="time" value={start} onChange={e=>setStart(e.target.value)}/></FormField><FormField label="Quiet hours end"><Input type="time" value={end} onChange={e=>setEnd(e.target.value)}/></FormField><FormField label="Maximum per day"><NativeSelect value={max} onChange={e=>setMax(Number(e.target.value))}>{[1,2,3,4,5,6].map(n=><NativeSelectOption key={n} value={n}>{n}</NativeSelectOption>)}</NativeSelect></FormField></div>
    <p className="text-xs text-muted-foreground">About {Math.min(max,active.length)} extra reminder{Math.min(max,active.length)===1?'':'s'} on a typical scheduled day, before quiet hours or completed-task skips.</p>
    <h4 className="text-headline">Extra reminder drafts</h4>
    <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end"><FormField label="For"><NativeSelect value={task} onChange={e=>setTask(e.target.value)}><NativeSelectOption value="">General check-in</NativeSelectOption>{tasks.filter(t=>!t.archive_date).map(t=><NativeSelectOption key={t.id} value={t.id}>{t.title}</NativeSelectOption>)}</NativeSelect></FormField><FormField label="Eastern time"><Input type="time" step="900" value={time} onChange={e=>setTime(e.target.value)}/></FormField><Button variant="outline" disabled={busy||active.length>=6||Number(time.slice(3))%15!==0} onClick={addRule}>Add draft</Button></div>
    {rules.length>0&&<div className="flex flex-col divide-y rounded-xl ring-1 ring-foreground/10">{rules.map(r=><div key={r.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm"><span><strong className="tabular font-medium">{r.local_time.slice(0,5)}</strong> · {tasks.find(t=>t.id===r.task_id)?.title??'General check-in'}</span><Switch checked={r.enabled} disabled={busy} onCheckedChange={()=>toggleRule(r)} aria-label={(r.enabled?'Pause':'Resume')+' reminder'}/></div>)}</div>}
   </>}
   {mode==='off'&&<p className="text-sm text-muted-foreground">Off disables account-level push delivery. Your browser may still show permission as granted, but Pronark will not send reminders.</p>}
   <Button className="self-start" disabled={busy} onClick={save}>Save notification mode</Button>
   {status&&<p className="text-sm text-primary" role="status">{status}</p>}<ErrorText>{error}</ErrorText>
   <Disclosure summary="Why might a reminder not arrive?">Custom delivery is still disabled locally. Once released, your device also needs browser permission and a valid push subscription. Quiet hours, rest days, completed activities, and your daily maximum can suppress a reminder.</Disclosure>
  </>}
 </CardContent></Card>;
}
