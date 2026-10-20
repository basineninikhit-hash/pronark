import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Disclosure, ErrorText, FieldRow, Form, FormField, SectionHeading } from '@/components/pronark';

type Plan={category_id:string;increment_cents:number;starts_on:string;enabled:boolean;revision:number};
const money=(cents:number)=>'$'+(cents/100).toFixed(2);
function nextDate(today:string,start:string){const d=new Date(today+'T12:00:00Z');for(let i=0;i<65;i++){const date=d.toISOString().slice(0,10);if(date>=start&&(date.endsWith('-01')||date.endsWith('-15')))return date;d.setUTCDate(d.getUTCDate()+1)}return '—'}

export function GoalTargetPlan({client,categoryId,today,readOnly}:{client:SupabaseClient;categoryId:string;today:string;readOnly:boolean}){
 const [plan,setPlan]=useState<Plan|null>(null),[ready,setReady]=useState(false),[error,setError]=useState(''),[editing,setEditing]=useState(false),[amount,setAmount]=useState(''),[start,setStart]=useState(today),[enabled,setEnabled]=useState(true),[busy,setBusy]=useState(false);
 useEffect(()=>{let cancelled=false;setReady(false);setError('');if(readOnly)return;client.from('category_target_plans').select('*').eq('category_id',categoryId).maybeSingle().then(({data,error})=>{if(cancelled)return;if(error)setError('Target-growth plans need the new database migration.');else setPlan(data as Plan|null);setReady(true)});return()=>{cancelled=true}},[client,categoryId,readOnly]);
 function begin(){setAmount(plan?(plan.increment_cents/100).toFixed(2):'');setStart(plan?.starts_on??today);setEnabled(plan?.enabled??true);setEditing(true)}
 async function save(){setBusy(true);setError('');const {data,error:failure}=await client.rpc('save_category_target_plan',{p_category:categoryId,p_increment_cents:Math.round(Number(amount)*100),p_starts_on:start,p_enabled:enabled,p_expected_revision:plan?.revision??0});if(failure)setError(failure.message);else{setPlan({category_id:categoryId,increment_cents:Math.round(Number(amount)*100),starts_on:start,enabled,revision:Number(data)});setEditing(false)}setBusy(false)}
 if(readOnly)return null;
 return <Card><CardContent className="flex flex-col gap-3">
  <SectionHeading title="Grow this goal on the 1st and 15th" description="Optional. This increases the goal amount only. It never adds wallet earnings or assigned savings." action={plan&&<Badge variant={plan.enabled?'default':'secondary'}>{plan.enabled?'Active':'Paused'}</Badge>}/>
  <ErrorText>{error}</ErrorText>
  {plan?<div className="rounded-xl bg-muted/50 p-3 text-sm"><p><strong className="tabular">{money(plan.increment_cents)}</strong> added to this goal each 1st and 15th.</p><p className="mt-1 text-xs text-muted-foreground">Next planned increase: {plan.enabled?nextDate(today,plan.starts_on):'Paused'} · About {money(plan.increment_cents*2)} per month / {money(plan.increment_cents*24)} per year.</p></div>:<p className="text-sm text-muted-foreground">No automatic goal increases set.</p>}
  {ready&&!editing&&!error&&<Button variant="outline" className="self-start" onClick={begin}>{plan?'Edit or pause plan':'Set a plan'}</Button>}
  {editing&&<Form className="rounded-xl ring-1 ring-foreground/10 p-3.5">
   <FieldRow><FormField label="Increase each time ($)"><Input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="75.00"/></FormField><FormField label="Start on or after"><Input type="date" min={plan?.starts_on??today} value={start} onChange={e=>setStart(e.target.value)}/></FormField></FieldRow>
   <label className="flex items-center justify-between gap-3 text-sm">Plan active<Switch checked={enabled} onCheckedChange={v=>setEnabled(v)}/></label>
   <Disclosure summary="What happens if I pause or edit it?">Past increases stay. Pausing stops future increases. Editing the amount changes future increases only.</Disclosure>
   <div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setEditing(false)}>Cancel</Button><Button disabled={busy||!/^\d+(\.\d{1,2})?$/.test(amount)||Number(amount)<=0||Number(amount)>1000000||(start<today&&start!==plan?.starts_on)} onClick={save}>Save plan</Button></div>
  </Form>}
 </CardContent></Card>
}
