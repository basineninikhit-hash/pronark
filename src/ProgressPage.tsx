import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Lock, NotebookPen, Plus, Sparkles, Target } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Segmented } from '@/components/segmented';
import { Sheet, SheetFooter } from '@/components/sheet';
import { TimedUndoButton } from '@/components/timed-undo-button';
import { Disclosure, EmptyState, ErrorText, FieldRow, Form, FormField, SectionHeading, StatTile } from '@/components/pronark';

type Activity = {id:string;owner_id:string;title:string};
type ActivityKpi = {task_id:string;owner_id:string;target:number;unit:string};
type ActivityLog = {task_id:string;owner_id:string;local_date:string;value:number};
type Metric = {id:string;owner_id:string;name:string;unit:string;aggregation:'sum'|'average'|'latest';target:number|null;revision:number;archived_at:string|null};
type MetricLog = {metric_id:string;local_date:string;value:number;revision:number};
const number=(n:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(n);
const shortDate=(s:string)=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(s+'T12:00:00Z'));
const rangeStart=(today:string,range:'week'|'month'|'90 days')=>{if(range==='month')return today.slice(0,7)+'-01';const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-(range==='week'?(d.getUTCDay()+6)%7:89));return d.toISOString().slice(0,10)};

export function ProgressPage({client,owner,today,readOnly,tasks,kpis,kpiLogs}:{client:SupabaseClient;owner:string;today:string;readOnly:boolean;tasks:Activity[];kpis:ActivityKpi[];kpiLogs:ActivityLog[]}){
  const [metrics,setMetrics]=useState<Metric[]>([]),[logs,setLogs]=useState<MetricLog[]>([]),[ready,setReady]=useState(false),[error,setError]=useState('');
  const [newOpen,setNewOpen]=useState(false),[editId,setEditId]=useState<string|null>(null),[name,setName]=useState(''),[unit,setUnit]=useState(''),[aggregation,setAggregation]=useState<Metric['aggregation']>('latest'),[target,setTarget]=useState('');
  const [selected,setSelected]=useState<string|null>(null),[value,setValue]=useState(''),[date,setDate]=useState(today),[busy,setBusy]=useState(false);
  const [range,setRange]=useState<'week'|'month'|'90 days'>('month'),[selectedActivity,setSelectedActivity]=useState('');
  async function load(){if(readOnly){setReady(true);return}const [a,b]=await Promise.all([client.from('private_metrics').select('*'),client.from('private_metric_logs').select('*')]);if(a.error||b.error){setError('Private measurements need the new database migration before they can be used.');setReady(true);return}setMetrics((a.data??[]) as Metric[]);setLogs((b.data??[]) as MetricLog[]);setError('');setReady(true)}
  useEffect(()=>{setReady(false);void load()},[owner,readOnly]);
  async function saveMetric(){setBusy(true);setError('');const old=metrics.find(m=>m.id===editId);const {error:failure}=await client.rpc('save_private_metric',{p_id:editId??crypto.randomUUID(),p_name:name.trim(),p_unit:unit.trim(),p_aggregation:aggregation,p_target:target?Number(target):null,p_expected_revision:old?.revision??0});if(failure)setError(failure.message);else{setNewOpen(false);setEditId(null);setName('');setUnit('');setTarget('');toast.success('Measurement saved. It does not affect rewards or checkoffs.');await load()}setBusy(false)}
  async function archiveMetric(){const old=metrics.find(m=>m.id===editId);if(!old)return;setBusy(true);const {error:failure}=await client.rpc('archive_private_metric',{p_id:old.id,p_expected_revision:old.revision});if(failure)setError(failure.message);else{setNewOpen(false);setEditId(null);await load()}setBusy(false)}
  async function saveLog(){if(!selected)return;setBusy(true);setError('');const prior=logs.find(x=>x.metric_id===selected&&x.local_date===date);const {error:failure}=await client.rpc('save_private_metric_log',{p_metric:selected,p_date:date,p_value:Number(value),p_expected_revision:prior?.revision??0});if(failure)setError(failure.message);else{setSelected(null);toast.success('Measurement saved privately.');await load()}setBusy(false)}
  async function deleteLog(){if(!selected)return;const prior=logs.find(x=>x.metric_id===selected&&x.local_date===date);if(!prior)return;setBusy(true);const {error:failure}=await client.rpc('delete_private_metric_log',{p_metric:selected,p_date:date,p_expected_revision:prior.revision});if(failure)setError(failure.message);else{setSelected(null);toast.success('Logged value deleted.');await load()}setBusy(false)}
  const active=metrics.filter(m=>!m.archived_at&&m.owner_id===owner);
  const activities=kpis.filter(k=>k.owner_id===owner&&tasks.some(t=>t.id===k.task_id));
  const from=rangeStart(today,range);
  const periodLogs=kpiLogs.filter(l=>l.owner_id===owner&&l.local_date>=from&&l.local_date<=today&&activities.some(k=>k.task_id===l.task_id));
  const hits=periodLogs.filter(l=>{const k=activities.find(k=>k.task_id===l.task_id);return k&&Number(l.value)>=Number(k.target)}).length;
  const chosen=activities.find(k=>k.task_id===selectedActivity)??activities[0];
  const chosenLogs=chosen?periodLogs.filter(l=>l.task_id===chosen.task_id).sort((a,b)=>a.local_date.localeCompare(b.local_date)):[];
  const maxValue=Math.max(Number(chosen?.target??0),...chosenLogs.map(l=>Number(l.value)),1);
  const selectedMetric=active.find(m=>m.id===selected);
  return <div className="flex flex-col gap-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><div className="text-eyebrow text-muted-foreground">Your numbers</div><h2 className="text-title mt-1">Your progress</h2><p className="mt-1 max-w-xl text-sm text-muted-foreground">See the distance you’ve covered, one measured step at a time. These numbers are separate from checklist consistency.</p></div>
      <div className="flex flex-col items-start gap-1 sm:items-end"><Segmented label="Progress time range" value={range} onChange={setRange} options={(['week','month','90 days'] as const).map(r=>({value:r,label:r==='90 days'?'90 days':r[0].toUpperCase()+r.slice(1)}))}/><p className="tabular text-xs text-muted-foreground">{shortDate(from)} – {shortDate(today)}</p></div>
    </div>
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      <StatTile icon={<Target className="size-3.5" aria-hidden="true"/>} label="Tracked activities" value={activities.length} hint="With a measurable KPI"/>
      <StatTile icon={<NotebookPen className="size-3.5" aria-hidden="true"/>} label="Measurements logged" value={periodLogs.length} hint="In this time range"/>
      <StatTile icon={<Sparkles className="size-3.5" aria-hidden="true"/>} label="Targets reached" value={periodLogs.length?`${hits} of ${periodLogs.length}`:'—'} hint="Only logged days counted"/>
    </div>
    <Card><CardContent className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3"><SectionHeading title="Activity progress" description="Choose a routine to explore the numbers behind it."/>{activities.length>0&&<NativeSelect className="w-full sm:w-56" aria-label="Choose a KPI activity" value={chosen?.task_id??''} onChange={e=>setSelectedActivity(e.target.value)}>{activities.map(k=><NativeSelectOption key={k.task_id} value={k.task_id}>{tasks.find(t=>t.id===k.task_id)?.title}</NativeSelectOption>)}</NativeSelect>}</div>
      {chosen?<>
        <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/50 p-4">
          <div><div className="text-eyebrow text-muted-foreground">Latest logged value</div><strong className="tabular text-3xl font-semibold tracking-tight">{chosenLogs.length?number(Number(chosenLogs.at(-1)!.value)):'—'} <span className="text-base font-normal text-muted-foreground">{chosen.unit}</span></strong><p className="text-xs text-muted-foreground">{chosenLogs.length?`Logged ${shortDate(chosenLogs.at(-1)!.local_date)}`:'No values in this time range yet'}</p></div>
          <div className="grid size-24 shrink-0 place-items-center rounded-full text-center ring-[6px] ring-primary/20"><div><small className="block text-[0.625rem] text-muted-foreground">Target</small><strong className="tabular text-lg">{number(Number(chosen.target))}</strong><small className="block text-[0.625rem] text-muted-foreground">{chosen.unit}</small></div></div>
        </div>
        <div className="flex items-baseline justify-between"><h4 className="text-headline">Your trend</h4><span className="text-xs text-muted-foreground">{chosenLogs.length} logged day{chosenLogs.length===1?'':'s'}</span></div>
        {chosenLogs.length?<><div className="flex h-48 items-end gap-1.5 overflow-x-auto border-b pb-1" role="img" aria-label={chosenLogs.map(l=>`${shortDate(l.local_date)}: ${number(Number(l.value))} ${chosen.unit}`).join('; ')}>{chosenLogs.map(l=><div key={l.local_date} className="flex h-full min-w-9 flex-1 flex-col items-center justify-end gap-1" title={`${shortDate(l.local_date)} · ${number(Number(l.value))} ${chosen.unit}`}><span className="tabular text-[0.625rem] text-muted-foreground">{number(Number(l.value))}</span><div className="flex w-full flex-1 items-end justify-center"><i className={'w-full max-w-7 rounded-t-md transition-[height] duration-500 ease-out '+(Number(l.value)>=Number(chosen.target)?'bg-primary':'bg-primary/35')} style={{height:Math.max(3,Number(l.value)/maxValue*100)+'%'}}/></div><small className="text-[0.625rem] whitespace-nowrap text-muted-foreground">{shortDate(l.local_date)}</small></div>)}</div><p className="text-xs text-muted-foreground">Solid bars met your {number(Number(chosen.target))} {chosen.unit} target. Unlogged days are not shown as zero.</p></>:<EmptyState>No numbers logged for this activity in this time range. Try a wider range or log a value from your checklist.</EmptyState>}
      </>:<EmptyState>Add a measurable KPI while editing an activity to see its progress here.</EmptyState>}
    </CardContent></Card>
    {!readOnly&&<Card><CardContent className="flex flex-col gap-4">
      <SectionHeading title={<span className="inline-flex items-center gap-2"><Lock className="size-4" aria-hidden="true"/>Other measurements</span>} description="For things like weight or calories that are not checklist activities. These values are private, excluded from Google Sheets, and never earn rewards." action={<Button disabled={!ready||!!error} onClick={()=>{setEditId(null);setName('');setUnit('');setAggregation('latest');setTarget('');setNewOpen(true)}}><Plus data-icon="inline-start"/>Add</Button>}/>
      {error&&<Alert variant="info"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">{active.map(m=>{const mine=logs.filter(l=>l.metric_id===m.id).sort((a,b)=>b.local_date.localeCompare(a.local_date));const recent=mine.slice(0,7);const result=recent.length?(m.aggregation==='latest'?Number(recent[0].value):m.aggregation==='sum'?recent.reduce((n,l)=>n+Number(l.value),0):recent.reduce((n,l)=>n+Number(l.value),0)/recent.length):null;return <article key={m.id} className="flex flex-col gap-2 rounded-xl p-3.5 ring-1 ring-foreground/10">
        <h4 className="text-sm font-semibold">{m.name}</h4>
        <strong className="tabular text-2xl font-semibold tracking-tight">{result===null?'—':number(result)} <small className="text-sm font-normal text-muted-foreground">{m.unit}</small></strong>
        <p className="text-xs text-muted-foreground">{m.aggregation==='latest'?'Latest value':m.aggregation==='sum'?'Total of last 7 logs':'Average of last 7 logs'} · {recent.length} recent log{recent.length===1?'':'s'}{m.target?` · target ${number(Number(m.target))} ${m.unit}`:''}</p>
        <div className="mt-auto flex gap-1.5"><Button size="sm" onClick={()=>{setSelected(m.id);setDate(today);setValue(logs.find(l=>l.metric_id===m.id&&l.local_date===today)?.value.toString()??'')}}>Log a value</Button><Button variant="outline" size="sm" onClick={()=>{setEditId(m.id);setName(m.name);setUnit(m.unit);setAggregation(m.aggregation);setTarget(m.target===null?'':String(m.target));setNewOpen(true)}}>Edit</Button></div>
      </article>})}{ready&&!active.length&&<EmptyState className="sm:col-span-2 lg:col-span-3">No private measurements yet.</EmptyState>}</div>
    </CardContent></Card>}
    <Sheet open={newOpen} onClose={()=>setNewOpen(false)} title={editId?'Edit measurement':'Add a measurement'}>
      <Form>
        <FormField label="Name"><Input value={name} maxLength={80} onChange={e=>setName(e.target.value)} placeholder="Weight, calories…"/></FormField>
        <FieldRow><FormField label="Unit"><Input value={unit} maxLength={30} onChange={e=>setUnit(e.target.value)} placeholder="lb, kcal…"/></FormField>
        <FormField label="Show as"><NativeSelect value={aggregation} onChange={e=>setAggregation(e.target.value as Metric['aggregation'])}><NativeSelectOption value="latest">Latest value</NativeSelectOption><NativeSelectOption value="sum">Sum</NativeSelectOption><NativeSelectOption value="average">Average</NativeSelectOption></NativeSelect></FormField></FieldRow>
        <FormField label="Optional target"><Input inputMode="decimal" value={target} onChange={e=>setTarget(e.target.value)}/></FormField>
        <Disclosure summary="Will this change my rewards?">No. This is a private tracker only; it does not create a checklist task or earnings.</Disclosure>
        <ErrorText>{error}</ErrorText>
        {editId&&<div className="flex flex-col items-start gap-1.5"><TimedUndoButton disabled={busy} label="Archive measurement" undoLabel="Keep measurement" runningLabel="Archiving…" onConfirm={archiveMetric}/><p className="text-xs text-muted-foreground">Its past logs stay private.</p></div>}
        <SheetFooter><Button variant="outline" onClick={()=>setNewOpen(false)}>Cancel</Button><Button disabled={busy||!name.trim()||!unit.trim()||!!target&&!(Number(target)>0&&Number(target)<=100000000)} onClick={saveMetric}>{editId?'Save changes':'Add measurement'}</Button></SheetFooter>
      </Form>
    </Sheet>
    <Sheet open={!!selected} onClose={()=>setSelected(null)} title={selectedMetric?.name??'Log a value'}>
      <Form>
        <FieldRow><FormField label="Date"><Input type="date" max={today} value={date} onChange={e=>{setDate(e.target.value);setValue(logs.find(l=>l.metric_id===selected&&l.local_date===e.target.value)?.value.toString()??'')}}/></FormField>
        <FormField label={`Value (${selectedMetric?.unit??''})`}><Input type="number" min="0" step="any" inputMode="decimal" value={value} onChange={e=>setValue(e.target.value)}/></FormField></FieldRow>
        <ErrorText>{error}</ErrorText>
        {logs.some(l=>l.metric_id===selected&&l.local_date===date)&&<TimedUndoButton className="self-start" disabled={busy} label="Delete this value" undoLabel="Keep value" runningLabel="Deleting…" onConfirm={deleteLog}/>}
        <SheetFooter><Button variant="outline" onClick={()=>setSelected(null)}>Cancel</Button><Button disabled={busy||!date||date>today||value.trim()===''||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>100000000} onClick={saveLog}>Save value</Button></SheetFooter>
      </Form>
    </Sheet>
  </div>
}
